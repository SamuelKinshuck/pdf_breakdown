import React, { useState, useCallback, useEffect } from 'react';
import CollapsibleSection from './CollapsibleSection';
import SuccessModal from './SuccessModal';
import CustomDropdown from './CustomDropdown';
import OutputLocationModal, { OutputConfig } from './OutputLocationModal';
import ProcessingDetailsModal from './ProcessingDetailsModal';
import SavePromptModal, { SavePromptData } from './SavePromptModal';
import SearchPromptsModal, { SavedPrompt } from './SearchPromptsModal';
import { BACKEND_URL } from '../apiConfig';

interface InitFromSharepointResponse {
  success: boolean;
  pdf_file: FileUploadResponse;
  prompt: {
    role: string;
    task: string;
    context: string;
    format: string;
    constraints: string;
  };
  error?: string;
} 
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
  const [isProcessing, setIsProcessing] = useState(false)
  const [uploadError, setUploadError] = useState<string>('');

  // NEW: URL-based initialisation state
  const [isInitializing, setIsInitializing] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [initializedFromUrl, setInitializedFromUrl] = useState(false);

  // Processing state
  const [processedPages, setProcessedPages] = useState<{ page: number; gpt_response: string; image_size_bytes?: number }[]>([]);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState<number>(0);

  

  const percent = () => {
    if (!totalPages) return 0;
    return Math.round((processedPages.length / totalPages) * 100);
  };

  useEffect(() => {
  // Parse query params from the current URL
  const searchParams = new URLSearchParams(window.location.search);

  const folderName = searchParams.get('folderName');
  const xlsxFilename = searchParams.get('xlsxFilename');
  const siteName = searchParams.get('siteName')
  const pdfFilename = searchParams.get('pdfFilename')
  const sheet = searchParams.get('sheet');
  const row = searchParams.get('row');
  const column = searchParams.get('column')
  console.log('Folder Name FROM URL: ', folderName)

  // Only do the special flow if we actually have the SharePoint parameters
  if (!folderName || !xlsxFilename || !pdfFilename || !siteName) {
    return;
  }

  // Start init state
  setIsInitializing(true);
  setInitError(null);
  setUploadError('');

  const initFromSharepoint = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}api/init_from_sharepoint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folderName,
          siteName,
          sheet,
          row,
          column,
          xlsxFilename,
          pdfFilename
        })
      });

      if (!response.ok) {
        const msg = await response.text().catch(() => '');
        throw new Error(msg || `Init failed with status ${response.status}`);
      }

      const data = (await response.json()) as InitFromSharepointResponse;

      if (!data.success) {
        throw new Error(data.error || 'Failed to initialise from SharePoint.');
      }

      // 1) Pretend the PDF has been uploaded (so page selection etc. works)
      setFileInfo(data.pdf_file);

      // 2) Fill in the prompt fields
      setFormData(prev => ({
        ...prev,
        role: data.prompt.role || '',
        task: data.prompt.task || '',
        context: data.prompt.context || '',
        format: data.prompt.format || '',
        constraints: data.prompt.constraints || '',
        // Optional: auto-select all pages by default
        selectedPages: Array.from(
          { length: data.pdf_file.page_count },
          (_, i) => i + 1
        )
      }));

      setInitializedFromUrl(true);
    } catch (err: any) {
      console.error('Init from SharePoint error:', err);
      setInitError(err.message || 'Failed to load data from SharePoint URL.');
    } finally {
      setIsInitializing(false);
    }
  };

  void initFromSharepoint();
}, []);

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
  
  // Output location modal state
  const [showOutputModal, setShowOutputModal] = useState(false);
  const [outputConfig, setOutputConfig] = useState<OutputConfig>({ outputType: 'browser' });
  
  // Processing details modal state
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  
  // Prompt management modal state
  const [showSavePromptModal, setShowSavePromptModal] = useState(false);
  const [showSearchPromptsModal, setShowSearchPromptsModal] = useState(false);
  const [promptSaveSuccess, setPromptSaveSuccess] = useState<string | null>(null);
  
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
      const response = await fetch(BACKEND_URL + 'upload', {
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

  const handleSavePrompt = async (saveData: SavePromptData) => {
    try {
      const response = await fetch(`${BACKEND_URL}api/prompts/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: saveData.name,
          description: saveData.description,
          role: formData.role,
          task: formData.task,
          context: formData.context,
          format: formData.format,
          constraints: formData.constraints,
          tags: saveData.tags,
          created_by: saveData.created_by
        })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to save prompt');
      }

      setPromptSaveSuccess(`Prompt "${saveData.name}" saved successfully!`);
      setTimeout(() => setPromptSaveSuccess(null), 5000);
    } catch (error: any) {
      throw new Error(error.message || 'Failed to save prompt');
    }
  };

  const handleSelectPrompt = (prompt: SavedPrompt) => {
    setFormData(prev => ({
      ...prev,
      role: prompt.role_prompt || '',
      task: prompt.task_prompt || '',
      context: prompt.context_prompt || '',
      format: prompt.format_prompt || '',
      constraints: prompt.constraints_prompt || ''
    }));
    setPromptSaveSuccess(`Loaded prompt: "${prompt.name}"`);
    setTimeout(() => setPromptSaveSuccess(null), 5000);
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

  const processPage = async (jobId: string, pageNumber: number) => {
    const response = await fetch(`${BACKEND_URL}/process_page`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job_id: jobId,
        page_number: pageNumber
      }),
    });

    if (!response.ok) {
      const message = await response.text().catch(() => '');
      throw new Error(message || `Failed to process page ${pageNumber}`);
    }

    return await response.json();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!fileInfo?.file_id || formData.selectedPages.length === 0) return;

    try {
      setIsProcessing(true);
      setProcessingError(null);
      setProcessedPages([]);
      setTotalPages(formData.selectedPages.length);

      const response = await fetch(`${BACKEND_URL}/process`, {
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
          output_config: outputConfig,
        }),
      });

      if (!response.ok) {
        const message = await response.text().catch(() => '');
        throw new Error(message || `Processing failed with status ${response.status}`);
      }

      const data = await response.json();
      if (!data?.success || !data?.job_id) {
        throw new Error(data?.error || 'No job id returned.');
      }

      const sortedPages = [...formData.selectedPages].sort((a, b) => a - b);
      
      for (const pageNumber of sortedPages) {
        try {
          console.log(`Processing page ${pageNumber}...`);
          const pageResult = await processPage(data.job_id, pageNumber);
          
          if (!pageResult.success) {
            throw new Error(pageResult.error || `Failed to process page ${pageNumber}`);
          }

          setProcessedPages(prev => [...prev, {
            page: pageResult.page,
            gpt_response: pageResult.gpt_response,
            image_size_bytes: pageResult.image_size_bytes
          }]);

          if (pageResult.is_last_page) {
            console.log('Last page processed, downloading CSV');
            
            if (outputConfig.outputType === 'browser' && pageResult.csv_download_url) {
              const absolute = `${BACKEND_URL}${pageResult.csv_download_url}`;
              try {
                await downloadCsv(absolute, pageResult.csv_filename);
                setShowSuccessModal(true);
              } catch (e) {
                console.error(e);
                setProcessingError(e instanceof Error ? e.message : String(e));
              }
            } else if (outputConfig.outputType === 'sharepoint') {
              setShowSuccessModal(true);
            }
            
            setIsProcessing(false);
            break;
          }
        } catch (pageError) {
          console.error(`Error processing page ${pageNumber}:`, pageError);
          setProcessingError(pageError instanceof Error ? pageError.message : String(pageError));
          setIsProcessing(false);
          throw pageError;
        }
      }

    } catch (error) {
      console.error('Processing error:', error);
      setProcessingError(error instanceof Error ? error.message : String(error));
      setIsProcessing(false);
      alert('Failed to process document. Please try again.');
    }
  };



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

  if(initError) {
    <p
            style={{
              marginTop: '20px',
              color: colors.tertiary.red,
              fontSize: '14px'
            }}
          >
            ⚠️ {initError}
          </p>
  }
  if (isInitializing) {
    return (
      <div
        style={{
          fontFamily: 'system-ui, -apple-system, sans-serif',
          padding: '40px',
          maxWidth: '800px',
          margin: '80px auto',
          backgroundColor: colors.primary.offWhite,
          borderRadius: '20px',
          boxShadow: `0 12px 40px ${colors.tertiary.blueGrey}25`,
          textAlign: 'center'
        }}
      >
        <h2
          style={{
            color: colors.primary.darkGrey,
            fontSize: '24px',
            marginBottom: '16px'
          }}
        >
          Please wait while we access the information from your files…
        </h2>
        <p
          style={{
            color: colors.tertiary.blueGrey,
            fontSize: '14px',
            marginBottom: '16px'
          }}
        >
          We’re retrieving your PDF and prompt configuration from SharePoint.
        </p>

        {/* Simple loader bar */}
        <div
          style={{
            height: '8px',
            width: '60%',
            margin: '0 auto',
            borderRadius: '999px',
            backgroundColor: colors.primary.white,
            overflow: 'hidden',
            border: `1px solid ${colors.primary.lightBlue}`
          }}
        >
          <div
            style={{
              width: '50%',
              height: '100%',
              background: `linear-gradient(90deg, ${colors.secondary.seaGreen}, ${colors.secondary.green})`,
              animation: 'loadingBar 1s infinite alternate'
            }}
          />
        </div>

      </div>
    );
  }

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

        {/* Prompt Management Buttons */}
        <div style={{
          display: 'flex',
          gap: '12px',
          marginTop: '20px',
          flexWrap: 'wrap'
        }}>
          <button
            type="button"
            onClick={() => setShowSavePromptModal(true)}
            style={{
              flex: '1',
              minWidth: '200px',
              padding: '14px 24px',
              backgroundColor: colors.secondary.lilac,
              color: colors.primary.white,
              border: 'none',
              borderRadius: '12px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: `0 4px 12px ${colors.secondary.lilac}40`
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = colors.secondary.darkPurple;
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = `0 6px 16px ${colors.secondary.lilac}50`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = colors.secondary.lilac;
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = `0 4px 12px ${colors.secondary.lilac}40`;
            }}
          >
            💾 Save Prompts
          </button>

          <button
            type="button"
            onClick={() => setShowSearchPromptsModal(true)}
            style={{
              flex: '1',
              minWidth: '200px',
              padding: '14px 24px',
              backgroundColor: colors.tertiary.blue,
              color: colors.primary.white,
              border: 'none',
              borderRadius: '12px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: `0 4px 12px ${colors.tertiary.blue}40`
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = colors.tertiary.blueGrey;
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = `0 6px 16px ${colors.tertiary.blue}50`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = colors.tertiary.blue;
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = `0 4px 12px ${colors.tertiary.blue}40`;
            }}
          >
            🔍 Search Saved Prompts
          </button>
        </div>

        {/* Success Message */}
        {promptSaveSuccess && (
          <div style={{
            marginTop: '16px',
            padding: '12px 16px',
            backgroundColor: `${colors.secondary.green}20`,
            color: colors.secondary.seaGreen,
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '600',
            border: `2px solid ${colors.secondary.green}`,
            animation: 'fadeIn 0.3s ease'
          }}>
            ✓ {promptSaveSuccess}
          </div>
        )}
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
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', alignItems: 'center' }}>
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
            <button
              type = {'button'}
              onClick={() => setShowOutputModal(true)}
              style={{
                padding: '12px 24px',
                backgroundColor: colors.secondary.lilac,
                color: colors.primary.white,
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '600',
                border: 'none',
                fontSize: '16px',
                transition: 'all 0.3s ease',
                boxShadow: `0 4px 12px ${colors.secondary.lilac}40`
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = colors.secondary.darkPurple;
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = `0 6px 16px ${colors.secondary.darkPurple}50`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = colors.secondary.lilac;
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = `0 4px 12px ${colors.secondary.lilac}40`;
              }}
            >
              Choose Output Location
            </button>
          </div>
          <p style={{ marginTop: '16px', color: colors.tertiary.lightGrey, fontSize: '14px' }}>
            Supports PDF, DOCX, and PPTX files
          </p>
          {uploadError && (
            <p style={{ color: colors.tertiary.red, marginTop: '8px', fontSize: '14px' }}>
              {uploadError}
            </p>
          )}
          {formData.file && (
            <p
              style={{
                color: colors.secondary.seaGreen,
                marginTop: '8px',
                fontSize: '14px'
              }}
            >
              Selected: {formData.file.name}
            </p>
          )}

          {/* NEW: show info when PDF came from SharePoint init */}
          {!formData.file && fileInfo && initializedFromUrl && (
            <p
              style={{
                color: colors.secondary.seaGreen,
                marginTop: '8px',
                fontSize: '14px'
              }}
            >
              PDF loaded from SharePoint: {fileInfo.filename} ({fileInfo.page_count} pages)
            </p>
          )}
          {outputConfig.outputType === 'sharepoint' && outputConfig.sharepointFolder && (
            <div style={{ 
              marginTop: '12px', 
              padding: '12px', 
              backgroundColor: colors.primary.offWhite,
              borderRadius: '8px',
              fontSize: '14px'
            }}>
              <div style={{ color: colors.secondary.seaGreen, fontWeight: '600', marginBottom: '4px' }}>
                📤 Output to SharePoint
              </div>
              <div style={{ color: colors.primary.darkGrey, fontSize: '12px' }}>
                Folder: {outputConfig.sharepointFolder}
              </div>
              <div style={{ color: colors.primary.darkGrey, fontSize: '12px' }}>
                File: {outputConfig.filename}
              </div>
            </div>
          )}
          {outputConfig.outputType === 'browser' && (
            <p style={{ marginTop: '8px', color: colors.tertiary.blue, fontSize: '14px' }}>
              📥 Output: Download to browser
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

      {isProcessing && (
  <div style={{
    margin: '24px 0',
    padding: '16px',
    borderRadius: '12px',
    background: colors.primary.white,
    border: `1px solid ${colors.primary.lightBlue}`,
    boxShadow: `0 6px 18px ${colors.tertiary.blueGrey}20`
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
      <strong>Processing Status</strong>
      <span style={{ 
        fontSize: '14px', 
        fontWeight: '600',
        color: processingError 
          ? colors.tertiary.red
          : processedPages.length === totalPages
          ? colors.secondary.green
          : colors.tertiary.blue,
        textTransform: 'capitalize'
      }}>
        {processingError ? 'error' : processedPages.length === totalPages ? 'completed' : 'processing...'}
      </span>
    </div>

    {/* Progress bar */}
      <div style={{ height: 10, background: colors.primary.offWhite, borderRadius: 6, overflow: 'hidden', marginBottom: 12 }}>
        <div
          style={{
            width: `${percent()}%`,
            height: '100%',
            transition: 'width 300ms ease',
            background: `linear-gradient(90deg, ${colors.secondary.seaGreen}, ${colors.secondary.green})`
          }}
        />
      </div>

      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        fontSize: 14, 
        color: colors.tertiary.blueGrey 
      }}>
        <div>
          <strong>{percent()}%</strong> - Pages: {processedPages.length} / {totalPages}
        </div>
        <button
          type="button"
          onClick={() => setShowDetailsModal(true)}
          style={{
            padding: '8px 16px',
            backgroundColor: colors.secondary.seaGreen,
            color: colors.primary.white,
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            boxShadow: `0 2px 8px ${colors.secondary.seaGreen}40`
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = colors.secondary.green;
            e.currentTarget.style.transform = 'translateY(-1px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = colors.secondary.seaGreen;
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          View Details
        </button>
      </div>

      {processingError && (
        <div style={{ 
          color: colors.tertiary.red, 
          marginTop: 12,
          padding: '8px 12px',
          backgroundColor: `${colors.tertiary.red}15`,
          borderRadius: '6px',
          fontSize: '13px'
        }}>
          ⚠️ {processingError}
        </div>
      )}
    </div>
  )}


      {/* Output Location Modal */}
      <OutputLocationModal
        isOpen={showOutputModal}
        onClose={() => setShowOutputModal(false)}
        onConfirm={(config) => {
          setOutputConfig(config);
          setShowOutputModal(false);
        }}
      />

      {/* Success Modal */}
      <SuccessModal
        isOpen={showSuccessModal}
        onClose={() => setShowSuccessModal(false)}
        message="Your document has been successfully processed and the CSV file has been downloaded!"
      />

      {/* Processing Details Modal */}
      <ProcessingDetailsModal
        isOpen={showDetailsModal}
        onClose={() => setShowDetailsModal(false)}
        processedPages={processedPages}
        totalPages={totalPages}
        processingError={processingError}
      />

      {/* Save Prompt Modal */}
      <SavePromptModal
        isOpen={showSavePromptModal}
        onClose={() => setShowSavePromptModal(false)}
        onSave={handleSavePrompt}
        promptData={{
          role: formData.role,
          task: formData.task,
          context: formData.context,
          format: formData.format,
          constraints: formData.constraints
        }}
      />

      {/* Search Prompts Modal */}
      <SearchPromptsModal
        isOpen={showSearchPromptsModal}
        onClose={() => setShowSearchPromptsModal(false)}
        onSelectPrompt={handleSelectPrompt}
      />
    </form>
  );
};

export default DocumentProcessorForm;
