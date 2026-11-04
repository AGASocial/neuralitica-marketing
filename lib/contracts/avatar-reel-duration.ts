/**
 * Avatar vs faceless reel duration bounds.
 * Avatar / talking-head modalities: short 8–15s reels.
 * Faceless keeps the longer 15–45s range.
 */
import type { VisualModality } from "@/lib/contracts/visual-preferences";
import type { VisualMode } from "@/lib/contracts/providers";

export const AVATAR_REEL_TARGET_DURATION_SEC_MIN = 8 as const;
export const AVATAR_REEL_TARGET_DURATION_SEC_MAX = 15 as const;

export const FACELESS_REEL_TARGET_DURATION_SEC_MIN = 15 as const;
export const FACELESS_REEL_TARGET_DURATION_SEC_MAX = 45 as const;

/** Legacy package-wide bounds (union of avatar + faceless). */
export const REEL_SCRIPT_TARGET_DURATION_SEC_MIN = AVATAR_REEL_TARGET_DURATION_SEC_MIN;
export const REEL_SCRIPT_TARGET_DURATION_SEC_MAX = FACELESS_REEL_TARGET_DURATION_SEC_MAX;

/** Max length of a single avatar video segment (HeyGen clip / lip-sync slice). */
export const AVATAR_VOICEOVER_SEGMENT_MAX_SEC = 8 as const;

export function isAvatarVisualModality(
  modalidad: VisualModality | VisualMode | null | undefined,
): boolean {
  return (
    modalidad === "own_avatar" ||
    modalidad === "generic_avatar"
  );
}

export function reelTargetDurationBoundsForModality(
  modalidad: VisualModality | VisualMode | null | undefined,
): { min: number; max: number } {
  if (isAvatarVisualModality(modalidad)) {
    return {
      min: AVATAR_REEL_TARGET_DURATION_SEC_MIN,
      max: AVATAR_REEL_TARGET_DURATION_SEC_MAX,
    };
  }
  return {
    min: FACELESS_REEL_TARGET_DURATION_SEC_MIN,
    max: FACELESS_REEL_TARGET_DURATION_SEC_MAX,
  };
}

/** Clamp an LLM-picked target into the modality-appropriate range. */
export function clampReelTargetDurationSec(params: {
  targetDurationSec: number;
  modalidad: VisualModality | VisualMode | null | undefined;
}): number {
  const { min, max } = reelTargetDurationBoundsForModality(params.modalidad);
  const rounded = Math.round(params.targetDurationSec);
  if (!Number.isFinite(rounded)) {
    return min;
  }
  return Math.min(max, Math.max(min, rounded));
}
