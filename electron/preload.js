const { contextBridge } = require('electron');

/**
 * Security: This preload script runs in an isolated context between the main process
 * and the renderer. We use contextBridge to safely expose APIs to the renderer.
 * 
 * IMPORTANT SECURITY NOTES:
 * - We NEVER expose Node.js APIs directly (no require('fs'), require('child_process'), etc.)
 * - We NEVER expose Electron APIs directly (no require('electron') in renderer)
 * - We ONLY expose controlled, safe functions via contextBridge
 * - All communication with Node.js/Electron happens through this controlled bridge
 * - The adapter service runs as a separate HTTP server, keeping it isolated
 */

contextBridge.exposeInMainWorld('devskin', {
  /**
   * Call the adapter service via HTTP
   * 
   * @param {string} path - API endpoint path (e.g., '/api/query', '/api/embed')
   * @param {object} body - Request body to send as JSON
   * @returns {Promise<any>} - Response from the adapter service
   * 
   * Security: This uses fetch() which runs in the renderer's context.
   * The adapter service runs on localhost:8000 as a separate process,
   * providing isolation between the Electron app and the LLM/RAG service.
   */
  callAdapter: async (path, body) => {
    try {
      const response = await fetch(`http://localhost:8000${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      // Handle both JSON and text responses
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      } else {
        return await response.text();
      }
    } catch (error) {
      // Return error in a controlled way, don't expose internal details
      throw new Error(`Adapter service error: ${error.message}`);
    }
  },
});
