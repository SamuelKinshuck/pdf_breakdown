import React, { useState, useCallback, useEffect } from 'react';
import CollapsibleSection from './CollapsibleSection';
import SuccessModal from './SuccessModal';
import CustomDropdown from './CustomDropdown';

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

// --- add near your other interfaces ---
interface PollResponse {
  success: boolean;
  job_id: string;
  file_id: string;
  status: 'queued' | 'running' | 'completed' | 'error' | string;
  error?: string | null;
  created_at?: string;
  updated_at?: string;
  started_at?: string | null;
  finished_at?: string | null;
  pages_total: number;
  pages_done: number;
  last_page?: number | null;
  responses: { page: number; gpt_response: string }[];
  csv_filename?: string | null;
  csv_download_url?: string | null;
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
  const [isProcessing, setIsProcessing] = useState(false)
  const [uploadError, setUploadError] = useState<string>('');

  // --- add to component state ---
  const [jobId, setJobId] = useState<string | null>(null);
  const [pollUrl, setPollUrl] = useState<string | null>(null);
  const [pollData, setPollData] = useState<PollResponse | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  const percent = (p: PollResponse | null) => {
    if (!p || !p.pages_total) return 0;
    const done = Math.min(p.pages_done ?? 0, p.pages_total);
    return Math.round((done / p.pages_total) * 100);
  };

  const downloadCsv = async (absoluteUrl: string, filename?: string | null) => {
    const dlResp = await fetch(absoluteUrl);
    if (!dlResp.ok) throw new Error('CSV download failed.');
    const blob = await dlResp.blob();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename || 'gpt_responses.csv';
    document.body.appendChild(link);
    link.click();
    URL.revokeObjectURL(link.href);
    link.remove();
  };

  
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
      const response = await fetch(window.BACKEND_URL + 'upload', {
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
  console.log('isProcessing', isProcessing)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!fileInfo?.file_id || formData.selectedPages.length === 0) return;

    try {
      setIsProcessing(true);
      setPollError(null);
      setPollData(null);
      setJobId(null);
      setPollUrl(null);

      const response = await fetch(`${window.BACKEND_URL}/process`, {
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
          file_id: fileInfo.file_id,
          selected_pages: formData.selectedPages,
        }),
      });

      if (!response.ok) {
        const message = await response.text().catch(() => '');
        throw new Error(message || `Processing failed with status ${response.status}`);
      }

      const data = await response.json(); // 202 with job_id + poll_url
      if (!data?.success || !data?.job_id || !data?.poll_url) {
        throw new Error(data?.error || 'No job id or poll url returned.');
      }

