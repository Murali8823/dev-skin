import { MCPService } from '../services/mcpService';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

jest.mock('fs');
jest.mock('child_process');

describe('MCPService', () => {
  let mcpService: MCPService;
  const mockWorkspacePath = '/test/workspace';

  beforeEach(() => {
    mcpService = new MCPService();
    jest.clearAllMocks();
  });

  describe('applyPatch', () => {
    it('should apply a patch successfully', () => {
      const testFile = path.join(mockWorkspacePath, 'test.ts');
      const originalContent = 'const x = 1;';
      const patch = {
        file: testFile,
        edits: [
          { start: 0, end: 10, replacement: 'const y = 2;' },
        ],
      };

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(originalContent);
      (fs.writeFileSync as jest.Mock).mockImplementation(() => {});

      const result = mcpService.applyPatch(patch);

      expect(result.success).toBe(true);
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        testFile,
        'const y = 2;',
        'utf-8'
      );
    });

    it('should return error if file does not exist', () => {
      const patch = {
        file: '/nonexistent/file.ts',
        edits: [{ start: 0, end: 10, replacement: 'new content' }],
      };

      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const result = mcpService.applyPatch(patch);

      expect(result.success).toBe(false);
      expect(result.error).toContain('does not exist');
    });

    it('should handle multiple edits correctly', () => {
      const testFile = path.join(mockWorkspacePath, 'test.ts');
      const originalContent = 'line1\nline2\nline3';
      const patch = {
        file: testFile,
        edits: [
          { start: 0, end: 5, replacement: 'new1' },
          { start: 11, end: 16, replacement: 'new2' },
        ],
      };

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(originalContent);
      (fs.writeFileSync as jest.Mock).mockImplementation(() => {});

      const result = mcpService.applyPatch(patch);

      expect(result.success).toBe(true);
      // Edits should be applied from end to start
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });
});

