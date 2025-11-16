import React, { useState, useRef, useEffect } from 'react';
import './AssistantSidebar.css';

function AssistantSidebar({ editorContent, currentFile, onApplyPatch }) {
  const [messages, setMessages] = useState([
    {
      id: '1',
      role: 'assistant',
      content: 'Hello! I\'m your Dev Skin assistant. I can help you with code, run tests, create PRs, and apply patches. How can I help you today?',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await window.electronAPI?.adapter.query(input, editorContent);
      
      const assistantMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response || 'Sorry, I couldn\'t process your request.',
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunTests = async () => {
    setIsLoading(true);
    try {
      const workspacePath = await window.electronAPI?.getWorkspacePath() || '.';
      const result = await window.electronAPI?.mcp.runTests(workspacePath);
      
      const message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: result?.success 
          ? `Tests passed!\n\n${result.output}`
          : `Tests failed:\n\n${result?.error || result?.output || 'Unknown error'}`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, message]);
    } catch (error) {
      const errorMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `Error running tests: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreatePR = async () => {
    const title = prompt('PR Title:');
    if (!title) return;

    const description = prompt('PR Description:') || '';
    setIsLoading(true);

    try {
      const workspacePath = await window.electronAPI?.getWorkspacePath() || '.';
      const result = await window.electronAPI?.mcp.createPR(title, description, workspacePath);
      
      const message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: result?.success 
          ? `✅ ${result.message}`
          : `❌ ${result?.error || 'Failed to create PR'}`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, message]);
    } catch (error) {
      const errorMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `Error creating PR: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyPatch = async () => {
    const patchText = prompt('Enter patch (JSON format):\nExample: {"file": "src/App.jsx", "edits": [{"start": 0, "end": 10, "replacement": "// New code"}]}');
    if (!patchText) return;

    try {
      const patch = JSON.parse(patchText);
      const result = await window.electronAPI?.applyPatch(patch);
      
      const message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: result?.success 
          ? `✅ ${result.message}`
          : `❌ ${result?.error || 'Failed to apply patch'}`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, message]);
      
      if (result?.success) {
        onApplyPatch(patch);
      }
    } catch (error) {
      const errorMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `Error applying patch: ${error instanceof Error ? error.message : 'Invalid patch format'}`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    }
  };

  return (
    <div className="assistant-sidebar">
      <div className="sidebar-header">
        <h2>Assistant</h2>
      </div>
      
      <div className="action-buttons">
        <button 
          onClick={handleRunTests} 
          disabled={isLoading}
          className="action-btn"
        >
          🧪 Run Tests
        </button>
        <button 
          onClick={handleCreatePR} 
          disabled={isLoading}
          className="action-btn"
        >
          🔀 Create PR
        </button>
        <button 
          onClick={handleApplyPatch} 
          disabled={isLoading}
          className="action-btn"
        >
          📝 Apply Patch
        </button>
      </div>

      <div className="messages-container">
        {messages.map((message) => (
          <div key={message.id} className={`message ${message.role}`}>
            <div className="message-content">
              {message.content.split('\n').map((line, i) => (
                <React.Fragment key={i}>
                  {line}
                  {i < message.content.split('\n').length - 1 && <br />}
                </React.Fragment>
              ))}
            </div>
            <div className="message-timestamp">
              {message.timestamp.toLocaleTimeString()}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="message assistant">
            <div className="message-content">Thinking...</div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="input-container">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Type your message... (Enter to send, Shift+Enter for new line)"
          className="chat-input"
          rows={3}
          disabled={isLoading}
        />
        <button 
          onClick={handleSend} 
          disabled={isLoading || !input.trim()}
          className="send-button"
        >
          Send
        </button>
      </div>
    </div>
  );
}

export default AssistantSidebar;

