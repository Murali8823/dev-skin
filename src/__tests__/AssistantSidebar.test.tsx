import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AssistantSidebar from '../components/AssistantSidebar';

// Mock electron API
const mockQuery = jest.fn().mockResolvedValue('Test response');
const mockRunTests = jest.fn().mockResolvedValue({ success: true, output: 'Tests passed' });
const mockCreatePR = jest.fn().mockResolvedValue({ success: true, message: 'PR created' });
const mockApplyPatch = jest.fn().mockResolvedValue({ success: true, message: 'Patch applied' });

global.window.electronAPI = {
  adapter: {
    query: mockQuery,
    embed: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  },
  mcp: {
    runTests: mockRunTests,
    createPR: mockCreatePR,
  },
  applyPatch: mockApplyPatch,
};

// Mock prompt
global.prompt = jest.fn();

describe('AssistantSidebar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the sidebar with action buttons', () => {
    render(
      <AssistantSidebar
        editorContent="test content"
        currentFile="test.ts"
        onApplyPatch={jest.fn()}
      />
    );

    expect(screen.getByText('Assistant')).toBeInTheDocument();
    expect(screen.getByText('🧪 Run Tests')).toBeInTheDocument();
    expect(screen.getByText('🔀 Create PR')).toBeInTheDocument();
    expect(screen.getByText('📝 Apply Patch')).toBeInTheDocument();
  });

  it('sends a message when user types and submits', async () => {
    render(
      <AssistantSidebar
        editorContent="test content"
        currentFile="test.ts"
        onApplyPatch={jest.fn()}
      />
    );

    const input = screen.getByPlaceholderText(/Type your message/);
    const sendButton = screen.getByText('Send');

    fireEvent.change(input, { target: { value: 'Hello, assistant!' } });
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(mockQuery).toHaveBeenCalledWith('Hello, assistant!', 'test content');
    });
  });

  it('handles run tests action', async () => {
    render(
      <AssistantSidebar
        editorContent="test content"
        currentFile="test.ts"
        onApplyPatch={jest.fn()}
      />
    );

    const runTestsButton = screen.getByText('🧪 Run Tests');
    fireEvent.click(runTestsButton);

    await waitFor(() => {
      expect(mockRunTests).toHaveBeenCalled();
    });
  });
});

