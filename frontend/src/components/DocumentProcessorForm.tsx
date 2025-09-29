import React, { useState, useCallback } from 'react';
import CollapsibleSection from './CollapsibleSection';
import SuccessModal from './SuccessModal';

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
  
  // Success modal state
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  
  // Collapsible sections state
  const [promptConfigExpanded, setPromptConfigExpanded] = useState(true);
  const [modelConfigExpanded, setModelConfigExpanded] = useState(true);
  const [promptSectionsExpanded, setPromptSectionsExpanded] = useState({
    role: true,
    task: true,
    context: true,
    format: true,
    constraints: true
  });

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

  // Helper functions for collapsible sections
  const togglePromptSection = (section: keyof typeof promptSectionsExpanded) => {
    setPromptSectionsExpanded(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };



  const handleFileUpload = useCallback(async (file: File) => {
    console.log('uploading');
    setIsUploading(true);
    setUploadError('');
    
    const formDataToSend = new FormData();
    formDataToSend.append('file', file);

    try {
      console.log('contacting endpoint');
      const response = await fetch('http://localhost:4005/upload', {
        method: 'POST',
        body: formDataToSend, // Don't set Content-Type; the browser adds the boundary.
      });

      if (!response.ok) {
        const message = await response.text().catch(() => '');
        throw new Error(message || `Upload failed with status ${response.status}`);
      }

      const data = (await response.json()) as FileUploadResponse;
      console.log('xxx');

      setFileInfo(data);
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
        {
          const halfPoint = Math.ceil(pageCount / 2);
          selectedPages = Array.from({ length: halfPoint }, (_, i) => i + 1);
        }
        break;
      case 'second-half':
        {
          const secondHalfStart = Math.ceil(pageCount / 2) + 1;
          selectedPages = Array.from({ length: pageCount - secondHalfStart + 1 }, (_, i) => secondHalfStart + i);
        }
        break;
    }
    
    handlePageSelection(selectedPages);
  };

  const API_BASE = 'http://localhost:4005';

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();

  try {
    console.log('selected pages: ', formData.selectedPages)
    const response = await fetch(`${API_BASE}/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: formData.role,
        task: formData.task,
        context: formData.context,
        format: formData.format,
        constraints: formData.constraints,
        temperature: formData.temperature,
        model: formData.model,
        file_id: fileInfo?.file_id,
        selected_pages: formData.selectedPages, // make sure this is an array of numbers
      }),
    });

    if (!response.ok) {
      const message = await response.text().catch(() => '');
      throw new Error(message || `Processing failed with status ${response.status}`);
    }

    const data = await response.json();
    if (!data.success || !data.csv_download_url) {
      throw new Error(data.error || 'No CSV returned from server.');
    }

    // Build absolute URL and fetch the CSV as a blob
    const absoluteUrl = `${API_BASE}${data.csv_download_url}`;
    const dlResp = await fetch(absoluteUrl);
    if (!dlResp.ok) throw new Error('CSV download failed.');
    const blob = await dlResp.blob();

    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = data.csv_filename || 'gpt_responses.csv';
    document.body.appendChild(link);
    link.click();
    URL.revokeObjectURL(link.href);
    link.remove();

    // Show success modal instead of alert
    setShowSuccessModal(true);
  } catch (error) {
    console.error('Processing error:', error);
    alert('Failed to process document. Please try again.');
  }
};


  const inputStyle = {
    width: '100%',
    padding: '16px 20px',
    borderRadius: '8px',
    border: `2px solid ${colors.primary.lightBlue}`,
    fontSize: '16px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    backgroundColor: colors.primary.white,
    color: colors.primary.darkGrey,
    transition: 'all 0.3s ease',
    outline: 'none' as const
  };


  const sectionHeaderStyle = {
    color: colors.secondary.darkPurple,
    fontSize: '18px',
    fontWeight: '700',
    marginBottom: '16px',
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
    borderBottom: `2px solid ${colors.tertiary.yellow}`,
    paddingBottom: '8px'
  };

  const labelStyle = {
    display: 'block',
    marginBottom: '8px',
    fontWeight: '600',
    color: colors.secondary.darkPurple,
    fontSize: '14px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px'
  };

  const helperTextStyle = {
    fontSize: '12px',
    color: colors.tertiary.blueGrey,
    marginTop: '4px',
    fontStyle: 'italic'
  };

  return (
    <form onSubmit={handleSubmit} style={{ 
      fontFamily: 'system-ui, -apple-system, sans-serif',
      padding: '32px',
      maxWidth: '1400px',
      margin: '0 auto',
      backgroundColor: colors.primary.offWhite,
      borderRadius: '16px',
      boxShadow: `0 8px 32px ${colors.tertiary.blueGrey}20`
    }}>
      {/* Prompt Configuration Section */}
      <CollapsibleSection
        title="Prompt Configuration"
        isExpanded={promptConfigExpanded}
        onToggle={() => setPromptConfigExpanded(!promptConfigExpanded)}
      >
        {/* Role */}
        <CollapsibleSection
          title="Role"
          isExpanded={promptSectionsExpanded.role}
          onToggle={() => togglePromptSection('role')}
          isSubSection={true}
        >
          <textarea
            key = {'RoleText'}
            value={formData.role}
            onChange={(e) => handleInputChange('role', e.target.value)}
            rows={4}
            style={{
              ...inputStyle,
              resize: 'vertical' as const,
              minHeight: '100px'
            }}
            placeholder="Define the role or persona for the AI assistant..."
            onFocus={(e) => {
              e.target.style.borderColor = colors.tertiary.blue;
              e.target.style.boxShadow = `0 0 0 3px ${colors.tertiary.blue}20`;
            }}
            onBlur={(e) => {
              e.target.style.borderColor = colors.primary.lightBlue;
              e.target.style.boxShadow = 'none';
            }}
          />
          <div style={helperTextStyle}>Specify the persona, expertise level, and perspective for the AI</div>
        </CollapsibleSection>

        {/* Task */}
        <CollapsibleSection
          title="Task"
          isExpanded={promptSectionsExpanded.task}
          onToggle={() => togglePromptSection('task')}
          isSubSection={true}
        >
          <textarea
            key = {'TaskText'}
            value={formData.task}
            onChange={(e) => handleInputChange('task', e.target.value)}
            rows={4}
            style={{
              ...inputStyle,
              resize: 'vertical' as const,
              minHeight: '100px'
            }}
            placeholder="Describe the specific task to be performed..."
            onFocus={(e) => {
              e.target.style.borderColor = colors.tertiary.blue;
              e.target.style.boxShadow = `0 0 0 3px ${colors.tertiary.blue}20`;
            }}
            onBlur={(e) => {
              e.target.style.borderColor = colors.primary.lightBlue;
              e.target.style.boxShadow = 'none';
            }}
          />
          <div style={helperTextStyle}>Clear, specific description of what you want accomplished</div>
        </CollapsibleSection>

        {/* Context */}
        <CollapsibleSection
          title="Context"
          isExpanded={promptSectionsExpanded.context}
          onToggle={() => togglePromptSection('context')}
          isSubSection={true}
        >
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
            onFocus={(e) => {
              e.target.style.borderColor = colors.tertiary.blue;
              e.target.style.boxShadow = `0 0 0 3px ${colors.tertiary.blue}20`;
            }}
            onBlur={(e) => {
              e.target.style.borderColor = colors.primary.lightBlue;
              e.target.style.boxShadow = 'none';
            }}
          />
          <div style={helperTextStyle}>Background information, constraints, or relevant details</div>
        </CollapsibleSection>

        {/* Format */}
        <CollapsibleSection
          title="Format"
          isExpanded={promptSectionsExpanded.format}
          onToggle={() => togglePromptSection('format')}
          isSubSection={true}
        >
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
            onFocus={(e) => {
              e.target.style.borderColor = colors.tertiary.blue;
              e.target.style.boxShadow = `0 0 0 3px ${colors.tertiary.blue}20`;
            }}
            onBlur={(e) => {
              e.target.style.borderColor = colors.primary.lightBlue;
              e.target.style.boxShadow = 'none';
            }}
          />
          <div style={helperTextStyle}>Structure, style, length, or presentation requirements</div>
        </CollapsibleSection>

        {/* Constraints */}
        <CollapsibleSection
          title="Constraints"
          isExpanded={promptSectionsExpanded.constraints}
          onToggle={() => togglePromptSection('constraints')}
          isSubSection={true}
        >
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
            onFocus={(e) => {
              e.target.style.borderColor = colors.tertiary.blue;
              e.target.style.boxShadow = `0 0 0 3px ${colors.tertiary.blue}20`;
            }}
            onBlur={(e) => {
              e.target.style.borderColor = colors.primary.lightBlue;
              e.target.style.boxShadow = 'none';
            }}
          />
          <div style={helperTextStyle}>Rules, limitations, or things to avoid</div>
        </CollapsibleSection>
      </CollapsibleSection>

      {/* Model Configuration Section */}
      <CollapsibleSection
        title="Model Configuration"
        isExpanded={modelConfigExpanded}
        onToggle={() => setModelConfigExpanded(!modelConfigExpanded)}
      >
        {/* Temperature */}
        <div style={{ marginBottom: '32px' }}>
          <label style={labelStyle}>Temperature: {formData.temperature}</label>
          <div style={helperTextStyle}>Controls randomness: 0 = focused, 1 = creative</div>
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
                background: `linear-gradient(to right, ${colors.tertiary.orange} 0%, ${colors.tertiary.yellow} ${formData.temperature * 100}%, ${colors.primary.lightBlue} ${formData.temperature * 100}%, ${colors.primary.lightBlue} 100%)`,
                boxShadow: `0 2px 4px ${colors.tertiary.blueGrey}30`,
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
        <div style={{ marginBottom: '32px' }}>
          <label style={labelStyle}>Model</label>
          <select
            value={formData.model}
            onChange={(e) => handleInputChange('model', e.target.value)}
            style={{
              ...inputStyle,
              cursor: 'pointer',
              appearance: 'none',
              WebkitAppearance: 'none',
              MozAppearance: 'none',
              backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='${colors.tertiary.blueGrey.replace('#', '%23')}' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
              backgroundPosition: 'right 12px center',
              backgroundRepeat: 'no-repeat',
              backgroundSize: '16px',
              paddingRight: '40px'
            }}
            onFocus={(e) => {
              e.target.style.borderColor = colors.tertiary.blue;
              e.target.style.boxShadow = `0 0 0 3px ${colors.tertiary.blue}20`;
            }}
            onBlur={(e) => {
              e.target.style.borderColor = colors.primary.lightBlue;
              e.target.style.boxShadow = 'none';
            }}
          >
            <option value="GPT-4.1">GPT-4.1</option>
            <option value="GPT-5">GPT-5</option>
          </select>
          <div style={helperTextStyle}>Select the AI model for processing</div>
        </div>
      </CollapsibleSection>

      {/* File Upload */}
      <div style={{ marginBottom: '32px' }}>
        <h2 style={sectionHeaderStyle}>Document Upload</h2>
        <div
          style={{
            border: `2px dashed ${colors.primary.lightBlue}`,
            borderRadius: '12px',
            padding: '32px',
            textAlign: 'center',
            backgroundColor: colors.primary.white,
            transition: 'all 0.3s ease',
            position: 'relative',
            backgroundImage: `linear-gradient(135deg, ${colors.primary.white} 0%, ${colors.primary.offWhite} 100%)`
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = colors.tertiary.blue;
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = `0 8px 25px ${colors.tertiary.blueGrey}30`;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = colors.primary.lightBlue;
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'none';
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
              transition: 'all 0.3s ease',
              boxShadow: `0 4px 12px ${colors.secondary.seaGreen}40`
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = colors.secondary.green;
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = `0 6px 16px ${colors.secondary.green}50`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = colors.secondary.seaGreen;
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = `0 4px 12px ${colors.secondary.seaGreen}40`;
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

      {/* Success Modal */}
      <SuccessModal
        isOpen={showSuccessModal}
        onClose={() => setShowSuccessModal(false)}
        message="Your document has been successfully processed and the CSV file has been downloaded!"
      />
    </form>
  );
};

export default DocumentProcessorForm;
