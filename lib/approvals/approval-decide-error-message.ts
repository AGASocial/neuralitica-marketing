import type { ApprovalErrorCode } from "@/lib/contracts/approval";

/** Last-resort copy when the catalog string is missing. Never a bare "Error". */
export const APPROVAL_DECIDE_FALLBACK_ES =
  "No se pudo aprobar. Inténtalo de nuevo en un momento.";

export type ApprovalDecideErrorCopy = {
  unauthenticated: string;
  forbidden: string;
  validation: string;
  notFound: string;
  forbiddenFields: string;
  qaGateNotReady: string;
  assemblyNotReady: string;
  brandingRequired: string;
  captionRequired: string;
  captionCtaNotSelected: string;
  invalidTransition: string;
  revisionLimitExceeded: string;
  rateLimited: string;
  internal: string;
  approveFailed: string;
};

const CODE_TO_FIELD: Partial<
  Record<ApprovalErrorCode, keyof ApprovalDecideErrorCopy>
> = {
  UNAUTHENTICATED: "unauthenticated",
  FORBIDDEN: "forbidden",
  VALIDATION_ERROR: "validation",
  NOT_FOUND: "notFound",
  FORBIDDEN_FIELDS: "forbiddenFields",
  QA_GATE_NOT_READY: "qaGateNotReady",
  ASSEMBLY_NOT_READY: "assemblyNotReady",
  BRANDING_REQUIRED: "brandingRequired",
  CAPTION_REQUIRED: "captionRequired",
  CAPTION_CTA_NOT_SELECTED: "captionCtaNotSelected",
  INVALID_TRANSITION: "invalidTransition",
  REVISION_LIMIT_EXCEEDED: "revisionLimitExceeded",
  RATE_LIMITED: "rateLimited",
  INTERNAL_ERROR: "internal",
  REVISION_ROUTING_FAILED: "internal",
};

const MESSAGE_KEY_FIELDS = new Set<string>([
  "unauthenticated",
  "forbidden",
  "validation",
  "notFound",
  "forbiddenFields",
  "qaGateNotReady",
  "assemblyNotReady",
  "brandingRequired",
  "captionRequired",
  "captionCtaNotSelected",
  "invalidTransition",
  "revisionLimitExceeded",
  "rateLimited",
  "internal",
]);

function fieldFromMessageKey(
  messageKey: string | undefined,
): keyof ApprovalDecideErrorCopy | undefined {
  if (!messageKey) return undefined;
  const leaf = messageKey.split(".").pop();
  if (leaf && MESSAGE_KEY_FIELDS.has(leaf)) {
    return leaf as keyof ApprovalDecideErrorCopy;
  }
  return undefined;
}

function catalogText(
  copy: Partial<ApprovalDecideErrorCopy> | null | undefined,
  field: keyof ApprovalDecideErrorCopy | undefined,
): string | undefined {
  if (!field || !copy) return undefined;
  const value = copy[field];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Map a decideApproval error to owner-facing copy.
 * Unknown codes and thrown failures use `approveFailed`, then the Spanish fallback.
 */
export function approvalDecideErrorMessage(
  error: { code?: string; messageKey?: string } | null | undefined,
  copy: Partial<ApprovalDecideErrorCopy> | null | undefined,
): string {
  const fallback =
    catalogText(copy, "approveFailed") ?? APPROVAL_DECIDE_FALLBACK_ES;
  if (!error) return fallback;

  const fromKey = catalogText(copy, fieldFromMessageKey(error.messageKey));
  if (fromKey) return fromKey;

  const field =
    error.code && error.code in CODE_TO_FIELD
      ? CODE_TO_FIELD[error.code as ApprovalErrorCode]
      : undefined;
  return catalogText(copy, field) ?? fallback;
}

/** Client-only verification hook. Does not approve and does not call the server. */
export function shouldForceApproveError(search: string): boolean {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  return new URLSearchParams(raw).get("forceApproveError") === "1";
}
