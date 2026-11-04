import "server-only";

import {
  reelDurationPolicySchema,
  type ReelDurationPolicy,
} from "@/lib/contracts/reel-duration-policy";

export type ReelDurationPolicySelectRow = {
  modality_key: unknown;
  target_duration_sec_min: unknown;
  target_duration_sec_max: unknown;
  avatar_segment_max_sec: unknown;
  avatar_segments_min: unknown;
  avatar_segments_max: unknown;
  broll_cutaways_allowed: unknown;
};

export function mapReelDurationPolicyRow(
  row: ReelDurationPolicySelectRow,
): ReelDurationPolicy | null {
  const parsed = reelDurationPolicySchema.safeParse({
    modalityKey: row.modality_key,
    targetDurationSecMin: row.target_duration_sec_min,
    targetDurationSecMax: row.target_duration_sec_max,
    avatarSegmentMaxSec: row.avatar_segment_max_sec ?? null,
    avatarSegmentsMin: row.avatar_segments_min ?? null,
    avatarSegmentsMax: row.avatar_segments_max ?? null,
    brollCutawaysAllowed: row.broll_cutaways_allowed,
  });
  return parsed.success ? parsed.data : null;
}
