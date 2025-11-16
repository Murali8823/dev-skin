# MCP Server

Model Context Protocol (MCP) server for Dev Skin tools. Provides a standardized interface for invoking tools like running tests and creating PRs.

## Endpoints

### GET /manifest
Returns the MCP manifest describing available tools and their schemas.

### POST /invoke/:toolName
Invokes a tool by name. Routes to the appropriate adapter endpoint.

**Example:**
```bash
curl -X POST http://localhost:8001/invoke/run-tests \
  -H "Content-Type: application/json" \
  -d '{"repoPath": "/path/to/repo"}'
```

### GET /health
Health check endpoint.

## Tools

### run-tests
Runs tests in a repository.

**Input:**
```json
{
  "repoPath": "/path/to/repository"
}
```

**Output:**
```json
{
  "success": true,
  "exitCode": 0,
  "stdout": "...",
  "stderr": ""
}
```

### create-pr
Creates a pull request by creating a branch, committing changes, and pushing.

**Input:**
```json
{
  "branchName": "feature/new-feature",
  "baseBranch": "main",
  "commitMsg": "Add new feature"
}
```

**Output:**
```json
{
  "prUrl": "https://github.com/user/repo/pull/123",
  "branchName": "feature/new-feature",
  "success": true,
  "message": "PR created successfully"
}
```

## Configuration

### Environment Variables

- `ADAPTER_URL`: URL of the adapter service (default: `http://localhost:8000`)
- `PORT`: Server port (default: `8001`)
- `MCP_TOKEN`: Optional API token for authentication
- `MCP_AUTH_ENABLED`: Set to `true` to enable token authentication (default: `false`)

### Authentication

By default, authentication is disabled. To enable:

1. Set `MCP_TOKEN` environment variable to your desired token
2. Set `MCP_AUTH_ENABLED=true`
3. Clients must include the token in the `x-mcp-token` header

**Example:**
```bash
export MCP_TOKEN=your-secret-token
export MCP_AUTH_ENABLED=true
```

Then clients should send:
```bash
curl -X POST http://localhost:8001/invoke/run-tests \
  -H "Content-Type: application/json" \
  -H "x-mcp-token: your-secret-token" \
  -d '{"repoPath": "/path/to/repo"}'
```

## Architecture

The MCP server acts as a proxy/router between MCP clients and the adapter service:

```
MCP Client → MCP Server → Adapter Service
```

This separation allows:
- Standardized MCP interface for tools
- Adapter service to focus on implementation
- Easy addition of new tools via manifest
- Optional authentication layer

