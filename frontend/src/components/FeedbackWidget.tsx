import React, { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../apiConfig";

const FeedbackWidget: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);

  // Form state (DO NOT clear on failure)
  const [name, setName] = useState("");
  const [comment, setComment] = useState("");

  // UX state
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Auto-hide toast
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2500);
    return () => window.clearTimeout(t);
  }, [toast]);

  const canSubmit = useMemo(() => {
    return (
      name.trim().length > 0 &&
      !isSubmitting
    );
  }, [name, isSubmitting]);

  const resetForm = () => {
    setName("");
    setComment("");
    setError(null);
  };

  const submit = async () => {
    setError(null);

    // Frontend validation (backend validates too)
    if (name.trim().length === 0) {
      setError("Please enter your name.");
      return;
    }
    

    setIsSubmitting(true);

    try {
      const resp = await apiFetch("api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          comment,
          meta: {
            path: window.location.pathname,
            userAgent: navigator.userAgent,
          },
        }),
      });

      let data: any = null;
      try {
        data = await resp.json();
      } catch {
        // ignore parse errors; we'll handle via resp.ok below
      }

      if (!resp.ok || !data?.success) {
        // IMPORTANT: do not close modal, do not erase form state
        const msg =
          data?.error ||
          data?.message ||
          `Failed to submit feedback (HTTP ${resp.status}).`;
        setError(msg);
        setIsSubmitting(false);
        return;
      }

      // Success: show message, close modal, clear states
      setToast("✅ Feedback submitted. Thank you!");
      setIsOpen(false);
      resetForm();
      setIsSubmitting(false);
    } catch (e: any) {
      // IMPORTANT: do not close modal, do not erase form state
      setError(e?.message || "Failed to submit feedback. Please try again.");
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* Sticky button (top-left) */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        style={{
          position: "fixed",
          top: 14,
          left: 14,
          zIndex: 10000,
          padding: "10px 14px",
          borderRadius: 12,
          border: "none",
          cursor: "pointer",
          fontWeight: 800,
          background: "#B85FB1",
          color: "white",
          boxShadow: "0 10px 24px rgba(0,0,0,0.18)",
        }}
      >
        💬 Suggestions
      </button>

      {/* Toast */}
      {toast && (
        <div
          style={{
            position: "fixed",
            top: 64,
            left: 14,
            zIndex: 10000,
            padding: "10px 12px",
            borderRadius: 12,
            background: "white",
            border: "1px solid rgba(0,0,0,0.12)",
            boxShadow: "0 10px 24px rgba(0,0,0,0.12)",
            fontWeight: 700,
          }}
        >
          {toast}
        </div>
      )}

      {/* Modal */}
      {isOpen && (
        <div
          onClick={() => {
            if (!isSubmitting) setIsOpen(false);
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 10001,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(720px, 100%)",
              borderRadius: 18,
              background: "white",
              boxShadow: "0 22px 70px rgba(0,0,0,0.30)",
              padding: 20,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 900 }}>Tell us what you think</div>
               
              </div>

              <button
                type="button"
                onClick={() => {
                  if (!isSubmitting) setIsOpen(false);
                }}
                style={{
                  border: "none",
                  background: "transparent",
                  fontSize: 20,
                  cursor: isSubmitting ? "not-allowed" : "pointer",
                  padding: 8,
                }}
                aria-label="Close feedback modal"
                disabled={isSubmitting}
              >
                ✕
              </button>
            </div>

            <div style={{ marginTop: 18, textAlign: 'left' }}>
              {/* Name */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Your name</div>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. John Smith"
                  style={{
                    width: "80%",
                    padding: "12px 14px",
                    borderRadius: 12,
                    border: "1px solid rgba(0,0,0,0.15)",
                    fontFamily: "system-ui, -apple-system, sans-serif",
                    fontSize: 14,
                  }}
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <p> This is a new process and any suggestions you may have to improve how it works are welcome. Please use the text box below</p>
              </div>
              {/* Comments */}
              <div style={{ marginTop: 8 }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Comments</div>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={4}
                  placeholder="Free text feedback..."
                  style={{
                    width: "80%",
                    padding: "12px 14px",
                    borderRadius: 12,
                    border: "1px solid rgba(0,0,0,0.15)",
                    resize: "vertical",
                    fontFamily: "system-ui, -apple-system, sans-serif",
                    fontSize: 14,
                  }}
                  disabled={isSubmitting}
                />
              </div>

              {error && (
                <div
                  style={{
                    marginTop: 12,
                    padding: "10px 12px",
                    borderRadius: 12,
                    background: "rgba(229, 74, 114, 0.12)",
                    border: "1px solid rgba(229, 74, 114, 0.35)",
                    color: "#7a1e34",
                    fontWeight: 700,
                  }}
                >
                  ⚠️ {error}
                </div>
              )}

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
                <button
                  type="button"
                  onClick={() => {
                    if (!isSubmitting) setIsOpen(false);
                  }}
                  disabled={isSubmitting}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: "1px solid rgba(0,0,0,0.15)",
                    background: "white",
                    cursor: isSubmitting ? "not-allowed" : "pointer",
                    fontWeight: 800,
                  }}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={submit}
                  disabled={!canSubmit}
                  style={{
                    padding: "10px 16px",
                    borderRadius: 12,
                    border: "none",
                    background: canSubmit ? "#3E8989" : "rgba(0,0,0,0.25)",
                    color: "white",
                    cursor: canSubmit ? "pointer" : "not-allowed",
                    fontWeight: 900,
                    boxShadow: canSubmit ? "0 10px 24px rgba(0,0,0,0.18)" : "none",
                  }}
                >
                  {isSubmitting ? "Submitting..." : "Submit"}
                </button>
              </div>

              <div style={{ marginTop: 10, fontSize: 12, opacity: 0.65 }}>
                Note: Clicking outside closes this window (disabled while submitting).
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default FeedbackWidget;
