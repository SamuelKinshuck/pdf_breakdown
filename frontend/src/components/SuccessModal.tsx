import React from 'react';

interface SuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  message: string;
}

const SuccessModal: React.FC<SuccessModalProps> = ({ isOpen, onClose, message }) => {
  if (!isOpen) return null;

  // Color scheme matching the app
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
          maxWidth: '500px',
          width: '90%',
          textAlign: 'center',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
          border: `3px solid ${colors.secondary.green}`,
          position: 'relative',
          transform: 'scale(1)',
          animation: 'modalSlideIn 0.3s ease-out'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Success Image */}
        <div style={{ marginBottom: '24px' }}>
          <img
            src="/success-image.jpg"
            alt="Success"
            style={{
              width: '120px',
              height: '120px',
              borderRadius: '50%',
              objectFit: 'cover',
              border: `4px solid ${colors.secondary.green}`,
              boxShadow: `0 8px 24px ${colors.secondary.green}40`
            }}
          />
        </div>

        {/* Success Icon Overlay */}
        <div
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            backgroundColor: colors.secondary.green,
            borderRadius: '50%',
            width: '60px',
            height: '60px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: `0 4px 12px ${colors.secondary.green}50`
          }}
        >
          <span style={{ 
            color: colors.primary.white, 
            fontSize: '32px',
            fontWeight: 'bold'
          }}>
            ✓
          </span>
        </div>

        {/* Success Message */}
        <h2
          style={{
            color: colors.secondary.darkPurple,
            fontSize: '28px',
            fontWeight: '700',
            marginBottom: '16px',
            fontFamily: 'system-ui, -apple-system, sans-serif'
          }}
        >
          Success!
        </h2>

        <p
          style={{
            color: colors.tertiary.blueGrey,
            fontSize: '18px',
            marginBottom: '32px',
            lineHeight: '1.5',
            fontFamily: 'system-ui, -apple-system, sans-serif'
          }}
        >
          {message}
        </p>

        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          style={{
            backgroundColor: colors.secondary.seaGreen,
            color: colors.primary.white,
            border: 'none',
            borderRadius: '12px',
            padding: '16px 32px',
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
          Continue
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

export default SuccessModal;