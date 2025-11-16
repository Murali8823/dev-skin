# Dev Skin Desktop MVP

AI-powered code editor with LLM-driven patch generation, RAG context retrieval, MCP tool integration, and sandboxed test execution.

## Architecture Snapshot

Electron desktop shell hosts React+Monaco UI, communicates via IPC bridge to Node adapter service providing LLM/RAG endpoints, with MCP server exposing tools for external integrations.

```
Renderer (React+Monaco) ⇄ Preload (IPC Bridge) ⇄ Main (Electron) → Adapter (Express) ⇄ {RAG Stub, LLM API, MCP Server}
```

## Code Overview

- **electron/main.js** – Electron main process, window creation, context isolation enabled
- **electron/preload.js** – IPC bridge exposing safe APIs via contextBridge
- **renderer/src/App.jsx** – React UI with Monaco editor and assistant sidebar
- **adapter/index.js** – Express server: `/assist`, `/run-tests`, `/create-pr`, `/review-patch`, `/rank-patches`
- **adapter/security/sandbox.js** – Command allowlist, process isolation, timeout/memory limits
- **adapter/security/keychain.js** – OS keychain integration for API key storage
- **mcp-server/manifest.json** – MCP tool definitions (run-tests, create-pr)
- **mcp-server/server.js** – MCP protocol server forwarding to adapter
- **RAG stub** – `getGitFileSummaries()` + `findRelevantSnippets()` in adapter (FAISS placeholder)

## Tools & Technologies

- **Electron** (desktop shell) – **React + Vite** (UI) – **Monaco** (editor) – **Node/Express** (adapter) – **FAISS stub** (vector store) – **OpenAI/Gemini** (LLM) – **Git** (VCS) – **electron-builder** (packaging) – **Mocha/Chai** (testing) – **keytar** (keychain)

## Step-by-Step Implementation Summary

1. **Scaffold monorepo** – Created workspaces: electron, renderer, adapter, mcp-server
2. **Build UI** – React app with Monaco editor, assistant panel, patch preview
3. **Implement adapter** – Express endpoints for LLM calls, RAG retrieval, test execution, PR creation
4. **Add RAG stub** – Git-based file summaries and snippet search (FAISS placeholder)
5. **Create MCP manifest** – Tool definitions for run-tests and create-pr
6. **Apply-patch flow** – Dry-run preview → confirmation → file edits with validation
7. **Sandbox tests** – Command allowlist, process isolation, timeout/memory limits, explicit confirmation for git operations
8. **Demo script** – End-to-end flow from instruction to patch application

## How to Run / Quickstart

```bash
git clone <repo>
cd dev-skin
npm install

# Set API key (required)
export OPENAI_API_KEY=sk-your-key-here

# Start all services (renderer, adapter, MCP, electron)
npm run start:dev

# Or start individually:
cd adapter && npm start          # Port 8000
cd renderer && npm run dev       # Port 5173
cd mcp-server && npm start       # Port 8001
cd electron && npm run start     # Launches app
```

**Environment variables:** `OPENAI_API_KEY` (required), `LLM_MODEL` (default: gpt-4), `DRY_RUN` (default: true), `MCP_TOKEN` (optional auth)

## Demo Script

1. **Open app** → Monaco editor loads with assistant sidebar
2. **Paste instruction** → "Add error handling to fetchData function" → Click "✨ Generate Patch"
3. **Review patch** → Preview appears below chat → Click "✅ Apply Patch" (dry-run) → Confirm → Patch applied
4. **Run tests** → Click "Run Tests" → Sandboxed execution → Results displayed
5. **Create PR** → Click "Create PR" → Branch created → Commit → Push (requires `confirm: true`)

## Testing & Validation

- **Unit tests** – `npm test` runs Mocha suite (`test/test-assist.spec.js`)
- **Test output** – Validates `/assist` endpoint, patch format, LLM response parsing
- **Lint** – Check code style (add `npm run lint` if configured)
- **Patch dry-run** – Default mode previews changes without file modifications
- **Branch verification** – `git branch` confirms branch creation after PR flow

## Security & Safety

- **Sandbox tests** – Command allowlist blocks `rm -rf`, `sudo`, shell injection; 60s timeout, 512MB memory limit
- **Dry-run default** – All destructive operations preview first, require `confirm: true`
- **API keys in keychain** – OS-level storage (macOS Keychain, Windows Credential Manager, Linux Secret Service)
- **Context isolation** – Electron `contextIsolation: true`, no Node integration in renderer
- **Explicit confirmation** – Git commit/push require `confirm: true` in request body
- **Path validation** – Directory traversal prevention, repository validation

## Packaging & Next Steps

- **electron-builder** – `npm run package` creates distributable (NSIS/DMG/AppImage)
- **Auto-update** – Add electron-updater for seamless updates
- **Replace RAG stub** – Integrate FAISS + sentence-transformers for vector search
- **MCP auth** – Enable token-based authentication with `MCP_AUTH_ENABLED=true`
- **Production config** – Disable DevTools, set `NODE_ENV=production`, use built renderer

## Troubleshooting / FAQs

- **App won't start?** – Check ports 5173, 8000, 8001 available; verify Node.js 18+
- **LLM errors?** – Verify `OPENAI_API_KEY` set and has credits; check adapter logs in `adapter/logs/`
- **Patch not applying?** – Check file paths exist; review `dryRun` flag; validate patch format (unified diff or JSON)

## Appendix: Essential Commands & Paths

| Command | Purpose |
|---------|---------|
| `npm run start:dev` | Start all services + Electron |
| `npm test` | Run test suite |
| `npm run build` | Build renderer for production |
| `npm run package` | Package app with electron-builder |
| `curl http://localhost:8000/health` | Check adapter health |

| Path | Description |
|------|-------------|
| `electron/main.js` | Electron entry point |
| `adapter/index.js` | Adapter service endpoints |
| `adapter/security/` | Sandbox, keychain, allowlist |
| `mcp-server/manifest.json` | MCP tool definitions |
| `renderer/src/App.jsx` | React UI main component |
| `adapter/logs/` | Request logs (audit trail) |

---

**Document generated by Kiro — concise single-page summary.**
