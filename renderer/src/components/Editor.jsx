import React from 'react';
import Editor from '@monaco-editor/react';

function CodeEditor({ value, onChange, language = 'typescript', filePath }) {
  const handleEditorChange = (newValue) => {
    if (newValue !== undefined) {
      onChange(newValue);
    }
  };

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <Editor
        height="100%"
        language={language}
        value={value}
        onChange={handleEditorChange}
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
  );
}

export default CodeEditor;

