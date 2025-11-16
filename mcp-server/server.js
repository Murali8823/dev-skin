import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Configuration
const config = {
  adapterUrl: process.env.ADAPTER_URL || 'http://localhost:8000',
  mcpToken: process.env.MCP_TOKEN, // Optional API token for authentication
  authEnabled: process.env.MCP_AUTH_ENABLED === 'true', // Enable auth check if token is set
};

// Middleware: Optional API token authentication
// Set MCP_TOKEN environment variable and MCP_AUTH_ENABLED=true to enable
// Clients should send token in 'x-mcp-token' header
function authMiddleware(req, res, next) {
  if (!config.authEnabled || !config.mcpToken) {
    // Auth is disabled or no token configured, allow all requests
    return next();
  }

  const providedToken = req.headers['x-mcp-token'];
  
  if (!providedToken) {
    return res.status(401).json({ 
      error: 'Authentication required',
      message: 'Missing x-mcp-token header',
    });
  }

  if (providedToken !== config.mcpToken) {
    return res.status(403).json({ 
      error: 'Authentication failed',
      message: 'Invalid token',
    });
  }

  next();
}

// Apply auth middleware to all routes
app.use(authMiddleware);

// Load manifest
function loadManifest() {
  const manifestPath = path.join(__dirname, 'manifest.json');
  try {
    const manifestData = fs.readFileSync(manifestPath, 'utf-8');
    return JSON.parse(manifestData);
  } catch (error) {
    console.error('Error loading manifest:', error);
    return null;
  }
}

// GET /manifest - Serve the MCP manifest
app.get('/manifest', (req, res) => {
  const manifest = loadManifest();
  
  if (!manifest) {
    return res.status(500).json({ error: 'Failed to load manifest' });
  }

  res.json(manifest);
});

// Helper: Call adapter endpoint
async function callAdapter(endpoint, body) {
  try {
    const response = await fetch(`${config.adapterUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Adapter error: ${response.status} ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    throw new Error(`Failed to call adapter: ${error.message}`);
  }
}

// POST /invoke/:toolName - Invoke a tool by name
app.post('/invoke/:toolName', async (req, res) => {
  const { toolName } = req.params;
  const toolInput = req.body;

  try {
    const manifest = loadManifest();
    if (!manifest) {
      return res.status(500).json({ error: 'Failed to load manifest' });
    }

    // Find tool in manifest
    const tool = manifest.tools.find(t => t.name === toolName);
    if (!tool) {
      return res.status(404).json({ 
        error: 'Tool not found',
        availableTools: manifest.tools.map(t => t.name),
      });
    }

    // Route to appropriate adapter endpoint based on tool name
    let adapterResponse;
    
    switch (toolName) {
      case 'run-tests': {
        const { repoPath } = toolInput;
        if (!repoPath) {
          return res.status(400).json({ error: 'repoPath is required' });
        }

        adapterResponse = await callAdapter('/run-tests', { repoPath });
        
        // Transform adapter response to match tool output schema
        return res.json({
          success: adapterResponse.success || adapterResponse.exitCode === 0,
          exitCode: adapterResponse.exitCode || (adapterResponse.success ? 0 : 1),
          stdout: adapterResponse.stdout || '',
          stderr: adapterResponse.stderr || '',
        });
      }

      case 'create-pr': {
        const { branchName, baseBranch = 'main', commitMsg } = toolInput;
        
        if (!branchName || !commitMsg) {
          return res.status(400).json({ 
            error: 'branchName and commitMsg are required' 
          });
        }

        // Note: adapter's create-pr endpoint expects { branchName, commitMessage, repoPath }
        // We'll use current working directory as repoPath if not provided
        const repoPath = toolInput.repoPath || process.cwd();
        
        adapterResponse = await callAdapter('/create-pr', {
          branchName,
          commitMessage: commitMsg,
          repoPath,
        });

        // Transform adapter response to match tool output schema
        return res.json({
          prUrl: adapterResponse.prUrl || adapterResponse.preview?.prUrl || null,
          branchName: adapterResponse.branchName || branchName,
          success: adapterResponse.success !== false,
          message: adapterResponse.message || 'PR creation completed',
        });
      }

      default:
        return res.status(404).json({ 
          error: `Tool "${toolName}" not implemented`,
          availableTools: manifest.tools.map(t => t.name),
        });
    }
  } catch (error) {
    console.error(`Error invoking tool ${toolName}:`, error);
    return res.status(500).json({ 
      error: 'Tool invocation failed',
      message: error.message,
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    adapterUrl: config.adapterUrl,
    authEnabled: config.authEnabled && !!config.mcpToken,
  });
});

const PORT = process.env.PORT || 8001;
app.listen(PORT, () => {
  console.log(`MCP server running on http://localhost:${PORT}`);
  console.log(`Adapter URL: ${config.adapterUrl}`);
  console.log(`Auth enabled: ${config.authEnabled && !!config.mcpToken ? 'YES' : 'NO'}`);
  console.log(`Manifest: http://localhost:${PORT}/manifest`);
  
  if (config.authEnabled && config.mcpToken) {
    console.log('⚠️  Authentication is enabled. Clients must provide x-mcp-token header.');
  } else {
    console.log('ℹ️  Authentication is disabled. Set MCP_TOKEN and MCP_AUTH_ENABLED=true to enable.');
  }
});

