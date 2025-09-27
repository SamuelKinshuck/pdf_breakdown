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
const headerStyle = isSubSection ? {
    ...labelStyle,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    cursor: 'pointer',
    padding: '8px 0',
    borderBottom: `1px solid ${colors.primary.lightBlue}`,
    marginBottom: isExpanded ? '8px' : '0'
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
    <div style={{ marginBottom: isSubSection ? '20px' : '32px' }}>
    <div style={headerStyle} onClick={onToggle}>
        <span>{title}</span>
        <span style={chevronStyle}>▶</span>
    </div>
    {isExpanded && (
        <div style={{ 
        overflow: 'hidden',
        transition: 'all 0.3s ease'
        }}>
        {children}
        </div>
    )}
    </div>
);
};

export default CollapsibleSection