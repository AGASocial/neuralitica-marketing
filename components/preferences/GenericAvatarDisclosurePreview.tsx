"use client";

export type GenericAvatarDisclosurePreviewProps = {
  /** When false, render nothing. */
  visible: boolean;
  /** Layout/copy variant — both use same legal line in V1. */
  variant?: "preferences" | "approval";
  /** Pre-resolved i18n strings from RSC parent. */
  line: string;
  /** Optional subtitle for preferences stub — clarifies not final Aprobación package. */
  previewNote?: string;
};

/**
 * Read-only disclosure line preview (US-3.4).
 * Reused on Preferencias; future US-11.1 approval package may style `approval` variant.
 */
export function GenericAvatarDisclosurePreview({
  visible,
  variant = "preferences",
  line,
  previewNote,
}: GenericAvatarDisclosurePreviewProps) {
  if (!visible) {
    return null;
  }

  return (
    <section
      aria-label={variant === "approval" ? undefined : "Disclosure preview"}
      style={{
        background: "#f9fafb",
        border: "1px solid #e5e7eb",
        borderRadius: "8px",
        padding: "1rem 1.25rem",
      }}
    >
      <p
        style={{
          margin: 0,
          fontWeight: 600,
          color: "#111827",
          lineHeight: 1.5,
        }}
      >
        {line}
      </p>
      {previewNote ? (
        <p
          style={{
            margin: "0.5rem 0 0",
            color: "#6b7280",
            fontSize: "0.875rem",
            lineHeight: 1.45,
          }}
        >
          {previewNote}
        </p>
      ) : null}
    </section>
  );
}
