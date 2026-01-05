import React, { useMemo, useState } from "react";

interface TestingStateOverlayProps {
  testingModeOn: boolean;
  showTestingModal: boolean;
  setShowTestingModal: (open: boolean) => void;
  debugDump: unknown;
}

const TestingStateOverlay: React.FC<TestingStateOverlayProps> = ({
  testingModeOn,
  showTestingModal,
  setShowTestingModal,
  debugDump,
}) => {
  const [expandDepth, setExpandDepth] = useState<number>(2);

  const jsonText = useMemo(() => {
    // Use JSON.stringify indentation for clear nested structure.
    // (Truncation should already be applied upstream in debugDump.)
    try {
      return JSON.stringify(debugDump, null, 2);
    } catch (e) {
      return `<< Could not stringify debugDump: ${String(e)} >>`;
    }
  }, [debugDump]);

  const lines = useMemo(() => jsonText.split("\n"), [jsonText]);

  // A simple "structure view" that visually emphasizes nesting:
  // - monospaced
  // - visible indentation guides
  // - optional line numbers
  const [showLineNumbers, setShowLineNumbers] = useState(true);
  const [wrapLines, setWrapLines] = useState(false);

  if (!testingModeOn) return null;

  return (
    <>
      {/* Fixed button */}
      <button
        type="button"
        onClick={() => setShowTestingModal(true)}
        style={{
          position: "fixed",
          top: 12,
          right: 12,
          zIndex: 99999,
          padding: "10px 12px",
          borderRadius: 10,
          border: "1px solid rgba(0,0,0,0.25)",
          background: "white",
          cursor: "pointer",
          fontWeight: 800,
          fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial",
        }}
        title="Open state inspector"
      >
        🧪 State
      </button>

      {/* Fullscreen modal */}
      {showTestingModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100000,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            flexDirection: "column",
          }}
          onClick={() => setShowTestingModal(false)}
        >
          <div
            style={{
              flex: 1,
              margin: 14,
              borderRadius: 14,
              overflow: "hidden",
              boxShadow: "0 20px 80px rgba(0,0,0,0.45)",
              border: "1px solid rgba(255,255,255,0.12)",
              background: "#0b1020",
              display: "flex",
              flexDirection: "column",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: "12px 14px",
                borderBottom: "1px solid rgba(255,255,255,0.12)",
                background:
                  "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div
                  style={{
                    fontWeight: 900,
                    fontSize: 14,
                    color: "rgba(255,255,255,0.92)",
                    fontFamily:
                      "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial",
                    letterSpacing: 0.2,
                  }}
                >
                  Testing Mode — React State Inspector
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "rgba(255,255,255,0.65)",
                    fontFamily:
                      "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial",
                  }}
                >
                  Read-only snapshot • Emphasizes nesting & indentation
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                {/* Controls */}
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    color: "rgba(255,255,255,0.8)",
                    fontSize: 12,
                    fontFamily:
                      "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial",
                    userSelect: "none",
                  }}
                  title="Show/Hide line numbers"
                >
                  <input
                    type="checkbox"
                    checked={showLineNumbers}
                    onChange={(e) => setShowLineNumbers(e.target.checked)}
                  />
                  Line numbers
                </label>

                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    color: "rgba(255,255,255,0.8)",
                    fontSize: 12,
                    fontFamily:
                      "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial",
                    userSelect: "none",
                  }}
                  title="Wrap long lines"
                >
                  <input
                    type="checkbox"
                    checked={wrapLines}
                    onChange={(e) => setWrapLines(e.target.checked)}
                  />
                  Wrap
                </label>

                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(jsonText);
                    } catch {
                      // noop (no need to alert; this is dev tooling)
                    }
                  }}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.18)",
                    background: "rgba(255,255,255,0.06)",
                    color: "rgba(255,255,255,0.9)",
                    cursor: "pointer",
                    fontWeight: 800,
                    fontSize: 12,
                    fontFamily:
                      "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial",
                  }}
                  title="Copy JSON to clipboard"
                >
                  Copy
                </button>

                <button
                  type="button"
                  onClick={() => setShowTestingModal(false)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.18)",
                    background: "rgba(255,255,255,0.06)",
                    color: "rgba(255,255,255,0.9)",
                    cursor: "pointer",
                    fontWeight: 900,
                    fontSize: 12,
                    fontFamily:
                      "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial",
                  }}
                >
                  Close
                </button>
              </div>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflow: "auto" }}>
              <div
                style={{
                  padding: 14,
                  minWidth: wrapLines ? "auto" : 980,
                }}
              >
                {/* “Indent guides”: create subtle vertical stripes every 2 spaces (approx) */}
                <div
                  style={{
                    borderRadius: 12,
                    textAlign: 'left',
                    overflow: "hidden",
                    border: "1px solid rgba(255,255,255,0.12)",
                    background:
                      "repeating-linear-gradient(90deg, rgba(255,255,255,0.03) 0, rgba(255,255,255,0.03) 1px, transparent 1px, transparent 24px)",
                  }}
                >
                  <div
                    style={{
                      fontFamily:
                        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                      fontSize: 12,
                      lineHeight: 1.55,
                      color: "rgba(255,255,255,0.92)",
                      padding: 12,
                      whiteSpace: wrapLines ? "pre-wrap" : "pre",
                      wordBreak: wrapLines ? "break-word" : "normal",
                      tabSize: 2,
                    }}
                  >
                    {lines.map((ln, i) => {
                      // count leading spaces for a visual “indent marker”
                      const m = ln.match(/^(\s*)/);
                      const indent = m ? m[1].length : 0;
                      const depth = Math.floor(indent / 2);

                      // Slightly dim deeper lines so structure pops
                      const alpha = Math.max(0.35, 1 - depth * 0.06);
                      const lineColor = `rgba(255,255,255,${alpha})`;

                      return (
                        <div
                          key={i}
                          style={{
                            display: "grid",
                            gridTemplateColumns: showLineNumbers
                              ? "56px 1fr"
                              : "1fr",
                            gap: 12,
                          }}
                        >
                          {showLineNumbers && (
                            <div
                              style={{
                                textAlign: "right",
                                color: "rgba(255,255,255,0.35)",
                                userSelect: "none",
                              }}
                            >
                              {String(i + 1).padStart(4, " ")}
                            </div>
                          )}
                          <div
                            style={{
                              color: lineColor,
                              // add subtle left border proportional to depth
                              boxShadow:
                                depth > 0
                                  ? `inset ${depth * 10}px 0 0 rgba(0,0,0,0.08)`
                                  : "none",
                            }}
                          >
                            {ln}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div
              style={{
                padding: "10px 14px",
                borderTop: "1px solid rgba(255,255,255,0.12)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                color: "rgba(255,255,255,0.6)",
                fontSize: 12,
                fontFamily:
                  "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial",
              }}
            >
              <div>
                Lines: <strong style={{ color: "rgba(255,255,255,0.85)" }}>{lines.length}</strong>
              </div>
              <div style={{ opacity: 0.9 }}>
                Click outside to close • Copy button grabs the full JSON string
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default TestingStateOverlay;
