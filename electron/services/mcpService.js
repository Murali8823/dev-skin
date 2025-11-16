const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class MCPService {
  async runTests(workspacePath) {
    try {
      const packageJsonPath = path.join(workspacePath, 'package.json');
      let testCommand = 'npm test';
      
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        if (packageJson.scripts && packageJson.scripts.test) {
          testCommand = 'npm test';
        } else {
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
        timeout: 60000,
      });

      return {
        success: true,
        output: stdout,
        error: stderr || undefined,
      };
    } catch (error) {
      return {
        success: false,
        output: error.stdout || '',
        error: error.stderr || error.message,
      };
    }
  }

  async createPR(title, description, workspacePath) {
    try {
      const gitDir = path.join(workspacePath, '.git');
      if (!fs.existsSync(gitDir)) {
        return {
          success: false,
          message: 'Not a git repository',
          error: 'The workspace is not a git repository. Please initialize git first.',
        };
      }

      const { stdout: status } = await execAsync('git status --porcelain', { cwd: workspacePath });
      if (!status.trim()) {
        return {
          success: false,
          message: 'No changes to commit',
          error: 'There are no changes to create a PR from.',
        };
      }

      const branchName = `pr-${Date.now()}`;
      await execAsync(`git checkout -b ${branchName}`, { cwd: workspacePath });
      await execAsync('git add .', { cwd: workspacePath });
      await execAsync(`git commit -m "${title}\n\n${description}"`, { cwd: workspacePath });

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
    } catch (error) {
      return {
        success: false,
        message: 'Failed to create PR',
        error: error.message || 'Unknown error',
      };
    }
  }

  async applyPatch(patch) {
    try {
      const filePath = patch.file;
      
      if (!fs.existsSync(filePath)) {
        return {
          success: false,
          message: 'File not found',
          error: `File ${filePath} does not exist`,
        };
      }

      let content = fs.readFileSync(filePath, 'utf-8');
      const sortedEdits = [...patch.edits].sort((a, b) => b.start - a.start);
      
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

      fs.writeFileSync(filePath, content, 'utf-8');

      return {
        success: true,
        message: `Successfully applied patch to ${filePath}`,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to apply patch',
        error: error.message || 'Unknown error',
      };
    }
  }
}

module.exports = { MCPService };

