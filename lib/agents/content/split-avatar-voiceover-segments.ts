/**
 * Split avatar voiceover into 1–N segments on sentence boundaries.
 * Each segment ≤ maxSegmentSec (policy avatarSegmentMaxSec, fallback 8s).
 * If total ≤ maxSegmentSec → one segment. Cap at maxSegments (policy, fallback 2).
 * Duration estimates use the calibrated ~2.5 words/sec target when no measured
 * total duration is supplied; when totalDurationSec is known, sentence weights
 * are scaled to sum exactly to that duration.
 */
import {
  FALLBACK_REEL_DURATION_POLICIES,
  avatarSegmentMaxSecFromPolicy,
  avatarSegmentsMaxFromPolicy,
  type ReelDurationPolicy,
} from "@/lib/contracts/reel-duration-policy";
import { REEL_SCRIPT_WORDS_PER_SECOND_TARGET } from "@/lib/contracts/reel-script-readability";
import { countVoiceoverWords } from "@/lib/reel-scripts/compute-script-readability";
import { splitVoiceoverSentences } from "@/lib/agents/content/fit-voiceover-to-word-budget";

export type AvatarVoiceoverSegment = {
  index: number;
  text: string;
  /** Start offset within the full voiceover (seconds). */
  startSec: number;
  /** Estimated / measured segment duration (seconds). */
  durationSec: number;
  wordCount: number;
};

export type SplitAvatarVoiceoverSegmentsResult = {
  segments: AvatarVoiceoverSegment[];
  totalDurationSec: number;
};

function estimateDurationFromWords(wordCount: number): number {
  if (wordCount <= 0) {
    return 0;
  }
  return wordCount / REEL_SCRIPT_WORDS_PER_SECOND_TARGET;
}

/**
 * Pack sentences into at most maxSegments segments, each ≤ maxSegmentSec.
 * Prefers a single segment when total duration fits.
 */
export function splitAvatarVoiceoverSegments(params: {
  voiceoverText: string;
  /** Measured full VO duration when available (preferred). */
  totalDurationSec?: number | null;
  maxSegmentSec?: number;
  maxSegments?: number;
  /** Preferred: avatar policy from loader. */
  policy?: ReelDurationPolicy;
}): SplitAvatarVoiceoverSegmentsResult {
  const policy = params.policy ?? FALLBACK_REEL_DURATION_POLICIES.avatar;
  const maxSegmentSec =
    params.maxSegmentSec ?? avatarSegmentMaxSecFromPolicy(policy);
  const maxSegments =
    params.maxSegments ?? avatarSegmentsMaxFromPolicy(policy);
  const text = params.voiceoverText.trim();
  const sentences = splitVoiceoverSentences(text);
  const wordCounts = sentences.map((s) => countVoiceoverWords(s));
  const totalWords = wordCounts.reduce((sum, n) => sum + n, 0);

  const estimatedTotal = estimateDurationFromWords(totalWords);
  const totalDurationSec =
    typeof params.totalDurationSec === "number" &&
    Number.isFinite(params.totalDurationSec) &&
    params.totalDurationSec > 0
      ? params.totalDurationSec
      : Math.max(estimatedTotal, 0.1);

  if (sentences.length === 0 || totalWords === 0) {
    return {
      segments: [
        {
          index: 0,
          text,
          startSec: 0,
          durationSec: totalDurationSec,
          wordCount: 0,
        },
      ],
      totalDurationSec,
    };
  }

  // Scale word-based estimates so they sum to measured total when provided.
  const scale =
    estimatedTotal > 0 ? totalDurationSec / estimatedTotal : 1;
  const sentenceDurations = wordCounts.map((w) =>
    Math.max(0.05, estimateDurationFromWords(w) * scale),
  );

  if (
    totalDurationSec <= maxSegmentSec ||
    sentences.length === 1 ||
    maxSegments <= 1
  ) {
    return {
      segments: [
        {
          index: 0,
          text: sentences.join(" "),
          startSec: 0,
          durationSec: totalDurationSec,
          wordCount: totalWords,
        },
      ],
      totalDurationSec,
    };
  }

  // V1: pack into at most two segments (policy max is 2). Find a sentence
  // boundary split where both sides are ≤ maxSegmentSec, preferring midpoint.
  let bestSplit = -1;
  let bestScore = Number.POSITIVE_INFINITY;
  let cum = 0;
  for (let i = 0; i < sentences.length - 1; i += 1) {
    cum += sentenceDurations[i]!;
    const left = cum;
    const right = totalDurationSec - cum;
    if (left <= maxSegmentSec + 1e-6 && right <= maxSegmentSec + 1e-6) {
      const score = Math.abs(left - right);
      if (score < bestScore) {
        bestScore = score;
        bestSplit = i + 1;
      }
    }
  }

  // If no clean ≤max/≤max split, still bisect at the midpoint sentence so we
  // never emit more than maxSegments; callers ceil duration for the provider.
  if (bestSplit < 0) {
    let running = 0;
    const midpoint = totalDurationSec / 2;
    bestSplit = 1;
    for (let i = 0; i < sentences.length - 1; i += 1) {
      running += sentenceDurations[i]!;
      bestSplit = i + 1;
      if (running >= midpoint) {
        break;
      }
    }
  }

  const leftSentences = sentences.slice(0, bestSplit);
  const rightSentences = sentences.slice(bestSplit);
  const leftDuration = sentenceDurations
    .slice(0, bestSplit)
    .reduce((s, d) => s + d, 0);
  const rightDuration = Math.max(0.05, totalDurationSec - leftDuration);
  const leftWords = wordCounts.slice(0, bestSplit).reduce((s, n) => s + n, 0);
  const rightWords = totalWords - leftWords;

  const segments: AvatarVoiceoverSegment[] = [
    {
      index: 0,
      text: leftSentences.join(" "),
      startSec: 0,
      durationSec: leftDuration,
      wordCount: leftWords,
    },
    {
      index: 1,
      text: rightSentences.join(" "),
      startSec: leftDuration,
      durationSec: rightDuration,
      wordCount: rightWords,
    },
  ];

  return {
    segments: segments.slice(0, maxSegments),
    totalDurationSec,
  };
}
