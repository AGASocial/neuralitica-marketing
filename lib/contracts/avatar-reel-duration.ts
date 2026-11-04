/**
 * @deprecated Import from `@/lib/contracts/reel-duration-policy` instead.
 * Thin re-exports kept for transitional imports; live values come from
 * neuramark_reel_duration_policies via getReelDurationPolicies().
 */
import { FALLBACK_REEL_DURATION_POLICIES } from "@/lib/contracts/reel-duration-policy";

export {
  FALLBACK_REEL_DURATION_POLICIES,
  REEL_SCRIPT_TARGET_DURATION_SEC_MIN,
  REEL_SCRIPT_TARGET_DURATION_SEC_MAX,
  clampReelTargetDurationSec,
  isAvatarVisualModality,
  policyForVisualModality,
  reelDurationModalityKeyFor,
  reelTargetDurationBoundsForModality,
  reelTargetDurationBoundsFromPolicy,
  type ReelDurationPolicy,
  type ReelDurationPolicyCatalog,
} from "@/lib/contracts/reel-duration-policy";

/** @deprecated Use FALLBACK_REEL_DURATION_POLICIES.avatar / loader. */
export const AVATAR_REEL_TARGET_DURATION_SEC_MIN =
  FALLBACK_REEL_DURATION_POLICIES.avatar.targetDurationSecMin;
/** @deprecated Use FALLBACK_REEL_DURATION_POLICIES.avatar / loader. */
export const AVATAR_REEL_TARGET_DURATION_SEC_MAX =
  FALLBACK_REEL_DURATION_POLICIES.avatar.targetDurationSecMax;
/** @deprecated Use FALLBACK_REEL_DURATION_POLICIES.faceless / loader. */
export const FACELESS_REEL_TARGET_DURATION_SEC_MIN =
  FALLBACK_REEL_DURATION_POLICIES.faceless.targetDurationSecMin;
/** @deprecated Use FALLBACK_REEL_DURATION_POLICIES.faceless / loader. */
export const FACELESS_REEL_TARGET_DURATION_SEC_MAX =
  FALLBACK_REEL_DURATION_POLICIES.faceless.targetDurationSecMax;
/** @deprecated Use avatarSegmentMaxSecFromPolicy / loader. */
export const AVATAR_VOICEOVER_SEGMENT_MAX_SEC =
  FALLBACK_REEL_DURATION_POLICIES.avatar.avatarSegmentMaxSec!;
