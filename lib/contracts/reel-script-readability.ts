/**
 * Reel script readability contract (US-5.2).
 * Constants + Zod DTO for on-screen beat + VO warnings.
 * FE imports types only; compute logic lives in lib/reel-scripts/compute-script-readability.ts.
 */
import { z } from "zod";

/** PO frozen 2026-08-30 — supersedes SECURITY lean (42). */
export const REEL_SCRIPT_MAX_CHARS_PER_BEAT_LINE = 40 as const;

/** Reserved for future multi-line beats; V1 newline model yields 1 line per beat. */
export const REEL_SCRIPT_MAX_LINES_PER_BEAT = 2 as const;

/** Aligns with reelScriptBrollBeatSchema max (US-5.1). */
export const REEL_SCRIPT_MAX_BEAT_LINES_TOTAL = 8 as const;

export const REEL_SCRIPT_WORDS_PER_SECOND_TARGET = 2.5 as const;

export const REEL_SCRIPT_VO_WARN_OVER_RATIO = 1.15 as const;

export const REEL_SCRIPT_VO_WARN_UNDER_RATIO = 0.7 as const;

export const REEL_SCRIPT_READABILITY_THRESHOLDS = {
  maxCharsPerBeatLine: REEL_SCRIPT_MAX_CHARS_PER_BEAT_LINE,
  maxLinesPerBeat: REEL_SCRIPT_MAX_LINES_PER_BEAT,
  maxBeatLinesTotal: REEL_SCRIPT_MAX_BEAT_LINES_TOTAL,
  wordsPerSecondTarget: REEL_SCRIPT_WORDS_PER_SECOND_TARGET,
  voWarnOverRatio: REEL_SCRIPT_VO_WARN_OVER_RATIO,
  voWarnUnderRatio: REEL_SCRIPT_VO_WARN_UNDER_RATIO,
} as const;

export const onScreenBeatWarningCodeSchema = z.enum([
  "chars_exceeded",
  "lines_exceeded",
]);

export const onScreenAggregateWarningCodeSchema = z.enum([
  "too_many_beats",
  "beat_chars",
  "beat_lines",
]);

export const voiceoverReadabilityStatusSchema = z.enum(["ok", "over", "under"]);

export const reelScriptReadabilityBeatLineSchema = z
  .object({
    index: z.number().int().min(0),
    text: z.string(),
    charCount: z.number().int().min(0),
    lineCount: z.number().int().min(1),
    warnings: z.array(onScreenBeatWarningCodeSchema),
  })
  .strict();

export const reelScriptReadabilityOnScreenSchema = z
  .object({
    beatLines: z.array(reelScriptReadabilityBeatLineSchema),
    totalBeatLines: z.number().int().min(0),
    warnings: z.array(onScreenAggregateWarningCodeSchema),
  })
  .strict();

export const reelScriptReadabilityVoiceoverSchema = z
  .object({
    wordCount: z.number().int().min(0),
    targetWordCount: z.number().int().min(0),
    targetDurationSec: z.number().int().min(15).max(45),
    wordsPerSecondTarget: z.literal(REEL_SCRIPT_WORDS_PER_SECOND_TARGET),
    status: voiceoverReadabilityStatusSchema,
  })
  .strict();

export const reelScriptReadabilitySchema = z
  .object({
    onScreen: reelScriptReadabilityOnScreenSchema,
    voiceover: reelScriptReadabilityVoiceoverSchema,
    hasWarnings: z.boolean(),
  })
  .strict();

export const assertScriptReadabilityIssueCodeSchema = z.enum([
  "beat_chars_exceeded",
  "beat_lines_exceeded",
  "too_many_beats",
  "voiceover_over",
  "voiceover_under",
]);

export const assertScriptReadabilityIssueSchema = z
  .object({
    code: assertScriptReadabilityIssueCodeSchema,
    beatIndex: z.number().int().min(0).optional(),
    messageKey: z.string(),
  })
  .strict();

export const assertScriptReadabilityOkSchema = z
  .object({
    ok: z.literal(true),
    metrics: reelScriptReadabilitySchema,
  })
  .strict();

export const assertScriptReadabilityFailSchema = z
  .object({
    ok: z.literal(false),
    metrics: reelScriptReadabilitySchema,
    issues: z.array(assertScriptReadabilityIssueSchema),
  })
  .strict();

export const assertScriptReadabilityResultSchema = z.discriminatedUnion("ok", [
  assertScriptReadabilityOkSchema,
  assertScriptReadabilityFailSchema,
]);

export type OnScreenBeatWarningCode = z.infer<
  typeof onScreenBeatWarningCodeSchema
>;
export type OnScreenAggregateWarningCode = z.infer<
  typeof onScreenAggregateWarningCodeSchema
>;
export type VoiceoverReadabilityStatus = z.infer<
  typeof voiceoverReadabilityStatusSchema
>;
export type ReelScriptReadabilityBeatLine = z.infer<
  typeof reelScriptReadabilityBeatLineSchema
>;
export type ReelScriptReadabilityOnScreen = z.infer<
  typeof reelScriptReadabilityOnScreenSchema
>;
export type ReelScriptReadabilityVoiceover = z.infer<
  typeof reelScriptReadabilityVoiceoverSchema
>;
export type ReelScriptReadability = z.infer<typeof reelScriptReadabilitySchema>;
export type AssertScriptReadabilityIssue = z.infer<
  typeof assertScriptReadabilityIssueSchema
>;
export type AssertScriptReadabilityResult = z.infer<
  typeof assertScriptReadabilityResultSchema
>;
