# Security Quick Reference

## 🚀 Quick Setup (5 Steps)

```bash
# 1. Install dependencies
cd adapter && npm install && npm install keytar

# 2. Start adapter
npm start

# 3. Store API key (in another terminal)
curl -X POST http://localhost:8000/api/keychain \
  -H "Content-Type: application/json" \
  -d '{"key": "sk-your-api-key"}'

# 4. Test in dry-run mode (default)
curl -X POST http://localhost:8000/assist \
  -H "Content-Type: application/json" \
  -d '{"instruction": "test", "fileContents": "..."}'

# 5. Enable production (after testing)
export DRY_RUN=false && npm start
```

## 🔒 Security Features

| Feature | Status | Configuration |
|---------|--------|---------------|
| Process Sandbox | ✅ Active | `SANDBOX_TIMEOUT=60000` |
| Command Allowlist | ✅ Active | See `commandAllowlist.js` |
| OS Keychain | ✅ Active | `npm install keytar` |
| Confirmation Required | ✅ Active | `confirm: true` in request |
| Audit Logging | ✅ Active | `adapter/logs/*.log` |

## 🛡️ Command Allowlist

### ✅ Allowed
```bash
git status, diff, log, ls-files, branch, remote, show
git checkout -b <branch>
git add ., commit -m "...", push (with confirm:true)
npm test, yarn test
pytest, python -m unittest
ls, dir, pwd, echo
```

### ❌ Blocked
```bash
rm -rf, del /s, rmdir /s
sudo, su
shutdown, reboot, format
| (pipes), > (redirects), & (chaining)
curl | sh, wget | sh
eval, exec, system
chmod 777, kill -9, pkill
```

## 🔑 Keychain Management

### Store Key
```bash
curl -X POST http://localhost:8000/api/keychain \
  -H "Content-Type: application/json" \
  -d '{"key": "sk-your-api-key"}'
```

### Check Status
```bash
curl http://localhost:8000/api/keychain
# Returns: { keychainAvailable: true, hasKey: true }
```

### Delete Key
```bash
curl -X DELETE http://localhost:8000/api/keychain
```

### View Stored Keys

**macOS:**
```bash
open "/Applications/Utilities/Keychain Access.app"
# Search: "dev-skin"
```

**Windows:**
```powershell
control /name Microsoft.CredentialManager
# Look for: "dev-skin"
```

**Linux:**
```bash
secret-tool search service dev-skin
```

## ⚙️ Configuration

### Environment Variables
```bash
# Sandbox limits
export SANDBOX_TIMEOUT=60000        # 60 seconds
export SANDBOX_MAX_MEMORY=536870912 # 512MB
export SANDBOX_MAX_BUFFER=10485760  # 10MB

# Dry-run mode
export DRY_RUN=true   # Preview only (default)
export DRY_RUN=false  # Enable execution

# LLM configuration
export LLM_ENDPOINT="https://api.openai.com/v1/chat/completions"
export LLM_MODEL="gpt-4"

# Server
export PORT=8000
```

## 📝 API Endpoints

### Health Check
```bash
curl http://localhost:8000/health
```

### Store API Key
```bash
POST /api/keychain
{"key": "sk-..."}
```

### Check Keychain
```bash
GET /api/keychain
```

### Delete API Key
```bash
DELETE /api/keychain
```

### Run Tests (Sandboxed)
```bash
POST /run-tests
{"repoPath": "."}
```

### Create PR (Requires Confirmation)
```bash
POST /create-pr
{"branchName": "...", "commitMessage": "...", "confirm": true}
```

## 🧪 Testing Security

### Test Sandbox
```bash
# Set tight limits
export SANDBOX_TIMEOUT=5000
export SANDBOX_MAX_MEMORY=134217728
npm start

# Run test
curl -X POST http://localhost:8000/run-tests \
  -H "Content-Type: application/json" \
  -d '{"repoPath": "."}'
```

### Test Confirmation
```bash
# Without confirmation - should fail
curl -X POST http://localhost:8000/create-pr \
  -H "Content-Type: application/json" \
  -d '{"branchName": "test", "commitMessage": "Test"}'

# With confirmation - should succeed (if DRY_RUN=false)
curl -X POST http://localhost:8000/create-pr \
  -H "Content-Type: application/json" \
  -d '{"branchName": "test", "commitMessage": "Test", "confirm": true}'
```

## 📊 Monitoring

### View Logs
```bash
# Today's log
tail -f adapter/logs/adapter-$(date +%Y-%m-%d).log

# All logs
ls -lh adapter/logs/
```

### Log Format
```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "endpoint": "/assist",
  "method": "POST",
  "request": {...},
  "response": {...},
  "error": null
}
```

## ✅ Security Checklist

Before production:
- [ ] `npm install keytar` installed
- [ ] API key in keychain (not env/code)
- [ ] Tested in dry-run mode
- [ ] Resource limits configured
- [ ] Runs on localhost only
- [ ] `npm audit` passed
- [ ] Logs directory secured
- [ ] Confirmation requirements understood

## 🚨 Common Issues

### Keychain Not Available
```bash
# Install keytar
npm install keytar

# Restart adapter
npm start

# Verify
curl http://localhost:8000/api/keychain
```

### Command Blocked
```bash
# Check allowlist
cat adapter/security/commandAllowlist.js

# If safe, add to ALLOWED_COMMANDS
```

### Timeout Exceeded
```bash
# Increase timeout
export SANDBOX_TIMEOUT=120000  # 2 minutes
npm start
```

### Memory Limit Exceeded
```bash
# Increase memory
export SANDBOX_MAX_MEMORY=1073741824  # 1GB
npm start
```

## 🎯 Best Practices

### DO ✅
- Store keys in OS keychain
- Test in dry-run mode first
- Review logs regularly
- Keep dependencies updated
- Run on localhost only
- Use HTTPS for LLM endpoints
- Set appropriate resource limits

### DON'T ❌
- Commit API keys to git
- Expose adapter to network
- Disable security features
- Run with sudo
- Store keys in .env files
- Skip dry-run testing
- Ignore security warnings

## 📚 Documentation

- **Main:** `adapter/README.md`
- **Security:** `adapter/SECURITY.md`
- **Patch:** `adapter-security-hardening.diff`
- **Summary:** `SECURITY_IMPLEMENTATION_SUMMARY.md`

## 🆘 Emergency Response

### Stop Adapter
```bash
pkill -f "node.*adapter"
```

### Review Logs
```bash
tail -100 adapter/logs/adapter-$(date +%Y-%m-%d).log
```

### Rotate API Key
```bash
# Delete old key
curl -X DELETE http://localhost:8000/api/keychain

# Store new key
curl -X POST http://localhost:8000/api/keychain \
  -H "Content-Type: application/json" \
  -d '{"key": "sk-new-key"}'
```

### Audit Dependencies
```bash
npm audit
npm audit fix
```

## 🔗 Resources

- [OWASP Command Injection](https://owasp.org/www-community/attacks/Command_Injection)
- [Node.js Security](https://nodejs.org/en/docs/guides/security/)
- [keytar GitHub](https://github.com/atom/node-keytar)

## 📞 Support

**Security Issues:**
- Do not open public issues
- Contact maintainers directly
- Provide reproduction steps

**General Questions:**
- Check documentation
- Review logs
- Test with dry-run mode
- Verify keychain status

---

**Version:** 1.1.0  
**Last Updated:** 2024-01-15  
**Status:** ✅ All security features implemented and tested
