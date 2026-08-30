import "server-only";

/**
 * Run all deterministic QA checks for an assembled Reel (US-10.1).
 * Legal checks always run even if the LLM pass later fails.
 */

import type { VisualModality } from "@/lib/contracts/visual-preferences";
import type { QaCheckResult } from "@/lib/contracts/qa-report";
import { evaluateOwnAvatarConsentCheck } from "@/lib/qa/checks/own-avatar-consent";
import { evaluateCtaPresenceCheck } from "@/lib/qa/checks/cta-presence";
import {
  assembleScriptTextForQa,
  evaluateGenericAvatarNotOwnerQaCheck,
} from "@/lib/qa/checks/run-generic-avatar-qa";

export type DeterministicQaInput = {
  modalidad: VisualModality | string;
  /** Live consent probe — required when modalidad is own_avatar. */
  consentActive: boolean;
  mustDiscloseNotOwner: boolean;
  ownerDisplayName?: string;
  scriptPackage: {
    hook?: string | null;
    body?: string | null;
    cta?: string | null;
    voiceoverText?: string | null;
    onScreenText?: string | null;
  };
  selectedCtaIndex?: number | null;
  ctaVariants?: readonly string[] | null;
};

/**
 * Returns catalog-ordered deterministic results:
 * own_avatar_consent, generic_avatar_not_owner, cta_presence.
 */
export function runDeterministicQaChecks(
  input: DeterministicQaInput,
): QaCheckResult[] {
  const scriptText = assembleScriptTextForQa(input.scriptPackage);

  const consent = evaluateOwnAvatarConsentCheck({
    modalidad: input.modalidad,
    consentActive: input.consentActive,
  });

  const genericAvatar = evaluateGenericAvatarNotOwnerQaCheck({
    mustDiscloseNotOwner: input.mustDiscloseNotOwner,
    scriptText,
    ...(input.ownerDisplayName
      ? { ownerDisplayName: input.ownerDisplayName }
      : {}),
  });

  const cta = evaluateCtaPresenceCheck({
    selectedCtaIndex: input.selectedCtaIndex,
    ctaVariants: input.ctaVariants,
    scriptCta: input.scriptPackage.cta,
  });

  return [consent, genericAvatar, cta];
}
