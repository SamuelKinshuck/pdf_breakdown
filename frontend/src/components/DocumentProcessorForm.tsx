import React, { useState, useCallback } from 'react';
import axios from 'axios';

interface FormData {
  role: string;
  task: string;
  context: string;
  format: string;
  constraints: string;
  temperature: number;
  model: string;
  file: File | null;
  selectedPages: number[];
}

interface FileUploadResponse {
  success: boolean;
  filename: string;
  page_count: number;
  file_id: string;
}

const DocumentProcessorForm: React.FC = () => {
  const [formData, setFormData] = useState<FormData>({
    role: '',
    task: '',
    context: '',
    format: '',
    constraints: '',
    temperature: 0.5,
    model: 'GPT-4.1',
    file: null,
    selectedPages: []
  });

  const [fileInfo, setFileInfo] = useState<FileUploadResponse | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string>('');

  // Color scheme
  const colors = {
    primary: {
      darkGrey: '#00212E',
      lightBlue: '#C5EFF7',
      white: '#FFFFFF',
      offWhite: '#F9F9FD'
    },
    secondary: {
      lilac: '#B85FB1',
      darkPurple: '#44163E',
      seaGreen: '#3E8989',
      green: '#50E28D'
    },
    tertiary: {
      yellow: '#F1BE46',
      orange: '#DD852C',
      red: '#E54A72',
      blueGrey: '#2E5266',
      blue: '#42A1DB',
      lightGrey: '#8F8E8F'
    }
  };

  const handleInputChange = (field: keyof FormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleFileUpload = useCallback(async (file: File) => {
    setIsUploading(true);
    setUploadError('');
    
    const formDataToSend = new FormData();
    formDataToSend.append('file', file);

    try {
      const response = await axios.post<FileUploadResponse>('http://localhost:8000/upload', formDataToSend, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setFileInfo(response.data);
      setFormData(prev => ({ ...prev, file }));
    } catch (error) {
      setUploadError('Failed to upload file. Please try again.');
      console.error('Upload error:', error);
    } finally {
      setIsUploading(false);
    }
  }, []);

  const generatePageOptions = (pageCount: number) => {
    const options = [];
    
    // Individual page checkboxes
    for (let i = 1; i <= pageCount; i++) {
      options.push(i);
    }
    
    return options;
  };

  const handlePageSelection = (pages: number[]) => {
    setFormData(prev => ({ ...prev, selectedPages: pages }));
  };

  const handleQuickPageSelection = (type: string, pageCount: number) => {
    let selectedPages: number[] = [];
    
    switch (type) {
      case 'all':
        selectedPages = Array.from({ length: pageCount }, (_, i) => i + 1);
        break;
      case 'odd':
        selectedPages = Array.from({ length: pageCount }, (_, i) => i + 1).filter(p => p % 2 === 1);
        break;
      case 'even':
        selectedPages = Array.from({ length: pageCount }, (_, i) => i + 1).filter(p => p % 2 === 0);
        break;
      case 'first-half':
        const halfPoint = Math.ceil(pageCount / 2);
        selectedPages = Array.from({ length: halfPoint }, (_, i) => i + 1);
        break;
      case 'second-half':
        const secondHalfStart = Math.ceil(pageCount / 2) + 1;
        selectedPages = Array.from({ length: pageCount - secondHalfStart + 1 }, (_, i) => secondHalfStart + i);
        break;
    }
    
    handlePageSelection(selectedPages);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const response = await axios.post('http://localhost:8000/process', {
        role: formData.role,
        task: formData.task,
        context: formData.context,
        format: formData.format,
        constraints: formData.constraints,
        temperature: formData.temperature,
        model: formData.model,
        file_id: fileInfo?.file_id,
        selected_pages: formData.selectedPages
      });

      console.log('Processing result:', response.data);
      alert('Document processed successfully!');
    } catch (error) {
      console.error('Processing error:', error);
      alert('Failed to process document. Please try again.');
    }
  };

  const inputStyle = {
    width: '100%',
    padding: '12px 16px',
    borderRadius: '8px',
    border: `2px solid ${colors.primary.lightBlue}`,
    fontSize: '16px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    backgroundColor: colors.primary.white,
    color: colors.primary.darkGrey,
    transition: 'border-color 0.3s ease',
    outline: 'none'
  };

  const labelStyle = {
    display: 'block',
    marginBottom: '8px',
    fontWeight: '600',
    color: colors.primary.darkGrey,
    fontSize: '14px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px'
  };

  return (
    <form onSubmit={handleSubmit} style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', marginBottom: '32px' }}>
        {/* Left Column */}
        <div>
          {/* Role */}
          <div style={{ marginBottom: '24px' }}>
            <label style={labelStyle}>Role</label>
            <textarea
              value={formData.role}
              onChange={(e) => handleInputChange('role', e.target.value)}
              rows={4}
              style={{
                ...inputStyle,
                resize: 'vertical' as const,
                minHeight: '100px'
              }}
              placeholder="Define the role or persona for the AI assistant..."
            />
          </div>

          {/* Task */}
          <div style={{ marginBottom: '24px' }}>
            <label style={labelStyle}>Task</label>
            <textarea
              value={formData.task}
              onChange={(e) => handleInputChange('task', e.target.value)}
              rows={4}
              style={{
                ...inputStyle,
                resize: 'vertical' as const,
                minHeight: '100px'
              }}
              placeholder="Describe the specific task to be performed..."
            />
          </div>

          {/* Context */}
          <div style={{ marginBottom: '24px' }}>
            <label style={labelStyle}>Context</label>
            <textarea
              value={formData.context}
              onChange={(e) => handleInputChange('context', e.target.value)}
              rows={4}
              style={{
                ...inputStyle,
                resize: 'vertical' as const,
                minHeight: '100px'
              }}
              placeholder="Provide relevant context and background information..."
            />
          </div>
        </div>

        {/* Right Column */}
        <div>
          {/* Format */}
          <div style={{ marginBottom: '24px' }}>
            <label style={labelStyle}>Format</label>
            <textarea
              value={formData.format}
              onChange={(e) => handleInputChange('format', e.target.value)}
              rows={4}
              style={{
                ...inputStyle,
                resize: 'vertical' as const,
                minHeight: '100px'
              }}
              placeholder="Specify the desired output format..."
            />
          </div>

          {/* Constraints */}
          <div style={{ marginBottom: '24px' }}>
            <label style={labelStyle}>Constraints</label>
            <textarea
              value={formData.constraints}
              onChange={(e) => handleInputChange('constraints', e.target.value)}
              rows={4}
              style={{
                ...inputStyle,
                resize: 'vertical' as const,
                minHeight: '100px'
              }}
              placeholder="Define any constraints or limitations..."
            />
          </div>

          {/* Temperature */}
          <div style={{ marginBottom: '24px' }}>
            <label style={labelStyle}>Temperature: {formData.temperature}</label>
            <div style={{ position: 'relative', marginTop: '8px' }}>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={formData.temperature}
                onChange={(e) => handleInputChange('temperature', parseFloat(e.target.value))}
                style={{
                  width: '100%',
                  height: '8px',
                  borderRadius: '4px',
                  background: `linear-gradient(to right, ${colors.secondary.seaGreen} 0%, ${colors.secondary.seaGreen} ${formData.temperature * 100}%, ${colors.primary.lightBlue} ${formData.temperature * 100}%, ${colors.primary.lightBlue} 100%)`,
                  outline: 'none',
                  appearance: 'none'
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '12px', color: colors.tertiary.lightGrey }}>
                <span>0 (Focused)</span>
                <span>1 (Creative)</span>
              </div>
            </div>
          </div>

          {/* Model */}
          <div style={{ marginBottom: '24px' }}>
            <label style={labelStyle}>Model</label>
            <select
              value={formData.model}
              onChange={(e) => handleInputChange('model', e.target.value)}
              style={{
                ...inputStyle,
                cursor: 'pointer'
              }}
            >
              <option value="GPT-4.1">GPT-4.1</option>
              <option value="GPT-5">GPT-5</option>
            </select>
          </div>
        </div>
      </div>

      {/* File Upload */}
      <div style={{ marginBottom: '32px' }}>
        <label style={labelStyle}>File Upload</label>
        <div
          style={{
            border: `2px dashed ${colors.primary.lightBlue}`,
            borderRadius: '12px',
            padding: '32px',
            textAlign: 'center',
            backgroundColor: colors.primary.white,
            transition: 'border-color 0.3s ease'
          }}
        >
          <input
            type="file"
            accept=".pdf,.docx,.pptx"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                handleFileUpload(file);
              }
            }}
            style={{ display: 'none' }}
            id="file-upload"
          />
          <label
            htmlFor="file-upload"
            style={{
              display: 'inline-block',
              padding: '12px 24px',
              backgroundColor: colors.secondary.seaGreen,
              color: colors.primary.white,
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: '600',
              border: 'none',
              fontSize: '16px',
              transition: 'background-color 0.3s ease'
            }}
          >
            {isUploading ? 'Uploading...' : 'Choose File'}
          </label>
          <p style={{ marginTop: '16px', color: colors.tertiary.lightGrey, fontSize: '14px' }}>
            Supports PDF, DOCX, and PPTX files
          </p>
          {uploadError && (
            <p style={{ color: colors.tertiary.red, marginTop: '8px', fontSize: '14px' }}>
              {uploadError}
            </p>
          )}
          {formData.file && (
            <p style={{ color: colors.secondary.seaGreen, marginTop: '8px', fontSize: '14px' }}>
              Selected: {formData.file.name}
            </p>
          )}
        </div>
      </div>

      {/* Page Selection - Only show if file is uploaded */}
      {fileInfo && (
        <div style={{ marginBottom: '32px' }}>
          <label style={labelStyle}>Pages (Total: {fileInfo.page_count})</label>
          
          {/* Quick Selection Buttons */}
          <div style={{ marginBottom: '16px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {[
              { label: 'All Pages', value: 'all' },
              { label: 'Odd Pages', value: 'odd' },
              { label: 'Even Pages', value: 'even' },
              { label: 'First Half', value: 'first-half' },
              { label: 'Second Half', value: 'second-half' }
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleQuickPageSelection(option.value, fileInfo.page_count)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: colors.secondary.lilac,
                  color: colors.primary.white,
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  transition: 'background-color 0.3s ease'
                }}
              >
                {option.label}
              </button>
            ))}
          </div>

          {/* Individual Page Checkboxes */}
          <div style={{
            maxHeight: '200px',
            overflowY: 'auto',
            border: `1px solid ${colors.primary.lightBlue}`,
            borderRadius: '8px',
            padding: '16px',
            backgroundColor: colors.primary.white
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: '8px' }}>
              {generatePageOptions(fileInfo.page_count).map((pageNum) => (
                <label key={pageNum} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formData.selectedPages.includes(pageNum)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        handlePageSelection([...formData.selectedPages, pageNum]);
                      } else {
                        handlePageSelection(formData.selectedPages.filter(p => p !== pageNum));
                      }
                    }}
                    style={{ marginRight: '6px' }}
                  />
                  <span style={{ fontSize: '14px', color: colors.primary.darkGrey }}>
                    Page {pageNum}
                  </span>
                </label>
              ))}
            </div>
          </div>
          
          <p style={{ marginTop: '8px', fontSize: '14px', color: colors.tertiary.lightGrey }}>
            Selected: {formData.selectedPages.length} page(s)
          </p>
        </div>
      )}

      {/* Submit Button */}
      <button
        type="submit"
        disabled={!fileInfo || formData.selectedPages.length === 0}
        style={{
          width: '100%',
          padding: '16px',
          backgroundColor: formData.selectedPages.length > 0 ? colors.secondary.green : colors.tertiary.lightGrey,
          color: colors.primary.white,
          border: 'none',
          borderRadius: '12px',
          fontSize: '18px',
          fontWeight: '600',
          cursor: formData.selectedPages.length > 0 ? 'pointer' : 'not-allowed',
          transition: 'background-color 0.3s ease',
          textTransform: 'uppercase',
          letterSpacing: '1px'
        }}
      >
        Process Document
      </button>
    </form>
  );
};

export default DocumentProcessorForm;