import React, { useState, useRef, useEffect } from 'react';

interface DropdownOption {
  value: string;
  label: string;
  icon?: string;
}

interface CustomDropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
  placeholder?: string;
  style?: React.CSSProperties;
  onFocus?: (e: React.FocusEvent) => void;
  onBlur?: (e: React.FocusEvent) => void;
}

const CustomDropdown: React.FC<CustomDropdownProps> = ({
  value,
  onChange,
  options,
  placeholder = "Select an option",
  style = {},
  onFocus,
  onBlur
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find(option => option.value === value);

  const handleToggle = () => {
    const newIsOpen = !isOpen;
    setIsOpen(newIsOpen);
    
    if (newIsOpen && onFocus) {
      onFocus({} as React.FocusEvent);
    } else if (!newIsOpen && onBlur) {
      onBlur({} as React.FocusEvent);
    }
  };

  const handleOptionSelect = (optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
    if (onBlur) {
      onBlur({} as React.FocusEvent);
    }
  };

  return (
    <div ref={dropdownRef} style={{ position: 'relative', ...style }}>
      {/* Dropdown Trigger */}
      <div
        onClick={handleToggle}
        style={{
          width: '100%',
          padding: '16px 20px',
          borderRadius: '8px',
          border: `2px solid ${colors.primary.lightBlue}`,
          fontSize: '16px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          backgroundColor: colors.primary.white,
          color: colors.primary.darkGrey,
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          transition: 'all 0.3s ease',
          outline: 'none',
          boxShadow: isOpen ? `0 0 0 3px ${colors.tertiary.blue}20` : 'none',
          borderColor: isOpen ? colors.tertiary.blue : colors.primary.lightBlue
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {selectedOption?.icon && <span>{selectedOption.icon}</span>}
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <span
          style={{
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.3s ease',
            fontSize: '14px',
            color: colors.tertiary.blueGrey
          }}
        >
          ▼
        </span>
      </div>

      {/* Dropdown Options */}
      {isOpen && (
        <div
          style={{
            width: "100% ",
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: '4px',
            backgroundColor: colors.primary.white,
            border: `2px solid ${colors.tertiary.blue}`,
            borderRadius: '8px',
            boxShadow: `0 8px 24px ${colors.tertiary.blueGrey}30`,
            zIndex: 1000,
            overflow: 'hidden',
            animation: 'dropdownSlideIn 0.2s ease-out'
          }}
        >
          {options.map((option, index) => (
            <div
              key={option.value}
              onClick={() => handleOptionSelect(option.value)}
              style={{
                
                padding: '14px 20px',
                cursor: 'pointer',
                backgroundColor: value === option.value ? colors.primary.lightBlue : colors.primary.white,
                color: colors.primary.darkGrey,
                fontSize: '16px',
                fontFamily: 'system-ui, -apple-system, sans-serif',
                borderBottom: index < options.length - 1 ? `1px solid ${colors.primary.lightBlue}` : 'none',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
              onMouseEnter={(e) => {
                if (value !== option.value) {
                  e.currentTarget.style.backgroundColor = colors.primary.offWhite;
                  e.currentTarget.style.color = colors.tertiary.blue;
                }
              }}
              onMouseLeave={(e) => {
                if (value !== option.value) {
                  e.currentTarget.style.backgroundColor = colors.primary.white;
                  e.currentTarget.style.color = colors.primary.darkGrey;
                }
              }}
            >
              {option.icon && <span>{option.icon}</span>}
              {option.label}
              {value === option.value && (
                <span style={{ marginLeft: 'auto', color: colors.secondary.green }}>✓</span>
              )}
            </div>
          ))}
        </div>
      )}

      <style>
        {`
          @keyframes dropdownSlideIn {
            from {
              opacity: 0;
              transform: translateY(-8px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
        `}
      </style>
    </div>
  );
};

export default CustomDropdown;