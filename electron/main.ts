import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { AdapterService } from './services/adapterService';
import { MCPService } from './services/mcpService';

let mainWindow: BrowserWindow | null = null;
const adapterService = new AdapterService();
const mcpService = new MCPService();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    backgroundColor: '#0a0e27',
  });


  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist-react/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC handlers for adapter service
ipcMain.handle('adapter:query', async (_, query: string, context?: string) => {
  return await adapterService.query(query, context);
});

ipcMain.handle('adapter:embed', async (_, text: string) => {
  return await adapterService.embed(text);
});

// IPC handlers for MCP tools
ipcMain.handle('mcp:run-tests', async (_, workspacePath: string) => {
  return await mcpService.runTests(workspacePath);
});

ipcMain.handle('mcp:create-pr', async (_, title: string, description: string, workspacePath: string) => {
  return await mcpService.createPR(title, description, workspacePath);
});

// IPC handler for applying patches
ipcMain.handle('apply-patch', async (_, patch: { file: string; edits: Array<{ start: number; end: number; replacement: string }> }) => {
  return await mcpService.applyPatch(patch);
});

// IPC handler for getting workspace path
ipcMain.handle('get-workspace-path', () => {
  return process.cwd();
});

