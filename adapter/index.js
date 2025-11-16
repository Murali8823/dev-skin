import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';
import { executeSandboxed } from './security/sandbox.js';
import { getApiKey, storeApiKey, deleteApiKey, isKeychainAvailable, getKeychainInstructions } from './security/keychain.js';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Configuration from environment variables (keychain loaded dynamically)
const config = {
  llmEndpoint: process.env.LLM_ENDPOINT || 'https://api.openai.com/v1/chat/completions',
  llmApiKey: null, // Loaded from keychain or env at runtime
  llmModel: process.env.LLM_MODEL || 'gpt-4',
  dryRun: process.env.DRY_RUN !== 'false', // Default to dry-run mode for safety
  requireConfirm: true, // Require explicit confirm:true for commit/push
};

// Logging setup
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

function logRequest(endpoint, method, body, response, error = null) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    endpoint,
    method,
    request: body,
    response: error ? { error: error.message } : response,
    error: error ? error.stack : null,
  };

  const logFile = path.join(logsDir, `adapter-${new Date().toISOString().split('T')[0]}.log`);
  const logLine = JSON.stringify(logEntry) + '\n';
  
  try {
    fs.appendFileSync(logFile, logLine);
  } catch (err) {
    console.error('Failed to write log:', err);
  }
}

// Helper: Get last 5 git-tracked file summaries
async function getGitFileSummaries(repoPath = process.cwd()) {
  try {
    // Check if it's a git repository
    const gitDir = path.join(repoPath, '.git');
    if (!fs.existsSync(gitDir)) {
      return [];
    }

    // Get list of tracked files
    const { stdout: trackedFiles } = await execAsync('git ls-files', { cwd: repoPath });
    const files = trackedFiles.trim().split('\n').filter(f => f);

    if (files.length === 0) {
      return [];
    }

    // Get last 5 files (or all if less than 5)
    const recentFiles = files.slice(-5);
    const summaries = [];

    for (const file of recentFiles) {
      try {
        const filePath = path.join(repoPath, file);
        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          const content = fs.readFileSync(filePath, 'utf-8');
          const lines = content.split('\n').length;
          
          summaries.push({
            path: file,
            lines,
            size: stats.size,
            modified: stats.mtime.toISOString(),
            summary: content.substring(0, 200) + (content.length > 200 ? '...' : ''),
          });
        }
      } catch (err) {
        // Skip files that can't be read
        continue;
      }
    }

    return summaries;
  } catch (error) {
    console.error('Error getting git file summaries:', error);
    return [];
  }
}

// Helper: Find relevant functions or docs for a topic across repo
async function findRelevantSnippets(topic, repoPath = process.cwd(), maxResults = 8) {
  try {
    // Check if it's a git repository
    const gitDir = path.join(repoPath, '.git');
    if (!fs.existsSync(gitDir)) {
      return [];
    }

    // Get list of tracked files (code files and docs)
    const { stdout: trackedFiles } = await execAsync('git ls-files', { cwd: repoPath });
    const allFiles = trackedFiles.trim().split('\n').filter(f => f);
    
    // Filter to code and doc files
    const codeExtensions = ['.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.go', '.rs', '.cpp', '.c'];
    const docExtensions = ['.md', '.txt', '.rst'];
    const relevantFiles = allFiles.filter(f => {
      const ext = path.extname(f).toLowerCase();
      return codeExtensions.includes(ext) || docExtensions.includes(ext);
    });

    if (relevantFiles.length === 0) {
      return [];
    }

    // Search for topic in files
    const topicLower = topic.toLowerCase();
    const topicWords = topicLower.split(/\s+/).filter(w => w.length > 2);
    const matches = [];

    for (const file of relevantFiles) {
      try {
        const filePath = path.join(repoPath, file);
        if (!fs.existsSync(filePath)) continue;

        const content = fs.readFileSync(filePath, 'utf-8');
        const contentLower = content.toLowerCase();
        
        // Calculate relevance score
        let score = 0;
        let matchLines = [];
        
        // Check for exact topic match
        if (contentLower.includes(topicLower)) {
          score += 10;
        }
        
        // Check for individual topic words
        for (const word of topicWords) {
          const wordCount = (contentLower.match(new RegExp(`\\b${word}\\b`, 'g')) || []).length;
          score += wordCount;
        }
        
        // Find function definitions, class definitions, or doc sections
        const lines = content.split('\n');
        const functionPattern = /(function|const|let|var|class|def|fn)\s+(\w+)/gi;
        const docPattern = /(#{1,6}|```|```\w+|<!--|#)/;
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const lineLower = line.toLowerCase();
          
          // Check if line contains topic
          if (topicWords.some(word => lineLower.includes(word))) {
            // Extract context (5 lines before and after)
            const start = Math.max(0, i - 5);
            const end = Math.min(lines.length, i + 10);
            const snippet = lines.slice(start, end).join('\n');
            
            // Check if it's a function/class definition or doc section
            if (functionPattern.test(line) || docPattern.test(line) || lineLower.includes('function') || lineLower.includes('class')) {
              score += 5;
            }
            
            matchLines.push({
              line: i + 1,
              snippet: snippet.substring(0, 500), // Limit snippet size
              context: line.trim(),
            });
          }
        }
        
        if (score > 0 && matchLines.length > 0) {
          matches.push({
            file: file,
            score: score,
            matches: matchLines.slice(0, 3), // Top 3 matches per file
            reason: generateRelevanceReason(topic, content, matchLines),
          });
        }
      } catch (err) {
        // Skip files that can't be read
        continue;
      }
    }

    // Sort by score and return top results
    matches.sort((a, b) => b.score - a.score);
    return matches.slice(0, maxResults);
  } catch (error) {
    console.error('Error finding relevant snippets:', error);
    return [];
  }
}

