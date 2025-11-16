import React, { useState } from 'react';
import Editor from '@monaco-editor/react';
import AssistantPanel from './components/AssistantPanel';
import './App.css';

function App() {
  const [editorContent, setEditorContent] = useState('// Welcome to Dev Skin\n// Start coding here...\n');

  return (
    <div className="app">
      <div className="editor-section">
        <Editor
          height="100%"
          language="typescript"
          value={editorContent}
          onChange={(value) => setEditorContent(value || '')}
          theme="vs-dark"
          options={{
            fontSize: 14,
            minimap: { enabled: true },
            wordWrap: 'on',
            automaticLayout: true,
            scrollBeyondLastLine: false,
            roundedSelection: true,
            padding: { top: 10, bottom: 10 },
            fontFamily: "'Courier New', monospace",
          }}
        />
      </div>
      <AssistantPanel fileContents={editorContent} />
    </div>
  );
}

export default App;
