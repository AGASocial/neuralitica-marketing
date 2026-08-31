import { createHash } from "node:crypto";

export type AssBeatTiming = {
  startSec: number;
  endSec: number;
};

/** Same tokenizer as US-5.2 `countVoiceoverWords`. */
export function tokenizeVoiceoverWords(voiceoverText: string): string[] {
  return voiceoverText.trim().split(/\s+/).filter(Boolean);
}

/**
 * Phase A equal-split fallback — last endSec forced to targetDurationSec.
 */
export function computeEqualSplitBeatTimings(
  beatCount: number,
  targetDurationSec: number,
): AssBeatTiming[] {
  if (beatCount <= 0) {
    return [];
  }

  const duration = targetDurationSec / beatCount;
  const timings: AssBeatTiming[] = [];
  for (let i = 0; i < beatCount; i += 1) {
    const startSec = i * duration;
    const endSec =
      i === beatCount - 1 ? targetDurationSec : (i + 1) * duration;
    timings.push({ startSec, endSec });
  }
  return timings;
}

/**
 * VO-proportional beat timings from voiceover_text word partitions (US-9.2 Phase B).
 * Script-word proxy only — not TTS/ASR A/V alignment.
 */
export function computeVoProportionalBeatTimings(params: {
  beatCount: number;
  targetDurationSec: number;
  voiceoverText: string;
}): AssBeatTiming[] {
  const { beatCount, targetDurationSec, voiceoverText } = params;

  if (beatCount <= 0) {
    return [];
  }

  const tokens = tokenizeVoiceoverWords(voiceoverText);

  if (tokens.length === 0 || targetDurationSec <= 0) {
    return computeEqualSplitBeatTimings(beatCount, targetDurationSec);
  }

  const base = Math.floor(tokens.length / beatCount);
  const remainder = tokens.length % beatCount;

  const timings: AssBeatTiming[] = [];
  let startSec = 0;

  for (let i = 0; i < beatCount; i += 1) {
    const bucketLen = base + (i < remainder ? 1 : 0);
    const durationI = (bucketLen / tokens.length) * targetDurationSec;
    const endSec =
      i === beatCount - 1 ? targetDurationSec : startSec + durationI;
    timings.push({ startSec, endSec });
    startSec = endSec;
  }

  return timings;
}

/**
 * Server-only fingerprint input — sha256 of normalized VO token list.
 * Empty VO → sha256("").
 */
export function computeVoiceoverTimingHash(voiceoverText: string): string {
  const tokens = tokenizeVoiceoverWords(voiceoverText);
  return createHash("sha256").update(tokens.join("\n")).digest("hex");
}
