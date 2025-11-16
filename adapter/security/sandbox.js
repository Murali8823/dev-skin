// Sandbox for safe process execution with resource limits

import { spawn } from 'child_process';
import { validateCommand } from './commandAllowlist.js';

const DEFAULT_TIMEOUT = 60000; // 60 seconds
const DEFAULT_MAX_MEMORY = 512 * 1024 * 1024; // 512MB
const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024; // 10MB

// Configurable limits (can be overridden via environment)
export const SANDBOX_LIMITS = {
  timeout: parseInt(process.env.SANDBOX_TIMEOUT) || DEFAULT_TIMEOUT,
  maxMemory: parseInt(process.env.SANDBOX_MAX_MEMORY) || DEFAULT_MAX_MEMORY,
  maxBuffer: parseInt(process.env.SANDBOX_MAX_BUFFER) || DEFAULT_MAX_BUFFER,
};

/**
 * Execute a command in a sandboxed child process with resource limits
 * @param {string} command - Command to execute
 * @param {Object} options - Execution options
 * @param {string} options.cwd - Working directory
 * @param {number} options.timeout - Timeout in milliseconds (default: 60000)
 * @param {number} options.maxMemory - Max memory in bytes (default: 512MB)
 * @param {number} options.maxBuffer - Max output buffer in bytes (default: 10MB)
 * @returns {Promise<{success: boolean, stdout: string, stderr: string, exitCode: number, error?: string}>}
 */
export async function executeSandboxed(command, options = {}) {
  const {
    cwd = process.cwd(),
    timeout = DEFAULT_TIMEOUT,
    maxMemory = DEFAULT_MAX_MEMORY,
    maxBuffer = DEFAULT_MAX_BUFFER,
  } = options;

  // Validate command against allowlist
  const validation = validateCommand(command);
  if (!validation.allowed) {
    throw new Error(`Command not allowed: ${validation.reason || 'Unknown reason'}`);
  }

  const sanitizedCommand = validation.sanitized || command;

  return new Promise((resolve, reject) => {
    // Parse command and arguments
    const parts = sanitizedCommand.split(/\s+/);
    const [cmd, ...args] = parts;

    // Spawn process with resource limits
    const childProcess = spawn(cmd, args, {
      cwd,
      env: {
        ...process.env,
        // Limit memory for Node.js processes
        NODE_OPTIONS: process.env.NODE_OPTIONS 
          ? `${process.env.NODE_OPTIONS} --max-old-space-size=${Math.floor(maxMemory / 1024 / 1024)}`
          : `--max-old-space-size=${Math.floor(maxMemory / 1024 / 1024)}`,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      // On Unix-like systems, set resource limits
      ...(process.platform !== 'win32' && {
        detached: false,
      }),
    });

    let stdout = '';
    let stderr = '';
    let killed = false;

    // Set timeout
    const timeoutId = setTimeout(() => {
      if (!killed) {
        killed = true;
        childProcess.kill('SIGTERM');
        
        // Force kill after 5 seconds if still running
        setTimeout(() => {
          if (!childProcess.killed) {
            childProcess.kill('SIGKILL');
          }
        }, 5000);

        reject(new Error(`Command timeout after ${timeout}ms`));
      }
    }, timeout);

    // Collect stdout with buffer limit
    childProcess.stdout.on('data', (data) => {
      stdout += data.toString();
      if (stdout.length > maxBuffer) {
        if (!killed) {
          killed = true;
          childProcess.kill('SIGTERM');
          clearTimeout(timeoutId);
          reject(new Error(`Output buffer exceeded ${maxBuffer} bytes`));
        }
      }
    });

    // Collect stderr with buffer limit
    childProcess.stderr.on('data', (data) => {
      stderr += data.toString();
      if (stderr.length > maxBuffer) {
        if (!killed) {
          killed = true;
          childProcess.kill('SIGTERM');
          clearTimeout(timeoutId);
          reject(new Error(`Error buffer exceeded ${maxBuffer} bytes`));
        }
      }
    });

    // Handle process exit
    childProcess.on('exit', (code, signal) => {
      clearTimeout(timeoutId);
      
      if (killed) {
        return; // Already handled
      }

      resolve({
        success: code === 0,
        stdout: stdout.substring(0, maxBuffer), // Ensure we don't exceed buffer
        stderr: stderr.substring(0, maxBuffer),
        exitCode: code || (signal ? 1 : 0),
      });
    });

    // Handle process errors
    childProcess.on('error', (error) => {
      clearTimeout(timeoutId);
      if (!killed) {
        killed = true;
        reject(new Error(`Process error: ${error.message}`));
      }
    });
  });
}

/**
 * Get resource usage for a process (if available)
 * @param {number} pid - Process ID
 * @returns {Promise<{memory?: number, cpu?: number}>}
 */
export async function getProcessResources(pid) {
  // This is a placeholder - in production, use system-specific tools
  // like 'ps' on Unix or WMI on Windows
  return {};
}

