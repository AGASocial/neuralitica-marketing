/**
 * Post-LLM voiceover fit — cap spoken copy to ~2.5 words/sec of targetDurationSec,
 * cutting only at sentence boundaries (never mid-clause).
 */

import { REEL_SCRIPT_WORDS_PER_SECOND_TARGET } from "@/lib/contracts/reel-script-readability";
import { countVoiceoverWords } from "@/lib/reel-scripts/compute-script-readability";

import { voiceoverEndsWithCompleteSentence } from "./voiceover-completeness";

/** Split into sentences keeping trailing terminal punctuation on each segment. */
export function splitVoiceoverSentences(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return [];
  }

  const parts = trimmed.split(/(?<=[.!?…])\s+/u).map((p) => p.trim()).filter(Boolean);
  return parts.length > 0 ? parts : [trimmed];
}

export function voiceoverWordBudget(targetDurationSec: number): number {
  return Math.max(1, Math.round(targetDurationSec * REEL_SCRIPT_WORDS_PER_SECOND_TARGET));
}

export type FitVoiceoverToWordBudgetResult = {
  voiceoverText: string;
  wordCount: number;
  targetWordCount: number;
  trimmed: boolean;
};

/**
 * Keep whole sentences while word count ≤ budget.
 * If the first sentence alone exceeds budget, keep it (prefer complete CTA over hard cut).
 */
export function fitVoiceoverToWordBudget(params: {
  voiceoverText: string;
  targetDurationSec: number;
}): FitVoiceoverToWordBudgetResult {
  const targetWordCount = voiceoverWordBudget(params.targetDurationSec);
  const original = params.voiceoverText.trim();
  const originalCount = countVoiceoverWords(original);

  if (originalCount <= targetWordCount) {
    return {
      voiceoverText: original,
      wordCount: originalCount,
      targetWordCount,
      trimmed: false,
    };
  }

  const sentences = splitVoiceoverSentences(original);
  const kept: string[] = [];
  let wordCount = 0;

  for (const sentence of sentences) {
    const sentenceWords = countVoiceoverWords(sentence);
    if (kept.length > 0 && wordCount + sentenceWords > targetWordCount) {
      break;
    }
    kept.push(sentence);
    wordCount += sentenceWords;
    if (wordCount >= targetWordCount) {
      break;
    }
  }

  let fitted = kept.join(" ").trim();
  if (fitted.length === 0) {
    fitted = sentences[0] ?? original;
    wordCount = countVoiceoverWords(fitted);
  }

  // Prefer a finished sentence when the leftover tail was incomplete.
  if (!voiceoverEndsWithCompleteSentence(fitted) && kept.length > 1) {
    kept.pop();
    fitted = kept.join(" ").trim();
    wordCount = countVoiceoverWords(fitted);
  }

  return {
    voiceoverText: fitted,
    wordCount,
    targetWordCount,
    trimmed: fitted !== original,
  };
}
