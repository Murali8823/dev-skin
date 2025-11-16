import { describe, it, before, after } from 'mocha';
import { expect } from 'chai';
import { spawn } from 'child_process';
import { promisify } from 'util';
import { exec } from 'child_process';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const execAsync = promisify(exec);

// Helper to wait for server to be ready
function waitForServer(url, maxAttempts = 30, delay = 1000) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    
    const check = () => {
      attempts++;
      const req = http.get(url, (res) => {
        resolve();
      });
      
      req.on('error', () => {
        if (attempts >= maxAttempts) {
          reject(new Error(`Server not ready after ${maxAttempts} attempts`));
        } else {
          setTimeout(check, delay);
        }
      });
    };
    
    check();
  });
}

describe('Assistant Flow', () => {
  let adapterProcess;
  const adapterUrl = 'http://localhost:8000';
  const testPort = 8000;

  before(async function() {
    this.timeout(30000); // 30 second timeout for setup
    
    // Start adapter in test mode
    console.log('Starting adapter server...');
    
    // Set test environment variables
    process.env.NODE_ENV = 'test';
    process.env.PORT = testPort;
    // Use a mock API key for testing (or skip LLM calls if not set)
    process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key';
    
    // Import and start adapter
    const adapterPath = path.join(process.cwd(), 'adapter', 'index.js');
    
    adapterProcess = spawn('node', [adapterPath], {
      env: { ...process.env, NODE_ENV: 'test', PORT: testPort },
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: process.cwd(),
    });

    // Wait for adapter to be ready
    try {
      await waitForServer(`${adapterUrl}/health`, 30, 1000);
      console.log('Adapter server is ready');
    } catch (error) {
      console.error('Failed to start adapter:', error);
      if (adapterProcess) {
        adapterProcess.kill();
      }
      throw error;
    }
  });

  after(async function() {
    this.timeout(5000);
    
    // Stop adapter
    if (adapterProcess) {
      console.log('Stopping adapter server...');
      adapterProcess.kill();
      
      // Wait for process to exit
      await new Promise((resolve) => {
        adapterProcess.on('exit', resolve);
        setTimeout(resolve, 2000); // Force exit after 2 seconds
      });
    }
  });

  it('should generate a patch for adding isEven function with tests', async function() {
    this.timeout(30000); // 30 second timeout for LLM call

    const instruction = 'Add a simple function isEven(n) with tests';
    const fileContents = `// Example file
function example() {
  return true;
}
`;

    const requestBody = {
      instruction,
      fileContents,
      filePath: 'src/utils.js',
    };

    const response = await fetch(`${adapterUrl}/assist`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    expect(response.ok).to.be.true;
    
    const data = await response.json();
    
    // Assert response structure
    expect(data).to.have.property('answer');
    expect(data).to.have.property('patch');
    
    // Assert response contains 'PATCH' (in answer or patch content)
    const responseText = JSON.stringify(data);
    expect(responseText).to.include('PATCH');
    
    // Assert response contains 'isEven'
    expect(responseText).to.include('isEven');
    
    // Assert patch structure if present
    if (data.patch) {
      expect(data.patch).to.have.property('format');
      if (data.patch.content) {
        expect(data.patch.content).to.be.a('string');
      }
    }
    
    console.log('Response received:', {
      answerLength: data.answer?.length || 0,
      hasPatch: !!data.patch,
      patchFormat: data.patch?.format,
    });
  });

  it('should handle missing instruction gracefully', async function() {
    const response = await fetch(`${adapterUrl}/assist`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fileContents: 'test',
      }),
    });

    expect(response.status).to.equal(400);
    const data = await response.json();
    expect(data).to.have.property('error');
    expect(data.error).to.include('Instruction is required');
  });
});

