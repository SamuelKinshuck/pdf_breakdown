import React, { useState, useEffect } from 'react';

interface OutputLocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (config: OutputConfig) => void;
}

export interface OutputConfig {
  outputType: 'browser' | 'sharepoint';
  sharepointFolder?: string;
  filename?: string;
  contextId?: string;
}

interface FolderNode {
  name: string;
  serverRelativeUrl: string;
}

const OutputLocationModal: React.FC<OutputLocationModalProps> = ({ isOpen, onClose, onConfirm }) => {
  const [outputType, setOutputType] = useState<'browser' | 'sharepoint'>('browser');
  const [contextId, setContextId] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [currentFolder, setCurrentFolder] = useState<string>('');
  const [folderContents, setFolderContents] = useState<{ folders: FolderNode[], files: any[] } | null>(null);
  const [folderHistory, setFolderHistory] = useState<string[]>([]);
  const [filename, setFilename] = useState<string>('output.csv');
  const [isLoadingFolder, setIsLoadingFolder] = useState(false);
  const [siteUrl, setSiteUrl] = useState<string>('https://tris42.sharepoint.com/sites/GADOpportunitiesandSolutions');
  const [rootFolder, setRootFolder] = useState<string>('/sites/GADOpportunitiesandSolutions/Shared Documents');

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

  useEffect(() => {
    if (!isOpen) {
      setOutputType('browser');
      setContextId(null);
      setAuthError(null);
      setCurrentFolder('');
      setFolderContents(null);
      setFolderHistory([]);
      setFilename('output.csv');
    }
  }, [isOpen]);

  const handleCreateContext = async () => {
    setIsAuthenticating(true);
    setAuthError(null);
    try {
      const response = await fetch(`${window.BACKEND_URL}/api/context`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          site_url: siteUrl,
          tenant: 'tris42.onmicrosoft.com',
          client_id: 'd44a05d5-c6a5-4bbb-82d2-443123722380'
        })
      });
      
      const data = await response.json();
      
      if (response.ok && data.context_id) {
        setContextId(data.context_id);
        setCurrentFolder(rootFolder);
        await loadFolder(rootFolder, data.context_id);
      } else {
        setAuthError(data.error || 'Failed to authenticate with SharePoint');
      }
    } catch (error) {
      setAuthError('Connection error: ' + (error as Error).message);
    } finally {
      setIsAuthenticating(false);
    }
  };

  const loadFolder = async (folderPath: string, ctxId?: string) => {
    const ctx = ctxId || contextId;
    if (!ctx) return;
    
    setIsLoadingFolder(true);
    try {
      const response = await fetch(
        `${window.BACKEND_URL}/api/folder/list?context_id=${ctx}&folder=${encodeURIComponent(folderPath)}`
      );
      
      const data = await response.json();
      
      if (response.ok) {
        setFolderContents(data);
      } else {
        console.error('Failed to load folder:', data.error);
      }
    } catch (error) {
      console.error('Error loading folder:', error);
    } finally {
      setIsLoadingFolder(false);
    }
  };

  const navigateToFolder = (folderPath: string) => {
    setFolderHistory([...folderHistory, currentFolder]);
    setCurrentFolder(folderPath);
    loadFolder(folderPath);
  };

  const navigateBack = () => {
    if (folderHistory.length > 0) {
      const previousFolder = folderHistory[folderHistory.length - 1];
      setFolderHistory(folderHistory.slice(0, -1));
      setCurrentFolder(previousFolder);
      loadFolder(previousFolder);
    }
  };

  const handleConfirm = () => {
    if (outputType === 'browser') {
      onConfirm({ outputType: 'browser' });
    } else {
      if (!filename.endsWith('.csv')) {
        alert('Filename must end with .csv');
        return;
      }
      if (!currentFolder || !contextId) {
        alert('Please select a SharePoint folder');
        return;
      }
      onConfirm({
        outputType: 'sharepoint',
        sharepointFolder: currentFolder,
        filename: filename,
        contextId: contextId
      });
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        backdropFilter: 'blur(4px)'
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: colors.primary.white,
          borderRadius: '20px',
          padding: '40px',
          maxWidth: '700px',
          width: '90%',
          maxHeight: '80vh',
          overflow: 'auto',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
          border: `3px solid ${colors.secondary.seaGreen}`
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ 
          color: colors.primary.darkGrey, 
          marginBottom: '24px',
          fontSize: '24px',
          fontWeight: 'bold'
        }}>
          Choose Output Location
        </h2>

        {/* Output Type Selection */}
        <div style={{ marginBottom: '24px' }}>
          <label style={{ display: 'block', marginBottom: '12px', fontWeight: '600', color: colors.primary.darkGrey }}>
            Output Destination:
          </label>
          <div style={{ display: 'flex', gap: '16px' }}>
            <button
              onClick={() => setOutputType('browser')}
              style={{
                flex: 1,
                padding: '16px',
                borderRadius: '8px',
                border: `2px solid ${outputType === 'browser' ? colors.secondary.seaGreen : colors.primary.lightBlue}`,
                backgroundColor: outputType === 'browser' ? colors.secondary.seaGreen : colors.primary.white,
                color: outputType === 'browser' ? colors.primary.white : colors.primary.darkGrey,
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.3s ease'
              }}
            >
              Download to Browser
            </button>
            <button
              onClick={() => setOutputType('sharepoint')}
              style={{
                flex: 1,
                padding: '16px',
                borderRadius: '8px',
                border: `2px solid ${outputType === 'sharepoint' ? colors.secondary.seaGreen : colors.primary.lightBlue}`,
                backgroundColor: outputType === 'sharepoint' ? colors.secondary.seaGreen : colors.primary.white,
                color: outputType === 'sharepoint' ? colors.primary.white : colors.primary.darkGrey,
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.3s ease'
              }}
            >
              Save to SharePoint
            </button>
          </div>
        </div>

        {/* SharePoint Configuration */}
        {outputType === 'sharepoint' && (
          <>
            {!contextId ? (
              <div style={{ marginBottom: '24px' }}>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: colors.primary.darkGrey }}>
                    SharePoint Site URL:
                  </label>
                  <input
                    type="text"
                    value={siteUrl}
                    onChange={(e) => setSiteUrl(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '8px',
                      border: `2px solid ${colors.primary.lightBlue}`,
                      fontSize: '14px'
                    }}
                  />
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: colors.primary.darkGrey }}>
                    Root Folder Path:
                  </label>
                  <input
                    type="text"
                    value={rootFolder}
                    onChange={(e) => setRootFolder(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '8px',
                      border: `2px solid ${colors.primary.lightBlue}`,
                      fontSize: '14px'
                    }}
                  />
                </div>
                <button
                  onClick={handleCreateContext}
                  disabled={isAuthenticating}
                  style={{
                    width: '100%',
                    padding: '12px 24px',
                    backgroundColor: isAuthenticating ? colors.tertiary.lightGrey : colors.secondary.seaGreen,
                    color: colors.primary.white,
                    borderRadius: '8px',
                    border: 'none',
                    fontWeight: '600',
                    cursor: isAuthenticating ? 'not-allowed' : 'pointer',
                    fontSize: '16px'
                  }}
                >
                  {isAuthenticating ? 'Authenticating...' : 'Connect to SharePoint'}
                </button>
                {authError && (
                  <div style={{ 
                    marginTop: '12px', 
                    padding: '12px', 
                    backgroundColor: `${colors.tertiary.red}20`,
                    borderRadius: '8px',
                    color: colors.tertiary.red,
                    fontSize: '14px'
                  }}>
                    {authError}
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Folder Navigation */}
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '8px',
                    marginBottom: '12px'
                  }}>
                    <label style={{ fontWeight: '600', color: colors.primary.darkGrey }}>
                      Current Folder:
                    </label>
                    {folderHistory.length > 0 && (
                      <button
                        onClick={navigateBack}
                        style={{
                          padding: '4px 12px',
                          backgroundColor: colors.tertiary.blue,
                          color: colors.primary.white,
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '14px'
                        }}
                      >
                        ← Back
                      </button>
                    )}
                  </div>
                  <div style={{
                    padding: '12px',
                    backgroundColor: colors.primary.offWhite,
                    borderRadius: '8px',
                    fontSize: '14px',
                    color: colors.primary.darkGrey,
                    wordBreak: 'break-all'
                  }}>
                    {currentFolder || 'No folder selected'}
                  </div>
                </div>

                {/* Folder Contents */}
                {isLoadingFolder ? (
                  <div style={{ textAlign: 'center', padding: '20px', color: colors.tertiary.lightGrey }}>
                    Loading folders...
                  </div>
                ) : folderContents && (
                  <div style={{ 
                    marginBottom: '24px',
                    border: `2px solid ${colors.primary.lightBlue}`,
                    borderRadius: '8px',
                    maxHeight: '200px',
                    overflow: 'auto'
                  }}>
                    {folderContents.folders.length === 0 ? (
                      <div style={{ padding: '20px', textAlign: 'center', color: colors.tertiary.lightGrey }}>
                        No subfolders in this location
                      </div>
                    ) : (
                      folderContents.folders.map((folder) => (
                        <div
                          key={folder.serverRelativeUrl}
                          onClick={() => navigateToFolder(folder.serverRelativeUrl)}
                          style={{
                            padding: '12px 16px',
                            borderBottom: `1px solid ${colors.primary.lightBlue}`,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            transition: 'background-color 0.2s ease'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = colors.primary.offWhite;
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent';
                          }}
                        >
                          <span style={{ fontSize: '18px' }}>📁</span>
                          <span style={{ fontSize: '14px', color: colors.primary.darkGrey }}>
                            {folder.name}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* Filename Input */}
                <div style={{ marginBottom: '24px' }}>
                  <label style={{ 
                    display: 'block', 
                    marginBottom: '8px', 
                    fontWeight: '600', 
                    color: colors.primary.darkGrey 
                  }}>
                    Output Filename (must end with .csv):
                  </label>
                  <input
                    type="text"
                    value={filename}
                    onChange={(e) => setFilename(e.target.value)}
                    placeholder="output.csv"
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '8px',
                      border: `2px solid ${filename.endsWith('.csv') ? colors.primary.lightBlue : colors.tertiary.red}`,
                      fontSize: '14px'
                    }}
                  />
                  {!filename.endsWith('.csv') && (
                    <div style={{ marginTop: '4px', fontSize: '12px', color: colors.tertiary.red }}>
                      Filename must end with .csv
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: '12px 24px',
              backgroundColor: colors.tertiary.lightGrey,
              color: colors.primary.white,
              borderRadius: '8px',
              border: 'none',
              fontWeight: '600',
              cursor: 'pointer',
              fontSize: '16px'
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={outputType === 'sharepoint' && (!contextId || !filename.endsWith('.csv'))}
            style={{
              flex: 1,
              padding: '12px 24px',
              backgroundColor: (outputType === 'sharepoint' && (!contextId || !filename.endsWith('.csv'))) 
                ? colors.tertiary.lightGrey 
                : colors.secondary.green,
              color: colors.primary.white,
              borderRadius: '8px',
              border: 'none',
              fontWeight: '600',
              cursor: (outputType === 'sharepoint' && (!contextId || !filename.endsWith('.csv'))) 
                ? 'not-allowed' 
                : 'pointer',
              fontSize: '16px'
            }}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};

export default OutputLocationModal;
