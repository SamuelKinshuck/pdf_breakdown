import React from 'react';

interface ExcelLimitWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  fields: string[];
}

const ExcelLimitWarningModal: React.FC<ExcelLimitWarningModalProps> = ({
  isOpen,
  onClose,
  fields,
}) => {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.4)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 9999,
      }}
    >
      <div
        style={{
          maxWidth: 520,
          width: '90%',
          backgroundColor: '#FFFFFF',
          borderRadius: 16,
          padding: 24,
          boxShadow: '0 12px 40px rgba(0, 0, 0, 0.25)',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <h2 style={{ margin: 0, marginBottom: 12, fontSize: 20 }}>
          ⚠️ Possible Excel truncation
        </h2>

        <p style={{ fontSize: 14, marginBottom: 8 }}>
          One or more of your prompt fields is exactly{' '}
          <strong>32,767 characters</strong> long.
          This is the maximum number of characters Excel allows in a single cell.
        </p>

        <p style={{ fontSize: 14, marginBottom: 8 }}>
          If this text came from an Excel cell, it may already have been{' '}
          <strong>truncated</strong> before it reached this tool.
        </p>

        {fields.length > 0 && (
          <div style={{ fontSize: 14, marginBottom: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>
              Fields at the Excel limit:
            </div>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {fields.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          style={{
            marginTop: 12,
            padding: '10px 20px',
            borderRadius: 10,
            border: 'none',
            fontWeight: 600,
            fontSize: 14,
            cursor: 'pointer',
            backgroundColor: '#B85FB1',
            color: '#FFFFFF',
          }}
        >
          Got it
        </button>
      </div>
    </div>
  );
};

export default ExcelLimitWarningModal;