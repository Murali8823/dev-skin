const { app, BrowserWindow } = require('electron');
const path = require('path');

// Single-instance locking: prevent multiple instances of the app
// This is a security best practice to avoid race conditions and resource conflicts
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // Another instance is already running, quit this one
  app.quit();
} else {
  // This is the first instance, proceed with app initialization
  let mainWindow = null;

  function createWindow() {
    mainWindow = new BrowserWindow({
      width: 1400,
      height: 900,
      webPreferences: {
        // Security: Disable Node.js integration in renderer
        // This prevents the renderer from accessing Node.js APIs directly
        nodeIntegration: false,
        
        // Security: Enable context isolation
        // This creates an isolated JavaScript context for the preload script,
        // preventing the renderer from accessing Node.js or Electron APIs directly
        contextIsolation: true,
        
        // Security: Use preload script to expose only safe, controlled APIs
        // The preload script runs in an isolated context and can selectively
        // expose functions via contextBridge, which is safer than exposing Node directly
        preload: path.join(__dirname, 'preload.js'),
      },
      backgroundColor: '#0a0e27',
    });

    // Load Vite dev server in development
    // In production, this would load the built files
    mainWindow.loadURL('http://localhost:5173');
    
    // Open DevTools in development (remove in production)
    if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
      mainWindow.webContents.openDevTools();
    }
  }

  app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
      // On macOS, re-create window when dock icon is clicked
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    // On macOS, keep app running even when all windows are closed
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  // Handle second instance: focus the existing window instead of creating a new one
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}
