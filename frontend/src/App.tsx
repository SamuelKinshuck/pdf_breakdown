import React from 'react';
import DocumentProcessorForm from './components/DocumentProcessorForm';
import './App.css';

function App() {
  return (
    <div className="App" style={{
      backgroundColor: '#00212E', // Dark grey primary background
      minHeight: '100vh',
      padding: '20px'
    }}>
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        backgroundColor: '#F9F9FD', // Off-white
        borderRadius: '12px',
        padding: '40px',
        boxShadow: '0 8px 32px rgba(0, 33, 46, 0.3)'
      }}>
        <h1 style={{
          color: '#00212E',
          fontSize: '2.5rem',
          fontWeight: 'bold',
          textAlign: 'center',
          marginBottom: '40px',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
          Document Processor
        </h1>
        <DocumentProcessorForm />
      </div>
    </div>
  );
}

export default App;