      setJobId(data.job_id);
      setPollUrl(`${window.BACKEND_URL}${data.poll_url}`); // poll_url is like "/process_poll?job_id=..."
      setIsPolling(true); // polling starts in useEffect below
    } catch (error) {
      console.error('Processing error:', error);
      setPollError(error instanceof Error ? error.message : String(error));
      setIsProcessing(false);
      setIsPolling(false);
      alert('Failed to process document. Please try again.');
    }
  };

  useEffect(() => {
    if (!isPolling || !pollUrl) return;

    let isMounted = true;
    let intervalId: number | undefined;

    const tick = async () => {
      try {
        const r = await fetch(pollUrl, { method: 'GET' });
        if (!r.ok) throw new Error(`Poll failed: ${r.status}`);
        const json: PollResponse = await r.json();
        if (!isMounted) return;
        setPollData(json);

        // Stop on terminal states
        if (json.status === 'completed' || json.status === 'error') {
          setIsPolling(false);
          setIsProcessing(false);

          if (json.status === 'completed' && json.csv_download_url) {
            const absolute = `${window.BACKEND_URL}${json.csv_download_url}`;
            try {
              await downloadCsv(absolute, json.csv_filename);
              setShowSuccessModal(true);
            } catch (e) {
              console.error(e);
              setPollError(e instanceof Error ? e.message : String(e));
            }
          } else if (json.status === 'error') {
            setPollError(json.error || 'Processing failed.');
          }

          if (intervalId) window.clearInterval(intervalId);
        }
      } catch (e) {
        if (!isMounted) return;
        setPollError(e instanceof Error ? e.message : String(e));
        // keep polling; often transient (network) errors
      }
    };

    // first immediate poll, then every 3s
    tick();
    intervalId = window.setInterval(tick, 3000);

    return () => {
      isMounted = false;
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [isPolling, pollUrl]);



  const inputStyle = {
    width: 'calc(100% - 50px)',
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
      padding: '40px',
      maxWidth: '1400px',
      margin: '0 auto',
      backgroundColor: colors.primary.offWhite,
      borderRadius: '20px',
      boxShadow: `0 12px 40px ${colors.tertiary.blueGrey}25`
    }}>
      {/* Prompt Configuration Section */}
      <CollapsibleSection
        title="⚙️ Prompt Configuration"
        isExpanded={promptConfigExpanded}
        onToggle={() => setPromptConfigExpanded(!promptConfigExpanded)}
      >
        {/* Role */}
        <CollapsibleSection
          title="👤 Role"
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
          title="📋 Task"
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
          title="🔍 Context"
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
          title="📝 Format"
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
          title="⚠️ Constraints"
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
        title="🤖 Model Configuration"
        isExpanded={modelConfigExpanded}
        onToggle={() => setModelConfigExpanded(!modelConfigExpanded)}
      >
        {/* Temperature */}
        <div style={{ marginBottom: '32px' }}>
          <label style={labelStyle}>🌡️ Temperature: {formData.temperature}</label>
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
          <label style={labelStyle}>⚡ Model</label>
          <CustomDropdown
            value={formData.model}
            onChange={(value) => handleInputChange('model', value)}
            options={[
              { value: 'GPT-4.1', label: 'GPT-4.1', icon: '🤖' },
              { value: 'GPT-5', label: 'GPT-5', icon: '⚡' }
            ]}
            placeholder="Select AI Model"
            onFocus={(e) => {
              // Optional: Add any focus handling
            }}
            onBlur={(e) => {
              // Optional: Add any blur handling
            }}
          />
          <div style={helperTextStyle}>Select the AI model for processing</div>
        </div>
      </CollapsibleSection>

      {/* File Upload */}
      <div style={{ marginBottom: '32px' }}>
        <h2 style={sectionHeaderStyle}>📁 Document Upload</h2>
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
          <label style={labelStyle}>📄 Pages (Total: {fileInfo.page_count})</label>
          
          {/* Quick Selection Buttons */}
          <div style={{ marginBottom: '16px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {[
              { label: '📄 All Pages', value: 'all' },
              { label: '1️⃣ Odd Pages', value: 'odd' },
              { label: '2️⃣ Even Pages', value: 'even' },
              { label: '⬆️ First Half', value: 'first-half' },
              { label: '⬇️ Second Half', value: 'second-half' }
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={
                  () => {
                    handleQuickPageSelection(option.value, fileInfo.page_count)
                  }
                }
                style={{
                  padding: '10px 18px',
                  backgroundColor: colors.secondary.lilac,
                  color: colors.primary.white,
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  transition: 'all 0.3s ease',
                  boxShadow: `0 2px 8px ${colors.secondary.lilac}30`
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = colors.secondary.darkPurple;
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = `0 4px 12px ${colors.secondary.darkPurple}40`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = colors.secondary.lilac;
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = `0 2px 8px ${colors.secondary.lilac}30`;
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
        disabled={!fileInfo || formData.selectedPages.length === 0 || isProcessing}
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
        🚀 {isProcessing ? 'Your Document is being processed' : 'Process Document'}
      </button>

      {(isProcessing || isPolling) && (
  <div style={{
    margin: '24px 0',
    padding: '16px',
    borderRadius: '12px',
    background: colors.primary.white,
    border: `1px solid ${colors.primary.lightBlue}`,
    boxShadow: `0 6px 18px ${colors.tertiary.blueGrey}20`
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
      <strong>Processing Status</strong>
      <span>{pollData?.status ?? 'starting...'}</span>
    </div>

    {/* Progress bar */}
      <div style={{ height: 10, background: colors.primary.offWhite, borderRadius: 6, overflow: 'hidden', marginBottom: 8 }}>
        <div
          style={{
            width: `${percent(pollData)}%`,
            height: '100%',
            transition: 'width 300ms ease',
            background: colors.secondary.green
          }}
        />
      </div>

      <div style={{ fontSize: 14, color: colors.tertiary.blueGrey }}>
        <div>Pages: {pollData?.pages_done ?? 0} / {pollData?.pages_total ?? formData.selectedPages.length}</div>
        {pollData?.last_page ? <div>Last processed page: {pollData.last_page}</div> : null}
        {pollError && <div style={{ color: colors.tertiary.red, marginTop: 6 }}>⚠️ {pollError}</div>}
      </div>

      {/* Live responses list */}
      {pollData?.responses?.length ? (
        <div style={{
          marginTop: 12,
          maxHeight: 200,
          overflowY: 'auto',
          borderTop: `1px solid ${colors.primary.offWhite}`,
          paddingTop: 8
        }}>
          {pollData.responses.map(r => (
            <div key={r.page} style={{ marginBottom: 8 }}>
              <strong>Page {r.page}:</strong>
              <div style={{ fontSize: 13, color: colors.primary.darkGrey, whiteSpace: 'pre-wrap' }}>
                {r.gpt_response}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )}


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
