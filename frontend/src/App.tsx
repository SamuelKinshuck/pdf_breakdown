import React from 'react';
import DocumentProcessorForm from './components/DocumentProcessorForm';
import './App.css';

function App() {
  return (
    <div className="App" style={{
      
      padding: '30px'
    }}>
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        borderRadius: '12px',
        padding: '40px',
        minHeight: '100vh'
      }}>

        <DocumentProcessorForm />
      </div>
    </div>
  );
}

export default App;
