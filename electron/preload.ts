import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  adapter: {
    query: (query: string, context?: string) => ipcRenderer.invoke('adapter:query', query, context),
    embed: (text: string) => ipcRenderer.invoke('adapter:embed', text),
  },
  mcp: {
    runTests: (workspacePath: string) => ipcRenderer.invoke('mcp:run-tests', workspacePath),
    createPR: (title: string, description: string, workspacePath: string) => 
      ipcRenderer.invoke('mcp:create-pr', title, description, workspacePath),
  },
  applyPatch: (patch: { file: string; edits: Array<{ start: number; end: number; replacement: string }> }) =>
    ipcRenderer.invoke('apply-patch', patch),
  getWorkspacePath: () => ipcRenderer.invoke('get-workspace-path'),
});

