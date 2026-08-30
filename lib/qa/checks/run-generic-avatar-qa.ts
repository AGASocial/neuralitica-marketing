import "server-only";

/**
 * Adapter: US-3.4 generic-avatar evaluator → US-10.1 QaCheckResult shape.
 * Does not fork GENERIC_AVATAR_NOT_OWNER_CHECK_KEY or blocking severity.
 */

import type { QaCheckResult } from "@/lib/contracts/qa-report";
import { QA_EVIDENCE_DETAIL_MAX_CHARS } from "@/lib/contracts/qa-report";
import {
  evaluateGenericAvatarNotOwnerCheck,
  GENERIC_AVATAR_NOT_OWNER_CHECK_KEY,
} from "@/lib/qa/checks/generic-avatar-not-owner";

export { GENERIC_AVATAR_NOT_OWNER_CHECK_KEY };

export type GenericAvatarQaCheckInput = {
  mustDiscloseNotOwner: boolean;
  scriptText: string;
  ownerDisplayName?: string;
};

/**
 * Concatenate script package fields the same way orchestrator / stub tests expect.
 */
export function assembleScriptTextForQa(parts: {
  hook?: string | null;
  body?: string | null;
  cta?: string | null;
  voiceoverText?: string | null;
  onScreenText?: string | null;
}): string {
  return [parts.hook, parts.body, parts.cta, parts.voiceoverText, parts.onScreenText]
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join("\n\n");
}

export function evaluateGenericAvatarNotOwnerQaCheck(
  input: GenericAvatarQaCheckInput,
): QaCheckResult {
  const stub = evaluateGenericAvatarNotOwnerCheck({
    mustDiscloseNotOwner: input.mustDiscloseNotOwner,
    scriptText: input.scriptText,
    ...(input.ownerDisplayName
      ? { ownerDisplayName: input.ownerDisplayName }
      : {}),
  });

  if (stub.status === "pass") {
    return {
      checkKey: GENERIC_AVATAR_NOT_OWNER_CHECK_KEY,
      status: "pass",
      severity: stub.severity,
    };
  }

  const matchedPhrase = stub.evidence?.matchedPhrase;
  const detail =
    typeof matchedPhrase === "string" && matchedPhrase.length > 0
      ? matchedPhrase.slice(0, QA_EVIDENCE_DETAIL_MAX_CHARS)
      : undefined;

  return {
    checkKey: GENERIC_AVATAR_NOT_OWNER_CHECK_KEY,
    status: "fail",
    severity: stub.severity,
    evidence: {
      messageKey:
        stub.evidence?.messageKey ??
        "qa.checks.genericAvatarNotOwner.failOwnerClaim",
      ...(detail ? { detail } : {}),
    },
  };
}
