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
      className="rounded-xl border border-edge bg-deep/60 px-5 py-4"
    >
      <p className="font-semibold leading-normal text-fog">{line}</p>
      {previewNote ? (
        <p className="mt-2 text-sm leading-[1.45] text-dim">{previewNote}</p>
      ) : null}
    </section>
  );
}