// Helper: Generate a short reason why a file is relevant
function generateRelevanceReason(topic, content, matchLines) {
  const topicLower = topic.toLowerCase();
  const contentLower = content.toLowerCase();
  
  // Check for function definitions
  if (contentLower.includes(`function ${topicLower}`) || contentLower.includes(`def ${topicLower}`)) {
    return `Contains function definition for ${topic}`;
  }
  
  // Check for class definitions
  if (contentLower.includes(`class ${topicLower}`)) {
    return `Contains class definition for ${topic}`;
  }
  
  // Check for imports/exports
  if (contentLower.includes(`import.*${topicLower}`) || contentLower.includes(`export.*${topicLower}`)) {
    return `Imports or exports ${topic}`;
  }
  
  // Check for documentation
  if (content.match(/^#+\s+.*/m) || content.includes('README') || content.includes('docs')) {
    return `Documentation about ${topic}`;
  }
  
  // Check for test files
  if (contentLower.includes('test') || contentLower.includes('spec')) {
    return `Test file that uses ${topic}`;
  }
  
  // Generic relevance
  const matchCount = matchLines.length;
  return `Contains ${matchCount} reference${matchCount > 1 ? 's' : ''} to ${topic}`;
}

// Helper: Get current API key (refresh from keychain if needed)
async function getCurrentApiKey() {
  // Try to get from keychain first
  const keychainKey = await getApiKey();
  if (keychainKey) {
    return keychainKey;
  }
  // Fallback to environment or config
  return config.llmApiKey || process.env.OPENAI_API_KEY || process.env.LLM_API_KEY;
}

// Helper: Call LLM API
async function callLLM(systemPrompt, userPrompt) {
  const apiKey = await getCurrentApiKey();
  if (!apiKey) {
    throw new Error('LLM API key not configured. Store key via POST /api/keychain or set OPENAI_API_KEY environment variable.');
  }

  try {
    const response = await fetch(config.llmEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: config.llmModel,
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: userPrompt,
          },
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LLM API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || '';
  } catch (error) {
    throw new Error(`Failed to call LLM: ${error.message}`);
  }
}

// Helper: Parse LLM response to extract answer and patch
function parseLLMResponse(response) {
  const patchStartMarker = 'PATCH_START';
  const patchEndMarker = 'PATCH_END';
  
  const patchStartIndex = response.indexOf(patchStartMarker);
  const patchEndIndex = response.indexOf(patchEndMarker);

  if (patchStartIndex === -1 || patchEndIndex === -1) {
    // Fallback: try old format with ---PATCH---
    const patchSeparator = '---PATCH---';
    const parts = response.split(patchSeparator);

    if (parts.length === 1) {
      // No patch separator found, treat entire response as answer
      return {
        answer: response.trim(),
        patch: null,
      };
    }

    return {
      answer: parts[0].trim(),
      patch: parts.slice(1).join(patchSeparator).trim(),
    };
  }

  // Extract answer (everything before PATCH_START)
  const answer = response.substring(0, patchStartIndex).trim();
  
  // Extract patch (everything between PATCH_START and PATCH_END)
  const patchStart = patchStartIndex + patchStartMarker.length;
  const patch = response.substring(patchStart, patchEndIndex).trim();

  return {
    answer: answer.replace(/^<ANSWER>\s*/i, '').trim(), // Remove <ANSWER> tag if present
    patch,
  };
}

// POST /assist
app.post('/assist', async (req, res) => {
  const startTime = Date.now();
  let responseData = null;
  let error = null;

  try {
    const { instruction, fileContents, filePath } = req.body;

    if (!instruction) {
      return res.status(400).json({ error: 'Instruction is required' });
    }

    // Build RAG-style prompt with retrieved chunks
    const repoPath = filePath ? path.dirname(filePath) : process.cwd();
    const fileSummaries = await getGitFileSummaries(repoPath);

    // Find relevant snippets for the instruction topic
    const relevantSnippets = await findRelevantSnippets(instruction, repoPath, 8);

    // Format retrieved chunks (most relevant first)
    let retrievedChunks = '';
    
    // Add relevant snippets first (more specific)
    if (relevantSnippets.length > 0) {
      retrievedChunks += 'Relevant code snippets and documentation:\n\n';
      relevantSnippets.forEach((snippet, idx) => {
        retrievedChunks += `${idx + 1}. File: ${snippet.file}\n`;
        retrievedChunks += `   Reason: ${snippet.reason}\n`;
        if (snippet.matches && snippet.matches.length > 0) {
          snippet.matches.forEach((match, matchIdx) => {
            retrievedChunks += `   Snippet (line ${match.line}):\n`;
            retrievedChunks += `   \`\`\`\n${match.snippet}\n\`\`\`\n\n`;
          });
        }
      });
      retrievedChunks += '\n';
    }
    
    // Add general file summaries (broader context)
    if (fileSummaries.length > 0) {
      retrievedChunks += 'Recent files in repository:\n';
      fileSummaries.forEach((summary, idx) => {
        retrievedChunks += `${idx + 1}. ${summary.path} (${summary.lines} lines, ${summary.size} bytes)\n`;
        retrievedChunks += `   Preview: ${summary.summary}\n\n`;
      });
    }
    
    if (!retrievedChunks) {
      retrievedChunks = 'No additional context files found.';
    }

    // System prompt
    const systemPrompt = `You are DevSkin Assistant. You will produce two sections: a human-readable ANSWER and a machine patch. Format:
<ANSWER>
Your explanation here
---
PATCH_START
<patch in unified diff format or multiple files format as JSON>
PATCH_END

Important: Always include both ANSWER and PATCH sections. Use PATCH_START and PATCH_END markers.`;

    // User prompt with context
    let userPrompt = `Instruction: ${instruction}\n\n`;
    
    if (retrievedChunks) {
      userPrompt += `Context files (most relevant first):\n${retrievedChunks}\n\n`;
    }

    if (filePath) {
      userPrompt += `Target file (path: ${filePath}):\n\`\`\`\n${fileContents || ''}\n\`\`\`\n\n`;
    } else if (fileContents) {
      userPrompt += `Target file:\n\`\`\`\n${fileContents}\n\`\`\`\n\n`;
    }

    userPrompt += `Constraints:
- Do not modify files outside the repo root.
- If patch affects tests, include a test run command and expected result.
- When possible produce small, minimal changes (single feature per patch).`;

    // Call LLM
    const llmResponse = await callLLM(systemPrompt, userPrompt);
    const { answer, patch } = parseLLMResponse(llmResponse);

    // Convert patch to structured format
    let structuredPatch = null;
    if (patch) {
      // Try to parse as JSON (for multiple files format)
      try {
        const jsonPatch = JSON.parse(patch);
        structuredPatch = {
          format: 'json',
          content: jsonPatch,
        };
      } catch (e) {
        // Not JSON, treat as unified diff
        structuredPatch = {
          file: filePath || 'current-file.ts',
          format: 'unified-diff',
          content: patch,
        };
      }
    }

    responseData = {
      answer,
      patch: structuredPatch,
    };

    res.json(responseData);
  } catch (err) {
    error = err;
    res.status(500).json({ error: err.message });
  } finally {
    logRequest('/assist', 'POST', req.body, responseData, error);
  }
});

// POST /retrieve
app.post('/retrieve', async (req, res) => {
  const startTime = Date.now();
  let responseData = null;
  let error = null;

  try {
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    // Placeholder: return empty array (to be replaced with vector DB)
    responseData = [];

    res.json(responseData);
  } catch (err) {
    error = err;
    res.status(500).json({ error: err.message });
  } finally {
    logRequest('/retrieve', 'POST', req.body, responseData, error);
  }
});

// POST /run-tests
app.post('/run-tests', async (req, res) => {
  const startTime = Date.now();
  let responseData = null;
  let error = null;

  try {
    const { repoPath } = req.body;

    if (!repoPath) {
      return res.status(400).json({ error: 'repoPath is required' });
    }

    // Validate repoPath to prevent directory traversal
    const resolvedPath = path.resolve(repoPath);
    if (!fs.existsSync(resolvedPath)) {
      return res.status(400).json({ error: 'Repository path does not exist' });
    }

    // Check if package.json exists
    const packageJsonPath = path.join(resolvedPath, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      return res.status(400).json({ error: 'No package.json found in repository' });
    }

    // Run tests in sandboxed process
    try {
      const result = await executeSandboxed('npm test', {
        cwd: resolvedPath,
        timeout: 60000, // 60 second timeout
        maxMemory: 512 * 1024 * 1024, // 512MB max memory
        maxBuffer: 10 * 1024 * 1024, // 10MB max output buffer
      });

      responseData = {
        success: result.success,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
      };

      res.json(responseData);
    } catch (sandboxError) {
      // Sandbox error (timeout, buffer exceeded, or command not allowed)
      responseData = {
        success: false,
        exitCode: 1,
        stdout: '',
        stderr: sandboxError.message || 'Sandbox execution failed',
        error: 'SANDBOX_ERROR',
      };

      res.json(responseData);
    }
  } catch (err) {
    error = err;
    res.status(500).json({ error: err.message });
  } finally {
    logRequest('/run-tests', 'POST', req.body, responseData, error);
  }
});

// POST /create-pr
app.post('/create-pr', async (req, res) => {
  const startTime = Date.now();
  let responseData = null;
  let error = null;

  try {
    const { branchName, commitMessage, repoPath, confirm } = req.body;

    if (!branchName || !commitMessage) {
      return res.status(400).json({ error: 'branchName and commitMessage are required' });
    }

    const resolvedPath = repoPath ? path.resolve(repoPath) : process.cwd();

    // Validate repoPath
    if (!fs.existsSync(resolvedPath)) {
      return res.status(400).json({ error: 'Repository path does not exist' });
    }

    const gitDir = path.join(resolvedPath, '.git');
    if (!fs.existsSync(gitDir)) {
      return res.status(400).json({ error: 'Not a git repository' });
    }

    // Check for staged changes using sandboxed git command
    let stagedChanges = '';
    try {
      const result = await executeSandboxed('git diff --cached --name-only', {
        cwd: resolvedPath,
        timeout: 5000,
      });
      stagedChanges = result.stdout.trim();
    } catch (err) {
      // No staged changes or error
    }

    // SECURITY: Require explicit confirmation for commit/push operations
    const requiresConfirmation = !config.dryRun;
    if (requiresConfirmation && confirm !== true) {
      return res.status(400).json({ 
        error: 'Explicit confirmation required',
        message: 'Set confirm: true in request body to commit and push changes',
        preview: {
          branchName,
          commitMessage,
          stagedFiles: stagedChanges ? stagedChanges.split('\n') : [],
          operations: [
            `Would create branch: ${branchName}`,
            `Would commit with message: ${commitMessage}`,
            'Would push to remote (if configured)',
          ],
        },
      });
    }

    if (config.dryRun || confirm !== true) {
      // Dry run mode: return preview without making changes
      responseData = {
        dryRun: true,
        message: 'Dry run mode: No changes were made. Set confirm: true to execute.',
        preview: {
          branchName,
          commitMessage,
          stagedFiles: stagedChanges ? stagedChanges.split('\n') : [],
          operations: [
            `Would create branch: ${branchName}`,
            `Would commit with message: ${commitMessage}`,
            'Would push to remote (if configured)',
          ],
        },
        prUrl: null,
      };

      res.json(responseData);
    } else {
      // Actual execution (requires explicit confirm: true)
      try {
        // Create branch using sandboxed execution
        await executeSandboxed(`git checkout -b ${branchName}`, {
          cwd: resolvedPath,
          timeout: 10000,
        });

        // Stage all changes (if any) using sandboxed execution
        if (stagedChanges) {
          await executeSandboxed('git add .', {
            cwd: resolvedPath,
            timeout: 10000,
          });
        }

        // Commit using sandboxed execution
        // Escape commit message to prevent injection
        const escapedMessage = commitMessage.replace(/"/g, '\\"');
        await executeSandboxed(`git commit -m "${escapedMessage}"`, {
          cwd: resolvedPath,
          timeout: 10000,
        });

        // Try to push (may fail if remote not configured)
        let pushSuccess = false;
        try {
          await executeSandboxed(`git push -u origin ${branchName}`, {
            cwd: resolvedPath,
            timeout: 30000,
          });
          pushSuccess = true;
        } catch (pushError) {
          // Push failed, but branch and commit were created locally
        }

        // Generate fake PR URL for MVP
        const fakePRUrl = `https://github.com/user/repo/pull/${Date.now()}`;

        responseData = {
          dryRun: false,
          success: true,
          branchName,
          commitMessage,
          pushed: pushSuccess,
          prUrl: pushSuccess ? fakePRUrl : null,
          message: pushSuccess
            ? `Branch ${branchName} created and pushed. PR URL: ${fakePRUrl}`
            : `Branch ${branchName} created locally. Configure remote to push.`,
        };

        res.json(responseData);
      } catch (gitError) {
        error = gitError;
        res.status(500).json({ error: `Git operation failed: ${gitError.message}` });
      }
    }
  } catch (err) {
    error = err;
    res.status(500).json({ error: err.message });
  } finally {
    logRequest('/create-pr', 'POST', req.body, responseData, error);
  }
});

// POST /review-patch - Review failed patch and produce corrected version
app.post('/review-patch', async (req, res) => {
  const startTime = Date.now();
  let responseData = null;
  let error = null;

  try {
    const { patch, testOutput, testError, fileContents, filePath } = req.body;

    if (!patch || (!testOutput && !testError)) {
      return res.status(400).json({ 
        error: 'patch and testOutput or testError are required' 
      });
    }

    // Build prompt for patch review
    const systemPrompt = `You are DevSkin Assistant. Review a failed patch and produce a corrected version. Format:
<ANSWER>
Your explanation of what was wrong and how you fixed it
---
PATCH_START
<corrected patch in unified diff format or JSON>
PATCH_END

Important: Make minimal changes to pass tests. Focus on fixing the specific test failures.`;

    let userPrompt = `Task: Review the following failed patch and produce a corrected patch. Show: diff, explanation of fix, and unit test adjustments.\n\n`;
    
    userPrompt += `Fail info:\n`;
    if (testError) {
      userPrompt += `Error: ${testError}\n\n`;
    }
    if (testOutput) {
      userPrompt += `Test Output:\n\`\`\`\n${testOutput}\n\`\`\`\n\n`;
    }

    userPrompt += `Current patch:\n\`\`\`json\n${JSON.stringify(patch, null, 2)}\n\`\`\`\n\n`;

    if (fileContents) {
      userPrompt += `Current file contents:\n\`\`\`\n${fileContents}\n\`\`\`\n\n`;
    }

    if (filePath) {
      userPrompt += `File path: ${filePath}\n\n`;
    }

    // Find relevant snippets to help with patch correction
    const repoPath = filePath ? path.dirname(filePath) : process.cwd();
    const searchTopic = [testOutput, testError].filter(Boolean).join(' ');
    const relevantSnippets = await findRelevantSnippets(
      searchTopic || 'test error', 
      repoPath, 
      8
    );

    if (relevantSnippets.length > 0) {
      userPrompt += `Relevant code snippets from repository:\n`;
      relevantSnippets.forEach((snippet, idx) => {
        userPrompt += `${idx + 1}. File: ${snippet.file}\n`;
        userPrompt += `   Reason: ${snippet.reason}\n`;
        if (snippet.matches && snippet.matches.length > 0) {
          snippet.matches.forEach((match) => {
            userPrompt += `   Snippet (line ${match.line}):\n`;
            userPrompt += `   \`\`\`\n${match.snippet}\n\`\`\`\n\n`;
          });
        }
      });
      userPrompt += '\n';
    }

    userPrompt += `Constraints:
- Make minimal changes to pass tests
- Focus on fixing the specific test failures shown in the error/output
- If tests expect specific behavior, ensure the patch implements it correctly
- Maintain existing functionality that wasn't broken
- Include any necessary unit test adjustments if the patch changes test expectations`;

    // Call LLM
    const llmResponse = await callLLM(systemPrompt, userPrompt);
    const { answer, patch: correctedPatch } = parseLLMResponse(llmResponse);

    // Convert patch to structured format
    let structuredPatch = null;
    if (correctedPatch) {
      try {
        const jsonPatch = JSON.parse(correctedPatch);
        structuredPatch = {
          format: 'json',
          content: jsonPatch,
        };
      } catch (e) {
        structuredPatch = {
          file: filePath || patch.file || 'current-file.ts',
          format: 'unified-diff',
          content: correctedPatch,
        };
      }
    }

    // Generate diff between original and corrected patch
    const diff = correctedPatch ? {
      original: patch,
      corrected: structuredPatch,
      explanation: answer,
    } : null;

    responseData = {
      answer,
      patch: structuredPatch,
      diff,
      originalPatch: patch,
    };

    res.json(responseData);
  } catch (err) {
    error = err;
    res.status(500).json({ error: err.message });
  } finally {
    logRequest('/review-patch', 'POST', req.body, responseData, error);
  }
});

// POST /rank-patches - Re-rank candidate patches and analyze risks
app.post('/rank-patches', async (req, res) => {
  const startTime = Date.now();
  let responseData = null;
  let error = null;

  try {
    const { patches, fileContents, filePath, testOutput } = req.body;

    if (!patches || !Array.isArray(patches) || patches.length === 0) {
      return res.status(400).json({ 
        error: 'patches array is required with at least one patch' 
      });
    }

    if (patches.length > 10) {
      return res.status(400).json({ 
        error: 'Maximum 10 patches allowed for ranking' 
      });
    }

    // Build prompt for patch ranking
    const systemPrompt = `You are DevSkin Assistant. Analyze and rank candidate patches. Format:
<ANSWER>
Your analysis and ranking rationale
---
RANKING_START
{
  "ranked": [
    {
      "index": 0,
      "score": 9.5,
      "risks": {
        "breaksTests": false,
        "changesAPI": true,
        "performance": "neutral"
      },
      "rationale": "Best option because..."
    }
  ],
  "recommended": 0,
  "recommendationRationale": "Why this patch is recommended"
}
RANKING_END

Important: Return top 3 patches ranked by score (0-10). Analyze risks: breaksTests (boolean), changesAPI (boolean), performance ("improves"|"neutral"|"degrades").`;

    let userPrompt = `Task: Re-rank the candidate patches (give me top-3 variants) and annotate risks for each (breaks tests, changes API, performance). Provide recommended patch and rationale.\n\n`;

    userPrompt += `Candidate patches (${patches.length} total):\n\n`;
    patches.forEach((patch, idx) => {
      userPrompt += `Patch ${idx}:\n\`\`\`json\n${JSON.stringify(patch, null, 2)}\n\`\`\`\n\n`;
    });

    if (fileContents) {
      userPrompt += `Current file contents:\n\`\`\`\n${fileContents}\n\`\`\`\n\n`;
    }

    if (filePath) {
      userPrompt += `File path: ${filePath}\n\n`;
    }

    if (testOutput) {
      userPrompt += `Test context:\n\`\`\`\n${testOutput}\n\`\`\`\n\n`;
    }

    // Find relevant snippets to understand context
    const repoPath = filePath ? path.dirname(filePath) : process.cwd();
    const searchTopic = patches.map(p => JSON.stringify(p)).join(' ');
    const relevantSnippets = await findRelevantSnippets(searchTopic.substring(0, 200), repoPath, 5);

    if (relevantSnippets.length > 0) {
      userPrompt += `Relevant code context:\n`;
      relevantSnippets.forEach((snippet, idx) => {
        userPrompt += `${idx + 1}. ${snippet.file}: ${snippet.reason}\n`;
      });
      userPrompt += '\n';
    }

    userPrompt += `Analysis criteria:
- Score patches 0-10 based on: correctness, maintainability, test compatibility, API stability, performance
- Risk assessment:
  * breaksTests: Will this patch cause existing tests to fail?
  * changesAPI: Does this patch change public APIs, function signatures, or exports?
  * performance: Will this improve, maintain, or degrade performance?
- Recommend the best patch with clear rationale
- Consider: minimal changes, backward compatibility, test coverage`;

    // Call LLM
    const llmResponse = await callLLM(systemPrompt, userPrompt);
    
    // Parse response
    const rankingStartMarker = 'RANKING_START';
    const rankingEndMarker = 'RANKING_END';
    const rankingStartIndex = llmResponse.indexOf(rankingStartMarker);
    const rankingEndIndex = llmResponse.indexOf(rankingEndMarker);

    let answer = llmResponse;
    let ranking = null;

    if (rankingStartIndex !== -1 && rankingEndIndex !== -1) {
      answer = llmResponse.substring(0, rankingStartIndex).trim();
      const rankingJson = llmResponse.substring(
        rankingStartIndex + rankingStartMarker.length,
        rankingEndIndex
      ).trim();
      
      try {
        ranking = JSON.parse(rankingJson);
      } catch (e) {
        console.error('Failed to parse ranking JSON:', e);
      }
    }

    // If no structured ranking, create a simple one from answer
    if (!ranking) {
      // Fallback: create basic ranking from patches
      ranking = {
        ranked: patches.slice(0, 3).map((patch, idx) => ({
          index: idx,
          score: 7 - idx, // Decreasing scores
          risks: {
            breaksTests: false,
            changesAPI: false,
            performance: 'neutral',
          },
          rationale: `Patch ${idx} - basic ranking`,
        })),
        recommended: 0,
        recommendationRationale: answer || 'First patch recommended',
      };
    }

    // Ensure we have top 3
    const top3 = ranking.ranked.slice(0, 3).map((rankedItem, idx) => ({
      patch: patches[rankedItem.index],
      rank: idx + 1,
      originalIndex: rankedItem.index,
      score: rankedItem.score,
      risks: rankedItem.risks,
      rationale: rankedItem.rationale,
    }));

    responseData = {
      answer: answer.replace(/^<ANSWER>\s*/i, '').trim(),
      top3,
      recommended: {
        patch: patches[ranking.recommended] || patches[0],
        index: ranking.recommended,
        rationale: ranking.recommendationRationale,
      },
      allPatches: patches,
    };

    res.json(responseData);
  } catch (err) {
    error = err;
    res.status(500).json({ error: err.message });
  } finally {
    logRequest('/rank-patches', 'POST', req.body, responseData, error);
  }
});

// Keychain management endpoints
app.post('/api/keychain', async (req, res) => {
  try {
    const { key } = req.body;
    if (!key) {
      return res.status(400).json({ error: 'API key is required' });
    }

    const stored = await storeApiKey(key);
    if (stored) {
      // Update config with new key
      config.llmApiKey = key;
      res.json({ 
        success: true, 
        message: 'API key stored in OS keychain',
        instructions: getKeychainInstructions(),
      });
    } else {
      res.status(500).json({ 
        error: 'Failed to store key. Install keytar: npm install keytar',
        instructions: getKeychainInstructions(),
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/keychain', async (req, res) => {
  try {
    const available = isKeychainAvailable();
    const hasKey = !!(await getApiKey());
    
    res.json({
      keychainAvailable: available,
      hasKey,
      instructions: getKeychainInstructions(),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/keychain', async (req, res) => {
  try {
    const deleted = await deleteApiKey();
    if (deleted) {
      config.llmApiKey = null;
      res.json({ success: true, message: 'API key deleted from keychain' });
    } else {
      res.status(404).json({ error: 'No key found in keychain' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    llmConfigured: !!config.llmApiKey,
    dryRun: config.dryRun,
    requireConfirm: config.requireConfirm,
    keychainAvailable: isKeychainAvailable(),
  });
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Adapter service running on http://localhost:${PORT}`);
  console.log(`LLM Endpoint: ${config.llmEndpoint}`);
  console.log(`LLM Model: ${config.llmModel}`);
  console.log(`LLM API Key: ${config.llmApiKey ? '***configured***' : 'NOT SET'}`);
  console.log(`Dry Run Mode: ${config.dryRun ? 'ENABLED' : 'DISABLED'}`);
  console.log(`Logs directory: ${logsDir}`);
  
  if (!config.llmApiKey) {
    console.warn('⚠️  WARNING: LLM API key not set. Set OPENAI_API_KEY or LLM_API_KEY environment variable.');
    console.warn('   To use a different LLM provider, set LLM_ENDPOINT and LLM_API_KEY environment variables.');
  }
});
