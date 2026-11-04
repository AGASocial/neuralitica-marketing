/**
 * Plan 1–2 avatar talking-head segments from full VO text + measured duration.
 * Provider request duration = ceil(segment audio length), not script target.
 */
import { splitAvatarVoiceoverSegments } from "@/lib/agents/content/split-avatar-voiceover-segments";
import { AVATAR_VOICEOVER_SEGMENT_MAX_SEC } from "@/lib/contracts/avatar-reel-duration";

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
}): PlannedAvatarVoiceoverSegment[] {
  const split = splitAvatarVoiceoverSegments({
    voiceoverText: params.voiceoverText,
    totalDurationSec: params.totalDurationSec,
    maxSegmentSec: params.maxSegmentSec ?? AVATAR_VOICEOVER_SEGMENT_MAX_SEC,
  });

  return split.segments.map((segment) => ({
    index: segment.index,
    text: segment.text,
    startSec: segment.startSec,
    durationSec: segment.durationSec,
    requestDurationSec: Math.max(1, Math.ceil(segment.durationSec)),
    wordCount: segment.wordCount,
  }));
}
