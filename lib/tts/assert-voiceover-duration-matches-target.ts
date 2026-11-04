/**
 * Reject TTS that is too short/long vs script targetDurationSec.
 *
 * Faceless / default: target ± tolerance (historically 15±2 → min 13).
 * Avatar modalities: absolute policy band (fallback 8–15s) so a valid ~12.5s
 * avatar VO is not rejected against a stale 13s floor from a 15±2 faceless rule.
 */

import {
  FALLBACK_REEL_DURATION_POLICIES,
  policyForVisualModality,
  type ReelDurationPolicy,
} from "@/lib/contracts/reel-duration-policy";
import type { VisualModality } from "@/lib/contracts/visual-preferences";
import type { VisualMode } from "@/lib/contracts/providers";

export const TTS_DURATION_TOLERANCE_SEC_DEFAULT = 2 as const;

export type AssertVoiceoverDurationMatchesTargetResult =
  | { ok: true }
  | {
      ok: false;
      code: "VOICEOVER_DURATION_MISMATCH";
      actualDurationSec: number;
      targetDurationSec: number;
      toleranceSec: number;
      minAllowedSec: number;
      maxAllowedSec: number;
    };

export function assertVoiceoverDurationMatchesTarget(params: {
  actualDurationSec: number | null | undefined;
  targetDurationSec: number;
  toleranceSec?: number;
  /** When avatar modality, use absolute policy bounds instead of target±tol. */
  modalidad?: VisualModality | VisualMode | null;
  /** Preferred: policy from getReelDurationPolicyForModality. */
  policy?: ReelDurationPolicy;
}): AssertVoiceoverDurationMatchesTargetResult {
  const toleranceSec =
    params.toleranceSec ?? TTS_DURATION_TOLERANCE_SEC_DEFAULT;
  const actual = params.actualDurationSec;
  if (
    actual === null ||
    actual === undefined ||
    !Number.isFinite(actual) ||
    actual <= 0
  ) {
    // Unknown duration — do not block (probe may be unavailable).
    return { ok: true };
  }

  const policy =
    params.policy ??
    policyForVisualModality(FALLBACK_REEL_DURATION_POLICIES, params.modalidad);

  let minAllowedSec: number;
  let maxAllowedSec: number;
  if (policy.modalityKey === "avatar") {
    minAllowedSec = policy.targetDurationSecMin;
    maxAllowedSec = policy.targetDurationSecMax;
  } else {
    minAllowedSec = params.targetDurationSec - toleranceSec;
    maxAllowedSec = params.targetDurationSec + toleranceSec;
  }

  if (actual < minAllowedSec || actual > maxAllowedSec) {
    return {
      ok: false,
      code: "VOICEOVER_DURATION_MISMATCH",
      actualDurationSec: actual,
      targetDurationSec: params.targetDurationSec,
      toleranceSec,
      minAllowedSec,
      maxAllowedSec,
    };
  }
  return { ok: true };
}
