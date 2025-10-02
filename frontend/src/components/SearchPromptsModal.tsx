import React, { useState, useEffect } from 'react';
import { BACKEND_URL } from '../apiConfig';

interface SearchPromptsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPrompt: (prompt: SavedPrompt) => void;
}

export interface SavedPrompt {
  id: number;
  name: string;
  description: string;
  role_prompt: string;
  task_prompt: string;
  context_prompt: string;
  format_prompt: string;
  constraints_prompt: string;
  created_at: string;
  created_by: string;
  tags: string;
  use_count: number;
  last_used_at: string | null;
}

const SearchPromptsModal: React.FC<SearchPromptsModalProps> = ({ isOpen, onClose, onSelectPrompt }) => {
  const [searchText, setSearchText] = useState('');
  const [searchIn, setSearchIn] = useState<'name' | 'body' | 'both'>('both');
  const [tags, setTags] = useState('');
  const [createdBy, setCreatedBy] = useState('');
  const [results, setResults] = useState<SavedPrompt[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState('');
  const [selectedPrompt, setSelectedPrompt] = useState<SavedPrompt | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

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
    if (isOpen) {
      handleSearch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleSearch = async () => {
    setIsSearching(true);
    setError('');

    try {
      const params = new URLSearchParams();
      if (searchText) params.append('search_text', searchText);
      params.append('search_in', searchIn);
      if (tags) params.append('tags', tags);
      if (createdBy) params.append('created_by', createdBy);

      const response = await fetch(`${BACKEND_URL}api/prompts/search?${params.toString()}`);
      const data = await response.json();

      if (data.success) {
        setResults(data.prompts);
      } else {
        setError(data.error || 'Failed to search prompts');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to search prompts');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectPrompt = async (prompt: SavedPrompt) => {
    try {
      const response = await fetch(`${BACKEND_URL}api/prompts/${prompt.id}`);
      const data = await response.json();
      
      if (data.success) {
        onSelectPrompt(data.prompt);
        onClose();
      } else {
        setError(data.error || 'Failed to load prompt');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load prompt');
    }
  };

  const showDetail = (prompt: SavedPrompt) => {
    setSelectedPrompt(prompt);
    setShowDetailModal(true);
  };

  const truncate = (text: string, maxLength: number = 100) => {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  if (!isOpen) return null;

  return (
    <>
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 33, 46, 0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}>
        <div style={{
          backgroundColor: colors.primary.offWhite,
          borderRadius: '16px',
          padding: '32px',
          maxWidth: '900px',
          width: '90%',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 16px 64px rgba(0, 33, 46, 0.4)'
        }}>
          <h2 style={{
            margin: '0 0 24px 0',
            color: colors.primary.darkGrey,
            fontSize: '28px',
            fontWeight: 'bold'
          }}>
            Search Saved Prompts
          </h2>

          <div style={{
            backgroundColor: colors.primary.white,
            padding: '20px',
            borderRadius: '12px',
            marginBottom: '24px',
            border: `2px solid ${colors.primary.lightBlue}`
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  color: colors.primary.darkGrey,
                  fontWeight: '600',
                  fontSize: '14px'
                }}>
                  Search Text
                </label>
                <input
                  type="text"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="Enter search term..."
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    border: `2px solid ${colors.primary.lightBlue}`,
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  color: colors.primary.darkGrey,
                  fontWeight: '600',
                  fontSize: '14px'
                }}>
                  Search In
                </label>
                <select
                  value={searchIn}
                  onChange={(e) => setSearchIn(e.target.value as 'name' | 'body' | 'both')}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    border: `2px solid ${colors.primary.lightBlue}`,
                    fontSize: '14px',
                    outline: 'none',
                    backgroundColor: colors.primary.white,
                    cursor: 'pointer',
                    boxSizing: 'border-box'
                  }}
                >
                  <option value="both">Name & Body</option>
                  <option value="name">Name Only</option>
                  <option value="body">Body Only</option>
                </select>
              </div>

              <div>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  color: colors.primary.darkGrey,
                  fontWeight: '600',
                  fontSize: '14px'
                }}>
                  Filter by Tags
                </label>
                <input
                  type="text"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="e.g., analysis, legal"
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    border: `2px solid ${colors.primary.lightBlue}`,
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  color: colors.primary.darkGrey,
                  fontWeight: '600',
                  fontSize: '14px'
                }}>
                  Filter by Creator
                </label>
                <input
                  type="text"
                  value={createdBy}
                  onChange={(e) => setCreatedBy(e.target.value)}
                  placeholder="Creator name"
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    border: `2px solid ${colors.primary.lightBlue}`,
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>

            <button
              onClick={handleSearch}
              disabled={isSearching}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: colors.secondary.seaGreen,
                color: colors.primary.white,
                fontSize: '16px',
                fontWeight: '600',
                cursor: isSearching ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                if (!isSearching) e.currentTarget.style.backgroundColor = colors.secondary.green;
              }}
              onMouseLeave={(e) => {
                if (!isSearching) e.currentTarget.style.backgroundColor = colors.secondary.seaGreen;
              }}
            >
              {isSearching ? 'Searching...' : '🔍 Search'}
            </button>
          </div>

          {error && (
            <div style={{
              padding: '12px',
              borderRadius: '8px',
              backgroundColor: `${colors.tertiary.red}15`,
              color: colors.tertiary.red,
              marginBottom: '20px',
              fontSize: '14px'
            }}>
              ⚠️ {error}
            </div>
          )}

          <div style={{ marginBottom: '24px' }}>
            <h3 style={{
              margin: '0 0 16px 0',
              color: colors.primary.darkGrey,
              fontSize: '18px',
              fontWeight: '600'
            }}>
              {results.length > 0 ? `Found ${results.length} prompt${results.length !== 1 ? 's' : ''}` : 'No prompts found'}
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {results.map((prompt) => (
                <div
                  key={prompt.id}
                  style={{
                    backgroundColor: colors.primary.white,
                    padding: '16px',
                    borderRadius: '12px',
                    border: `2px solid ${colors.primary.lightBlue}`,
                    transition: 'all 0.2s',
                    cursor: 'pointer'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = colors.secondary.seaGreen;
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = `0 4px 12px ${colors.tertiary.blueGrey}30`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = colors.primary.lightBlue;
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div style={{ flex: 1 }}>
                      <h4 style={{
                        margin: '0 0 4px 0',
                        color: colors.primary.darkGrey,
                        fontSize: '18px',
                        fontWeight: '600'
                      }}>
                        {prompt.name}
                      </h4>
                      <p style={{
                        margin: '0 0 8px 0',
                        color: colors.tertiary.blueGrey,
                        fontSize: '14px'
                      }}>
                        {truncate(prompt.description, 150)}
                      </p>
                    </div>
                  </div>

                  <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '8px',
                    marginBottom: '12px',
                    fontSize: '12px',
                    color: colors.tertiary.lightGrey
                  }}>
                    {prompt.created_by && (
                      <span>👤 {prompt.created_by}</span>
                    )}
                    <span>📅 {formatDate(prompt.created_at)}</span>
                    <span>🔄 Used {prompt.use_count} time{prompt.use_count !== 1 ? 's' : ''}</span>
                    {prompt.tags && (
                      <span>🏷️ {prompt.tags}</span>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectPrompt(prompt);
                      }}
                      style={{
                        flex: 1,
                        padding: '10px',
                        borderRadius: '8px',
                        border: 'none',
                        backgroundColor: colors.secondary.seaGreen,
                        color: colors.primary.white,
                        fontSize: '14px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.secondary.green}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = colors.secondary.seaGreen}
                    >
                      ✓ Use This Prompt
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        showDetail(prompt);
                      }}
                      style={{
                        padding: '10px 16px',
                        borderRadius: '8px',
                        border: `2px solid ${colors.tertiary.blue}`,
                        backgroundColor: colors.primary.white,
                        color: colors.tertiary.blue,
                        fontSize: '14px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      View Details
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            paddingTop: '16px',
            borderTop: `2px solid ${colors.primary.lightBlue}`
          }}>
            <button
              onClick={onClose}
              style={{
                padding: '12px 24px',
                borderRadius: '8px',
                border: `2px solid ${colors.tertiary.lightGrey}`,
                backgroundColor: colors.primary.white,
                color: colors.primary.darkGrey,
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {showDetailModal && selectedPrompt && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 33, 46, 0.90)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1001
        }}>
          <div style={{
            backgroundColor: colors.primary.offWhite,
            borderRadius: '16px',
            padding: '32px',
            maxWidth: '800px',
            width: '90%',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 16px 64px rgba(0, 33, 46, 0.5)'
          }}>
            <h2 style={{
              margin: '0 0 8px 0',
              color: colors.primary.darkGrey,
              fontSize: '28px',
              fontWeight: 'bold'
            }}>
              {selectedPrompt.name}
            </h2>
            
            {selectedPrompt.description && (
              <p style={{
                margin: '0 0 20px 0',
                color: colors.tertiary.blueGrey,
                fontSize: '16px'
              }}>
                {selectedPrompt.description}
              </p>
            )}

            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '12px',
              marginBottom: '24px',
              padding: '12px',
              backgroundColor: colors.primary.white,
              borderRadius: '8px',
              fontSize: '13px',
              color: colors.tertiary.blueGrey
            }}>
              {selectedPrompt.created_by && (
                <span><strong>Created by:</strong> {selectedPrompt.created_by}</span>
              )}
              <span><strong>Created:</strong> {formatDate(selectedPrompt.created_at)}</span>
              <span><strong>Used:</strong> {selectedPrompt.use_count} time{selectedPrompt.use_count !== 1 ? 's' : ''}</span>
              {selectedPrompt.tags && (
                <span><strong>Tags:</strong> {selectedPrompt.tags}</span>
              )}
            </div>

            {[
              { label: 'Role', content: selectedPrompt.role_prompt },
              { label: 'Task', content: selectedPrompt.task_prompt },
              { label: 'Context', content: selectedPrompt.context_prompt },
              { label: 'Format', content: selectedPrompt.format_prompt },
              { label: 'Constraints', content: selectedPrompt.constraints_prompt }
            ].map(({ label, content }) => content && (
              <div key={label} style={{ marginBottom: '20px' }}>
                <h3 style={{
                  margin: '0 0 8px 0',
                  color: colors.primary.darkGrey,
                  fontSize: '16px',
                  fontWeight: '600'
                }}>
                  {label}
                </h3>
                <div style={{
                  padding: '12px',
                  backgroundColor: colors.primary.white,
                  borderRadius: '8px',
                  border: `2px solid ${colors.primary.lightBlue}`,
                  fontSize: '14px',
                  color: colors.tertiary.blueGrey,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word'
                }}>
                  {content}
                </div>
              </div>
            ))}

            <div style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'flex-end',
              marginTop: '24px'
            }}>
              <button
                onClick={() => {
                  setShowDetailModal(false);
                  setSelectedPrompt(null);
                }}
                style={{
                  padding: '12px 24px',
                  borderRadius: '8px',
                  border: `2px solid ${colors.tertiary.lightGrey}`,
                  backgroundColor: colors.primary.white,
                  color: colors.primary.darkGrey,
                  fontSize: '16px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
              <button
                onClick={() => {
                  handleSelectPrompt(selectedPrompt);
                  setShowDetailModal(false);
                }}
                style={{
                  padding: '12px 24px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: colors.secondary.seaGreen,
                  color: colors.primary.white,
                  fontSize: '16px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.secondary.green}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = colors.secondary.seaGreen}
              >
                ✓ Use This Prompt
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SearchPromptsModal;
