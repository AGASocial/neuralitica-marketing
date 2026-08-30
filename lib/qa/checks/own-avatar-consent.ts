import "server-only";

/**
 * Deterministic own_avatar_consent QA check (US-10.1).
 *
 * When modalidad !== own_avatar → skipped.
 * When own_avatar → live consent ledger (never cached client flag).
 * Severity always blocking from catalog.
 */

import type { VisualModality } from "@/lib/contracts/visual-preferences";
import type { QaCheckResult } from "@/lib/contracts/qa-report";
import { QA_CHECK_SEVERITY } from "@/lib/qa/check-classes";
import { hasActiveAvatarConsent } from "@/lib/visual-preferences/has-active-avatar-consent";

export const OWN_AVATAR_CONSENT_CHECK_KEY = "own_avatar_consent" as const;

const FAIL_MISSING_MESSAGE_KEY = "qa.checks.ownAvatarConsent.failMissing";

export type OwnAvatarConsentCheckInput = {
  modalidad: VisualModality | string;
  /** Live probe result — must come from hasActiveAvatarConsent or equivalent. */
  consentActive: boolean;
};

/**
 * Pure evaluator — callers supply the live consent probe result.
 */
export function evaluateOwnAvatarConsentCheck(
  input: OwnAvatarConsentCheckInput,
): QaCheckResult {
  if (input.modalidad !== "own_avatar") {
    return {
      checkKey: OWN_AVATAR_CONSENT_CHECK_KEY,
      status: "skipped",
      severity: QA_CHECK_SEVERITY.blocking,
    };
  }

  if (input.consentActive) {
    return {
      checkKey: OWN_AVATAR_CONSENT_CHECK_KEY,
      status: "pass",
      severity: QA_CHECK_SEVERITY.blocking,
    };
  }

  return {
    checkKey: OWN_AVATAR_CONSENT_CHECK_KEY,
    status: "fail",
    severity: QA_CHECK_SEVERITY.blocking,
    evidence: {
      messageKey: FAIL_MISSING_MESSAGE_KEY,
    },
  };
}

/**
 * Live ledger probe wrapper — re-reads neuramark_avatar_consents for clientId.
 */
export async function evaluateOwnAvatarConsentCheckForClient(input: {
  modalidad: VisualModality | string;
  clientId: string;
}): Promise<QaCheckResult> {
  if (input.modalidad !== "own_avatar") {
    return evaluateOwnAvatarConsentCheck({
      modalidad: input.modalidad,
      consentActive: false,
    });
  }

  const consentActive = await hasActiveAvatarConsent(input.clientId);
  return evaluateOwnAvatarConsentCheck({
    modalidad: input.modalidad,
    consentActive,
  });
}
