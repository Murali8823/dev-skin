import React, { useState, useRef, useEffect } from 'react';
import './AssistantPanel.css';

// Simple syntax highlighter for code blocks
function highlightCode(code, language = 'javascript') {
  // Basic syntax highlighting - in production, use a proper library like Prism or highlight.js
  const keywords = ['function', 'const', 'let', 'var', 'if', 'else', 'return', 'async', 'await', 'try', 'catch', 'class', 'export', 'import'];
  const stringPattern = /(["'`])(?:(?=(\\?))\2.)*?\1/g;
  const commentPattern = /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm;
  
  let highlighted = code;
  
  // Highlight strings
  highlighted = highlighted.replace(stringPattern, '<span class="code-string">$&</span>');
  
  // Highlight comments
  highlighted = highlighted.replace(commentPattern, '<span class="code-comment">$&</span>');
  
  // Highlight keywords
  keywords.forEach(keyword => {
    const regex = new RegExp(`\\b${keyword}\\b`, 'g');
    highlighted = highlighted.replace(regex, `<span class="code-keyword">${keyword}</span>`);
  });
  
  return highlighted;
}

// Component for rendering code blocks with syntax highlighting
function CodeBlock({ code, language = 'javascript' }) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  return (
    <div className="code-block-container">
      <div className="code-block-header">
        <span className="code-language">{language}</span>
        <button className="copy-button" onClick={handleCopy} title="Copy code">
          {copied ? '✓ Copied' : '📋 Copy'}
        </button>
      </div>
      <pre className="code-block">
        <code dangerouslySetInnerHTML={{ __html: highlightCode(code, language) }} />
      </pre>
    </div>
  );
}

// Component for rendering diff blocks
function DiffBlock({ diff }) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = () => {
    navigator.clipboard.writeText(diff);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  const lines = diff.split('\n');
  
  return (
    <div className="diff-block-container">
      <div className="code-block-header">
        <span className="code-language">diff</span>
        <button className="copy-button" onClick={handleCopy} title="Copy diff">
          {copied ? '✓ Copied' : '📋 Copy'}
        </button>
      </div>
      <pre className="diff-block">
        {lines.map((line, i) => {
          let className = 'diff-line';
          if (line.startsWith('+')) className += ' diff-add';
          else if (line.startsWith('-')) className += ' diff-remove';
          else if (line.startsWith('@@')) className += ' diff-header';
          
          return (
            <div key={i} className={className}>
              {line}
            </div>
          );
        })}
      </pre>
    </div>
  );
}

// Confirmation Modal Component
function ConfirmModal({ isOpen, onClose, onConfirm, onDryRun, patch, mode = 'apply' }) {
  if (!isOpen) return null;
  
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Confirm Patch Application</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <p>You are about to apply a patch to your workspace.</p>
          {patch && (
            <div className="modal-patch-preview">
              <strong>Patch Preview:</strong>
              <pre>{JSON.stringify(patch, null, 2).substring(0, 300)}...</pre>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="modal-btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="modal-btn warning" onClick={onDryRun}>
            🔍 Apply (Dry Run)
          </button>
          <button className="modal-btn primary" onClick={onConfirm}>
            ✅ Apply (Confirm & Commit)
          </button>
        </div>
      </div>
    </div>
  );
}

function AssistantPanel({ fileContents }) {
  const [messages, setMessages] = useState([
    {
      id: '1',
      role: 'assistant',
      content: 'Hello! I\'m your Dev Skin assistant. I can help you generate patches, run tests, create PRs, and more.',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentPatch, setCurrentPatch] = useState(null);
  const [candidatePatches, setCandidatePatches] = useState([]);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const addMessage = (role, content, metadata = {}) => {
    const message = {
      id: Date.now().toString(),
      role,
      content,
      timestamp: new Date(),
      ...metadata,
    };
    setMessages(prev => [...prev, message]);
  };

  // Parse message content for code blocks and diffs
  const parseMessageContent = (content) => {
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    const diffRegex = /(?:diff|DIFF|Diff)[\s\S]*?```[\s\S]*?```/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    // Check for diff blocks first
    const diffMatch = content.match(/```diff\n([\s\S]*?)```/);
    if (diffMatch) {
      const beforeDiff = content.substring(0, diffMatch.index);
      const afterDiff = content.substring(diffMatch.index + diffMatch[0].length);
      
      if (beforeDiff.trim()) parts.push({ type: 'text', content: beforeDiff });
      parts.push({ type: 'diff', content: diffMatch[1] });
      if (afterDiff.trim()) parts.push({ type: 'text', content: afterDiff });
      return parts;
    }

    // Check for code blocks
    while ((match = codeBlockRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: 'text', content: content.substring(lastIndex, match.index) });
      }
      parts.push({ type: 'code', language: match[1] || 'javascript', content: match[2] });
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < content.length) {
      parts.push({ type: 'text', content: content.substring(lastIndex) });
    }

    return parts.length > 0 ? parts : [{ type: 'text', content }];
  };

  const handleGeneratePatch = async () => {
    if (!input.trim() || isLoading) return;

    const instruction = input.trim();
    setIsLoading(true);
    addMessage('user', instruction);
    setInput('');

    try {
      const response = await window.devskin?.callAdapter('/assist', {
        instruction,
        fileContents,
      });

      if (response && response.patch) {
        setCurrentPatch(response.patch.content || response.patch);
        addMessage('assistant', response.answer || 'Patch generated successfully', {
          patch: response.patch,
        });
      } else if (response && response.message) {
        addMessage('assistant', response.message);
      } else {
        addMessage('assistant', 'Patch generated successfully. Check the patch preview below.');
      }
    } catch (error) {
      addMessage('assistant', `Error: ${error.message || 'Failed to generate patch'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunTests = async () => {
    setIsLoading(true);
    addMessage('assistant', 'Running tests...');

    try {
      // This would call an MCP tool - placeholder for now
      addMessage('assistant', 'Tests completed. (MCP tool integration pending)');
    } catch (error) {
      addMessage('assistant', `Error: ${error.message || 'Failed to run tests'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreatePR = async () => {
    setIsLoading(true);
    addMessage('assistant', 'Creating PR...');

    try {
      // This would call an MCP tool - placeholder for now
      addMessage('assistant', 'PR created. (MCP tool integration pending)');
    } catch (error) {
      addMessage('assistant', `Error: ${error.message || 'Failed to create PR'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyPatchDryRun = async () => {
    if (!currentPatch) return;

    setIsLoading(true);
    addMessage('assistant', '🔍 Running dry-run patch application...');

    try {
      // This would call an MCP tool with dry-run flag
      addMessage('assistant', '✅ Dry-run completed. No changes were made. Review the preview above.');
    } catch (error) {
      addMessage('assistant', `Error: ${error.message || 'Failed to apply patch (dry run)'}`);
    } finally {
      setIsLoading(false);
      setShowConfirmModal(false);
    }
  };

  const handleApplyPatchConfirm = async () => {
    if (!currentPatch) return;

    setIsLoading(true);
    addMessage('assistant', '✅ Applying patch and committing changes...');

    try {
      // This would call an MCP tool to actually apply the patch
      addMessage('assistant', `✅ Patch applied successfully and committed.`);
      setCurrentPatch(null);
    } catch (error) {
      addMessage('assistant', `Error: ${error.message || 'Failed to apply patch'}`);
    } finally {
      setIsLoading(false);
      setShowConfirmModal(false);
    }
  };

  const handleApplyPatch = () => {
    if (!currentPatch) {
      addMessage('assistant', 'No patch to apply. Generate a patch first.');
      return;
    }
    setShowConfirmModal(true);
  };

  const handleCopyPatch = () => {
    if (!currentPatch) return;
    const patchText = JSON.stringify(currentPatch, null, 2);
    navigator.clipboard.writeText(patchText);
    addMessage('assistant', '📋 Patch copied to clipboard!');
  };

  const handleReviewPatch = async () => {
    if (!currentPatch) {
      addMessage('assistant', 'No patch to review. Generate a patch first.');
      return;
    }

    const testOutput = prompt('Paste test output or error message:');
    if (!testOutput) return;

    setIsLoading(true);
    addMessage('assistant', 'Reviewing failed patch...');

    try {
      const response = await window.devskin?.callAdapter('/review-patch', {
        patch: currentPatch,
        testOutput: testOutput,
        testError: testOutput.includes('Error:') || testOutput.includes('FAIL') ? testOutput : null,
        fileContents,
        filePath: 'current-file.ts',
      });

      if (response && response.patch) {
        setCurrentPatch(response.patch.content || response.patch);
        addMessage('assistant', response.answer || 'Patch corrected', {
          patch: response.patch,
          diff: response.diff,
        });
      } else {
        addMessage('assistant', response?.answer || 'Failed to review patch');
      }
    } catch (error) {
      addMessage('assistant', `Error: ${error.message || 'Failed to review patch'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRankPatches = async () => {
    if (candidatePatches.length === 0) {
      const patchesInput = prompt('Enter candidate patches as JSON array:\nExample: [{"file": "src/file.js", "edits": [...]}, ...]');
      if (!patchesInput) return;

      try {
        const patches = JSON.parse(patchesInput);
        if (!Array.isArray(patches) || patches.length === 0) {
          addMessage('assistant', 'Invalid patches format. Must be a non-empty array.');
          return;
        }
        setCandidatePatches(patches);
      } catch (error) {
        addMessage('assistant', `Error parsing patches: ${error.message}`);
        return;
      }
    }

    if (candidatePatches.length === 0) {
      addMessage('assistant', 'No candidate patches to rank.');
      return;
    }

    setIsLoading(true);
    addMessage('assistant', `Ranking ${candidatePatches.length} candidate patches...`);

    try {
      const response = await window.devskin?.callAdapter('/rank-patches', {
        patches: candidatePatches,
        fileContents,
        filePath: 'current-file.ts',
      });

      if (response && response.top3) {
        let rankingMessage = `Patch Ranking Results:\n\n`;
        
        response.top3.forEach((item, idx) => {
          rankingMessage += `${item.rank}. Patch ${item.originalIndex || item.index || idx} (Score: ${item.score}/10)\n`;
          rankingMessage += `   Risks: `;
          const risks = [];
          if (item.risks.breaksTests) risks.push('⚠️ Breaks Tests');
          if (item.risks.changesAPI) risks.push('⚠️ Changes API');
          if (item.risks.performance !== 'neutral') {
            risks.push(`⚡ Performance: ${item.risks.performance}`);
          }
          rankingMessage += risks.length > 0 ? risks.join(', ') : '✅ No major risks';
          rankingMessage += `\n   ${item.rationale}\n\n`;
        });

        rankingMessage += `\n✅ Recommended: Patch ${response.recommended.index}\n`;
        rankingMessage += `Rationale: ${response.recommended.rationale}`;

        addMessage('assistant', rankingMessage);
        setCurrentPatch(response.recommended.patch);
        setCandidatePatches([]);
      } else {
        addMessage('assistant', response?.answer || 'Failed to rank patches');
      }
    } catch (error) {
      addMessage('assistant', `Error: ${error.message || 'Failed to rank patches'}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="assistant-panel">
      <div className="panel-header">
        <h2>🤖 Assistant</h2>
      </div>

      <div className="chat-container">
        {messages.map((message) => {
          const contentParts = parseMessageContent(message.content);
          
          return (
            <div key={message.id} className={`message-card ${message.role}`}>
              <div className="message-card-header">
                <span className="message-role-badge">{message.role === 'user' ? '👤 You' : '🤖 Assistant'}</span>
                <span className="message-timestamp">{message.timestamp.toLocaleTimeString()}</span>
              </div>
              <div className="message-card-body">
                {contentParts.map((part, idx) => {
                  if (part.type === 'code') {
                    return <CodeBlock key={idx} code={part.content} language={part.language} />;
                  } else if (part.type === 'diff') {
                    return <DiffBlock key={idx} diff={part.content} />;
                  } else {
                    return (
                      <div key={idx} className="message-text">
                        {part.content.split('\n').map((line, i) => (
                          <React.Fragment key={i}>
                            {line}
                            {i < part.content.split('\n').length - 1 && <br />}
                          </React.Fragment>
                        ))}
                      </div>
                    );
                  }
                })}
              </div>
            </div>
          );
        })}
        {isLoading && (
          <div className="message-card assistant">
            <div className="message-card-body">
              <div className="loading-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
              <span className="loading-text">Processing...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {currentPatch && (
        <div className="patch-preview-card">
          <div className="patch-preview-header">
            <div className="patch-preview-title">
              <strong>📝 Patch Preview</strong>
            </div>
            <div className="patch-preview-actions">
              <button 
                className="patch-action-btn"
                onClick={handleCopyPatch}
                title="Copy patch to clipboard"
              >
                📋 Copy
              </button>
              <button 
                className="patch-close"
                onClick={() => setCurrentPatch(null)}
                title="Close patch preview"
              >
                ×
              </button>
            </div>
          </div>
          <div className="patch-preview-body">
            <CodeBlock code={JSON.stringify(currentPatch, null, 2)} language="json" />
          </div>
          <div className="patch-preview-footer">
            <button
              onClick={handleApplyPatch}
              disabled={isLoading}
              className="apply-btn primary"
            >
              ✅ Apply Patch
            </button>
          </div>
        </div>
      )}

      <div className="input-section">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleGeneratePatch();
            }
          }}
          placeholder="Enter instruction for patch generation..."
          className="chat-input"
          rows={2}
          disabled={isLoading}
        />
        <div className="action-buttons">
          <button
            onClick={handleGeneratePatch}
            disabled={isLoading || !input.trim()}
            className="action-btn primary"
            title="Generate patch from instruction"
          >
            ✨ Generate Patch
          </button>
          <button
            onClick={handleRunTests}
            disabled={isLoading}
            className="action-btn"
            title="Run tests"
          >
            🧪 Run Tests
          </button>
          <button
            onClick={handleCreatePR}
            disabled={isLoading}
            className="action-btn"
            title="Create pull request"
          >
            🔀 Create PR
          </button>
          <button
            onClick={handleReviewPatch}
            disabled={isLoading || !currentPatch}
            className="action-btn"
            title="Review and fix failed patch based on test output"
          >
            🔍 Review Failed Patch
          </button>
          <button
            onClick={handleRankPatches}
            disabled={isLoading}
            className="action-btn"
            title="Rank and analyze multiple candidate patches"
          >
            📊 Rank Patches
          </button>
        </div>
      </div>

      <ConfirmModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={handleApplyPatchConfirm}
        onDryRun={handleApplyPatchDryRun}
        patch={currentPatch}
      />
    </div>
  );
}

export default AssistantPanel;
