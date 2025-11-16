// OS Keychain integration for secure API key storage
// Uses keytar (cross-platform) or native OS keychain APIs

import * as os from 'os';

const SERVICE_NAME = 'dev-skin';
const ACCOUNT_NAME = 'llm-api-key';

// Fallback to environment variable if keychain is not available
let keychainAvailable = false;
let keytar = null;

// Lazy load keytar (optional dependency)
async function loadKeytar() {
  if (keytar !== null) {
    return keytar; // Already loaded or attempted
  }

  try {
    // Dynamic import to handle missing dependency gracefully
    const keytarModule = await import('keytar');
    keytar = keytarModule.default || keytarModule;
    keychainAvailable = true;
    return keytar;
  } catch (error) {
    keytar = false; // Mark as failed to load
    keychainAvailable = false;
    return null;
  }
}

/**
 * Store API key in OS keychain
 * @param {string} key - API key to store
 * @returns {Promise<boolean>} - True if stored successfully
 */
export async function storeApiKey(key) {
  if (!key || typeof key !== 'string') {
    throw new Error('Invalid API key');
  }

  const keytarInstance = await loadKeytar();
  if (keychainAvailable && keytarInstance) {
    try {
      await keytarInstance.setPassword(SERVICE_NAME, ACCOUNT_NAME, key);
      return true;
    } catch (error) {
      console.error('Failed to store key in keychain:', error);
      throw new Error(`Keychain storage failed: ${error.message}`);
    }
  } else {
    // Fallback: warn user to set environment variable
    console.warn('⚠️  Keychain not available. Please set OPENAI_API_KEY environment variable.');
    console.warn('   To enable keychain storage, install: npm install keytar');
    return false;
  }
}

/**
 * Retrieve API key from OS keychain
 * @returns {Promise<string|null>} - API key or null if not found
 */
export async function getApiKey() {
  const keytarInstance = await loadKeytar();
  if (keychainAvailable && keytarInstance) {
    try {
      const key = await keytarInstance.getPassword(SERVICE_NAME, ACCOUNT_NAME);
      return key;
    } catch (error) {
      console.error('Failed to retrieve key from keychain:', error);
      return null;
    }
  }
  
  // Fallback to environment variable
  return process.env.OPENAI_API_KEY || process.env.LLM_API_KEY || null;
}

/**
 * Delete API key from OS keychain
 * @returns {Promise<boolean>} - True if deleted successfully
 */
export async function deleteApiKey() {
  const keytarInstance = await loadKeytar();
  if (keychainAvailable && keytarInstance) {
    try {
      await keytarInstance.deletePassword(SERVICE_NAME, ACCOUNT_NAME);
      return true;
    } catch (error) {
      console.error('Failed to delete key from keychain:', error);
      return false;
    }
  }
  return false;
}

/**
 * Check if keychain is available
 * @returns {boolean}
 */
export function isKeychainAvailable() {
  return keychainAvailable;
}

/**
 * Get keychain storage instructions for the current OS
 * @returns {string}
 */
export function getKeychainInstructions() {
  const platform = os.platform();
  
  if (platform === 'darwin') {
    return `macOS Keychain:
1. Install keytar: npm install keytar
2. Keys are stored in macOS Keychain Access
3. View stored keys: Keychain Access app > search "dev-skin"
4. Delete key: Use Keychain Access app or call DELETE /api/keychain`;
  } else if (platform === 'win32') {
    return `Windows Credential Manager:
1. Install keytar: npm install keytar
2. Keys are stored in Windows Credential Manager
3. View: Control Panel > Credential Manager > Windows Credentials
4. Look for "dev-skin" entry
5. Delete key: Use Credential Manager or call DELETE /api/keychain`;
  } else {
    return `Linux Secret Service (libsecret):
1. Install keytar: npm install keytar
2. Requires libsecret (install via package manager)
3. Keys stored via Secret Service API (GNOME Keyring, KWallet, etc.)
4. View: Use secret-tool or keyring GUI
5. Delete key: Use secret-tool or call DELETE /api/keychain`;
  }
}

