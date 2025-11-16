import React, { useState } from 'react';
import Editor from './components/Editor';
import AssistantSidebar from './components/AssistantSidebar';
import './App.css';

function App() {
  const [editorContent, setEditorContent] = useState('// Welcome to Dev Skin\n// Start coding here...\n');
  const [currentFile, setCurrentFile] = useState<string>('untitled.ts');

  return (
    <div className="app">
      <div className="editor-container">
        <Editor 
          value={editorContent} 
          onChange={setEditorContent}
          language="typescript"
          filePath={currentFile}
        />
      </div>
      <AssistantSidebar 
        editorContent={editorContent}
        currentFile={currentFile}
        onApplyPatch={(patch) => {
          // Handle patch application
          console.log('Applying patch:', patch);
        }}
      />
    </div>
  );
}

export default App;

