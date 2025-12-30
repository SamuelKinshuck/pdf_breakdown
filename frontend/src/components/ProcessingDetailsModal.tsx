import React from 'react';

interface ProcessingResponse {
  page: number;
  gpt_response: string;
  image_size_bytes?: number;
}

interface ProcessingDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  processedPages: ProcessingResponse[];
  totalPages: number;
  processingError: string | null;
}

const ProcessingDetailsModal: React.FC<ProcessingDetailsModalProps> = ({ 
  isOpen, 
  onClose, 
  processedPages,
  totalPages,
  processingError 
}) => {
  if (!isOpen) return null;

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

  const percent = totalPages > 0 
    ? Math.round((processedPages.length / totalPages) * 100)
    : 0;
  
  const status = processingError 
    ? 'error' 
    : processedPages.length === totalPages 
    ? 'completed' 
    : 'processing';
  
  const lastPage = processedPages.length > 0 
    ? processedPages[processedPages.length - 1].page 
    : null;

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
          padding: '32px',
          maxWidth: '800px',
          width: '90%',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
          border: `2px solid ${colors.primary.lightBlue}`,
          position: 'relative',
          animation: 'modalSlideIn 0.3s ease-out'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '24px',
          paddingBottom: '16px',
          borderBottom: `2px solid ${colors.primary.offWhite}`
        }}>
          <h2
            style={{
              color: colors.secondary.darkPurple,
              fontSize: '24px',
              fontWeight: '700',
              margin: 0,
              fontFamily: 'system-ui, -apple-system, sans-serif'
            }}
          >
            Processing Details
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '28px',
              cursor: 'pointer',
              color: colors.tertiary.lightGrey,
              lineHeight: 1,
              padding: '4px 8px',
              transition: 'color 0.2s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = colors.primary.darkGrey}
            onMouseLeave={(e) => e.currentTarget.style.color = colors.tertiary.lightGrey}
          >
            ×
          </button>
        </div>

        {/* Status and Progress Section */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: '12px'
          }}>
            <div>
              <span style={{ 
                fontSize: '14px', 
                fontWeight: '600', 
                color: colors.tertiary.blueGrey 
              }}>
                Status:
              </span>
              <span style={{ 
                marginLeft: '8px',
                fontSize: '14px',
                fontWeight: '600',
                color: status === 'completed' 
                  ? colors.secondary.green 
                  : status === 'error'
                  ? colors.tertiary.red
                  : colors.tertiary.blue,
                textTransform: 'capitalize'
              }}>
                {status}
              </span>
            </div>
            <div>
              <span style={{ 
                fontSize: '16px', 
                fontWeight: '700', 
                color: colors.secondary.darkPurple 
              }}>
                {percent}%
              </span>
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ 
            height: 12, 
            background: colors.primary.offWhite, 
            borderRadius: 8, 
            overflow: 'hidden',
            marginBottom: '12px'
          }}>
            <div
              style={{
                width: `${percent}%`,
                height: '100%',
                transition: 'width 300ms ease',
                background: `linear-gradient(90deg, ${colors.secondary.seaGreen}, ${colors.secondary.green})`
              }}
            />
          </div>

          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between',
            fontSize: '14px',
            color: colors.tertiary.blueGrey
          }}>
            <div>
              Pages: <strong>{processedPages.length} / {totalPages}</strong>
            </div>
            {lastPage && (
              <div>
                Last processed: <strong>Page {lastPage}</strong>
              </div>
            )}
          </div>

          {processingError && (
            <div style={{ 
              marginTop: '12px',
              padding: '12px',
              backgroundColor: `${colors.tertiary.red}15`,
              borderLeft: `4px solid ${colors.tertiary.red}`,
              borderRadius: '4px',
              color: colors.tertiary.red,
              fontSize: '14px'
            }}>
              ⚠️ {processingError}
            </div>
          )}
        </div>

        {/* Responses Section */}
        {processedPages && processedPages.length > 0 ? (
          <>
            <h3 style={{ 
              fontSize: '16px',
              fontWeight: '600',
              color: colors.secondary.darkPurple,
              marginBottom: '16px'
            }}>
              Processed Pages ({processedPages.length})
            </h3>
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px',
              backgroundColor: colors.primary.offWhite,
              borderRadius: '12px',
              border: `1px solid ${colors.primary.lightBlue}`
            }}>
              {processedPages.map((r, idx) => (
                <div 
                  key={r.page * 1000 + idx} 
                  style={{ 
                    marginBottom: idx < processedPages.length - 1 ? '16px' : 0,
                    padding: '16px',
                    backgroundColor: colors.primary.white,
                    borderRadius: '8px',
                    border: `1px solid ${colors.primary.lightBlue}`,
                    boxShadow: `0 2px 8px ${colors.tertiary.blueGrey}10`
                  }}
                >
                  <div style={{ 
                    fontSize: '14px',
                    fontWeight: '600',
                    color: colors.secondary.seaGreen,
                    marginBottom: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        backgroundColor: colors.secondary.seaGreen,
                        color: colors.primary.white,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '12px',
                        fontWeight: '700'
                      }}>
                        {r.page}
                      </span>
                      Page {r.page}
                    </div>
                    {r.image_size_bytes !== undefined && r.image_size_bytes > 0 && (
                      <div style={{ 
                        fontSize: '12px',
                        fontWeight: '500',
                        color: colors.tertiary.blueGrey,
                        backgroundColor: colors.primary.offWhite,
                        padding: '4px 8px',
                        borderRadius: '4px'
                      }}>
                        Image: {(r.image_size_bytes / 1024).toFixed(2)} KB
                      </div>
                    )}
                  </div>
                  <div style={{ 
                    fontSize: '14px', 
                    color: colors.primary.darkGrey, 
                    whiteSpace: 'pre-wrap',
                    lineHeight: '1.5',
                    fontFamily: 'monospace',
                    backgroundColor: colors.primary.offWhite,
                    padding: '12px',
                    borderRadius: '6px',
                    maxHeight: '200px',
                    overflowY: 'auto'
                  }}>
                    {r.gpt_response}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div style={{
            padding: '32px',
            textAlign: 'center',
            color: colors.tertiary.lightGrey,
            fontSize: '14px'
          }}>
            No responses yet. Processing will begin shortly...
          </div>
        )}

        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          style={{
            marginTop: '24px',
            backgroundColor: colors.secondary.seaGreen,
            color: colors.primary.white,
            border: 'none',
            borderRadius: '12px',
            padding: '12px 24px',
            fontSize: '16px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            boxShadow: `0 4px 12px ${colors.secondary.seaGreen}40`,
            fontFamily: 'system-ui, -apple-system, sans-serif'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = colors.secondary.green;
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = `0 6px 16px ${colors.secondary.green}50`;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = colors.secondary.seaGreen;
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = `0 4px 12px ${colors.secondary.seaGreen}40`;
          }}
        >
          Close
        </button>

        <style>
          {`
            @keyframes modalSlideIn {
              from {
                opacity: 0;
                transform: scale(0.9) translateY(-20px);
              }
              to {
                opacity: 1;
                transform: scale(1) translateY(0);
              }
            }
          `}
        </style>
      </div>
    </div>
  );
};

export default ProcessingDetailsModal;
