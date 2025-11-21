// src/components/PromptSummaryCompact.tsx
import React, { useState } from 'react';

interface PromptSummaryCompactProps {
  prompt: {
    role: string;
    task: string;
    context: string;
    format: string;
    constraints: string;
    temperature: number;
    model: string;
  };
  colors: {
    primary: {
      darkGrey: string;
      lightBlue: string;
      white: string;
      offWhite: string;
    };
    secondary: {
      lilac: string;
      darkPurple: string;
      seaGreen: string;
      green: string;
    };
    tertiary: {
      yellow: string;
      orange: string;
      red: string;
      blueGrey: string;
      blue: string;
      lightGrey: string;
    };
  };
}

const PromptSummaryCompact: React.FC<PromptSummaryCompactProps> = ({ prompt, colors }) => {
  const [openSection, setOpenSection] = useState<{ label: string; value: string } | null>(null);

  const rows = [
    { key: 'role', label: 'Role', value: prompt.role },
    { key: 'task', label: 'Task', value: prompt.task },
    { key: 'context', label: 'Context', value: prompt.context },
    { key: 'format', label: 'Format', value: prompt.format },
    { key: 'constraints', label: 'Constraints', value: prompt.constraints }
  ];

  const truncate = (value: string, max = 200) => {
    if (!value) return '—';
    return value.length > max ? value.slice(0, max) + '…' : value;
  };

  const temperaturePercent = Math.round(prompt.temperature * 100);

  return (
    <section
      style={{
        marginBottom: '32px',
        padding: '24px',
        borderRadius: '16px',
        backgroundColor: colors.primary.white,
        border: `1px solid ${colors.primary.lightBlue}`,
        boxShadow: `0 6px 18px ${colors.tertiary.blueGrey}20`
      }}
    >
      <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h2
            style={{
              margin: 0,
              fontSize: '20px',
              fontWeight: 700,
              color: colors.secondary.darkPurple
            }}
          >
            🔎 Prompt Summary
          </h2>
         
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: '24px',
          flexWrap: 'wrap',
          alignItems: 'flex-start'
        }}
      >
        {/* Prompt table */}
        <div style={{ flex: '2 1 420px', minWidth: 0 }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '14px',
              tableLayout: 'fixed'
            }}
          >
            <thead>
              <tr>
                <th
                  style={{
                    padding: '10px 12px',
                    fontWeight: 700,
                    color: colors.secondary.darkPurple,
                    borderBottom: `2px solid ${colors.primary.offWhite}`,
                    width: '140px'
                  }}
                >
                  Section
                </th>
                <th
                  style={{
                    padding: '10px 12px',
                    fontWeight: 700,
                    color: colors.secondary.darkPurple,
                    borderBottom: `2px solid ${colors.primary.offWhite}`,
                    wordWrap: 'break-word'
                  }}
                >
                  Value (click to expand)
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.key}>
                  <td
                    style={{
                      padding: '10px 12px',
                      borderBottom: `1px solid ${colors.primary.offWhite}`,
                      fontWeight: 600,
                      color: colors.tertiary.blueGrey,
                      verticalAlign: 'top'
                    }}
                  >
                    {row.label}
                  </td>
                  <td
                    style={{
                      padding: '10px 12px',
                      borderBottom: `1px solid ${colors.primary.offWhite}`,
                      cursor: row.value ? 'pointer' : 'default',
                      color: row.value ? colors.primary.darkGrey : colors.tertiary.lightGrey,
                      fontFamily: 'system-ui, -apple-system, sans-serif',
                      whiteSpace: 'nowrap',
                      textOverflow: 'ellipsis',
                      overflow: 'hidden',
                      maxWidth: 0
                    }}
                    onClick={() => {
                      if (row.value) {
                        setOpenSection({ label: row.label, value: row.value });
                      }
                    }}
                    title={row.value ? 'Click to view full text' : ''}
                  >
                    {truncate(row.value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Model / temperature panel */}
        <div
          style={{
            flex: '1 1 100px',
            padding: '16px',
            borderRadius: '12px',
            background: `linear-gradient(135deg, ${colors.primary.offWhite}, ${colors.primary.white})`,
            border: `1px solid ${colors.primary.lightBlue}`,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-around'
          }}
        >
         

          <div
            style={{
              padding: '8px 12px',
              borderRadius: '999px',
              backgroundColor: colors.primary.offWhite,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '14px',
              fontWeight: 600,
              color: colors.secondary.darkPurple
            }}
          >
            <span>⚡ Model</span>
            <span
              style={{
                padding: '4px 10px',
                borderRadius: '999px',
                backgroundColor: colors.secondary.lilac,
                color: colors.primary.white,
                fontSize: '13px'
              }}
            >
              {prompt.model}
            </span>
          </div>

          <div style={{ 
                        fontSize: '13px', 
                        color: colors.tertiary.blueGrey, 
                        'textAlign': 'left', 
                        padding: '8px 12px'
           }}>
            <strong> 🌡️ Temperature:</strong> {prompt.temperature.toFixed(2)}
          </div>

          <div
            style={{
              marginTop: '4px',
              height: '8px',
              borderRadius: '999px',
              backgroundColor: colors.primary.offWhite,
              overflow: 'hidden'
            }}
          >
            <div
              style={{
                width: `${Math.min(100, Math.max(0, temperaturePercent))}%`,
                height: '100%',
                background: `linear-gradient(90deg, ${colors.tertiary.orange}, ${colors.tertiary.yellow})`,
                transition: 'width 300ms ease'
              }}
            />
          </div>

        
        </div>
      </div>

      {/* Modal for full section text */}
      {openSection && (
        <div
          onClick={() => setOpenSection(null)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: '#00000055',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 9999
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: '700px',
              width: '90%',
              maxHeight: '80vh',
              backgroundColor: colors.primary.white,
              borderRadius: '16px',
              padding: '20px 24px',
              boxShadow: `0 10px 30px ${colors.tertiary.blueGrey}50`,
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '12px',
                alignItems: 'center'
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize: '18px',
                  color: colors.secondary.darkPurple
                }}
              >
                {openSection.label}
              </h3>
              <button
                type="button"
                onClick={() => setOpenSection(null)}
                style={{
                  border: 'none',
                  borderRadius: '999px',
                  padding: '6px 12px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  backgroundColor: colors.primary.offWhite,
                  color: colors.tertiary.blueGrey
                }}
              >
                ✕ Close
              </button>
            </div>

            <div
              style={{
                fontSize: '14px',
                color: colors.primary.darkGrey,
                padding: '10px 12px',
                borderRadius: '10px',
                backgroundColor: colors.primary.offWhite,
                border: `1px solid ${colors.primary.lightBlue}`,
                overflowY: 'auto',
                whiteSpace: 'pre-wrap'
              }}
            >
              {openSection.value}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default PromptSummaryCompact;
