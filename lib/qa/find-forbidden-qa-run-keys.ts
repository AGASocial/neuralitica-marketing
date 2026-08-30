import { FORBIDDEN_QA_RUN_AUTHORITY_KEYS } from "@/lib/contracts/qa-report";

/**
 * Scan raw run-QA input for forbidden authority keys (US-10.1).
 * Shared with the Operator Server Action before Zod parse.
 */
export function findForbiddenQaRunKeys(raw: unknown): string[] {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return [];
  }

  const keys = Object.keys(raw as Record<string, unknown>);
  const forbidden = new Set<string>(FORBIDDEN_QA_RUN_AUTHORITY_KEYS);
  return keys.filter((key) => forbidden.has(key));
}
