import "server-only";

/**
 * Deterministic cta_presence QA check (US-10.1).
 *
 * Resolve CTA under test server-side:
 * 1. selected_cta_index → cta_variants[index] (non-empty)
 * 2. else first non-empty cta_variants entry
 * 3. else script package cta
 *
 * Empty → fail / overridable. Does not hard-reject the whole QA run.
 */

import type { QaCheckResult } from "@/lib/contracts/qa-report";
import { QA_CHECK_SEVERITY } from "@/lib/qa/check-classes";

export const CTA_PRESENCE_CHECK_KEY = "cta_presence" as const;

const FAIL_MISSING_MESSAGE_KEY = "qa.checks.ctaPresence.failMissing";

export type CtaPresenceResolveInput = {
  selectedCtaIndex: number | null | undefined;
  ctaVariants: readonly string[] | null | undefined;
  scriptCta: string | null | undefined;
};

/**
 * Resolves the CTA string under test per CONTRACT freeze order.
 */
export function resolveCtaUnderTest(
  input: CtaPresenceResolveInput,
): string | null {
  const variants = input.ctaVariants ?? [];

  if (
    input.selectedCtaIndex != null &&
    Number.isInteger(input.selectedCtaIndex) &&
    input.selectedCtaIndex >= 0 &&
    input.selectedCtaIndex < variants.length
  ) {
    const selected = variants[input.selectedCtaIndex];
    if (typeof selected === "string" && selected.trim().length > 0) {
      return selected.trim();
    }
  }

  for (const variant of variants) {
    if (typeof variant === "string" && variant.trim().length > 0) {
      return variant.trim();
    }
  }

  if (typeof input.scriptCta === "string" && input.scriptCta.trim().length > 0) {
    return input.scriptCta.trim();
  }

  return null;
}

export function evaluateCtaPresenceCheck(
  input: CtaPresenceResolveInput,
): QaCheckResult {
  const cta = resolveCtaUnderTest(input);
  if (cta == null) {
    return {
      checkKey: CTA_PRESENCE_CHECK_KEY,
      status: "fail",
      severity: QA_CHECK_SEVERITY.overridable,
      evidence: {
        messageKey: FAIL_MISSING_MESSAGE_KEY,
      },
    };
  }

  return {
    checkKey: CTA_PRESENCE_CHECK_KEY,
    status: "pass",
    severity: QA_CHECK_SEVERITY.overridable,
  };
}
