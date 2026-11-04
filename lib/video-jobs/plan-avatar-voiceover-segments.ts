/**
 * Plan 1–N avatar talking-head segments from full VO text + measured duration.
 * Provider request duration = ceil(segment audio length), not script target.
 * Bounds come from reel duration policy (fallback when caller omits policy).
 */
import { splitAvatarVoiceoverSegments } from "@/lib/agents/content/split-avatar-voiceover-segments";
import {
  FALLBACK_REEL_DURATION_POLICIES,
  avatarSegmentMaxSecFromPolicy,
  avatarSegmentsMaxFromPolicy,
  type ReelDurationPolicy,
} from "@/lib/contracts/reel-duration-policy";

export type PlannedAvatarVoiceoverSegment = {
  index: number;
  text: string;
  startSec: number;
  durationSec: number;
  /** Ceil'd duration for provider createJob / estimateCost. */
  requestDurationSec: number;
  wordCount: number;
};

export function planAvatarVoiceoverSegments(params: {
  voiceoverText: string;
  totalDurationSec: number | null | undefined;
  maxSegmentSec?: number;
  maxSegments?: number;
  policy?: ReelDurationPolicy;
}): PlannedAvatarVoiceoverSegment[] {
  const policy = params.policy ?? FALLBACK_REEL_DURATION_POLICIES.avatar;
  const maxSegmentSec =
    params.maxSegmentSec ?? avatarSegmentMaxSecFromPolicy(policy);
  const maxSegments =
    params.maxSegments ?? avatarSegmentsMaxFromPolicy(policy);

  const split = splitAvatarVoiceoverSegments({
    voiceoverText: params.voiceoverText,
    totalDurationSec: params.totalDurationSec,
    maxSegmentSec,
    maxSegments,
    policy,
  });

  return split.segments.map((segment) => ({
    index: segment.index,
    text: segment.text,
    startSec: segment.startSec,
    durationSec: segment.durationSec,
    // Ceil measured slice; splitter already targets ≤ maxSegmentSec when
    // sentence boundaries allow. Do not silently shrink below audio length.
    requestDurationSec: Math.max(1, Math.ceil(segment.durationSec)),
    wordCount: segment.wordCount,
  }));
}
