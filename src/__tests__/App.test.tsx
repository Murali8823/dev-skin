import React from 'react';
import { render, screen } from '@testing-library/react';
import App from '../App';

// Mock Monaco Editor
jest.mock('@monaco-editor/react', () => ({
  __esModule: true,
  default: ({ value, onChange }: any) => (
    <textarea
      data-testid="monaco-editor"
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
    />
  ),
}));

// Mock electron API
global.window.electronAPI = {
  adapter: {
    query: jest.fn().mockResolvedValue('Test response'),
    embed: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  },
  mcp: {
    runTests: jest.fn().mockResolvedValue({ success: true, output: 'Tests passed' }),
    createPR: jest.fn().mockResolvedValue({ success: true, message: 'PR created' }),
  },
  applyPatch: jest.fn().mockResolvedValue({ success: true, message: 'Patch applied' }),
};

describe('App', () => {
  it('renders the app with editor and sidebar', () => {
    render(<App />);
    
    expect(screen.getByTestId('monaco-editor')).toBeInTheDocument();
    expect(screen.getByText('Assistant')).toBeInTheDocument();
  });
});

