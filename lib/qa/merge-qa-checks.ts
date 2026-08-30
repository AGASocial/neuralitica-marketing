import "server-only";

/**
 * Merge deterministic + LLM QA results under catalog authority (US-10.1).
 *
 * - Deterministic keys win for deterministic checkKeys
 * - LLM subset only for LLM keys; severity overwritten from catalog
 * - Unknown LLM keys: drop + log
 * - LLM null/invalid: omit LLM keys (caller derives failed — never passed)
 */

import type {
  QaCheckKey,
  QaCheckResult,
  QaLlmCheckResult,
} from "@/lib/contracts/qa-report";
import {
  QA_DETERMINISTIC_CHECK_KEYS,
  QA_LLM_CHECK_KEYS,
} from "@/lib/contracts/qa-report";
import {
  isLlmCheckKey,
  severityForCheckKey,
} from "@/lib/qa/check-catalog";

export type MergeQaChecksInput = {
  deterministic: readonly QaCheckResult[];
  /** Parsed LLM checks; null = LLM failed / invalid — omit LLM keys. */
  llmChecks: readonly QaLlmCheckResult[] | null;
  /**
   * When true, ai_disclosure is server-skipped (not required) and must not
   * come from the LLM subset.
   */
  aiDisclosureSkipped?: boolean;
};

function logDroppedUnknownKey(checkKey: string): void {
  console.warn("[qa] dropping unknown LLM checkKey", { checkKey });
}

/**
 * Apply catalog severity to a single LLM check result. Returns null if key unknown.
 */
export function applyCatalogSeverityToLlmCheck(
  check: QaLlmCheckResult & { severity?: string },
): QaCheckResult | null {
  const severity = severityForCheckKey(check.checkKey);
  if (severity == null || !isLlmCheckKey(check.checkKey)) {
    logDroppedUnknownKey(check.checkKey);
    return null;
  }

  return {
    checkKey: check.checkKey,
    status: check.status,
    severity,
    ...(check.evidence ? { evidence: check.evidence } : {}),
  };
}

/**
 * Normalize LLM agent output into catalog-severity QaCheckResult[].
 * Drops unknown keys (log). Ignores any model-supplied severity.
 */
export function normalizeLlmChecksWithCatalog(
  llmChecks: readonly (QaLlmCheckResult & { severity?: string })[],
): QaCheckResult[] {
  const byKey = new Map<QaCheckKey, QaCheckResult>();

  for (const check of llmChecks) {
    const normalized = applyCatalogSeverityToLlmCheck(check);
    if (normalized == null) continue;
    byKey.set(normalized.checkKey, normalized);
  }

  return QA_LLM_CHECK_KEYS.filter((key) => byKey.has(key)).map(
    (key) => byKey.get(key)!,
  );
}

function skippedAiDisclosure(): QaCheckResult {
  return {
    checkKey: "ai_disclosure",
    status: "skipped",
    severity: "overridable",
  };
}

/**
 * Merge deterministic + LLM into the full checks[] array for persistence.
 * Order: deterministic keys (catalog order) then remaining LLM keys.
 */
export function mergeQaChecks(input: MergeQaChecksInput): QaCheckResult[] {
  const detByKey = new Map<string, QaCheckResult>();
  for (const check of input.deterministic) {
    detByKey.set(check.checkKey, check);
  }

  const deterministicOrdered: QaCheckResult[] = [];
  for (const key of QA_DETERMINISTIC_CHECK_KEYS) {
    const row = detByKey.get(key);
    if (row) {
      deterministicOrdered.push(row);
    }
  }

  if (input.aiDisclosureSkipped) {
    const llmNormalized =
      input.llmChecks == null
        ? []
        : normalizeLlmChecksWithCatalog(
            input.llmChecks.filter((c) => c.checkKey !== "ai_disclosure"),
          );
    const llmOrdered: QaCheckResult[] = [];
    for (const key of QA_LLM_CHECK_KEYS) {
      if (key === "ai_disclosure") {
        llmOrdered.push(skippedAiDisclosure());
        continue;
      }
      const row = llmNormalized.find((c) => c.checkKey === key);
      if (row) llmOrdered.push(row);
    }
    return [...deterministicOrdered, ...llmOrdered];
  }

  if (input.llmChecks == null) {
    return deterministicOrdered;
  }

  const llmNormalized = normalizeLlmChecksWithCatalog(input.llmChecks);
  const llmOrdered: QaCheckResult[] = [];
  for (const key of QA_LLM_CHECK_KEYS) {
    const row = llmNormalized.find((c) => c.checkKey === key);
    if (row) llmOrdered.push(row);
  }

  return [...deterministicOrdered, ...llmOrdered];
}
