import React, { useState, useEffect } from 'react';
import { BACKEND_URL } from '../apiConfig';

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

interface FileNode {
  name: string;
  serverRelativeUrl: string;
}

const OutputLocationModal: React.FC<OutputLocationModalProps> = ({ isOpen, onClose, onConfirm }) => {
  const [outputType, setOutputType] = useState<'browser' | 'sharepoint'>('browser');
  const [contextId, setContextId] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [currentFolder, setCurrentFolder] = useState<string>('');
  const [folderContents, setFolderContents] = useState<{ folders: FolderNode[], files: FileNode[] } | null>(null);
  const [folderHistory, setFolderHistory] = useState<string[]>([]);
  const [breadcrumbTrail, setBreadcrumbTrail] = useState<Array<{ name: string; path: string }>>([]);
  const [filename, setFilename] = useState<string>('output.csv');
  const [isLoadingFolder, setIsLoadingFolder] = useState(false);
  const [siteUrl, setSiteUrl] = useState<string>('https://tris42.sharepoint.com/sites/GADOpportunitiesandSolutions');
  const [rootFolder, setRootFolder] = useState<string>('/sites/GADOpportunitiesandSolutions');

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
      setBreadcrumbTrail([]);
      setFilename('output.csv');
    }
  }, [isOpen]);

  const handleCreateContext = async () => {
    setIsAuthenticating(true);
    setAuthError(null);
    try {
      const response = await fetch(`${BACKEND_URL}/api/context`, {
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
        const rootName = rootFolder.split('/').pop() || 'Root';
        setBreadcrumbTrail([{ name: rootName, path: rootFolder }]);
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
        `${BACKEND_URL}/api/folder/list?context_id=${ctx}&folder=${encodeURIComponent(folderPath)}`
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

  const navigateToFolder = (folderPath: string, folderName: string) => {
    setFolderHistory([...folderHistory, currentFolder]);
    setBreadcrumbTrail([...breadcrumbTrail, { name: folderName, path: folderPath }]);
    setCurrentFolder(folderPath);
    loadFolder(folderPath);
  };

  const navigateBack = () => {
    if (folderHistory.length > 0) {
      const previousFolder = folderHistory[folderHistory.length - 1];
      setFolderHistory(folderHistory.slice(0, -1));
      setBreadcrumbTrail(breadcrumbTrail.slice(0, -1));
      setCurrentFolder(previousFolder);
      loadFolder(previousFolder);
    }
  };

  const navigateToAncestor = (ancestorIndex: number) => {
    const targetBreadcrumb = breadcrumbTrail[ancestorIndex];
    if (!targetBreadcrumb) return;
    
    const newBreadcrumbTrail = breadcrumbTrail.slice(0, ancestorIndex + 1);
    const newFolderHistory = newBreadcrumbTrail.slice(0, -1).map(crumb => crumb.path);
    
    setFolderHistory(newFolderHistory);
    setBreadcrumbTrail(newBreadcrumbTrail);
    setCurrentFolder(targetBreadcrumb.path);
    loadFolder(targetBreadcrumb.path);
  };

  const renderBreadcrumbPath = () => {
    if (breadcrumbTrail.length === 0) {
      return <span style={{ color: colors.tertiary.lightGrey }}>No folder selected</span>;
    }
    
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px' }}>
        {breadcrumbTrail.map((crumb, index) => {
          const isLast = index === breadcrumbTrail.length - 1;
          
          return (
            <React.Fragment key={index}>
              <span
                onClick={() => !isLast && navigateToAncestor(index)}
                style={{
                  cursor: isLast ? 'default' : 'pointer',
                  color: isLast ? colors.primary.darkGrey : colors.tertiary.blue,
                  fontWeight: isLast ? '600' : '400',
                  textDecoration: isLast ? 'none' : 'underline',
                  fontSize: '14px'
                }}
                onMouseEnter={(e) => {
                  if (!isLast) e.currentTarget.style.color = colors.secondary.seaGreen;
                }}
                onMouseLeave={(e) => {
                  if (!isLast) e.currentTarget.style.color = colors.tertiary.blue;
                }}
              >
                {crumb.name}
              </span>
              {!isLast && (
                <span style={{ color: colors.tertiary.lightGrey, fontSize: '14px' }}>›</span>
              )}
            </React.Fragment>
          );
        })}
      </div>
    );
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

  const isSharePointMode = outputType === 'sharepoint';
  const isConnected = contextId !== null;

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
          width: '900px',
          maxWidth: '90vw',
          height: '700px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
          border: `3px solid ${colors.secondary.seaGreen}`,
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
          <span style={{ fontSize: '28px' }}>📍</span>
          <h2 style={{ 
            color: colors.primary.darkGrey, 
            margin: 0,
            fontSize: '28px',
            fontWeight: 'bold'
          }}>
            Choose Output Location
          </h2>
        </div>

        {/* Output Type Selection */}
        <div style={{ marginBottom: '24px' }}>
          <label style={{ 
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '12px', 
            fontWeight: '600', 
            color: colors.primary.darkGrey,
            fontSize: '16px'
          }}>
            <span style={{ fontSize: '20px' }}>🎯</span>
            Output Destination:
          </label>
          <div style={{ display: 'flex', gap: '16px' }}>
            <button
              type="button"
              onClick={() => setOutputType('browser')}
              style={{
                flex: 1,
                padding: '16px',
                borderRadius: '12px',
                border: `2px solid ${outputType === 'browser' ? colors.secondary.seaGreen : colors.primary.lightBlue}`,
                backgroundColor: outputType === 'browser' ? colors.secondary.seaGreen : colors.primary.white,
                color: outputType === 'browser' ? colors.primary.white : colors.primary.darkGrey,
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                fontSize: '15px'
              }}
            >
              <span style={{ fontSize: '20px' }}>💾</span>
              Download to Browser
            </button>
            <button
              type="button"
              onClick={() => setOutputType('sharepoint')}
              style={{
                flex: 1,
                padding: '16px',
                borderRadius: '12px',
                border: `2px solid ${outputType === 'sharepoint' ? colors.secondary.seaGreen : colors.primary.lightBlue}`,
                backgroundColor: outputType === 'sharepoint' ? colors.secondary.seaGreen : colors.primary.white,
                color: outputType === 'sharepoint' ? colors.primary.white : colors.primary.darkGrey,
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                fontSize: '15px'
              }}
            >
              <span style={{ fontSize: '20px' }}>☁️</span>
              Save to SharePoint
            </button>
          </div>
        </div>

        {/* SharePoint Configuration Area - Fixed Height */}
        <div style={{ 
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          opacity: isSharePointMode ? 1 : 0.4,
          pointerEvents: isSharePointMode ? 'auto' : 'none',
          transition: 'opacity 0.3s ease'
        }}>
          {!isConnected ? (
            <div style={{ 
              display: 'flex',
              flexDirection: 'column',
              height: '100%'
            }}>
              <div style={{ 
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '16px',
                fontWeight: '600',
                color: colors.primary.darkGrey,
                fontSize: '16px'
              }}>
                <span style={{ fontSize: '20px' }}>🔐</span>
                SharePoint Connection
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: colors.primary.darkGrey }}>
                  SharePoint Site URL:
                </label>
                <input
                  type="text"
                  value={siteUrl}
                  onChange={(e) => setSiteUrl(e.target.value)}
                  disabled={!isSharePointMode}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '8px',
                    border: `2px solid ${colors.primary.lightBlue}`,
                    fontSize: '14px',
                    backgroundColor: colors.primary.white
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
                  disabled={!isSharePointMode}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '8px',
                    border: `2px solid ${colors.primary.lightBlue}`,
                    fontSize: '14px',
                    backgroundColor: colors.primary.white
                  }}
                />
              </div>
              <button
                type="button"
                onClick={handleCreateContext}
                disabled={isAuthenticating || !isSharePointMode}
                style={{
                  width: '100%',
                  padding: '14px 24px',
                  backgroundColor: (isAuthenticating || !isSharePointMode) ? colors.tertiary.lightGrey : colors.secondary.seaGreen,
                  color: colors.primary.white,
                  borderRadius: '10px',
                  border: 'none',
                  fontWeight: '600',
                  cursor: (isAuthenticating || !isSharePointMode) ? 'not-allowed' : 'pointer',
                  fontSize: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                <span style={{ fontSize: '20px' }}>🔗</span>
                {isAuthenticating ? 'Authenticating...' : 'Connect to SharePoint'}
              </button>
              {authError && (
                <div style={{ 
                  marginTop: '12px', 
                  padding: '12px', 
                  backgroundColor: `${colors.tertiary.red}20`,
                  borderRadius: '8px',
                  color: colors.tertiary.red,
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span>⚠️</span>
                  {authError}
                </div>
              )}
            </div>
          ) : (
            <div style={{ 
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
              minHeight: 0
            }}>
              {/* Folder Navigation Header */}
              <div style={{ marginBottom: '12px' }}>
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '12px',
                  marginBottom: '12px'
                }}>
                  <div style={{ 
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontWeight: '600',
                    color: colors.primary.darkGrey,
                    fontSize: '16px'
                  }}>
                    <span style={{ fontSize: '20px' }}>📂</span>
                    Current Location:
                  </div>
                  {folderHistory.length > 0 && (
                    <button
                      type="button"
                      onClick={navigateBack}
                      disabled={!isSharePointMode}
                      style={{
                        padding: '6px 14px',
                        backgroundColor: colors.tertiary.blue,
                        color: colors.primary.white,
                        border: 'none',
                        borderRadius: '6px',
                        cursor: isSharePointMode ? 'pointer' : 'not-allowed',
                        fontSize: '14px',
                        fontWeight: '600',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <span>⬅️</span> Back
                    </button>
                  )}
                </div>
                <div style={{
                  padding: '12px 16px',
                  backgroundColor: colors.primary.offWhite,
                  borderRadius: '8px',
                  fontSize: '14px',
                  color: colors.primary.darkGrey,
                  border: `2px solid ${colors.primary.lightBlue}`,
                  minHeight: '44px',
                  display: 'flex',
                  alignItems: 'center'
                }}>
                  {renderBreadcrumbPath()}
                </div>
              </div>

              {/* Folder and File Contents */}
              <div style={{ 
                flex: 1,
                border: `2px solid ${colors.primary.lightBlue}`,
                borderRadius: '12px',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                minHeight: 0,
                backgroundColor: colors.primary.white
              }}>
                {isLoadingFolder ? (
                  <div style={{ 
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    color: colors.tertiary.lightGrey,
                    fontSize: '16px',
                    gap: '8px'
                  }}>
                    <span>⏳</span>
                    Loading...
                  </div>
                ) : folderContents ? (
                  <div style={{ height: '100%', overflowY: 'auto' }}>
                    {folderContents.folders.length === 0 && folderContents.files.length === 0 ? (
                      <div style={{ 
                        padding: '40px',
                        textAlign: 'center',
                        color: colors.tertiary.lightGrey,
                        fontSize: '15px'
                      }}>
                        <div style={{ fontSize: '48px', marginBottom: '12px' }}>📭</div>
                        This folder is empty
                      </div>
                    ) : (
                      <>
                        {/* Folders */}
                        {folderContents.folders.map((folder, idx) => (
                          <div
                            key={folder.serverRelativeUrl}
                            onClick={() => isSharePointMode && navigateToFolder(folder.serverRelativeUrl, folder.name)}
                            style={{
                              padding: '14px 20px',
                              borderBottom: `1px solid ${colors.primary.lightBlue}`,
                              cursor: isSharePointMode ? 'pointer' : 'default',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '12px',
                              transition: 'background-color 0.2s ease',
                              backgroundColor: 'transparent'
                            }}
                            onMouseEnter={(e) => {
                              if (isSharePointMode) {
                                e.currentTarget.style.backgroundColor = colors.primary.offWhite;
                              }
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent';
                            }}
                          >
                            <span style={{ fontSize: '20px' }}>📁</span>
                            <span style={{ 
                              fontSize: '15px',
                              color: colors.primary.darkGrey,
                              fontWeight: '500'
                            }}>
                              {folder.name}
                            </span>
                          </div>
                        ))}
                        
                        {/* Files */}
                        {folderContents.files.map((file, idx) => (
                          <div
                            key={file.serverRelativeUrl}
                            style={{
                              padding: '14px 20px',
                              borderBottom: idx < folderContents.files.length - 1 ? `1px solid ${colors.primary.lightBlue}` : 'none',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '12px',
                              cursor: 'default',
                              opacity: 0.7
                            }}
                          >
                            <span style={{ fontSize: '20px' }}>📄</span>
                            <span style={{ 
                              fontSize: '15px',
                              color: colors.tertiary.lightGrey,
                              fontWeight: '400'
                            }}>
                              {file.name}
                            </span>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                ) : (
                  <div style={{ 
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    color: colors.tertiary.lightGrey,
                    fontSize: '15px'
                  }}>
                    Select a folder to browse
                  </div>
                )}
              </div>

              {/* Filename Input */}
              <div style={{ marginTop: '16px' }}>
                <label style={{ 
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '8px', 
                  fontWeight: '600', 
                  color: colors.primary.darkGrey,
                  fontSize: '15px'
                }}>
                  <span style={{ fontSize: '18px' }}>✏️</span>
                  Output Filename (must end with .csv):
                </label>
                <input
                  type="text"
                  value={filename}
                  onChange={(e) => setFilename(e.target.value)}
                  disabled={!isSharePointMode}
                  placeholder="output.csv"
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '8px',
                    border: `2px solid ${filename.endsWith('.csv') ? colors.primary.lightBlue : colors.tertiary.red}`,
                    fontSize: '14px',
                    backgroundColor: colors.primary.white
                  }}
                />
                {!filename.endsWith('.csv') && (
                  <div style={{ 
                    marginTop: '6px',
                    fontSize: '13px',
                    color: colors.tertiary.red,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    <span>⚠️</span>
                    Filename must end with .csv
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1,
              padding: '14px 24px',
              backgroundColor: colors.tertiary.lightGrey,
              color: colors.primary.white,
              borderRadius: '10px',
              border: 'none',
              fontWeight: '600',
              cursor: 'pointer',
              fontSize: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            <span style={{ fontSize: '18px' }}>✖️</span>
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={outputType === 'sharepoint' && (!contextId || !filename.endsWith('.csv'))}
            style={{
              flex: 1,
              padding: '14px 24px',
              backgroundColor: (outputType === 'sharepoint' && (!contextId || !filename.endsWith('.csv'))) 
                ? colors.tertiary.lightGrey 
                : colors.secondary.green,
              color: colors.primary.white,
              borderRadius: '10px',
              border: 'none',
              fontWeight: '600',
              cursor: (outputType === 'sharepoint' && (!contextId || !filename.endsWith('.csv'))) 
                ? 'not-allowed' 
                : 'pointer',
              fontSize: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            <span style={{ fontSize: '18px' }}>✅</span>
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};

export default OutputLocationModal;
