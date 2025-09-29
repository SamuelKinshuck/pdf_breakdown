import React, { useRef, useEffect, useState } from 'react';

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



// CollapsibleSection component
const CollapsibleSection: React.FC<{
title: string;
isExpanded: boolean;
onToggle: () => void;
children: React.ReactNode;
isSubSection?: boolean;
}> = ({ title, isExpanded, onToggle, children, isSubSection = false }) => {
const contentRef = useRef<HTMLDivElement>(null);
const [contentHeight, setContentHeight] = useState<number>(0);

// Measure content height when expanded state changes
useEffect(() => {
    if (contentRef.current) {
        const height = contentRef.current.scrollHeight;
        setContentHeight(height);
    }
}, [isExpanded, children]);

// Update height when content changes (e.g., form inputs changing)
useEffect(() => {
    const updateHeight = () => {
        if (contentRef.current && isExpanded) {
            const height = contentRef.current.scrollHeight;
            setContentHeight(height);
        }
    };

    // Use ResizeObserver if available, otherwise fallback to interval
    if (window.ResizeObserver && contentRef.current) {
        const resizeObserver = new ResizeObserver(updateHeight);
        resizeObserver.observe(contentRef.current);
        return () => resizeObserver.disconnect();
    } else {
        // Fallback for browsers without ResizeObserver
        const interval = setInterval(updateHeight, 500);
        return () => clearInterval(interval);
    }
}, [isExpanded]);
const headerStyle = isSubSection ? {
    ...labelStyle,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    cursor: 'pointer',
    padding: '8px 0',
    borderBottom: `1px solid ${colors.primary.lightBlue}`,
    marginBottom: isExpanded ? '8px' : '0',
    width: '94%',
    marginLeft: '3%'
} : {
    ...sectionHeaderStyle,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    cursor: 'pointer',
    paddingBottom: '12px'
};

const chevronStyle = {
    transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
    transition: 'transform 0.3s ease',
    fontSize: '16px',
    color: isSubSection ? colors.secondary.darkPurple : colors.tertiary.orange
};

return (
    <div style={{ marginBottom: isSubSection ? '20px' : '64px' }}>
    <div style={headerStyle} onClick={onToggle}>
        <span>{title}</span>
        <span style={chevronStyle}>▶</span>
    </div>
    <div
        style={{
        height: isExpanded ? `${contentHeight}px` : '0px',
        //overflow: 'hidden',
        transition: 'height 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
        opacity: isExpanded ? 1 : 0,
        transform: isExpanded ? 'translateY(0)' : 'translateY(-8px)',
        transformOrigin: 'top',
        willChange: 'height, opacity, transform',
        width: '94%',
        marginLeft: '3%'
        }}
    >
        <div
        ref={contentRef}
        style={{
            paddingTop: isExpanded ? (isSubSection ? '8px' : '0px') : '0px',
            transition: 'padding-top 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
            ...(!isExpanded ? {height: '0px', overflow: 'hidden', 'pointerEvents' : 'none'} : {})
        }}
        >
        {children}
        </div>
    </div>
    </div>
);
};

export default CollapsibleSection