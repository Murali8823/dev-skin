import React from 'react';
import Editor from '@monaco-editor/react';

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  language?: string;
  filePath?: string;
}

const CodeEditor: React.FC<EditorProps> = ({ value, onChange, language = 'typescript', filePath }) => {
  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined) {
      onChange(value);
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
};

export default CodeEditor;

