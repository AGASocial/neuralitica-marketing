/**
 * Reject TTS that is too short/long vs script targetDurationSec.
 * Prevents 9.4s VO from proceeding against a 15±2s target (min 13s).
 */

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

  const minAllowedSec = params.targetDurationSec - toleranceSec;
  const maxAllowedSec = params.targetDurationSec + toleranceSec;
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
