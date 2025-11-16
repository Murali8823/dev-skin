import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface PatchEdit {
  start: number;
  end: number;
  replacement: string;
}

export interface Patch {
  file: string;
  edits: PatchEdit[];
}

export class MCPService {
  async runTests(workspacePath: string): Promise<{ success: boolean; output: string; error?: string }> {
    try {
      // Check if package.json exists to determine test command
      const packageJsonPath = path.join(workspacePath, 'package.json');
      let testCommand = 'npm test';
      
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        if (packageJson.scripts && packageJson.scripts.test) {
          testCommand = `npm test`;
        } else {
          // Try common test frameworks
          if (fs.existsSync(path.join(workspacePath, 'jest.config.js')) || 
              fs.existsSync(path.join(workspacePath, 'jest.config.ts'))) {
            testCommand = 'npx jest';
          } else if (fs.existsSync(path.join(workspacePath, 'pytest.ini')) || 
                     fs.existsSync(path.join(workspacePath, 'pyproject.toml'))) {
            testCommand = 'pytest';
          }
        }
      }

      const { stdout, stderr } = await execAsync(testCommand, {
        cwd: workspacePath,
        timeout: 60000, // 60 second timeout
      });

      return {
        success: true,
        output: stdout,
        error: stderr || undefined,
      };
    } catch (error: any) {
      return {
        success: false,
        output: error.stdout || '',
        error: error.stderr || error.message,
      };
    }
  }

  async createPR(title: string, description: string, workspacePath: string): Promise<{ success: boolean; message: string; error?: string }> {
    try {
      // Check if git is initialized
      const gitDir = path.join(workspacePath, '.git');
      if (!fs.existsSync(gitDir)) {
        return {
          success: false,
          message: 'Not a git repository',
          error: 'The workspace is not a git repository. Please initialize git first.',
        };
      }

      // Check if there are changes to commit
      const { stdout: status } = await execAsync('git status --porcelain', { cwd: workspacePath });
      if (!status.trim()) {
        return {
          success: false,
          message: 'No changes to commit',
          error: 'There are no changes to create a PR from.',
        };
      }

      // Create a branch for the PR
      const branchName = `pr-${Date.now()}`;
      await execAsync(`git checkout -b ${branchName}`, { cwd: workspacePath });
      
      // Stage and commit changes
      await execAsync('git add .', { cwd: workspacePath });
      await execAsync(`git commit -m "${title}\n\n${description}"`, { cwd: workspacePath });

      // Try to push (will fail if remote not configured, which is expected)
      try {
        await execAsync(`git push -u origin ${branchName}`, { cwd: workspacePath });
        return {
          success: true,
          message: `PR branch "${branchName}" created and pushed successfully. You can now create a PR on your git hosting platform.`,
        };
      } catch (pushError) {
        return {
          success: true,
          message: `PR branch "${branchName}" created locally. Configure remote and push to create PR: git push -u origin ${branchName}`,
        };
      }
    } catch (error: any) {
      return {
        success: false,
        message: 'Failed to create PR',
        error: error.message || 'Unknown error',
      };
    }
  }

  async applyPatch(patch: Patch): Promise<{ success: boolean; message: string; error?: string }> {
    try {
      const filePath = patch.file;
      
      if (!fs.existsSync(filePath)) {
        return {
          success: false,
          message: 'File not found',
          error: `File ${filePath} does not exist`,
        };
      }

      // Read the file
      let content = fs.readFileSync(filePath, 'utf-8');
      
      // Sort edits by start position (descending) to apply from end to start
      // This prevents position shifts when applying edits
      const sortedEdits = [...patch.edits].sort((a, b) => b.start - a.start);
      
      // Apply each edit
      for (const edit of sortedEdits) {
        if (edit.start < 0 || edit.end > content.length || edit.start > edit.end) {
          return {
            success: false,
            message: 'Invalid edit range',
            error: `Edit range [${edit.start}, ${edit.end}] is invalid for file of length ${content.length}`,
          };
        }
        
        const before = content.substring(0, edit.start);
        const after = content.substring(edit.end);
        content = before + edit.replacement + after;
      }

      // Write the modified content back
      fs.writeFileSync(filePath, content, 'utf-8');

      return {
        success: true,
        message: `Successfully applied patch to ${filePath}`,
      };
    } catch (error: any) {
      return {
        success: false,
        message: 'Failed to apply patch',
        error: error.message || 'Unknown error',
      };
    }
  }
}

