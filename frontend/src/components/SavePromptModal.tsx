import React, { useState, useEffect } from 'react';

interface SavePromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: SavePromptData) => Promise<void>;
  promptData: {
    role: string;
    task: string;
    context: string;
    format: string;
    constraints: string;
  };
}

export interface SavePromptData {
  name: string;
  description: string;
  tags: string;
  created_by: string;
}

const SavePromptModal: React.FC<SavePromptModalProps> = ({ isOpen, onClose, onSave, promptData }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [createdBy, setCreatedBy] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

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
      setName('');
      setDescription('');
      setTags('');
      setCreatedBy('');
      setError('');
    }
  }, [isOpen]);

  const hasPromptContent = () => {
    return promptData.role || promptData.task || promptData.context || 
           promptData.format || promptData.constraints;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    if (!hasPromptContent()) {
      setError('At least one prompt field must be filled');
      return;
    }

    setError('');
    setIsSaving(true);

    try {
      await onSave({
        name: name.trim(),
        description: description.trim(),
        tags: tags.trim(),
        created_by: createdBy.trim()
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save prompt');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
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
        maxWidth: '600px',
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
          Save Prompt Configuration
        </h2>

        <div>
          <div style={{ marginBottom: '20px' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              color: colors.primary.darkGrey,
              fontWeight: '600'
            }}>
              Name <span style={{ color: colors.tertiary.red }}>*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              placeholder="Enter a unique name for this prompt"
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: `2px solid ${colors.primary.lightBlue}`,
                fontSize: '16px',
                outline: 'none',
                transition: 'border-color 0.2s',
                boxSizing: 'border-box'
              }}
              onFocus={(e) => e.target.style.borderColor = colors.secondary.seaGreen}
              onBlur={(e) => e.target.style.borderColor = colors.primary.lightBlue}
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              color: colors.primary.darkGrey,
              fontWeight: '600'
            }}>
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of what this prompt does (optional)"
              rows={3}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: `2px solid ${colors.primary.lightBlue}`,
                fontSize: '16px',
                outline: 'none',
                resize: 'vertical',
                fontFamily: 'inherit',
                transition: 'border-color 0.2s',
                boxSizing: 'border-box'
              }}
              onFocus={(e) => e.target.style.borderColor = colors.secondary.seaGreen}
              onBlur={(e) => e.target.style.borderColor = colors.primary.lightBlue}
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              color: colors.primary.darkGrey,
              fontWeight: '600'
            }}>
              Tags
            </label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="e.g., analysis, legal, financial (comma-separated)"
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: `2px solid ${colors.primary.lightBlue}`,
                fontSize: '16px',
                outline: 'none',
                transition: 'border-color 0.2s',
                boxSizing: 'border-box'
              }}
              onFocus={(e) => e.target.style.borderColor = colors.secondary.seaGreen}
              onBlur={(e) => e.target.style.borderColor = colors.primary.lightBlue}
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              color: colors.primary.darkGrey,
              fontWeight: '600'
            }}>
              Created By
            </label>
            <input
              type="text"
              value={createdBy}
              onChange={(e) => setCreatedBy(e.target.value)}
              placeholder="Your name (optional)"
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: `2px solid ${colors.primary.lightBlue}`,
                fontSize: '16px',
                outline: 'none',
                transition: 'border-color 0.2s',
                boxSizing: 'border-box'
              }}
              onFocus={(e) => e.target.style.borderColor = colors.secondary.seaGreen}
              onBlur={(e) => e.target.style.borderColor = colors.primary.lightBlue}
            />
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

          <div style={{
            display: 'flex',
            gap: '12px',
            justifyContent: 'flex-end'
          }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              style={{
                padding: '12px 24px',
                borderRadius: '8px',
                border: `2px solid ${colors.tertiary.lightGrey}`,
                backgroundColor: colors.primary.white,
                color: colors.primary.darkGrey,
                fontSize: '16px',
                fontWeight: '600',
                cursor: isSaving ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                opacity: isSaving ? 0.5 : 1
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSaving}
              style={{
                padding: '12px 24px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: colors.secondary.seaGreen,
                color: colors.primary.white,
                fontSize: '16px',
                fontWeight: '600',
                cursor: isSaving ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                opacity: isSaving ? 0.7 : 1
              }}
              onMouseEnter={(e) => {
                if (!isSaving) e.currentTarget.style.backgroundColor = colors.secondary.green;
              }}
              onMouseLeave={(e) => {
                if (!isSaving) e.currentTarget.style.backgroundColor = colors.secondary.seaGreen;
              }}
            >
              {isSaving ? 'Saving...' : 'Save Prompt'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SavePromptModal;
