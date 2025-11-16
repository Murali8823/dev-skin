# Adapter Service

Express service providing LLM + RAG endpoints for Dev Skin.

## Environment Configuration

### Required
- `OPENAI_API_KEY` or `LLM_API_KEY`: API key for LLM service

### Optional
- `LLM_ENDPOINT`: LLM API endpoint (default: `https://api.openai.com/v1/chat/completions`)
- `LLM_MODEL`: Model name (default: `gpt-4`)
- `PORT`: Server port (default: `8000`)
- `DRY_RUN`: Set to `false` to disable dry-run mode for PR creation (default: `true`)

## Endpoints

### POST /assist
Generate code patches using LLM with RAG context.

**Request:**
```json
{
  "instruction": "Add error handling",
  "fileContents": "function test() { ... }",
  "filePath": "src/file.ts" // optional
}
```

**Response:**
```json
{
  "answer": "I will add try-catch blocks...",
  "patch": {
    "file": "src/file.ts",
    "format": "unified-diff",
    "content": "--- a/src/file.ts\n+++ b/src/file.ts\n..."
  }
}
```

### POST /retrieve
Placeholder for vector DB retrieval (returns empty array).

### POST /run-tests
Run tests in a repository safely.

**Request:**
```json
{
  "repoPath": "/path/to/repo"
}
```

**Response:**
```json
{
  "success": true,
  "exitCode": 0,
  "stdout": "...",
  "stderr": ""
}
```

### POST /review-patch
Review a failed patch and produce a corrected version based on test failures.

**Request:**
```json
{
  "patch": { "file": "src/file.js", "edits": [...] },
  "testOutput": "Test output or error message",
  "testError": "Error message (optional)",
  "fileContents": "Current file contents",
  "filePath": "src/file.js"
}
```

**Response:**
```json
{
  "answer": "Explanation of what was wrong and how it was fixed",
  "patch": {
    "format": "unified-diff",
    "content": "..."
  },
  "diff": {
    "original": {...},
    "corrected": {...},
    "explanation": "..."
  }
}
```

### POST /rank-patches
Re-rank candidate patches and analyze risks.

**Request:**
```json
{
  "patches": [
    { "file": "src/file.js", "edits": [...] },
    { "file": "src/file.js", "edits": [...] }
  ],
  "fileContents": "Current file contents",
  "filePath": "src/file.js",
  "testOutput": "Test context (optional)"
}
```

**Response:**
```json
{
  "answer": "Analysis explanation",
  "top3": [
    {
      "patch": {...},
      "rank": 1,
      "score": 9.5,
      "risks": {
        "breaksTests": false,
        "changesAPI": true,
        "performance": "neutral"
      },
      "rationale": "Why this patch ranks here"
    }
  ],
  "recommended": {
    "patch": {...},
    "index": 0,
    "rationale": "Why this is recommended"
  }
}
```

### POST /create-pr
Create a PR branch and commit changes (requires explicit confirmation).

**Request:**
```json
{
  "branchName": "feature/new-feature",
  "commitMessage": "Add new feature",
  "repoPath": "/path/to/repo", // optional, defaults to cwd
  "confirm": true // REQUIRED for actual execution
}
```

**Response (without confirmation):**
```json
{
  "error": "Explicit confirmation required",
  "message": "Set confirm: true in request body to commit and push changes",
  "preview": {
    "branchName": "feature/new-feature",
    "commitMessage": "Add new feature",
    "stagedFiles": ["src/file.js"],
    "operations": [
      "Would create branch: feature/new-feature",
      "Would commit with message: Add new feature",
      "Would push to remote (if configured)"
    ]
  }
}
```

**Response (with confirmation):**
```json
{
  "dryRun": false,
  "success": true,
  "branchName": "feature/new-feature",
  "commitMessage": "Add new feature",
  "pushed": true,
  "prUrl": "https://github.com/user/repo/pull/123"
}
```

### POST /api/keychain
Store API key in OS keychain.

**Request:**
```json
{
  "key": "sk-your-api-key"
}
```

**Response:**
```json
{
  "success": true,
  "message": "API key stored in OS keychain",
  "instructions": "Platform-specific instructions..."
}
```

### GET /api/keychain
Check keychain status and availability.

**Response:**
```json
{
  "keychainAvailable": true,
  "hasKey": true,
  "instructions": "Platform-specific instructions..."
}
```

### DELETE /api/keychain
Remove API key from OS keychain.

**Response:**
```json
{
  "success": true,
  "message": "API key deleted from keychain"
}
```

### GET /health
Health check and configuration status.

**Response:**
```json
{
  "status": "ok",
  "llmConfigured": true,
  "dryRun": true,
  "requireConfirm": true,
  "keychainAvailable": true
}
```

## Logging

All requests are logged to `adapter/logs/adapter-YYYY-MM-DD.log` in JSON format.

## Security

The adapter implements multiple layers of security to ensure safe local execution:

### 1. Process Sandboxing

All external commands run in isolated child processes with strict resource limits:

