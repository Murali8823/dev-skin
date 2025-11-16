// Command allowlist for safe execution
// Only whitelisted commands can be executed to prevent dangerous operations

const ALLOWED_COMMANDS = {
  // Git commands (safe read-only and controlled write operations)
  'git': [
    'status',
    'diff',
    'log',
    'ls-files',
    'diff --cached --name-only',
    'checkout -b', // Only branch creation, not deletion
    'add .',
    'commit -m', // Only with explicit confirmation
    'push -u origin', // Only with explicit confirmation
    'branch',
    'remote -v',
    'show',
  ],
  
  // NPM commands (test execution only)
  'npm': [
    'test',
    'run test',
  ],
  
  // Yarn commands
  'yarn': [
    'test',
  ],
  
  // Node commands (for running scripts)
  'node': [
    // Only allow running test scripts, not arbitrary scripts
  ],
  
  // Python test commands
  'python': [
    '-m pytest',
    '-m unittest',
  ],
  
  'pytest': [],
  
  // Additional safe commands
  'ls': [],
  'dir': [], // Windows
  'pwd': [],
  'echo': [],
};

// Dangerous command patterns that should never be allowed
const DANGEROUS_PATTERNS = [
  /rm\s+-rf/i,
  /rm\s+-r\s+/i,
  /del\s+\/s/i, // Windows
  /rmdir\s+\/s/i, // Windows
  /format\s+/i,
  /mkfs/i,
  /dd\s+if=/i,
  /shutdown/i,
  /reboot/i,
  /sudo/i,
  /su\s+/i,
  /\|\s*sh\s*$/i,
  /\|\s*bash\s*$/i,
  /\|\s*cmd\s*$/i,
  /\|\s*powershell\s*$/i,
  />\s*\/dev\/null/i,
  /curl\s+.*\s+\|\s*sh/i,
  /wget\s+.*\s+\|\s*sh/i,
  /eval\s*\(/i,
  /exec\s*\(/i,
  /system\s*\(/i,
  /chmod\s+777/i,
  /chown\s+/i,
  /kill\s+-9/i,
  /pkill/i,
];

/**
 * Check if a command is allowed to execute
 * @param {string} command - The command to check
 * @returns {boolean} - True if command is allowed
 */
function isCommandAllowed(command) {
  if (!command || typeof command !== 'string') {
    return false;
  }

  // Check for dangerous patterns first
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return false;
    }
  }

  // Parse command
  const parts = command.trim().split(/\s+/);
  const baseCommand = parts[0];
  const args = parts.slice(1).join(' ');

  // Check if base command is in allowlist
  if (!ALLOWED_COMMANDS[baseCommand]) {
    return false;
  }

  // If no specific args required, allow it
  const allowedArgs = ALLOWED_COMMANDS[baseCommand];
  if (allowedArgs.length === 0) {
    return true;
  }

  // Check if any allowed arg pattern matches
  return allowedArgs.some(allowedArg => {
    // Exact match
    if (args === allowedArg) {
      return true;
    }
    
    // Pattern match (for commands like "git checkout -b <branch>")
    const pattern = allowedArg.replace(/\s+/g, '\\s+');
    const regex = new RegExp(`^${pattern}`, 'i');
    return regex.test(args);
  });
}

/**
 * Validate and sanitize a command before execution
 * @param {string} command - The command to validate
 * @returns {{allowed: boolean, sanitized?: string, reason?: string}}
 */
function validateCommand(command) {
  if (!command || typeof command !== 'string') {
    return { allowed: false, reason: 'Invalid command' };
  }

  // Remove any shell redirection or piping
  const sanitized = command
    .split('|')[0] // Remove pipes
    .split('>')[0] // Remove output redirection
    .split('<')[0] // Remove input redirection
    .split('&')[0] // Remove background execution
    .trim();

  if (sanitized !== command.trim()) {
    return { allowed: false, reason: 'Shell redirection/piping not allowed' };
  }

  if (!isCommandAllowed(sanitized)) {
    return { allowed: false, reason: 'Command not in allowlist' };
  }

  return { allowed: true, sanitized };
}

export {
  isCommandAllowed,
  validateCommand,
  ALLOWED_COMMANDS,
  DANGEROUS_PATTERNS,
};

