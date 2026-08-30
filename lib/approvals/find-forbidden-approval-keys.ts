import {
  FORBIDDEN_APPROVAL_AUTHORITY_KEYS,
  FORBIDDEN_APPROVAL_DECIDE_EXTRA_KEYS,
  FORBIDDEN_APPROVAL_ENSURE_EXTRA_KEYS,
  FORBIDDEN_APPROVAL_GET_EXTRA_KEYS,
  type ApprovalForbiddenScanSurface,
} from "@/lib/contracts/approval";

/**
 * Scan raw approval input for forbidden authority / surface-extra keys (US-11.1).
 * Call before Zod parse on ensure / get / decide.
 */
export function findForbiddenApprovalKeys(
  raw: unknown,
  surface: ApprovalForbiddenScanSurface,
): string[] {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return [];
  }

  const forbidden = new Set<string>(FORBIDDEN_APPROVAL_AUTHORITY_KEYS);

  if (surface === "ensure") {
    for (const key of FORBIDDEN_APPROVAL_ENSURE_EXTRA_KEYS) {
      forbidden.add(key);
    }
  } else if (surface === "decide") {
    for (const key of FORBIDDEN_APPROVAL_DECIDE_EXTRA_KEYS) {
      forbidden.add(key);
    }
  } else if (surface === "get") {
    for (const key of FORBIDDEN_APPROVAL_GET_EXTRA_KEYS) {
      forbidden.add(key);
    }
  }

  const keys = Object.keys(raw as Record<string, unknown>);
  return keys.filter((key) => forbidden.has(key));
}