- **Timeout**: 60 seconds default (configurable via `SANDBOX_TIMEOUT` env var)
- **Max Memory**: 512MB default (configurable via `SANDBOX_MAX_MEMORY` env var)
- **Max Buffer**: 10MB output buffer (configurable via `SANDBOX_MAX_BUFFER` env var)
- **Process Isolation**: Commands run in separate child processes with no access to parent process

Example configuration:
```bash
export SANDBOX_TIMEOUT=30000        # 30 seconds
export SANDBOX_MAX_MEMORY=268435456 # 256MB
export SANDBOX_MAX_BUFFER=5242880   # 5MB
```

### 2. Command Allowlist

Only explicitly whitelisted commands can be executed. Dangerous operations are blocked:

**Allowed Commands:**
- Git: `status`, `diff`, `log`, `ls-files`, `checkout -b`, `add`, `commit`, `push` (with confirmation)
- NPM/Yarn: `test` only
- Python: `pytest`, `unittest`
- Safe utilities: `ls`, `dir`, `pwd`, `echo`

**Blocked Patterns:**
- File deletion: `rm -rf`, `del /s`, `rmdir /s`
- System commands: `shutdown`, `reboot`, `format`, `mkfs`
- Privilege escalation: `sudo`, `su`
- Shell injection: pipes (`|`), redirects (`>`, `<`), command chaining (`&`, `;`)
- Remote execution: `curl | sh`, `wget | sh`
- Dangerous operations: `chmod 777`, `kill -9`, `eval`, `exec`

### 3. API Key Storage (OS Keychain)

API keys are stored securely in the operating system's native keychain:

**macOS (Keychain Access):**
```bash
# Install keytar dependency
npm install keytar

# Store key via API
curl -X POST http://localhost:8000/api/keychain \
  -H "Content-Type: application/json" \
  -d '{"key": "sk-your-api-key"}'

# View stored keys
# Open Keychain Access app > search "dev-skin"

# Delete key
curl -X DELETE http://localhost:8000/api/keychain
```

**Windows (Credential Manager):**
```bash
# Install keytar dependency
npm install keytar

# Store key via API (same as above)

# View stored keys
# Control Panel > Credential Manager > Windows Credentials
# Look for "dev-skin" entry

# Delete key via API or Credential Manager
```

**Linux (Secret Service / libsecret):**
```bash
# Install system dependencies
sudo apt-get install libsecret-1-dev  # Debian/Ubuntu
sudo dnf install libsecret-devel      # Fedora
sudo pacman -S libsecret              # Arch

# Install keytar dependency
npm install keytar

# Store key via API (same as above)

# View stored keys
secret-tool search service dev-skin

# Delete key
secret-tool clear service dev-skin account llm-api-key
```

**Keychain API Endpoints:**

```bash
# Store API key
POST /api/keychain
{
  "key": "sk-your-api-key"
}

# Check keychain status
GET /api/keychain
# Returns: { keychainAvailable: true, hasKey: true, instructions: "..." }

# Delete API key
DELETE /api/keychain
```

**Fallback (Environment Variables):**

If keychain is not available, set environment variables:
```bash
export OPENAI_API_KEY="sk-your-api-key"
# or
export LLM_API_KEY="your-api-key"
```

### 4. Explicit Confirmation for Destructive Operations

Commit and push operations require explicit `confirm: true` in the request:

```javascript
// This will be rejected
POST /create-pr
{
  "branchName": "feature/new",
  "commitMessage": "Add feature"
}
// Response: { error: "Explicit confirmation required", preview: {...} }

// This will execute
POST /create-pr
{
  "branchName": "feature/new",
  "commitMessage": "Add feature",
  "confirm": true  // Required!
}
```

**Dry-Run Mode:**

Set `DRY_RUN=false` to enable actual execution (default is `true`):
```bash
export DRY_RUN=false
```

### 5. Path Validation

All file system operations validate paths to prevent directory traversal:
- Paths are resolved to absolute paths
- Operations are restricted to the repository root
- Symbolic links are validated
- Parent directory traversal (`../`) is blocked outside repo

### 6. Request Logging

All API requests are logged for audit purposes:
- Location: `adapter/logs/adapter-YYYY-MM-DD.log`
- Format: JSON with timestamp, endpoint, request, response, errors
- Includes full request/response for debugging and security audits

### Security Best Practices

1. **Never commit API keys** to version control
2. **Use keychain storage** instead of environment variables when possible
3. **Review logs regularly** for suspicious activity
4. **Keep dependencies updated** (`npm audit`, `npm update`)
5. **Run adapter on localhost only** (not exposed to network)
6. **Use HTTPS** for LLM endpoints
7. **Set resource limits** appropriate for your system
8. **Enable dry-run mode** by default in production

### Security Checklist

- [ ] API key stored in OS keychain (not in code/env files)
- [ ] `DRY_RUN=true` for initial testing
- [ ] Resource limits configured for your system
- [ ] Logs directory has appropriate permissions
- [ ] Adapter runs on localhost only (not 0.0.0.0)
- [ ] Dependencies audited (`npm audit`)
- [ ] Command allowlist reviewed for your use case

