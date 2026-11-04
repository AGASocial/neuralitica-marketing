import { clampWanClipCount } from "@/lib/contracts/siliconflow-wan21-turbo";

export function resolveBeatTexts(params: {
  needsBroll: boolean;
  brollBeats: string[] | undefined;
  hook: string;
  body: string;
}): string[] {
  const beats = params.brollBeats ?? [];
  if (beats.length > 0) {
    return beats.slice(0, clampWanClipCount(beats.length));
  }
  if (params.needsBroll) {
    return [`${params.hook} ${params.body}`.trim()];
  }
  return [];
}

/**
 * Clip count = max(beats, ceil(targetDurationSec / clipDurationSec)), clamped.
 */
export function computeBrollClipCount(params: {
  needsBroll: boolean;
  brollBeats: string[] | undefined;
  hook: string;
  body: string;
  targetDurationSec?: number;
  clipDurationSec?: number;
}): number {
  if (!params.needsBroll) {
    return 0;
  }
  const beatTexts = resolveBeatTexts(params);
  const fromBeats = Math.max(1, beatTexts.length);
  const clipSec =
    params.clipDurationSec !== undefined &&
    Number.isFinite(params.clipDurationSec) &&
    params.clipDurationSec > 0
      ? params.clipDurationSec
      : 5;
  const target = params.targetDurationSec;
  const fromDuration =
    target !== undefined && Number.isFinite(target) && target > 0
      ? Math.ceil(target / clipSec)
      : 0;
  return clampWanClipCount(Math.max(fromBeats, fromDuration, 1));
}
