/**
 * Reel Instagram caption contract (US-6.1).
 * FE imports types and IG limit constants; Zod validation stays server-side.
 */
import { z } from "zod";

import { trendWeekStartSchema } from "@/lib/contracts/trend";

export const IG_CAPTION_MAX_CHARS = 2200 as const;
export const IG_HASHTAG_WARN_MAX = 15 as const;
export const IG_HASHTAG_HARD_MAX = 30 as const;
export const IG_HASHTAG_ENTRY_MAX_CHARS = 100 as const;
export const IG_KEYWORD_MAX = 10 as const;
export const IG_KEYWORD_ENTRY_MAX_CHARS = 80 as const;
export const CTA_VARIANT_MIN = 2 as const;
export const CTA_VARIANT_MAX = 4 as const;
export const CTA_VARIANT_ENTRY_MAX_CHARS = 200 as const;

function plainTextNoHtmlRefine(value: string): boolean {
  return !/[<>&]/.test(value) && !value.toLowerCase().includes("javascript:");
}

export function plainTextNoHtmlSchemaWithMax(maxLen: number) {
  return z
    .string()
    .trim()
    .min(1)
    .max(maxLen)
    .refine(plainTextNoHtmlRefine, { message: "PLAIN_TEXT_REQUIRED" });
}

export const plainTextNoHtmlSchema = plainTextNoHtmlSchemaWithMax(
  IG_CAPTION_MAX_CHARS,
);

export const reelCaptionHashtagSchema = plainTextNoHtmlSchemaWithMax(
  IG_HASHTAG_ENTRY_MAX_CHARS,
);

export const reelCaptionKeywordSchema = plainTextNoHtmlSchemaWithMax(
  IG_KEYWORD_ENTRY_MAX_CHARS,
);

export const reelCaptionCtaVariantSchema = plainTextNoHtmlSchemaWithMax(
  CTA_VARIANT_ENTRY_MAX_CHARS,
);

/** LLM agent output shape (camelCase). Orchestrator normalizes hashtags then parses persist schema. */
export const reelCaptionAgentOutputSchema = z
  .object({
    caption: plainTextNoHtmlSchema,
    hashtags: z
      .array(z.string().trim().min(1).max(IG_HASHTAG_ENTRY_MAX_CHARS))
      .min(1)
      .max(IG_HASHTAG_HARD_MAX),
    keywords: z
      .array(z.string().trim().min(1).max(IG_KEYWORD_ENTRY_MAX_CHARS))
      .max(IG_KEYWORD_MAX)
      .default([]),
    ctaVariants: z
      .array(z.string().trim().min(1).max(CTA_VARIANT_ENTRY_MAX_CHARS))
      .min(CTA_VARIANT_MIN)
      .max(CTA_VARIANT_MAX),
  })
  .strict();

export type ReelCaptionAgentOutput = z.infer<typeof reelCaptionAgentOutputSchema>;

/** Normalizes a hashtag to leading `#` before persist. */
export function normalizeHashtag(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

/** Builds persisted record with server-computed counters and warn flags. */
export function buildReelCaptionRecord(
  output: ReelCaptionAgentOutput,
): ReelCaptionRecord {
  const hashtags = output.hashtags.map(normalizeHashtag);
  const keywords = output.keywords ?? [];
  const ctaVariants = output.ctaVariants;

  const hashtagCount = hashtags.length;
  const keywordCount = keywords.length;
  const ctaVariantCount = ctaVariants.length;
  const charCount = output.caption.length;

  return reelCaptionRecordSchema.parse({
    caption: output.caption,
    hashtags,
    keywords,
    ctaVariants,
    charCount,
    hashtagCount,
    keywordCount,
    ctaVariantCount,
    maxCaptionChars: IG_CAPTION_MAX_CHARS,
    maxHashtagsConfigured: IG_HASHTAG_WARN_MAX,
    maxHashtagsHard: IG_HASHTAG_HARD_MAX,
    hasKeywords: keywordCount > 0,
    hashtagsOverConfiguredMax: hashtagCount > IG_HASHTAG_WARN_MAX,
  });
}

export const reelCaptionRecordSchema = z
  .object({
    caption: plainTextNoHtmlSchema,
    hashtags: z
      .array(reelCaptionHashtagSchema)
      .min(1)
      .max(IG_HASHTAG_HARD_MAX),
    keywords: z.array(reelCaptionKeywordSchema).max(IG_KEYWORD_MAX),
    ctaVariants: z
      .array(reelCaptionCtaVariantSchema)
      .min(CTA_VARIANT_MIN)
      .max(CTA_VARIANT_MAX),
    charCount: z.number().int().min(1).max(IG_CAPTION_MAX_CHARS),
    hashtagCount: z.number().int().min(1).max(IG_HASHTAG_HARD_MAX),
    keywordCount: z.number().int().min(0).max(IG_KEYWORD_MAX),
    ctaVariantCount: z.number().int().min(CTA_VARIANT_MIN).max(CTA_VARIANT_MAX),
    maxCaptionChars: z.literal(IG_CAPTION_MAX_CHARS),
    maxHashtagsConfigured: z.literal(IG_HASHTAG_WARN_MAX),
    maxHashtagsHard: z.literal(IG_HASHTAG_HARD_MAX),
    hasKeywords: z.boolean(),
    hashtagsOverConfiguredMax: z.boolean(),
  })
  .strict();

export type ReelCaptionRecord = z.infer<typeof reelCaptionRecordSchema>;

export const reelCaptionSummarySchema = z
  .object({
    status: z.enum(["pending", "generated"]),
    captionId: z.string().uuid().nullable(),
    record: reelCaptionRecordSchema.nullable(),
    updatedAt: z.string().datetime().nullable(),
    stale: z.boolean(),
  })
  .strict();

export type ReelCaptionSummary = z.infer<typeof reelCaptionSummarySchema>;

export const PENDING_REEL_CAPTION_SUMMARY: ReelCaptionSummary = {
  status: "pending",
  captionId: null,
  record: null,
  updatedAt: null,
  stale: false,
};

export const generateReelCaptionsInputSchema = z
  .object({
    weekStart: trendWeekStartSchema,
  })
  .strict();

export const regenerateReelCaptionInputSchema = z
  .object({
    weekStart: trendWeekStartSchema,
    slotIndex: z.number().int().min(0).max(6),
  })
  .strict();

export type ReelCaptionInvoker = "operator" | "system";

export const generateReelCaptionsSuccessSchema = z
  .object({
    ok: z.literal(true),
    strategyId: z.string().uuid(),
    weekStart: trendWeekStartSchema,
    processedCount: z.number().int().min(0),
    captionIds: z.array(z.string().uuid()),
    skipped: z.array(
      z
        .object({
          slotIndex: z.number().int().min(0).max(6),
          code: z.literal("SCRIPT_PENDING"),
        })
        .strict(),
    ),
    errors: z.array(
      z
        .object({
          slotIndex: z.number().int().min(0).max(6),
          code: z.literal("CAPTION_OUTPUT_INVALID"),
          fields: z.record(z.string(), z.array(z.string())).optional(),
        })
        .strict(),
    ),
  })
  .strict();

export const regenerateReelCaptionSuccessSchema = z
  .object({
    ok: z.literal(true),
    strategyId: z.string().uuid(),
    weekStart: trendWeekStartSchema,
    slotIndex: z.number().int().min(0).max(6),
    reelScriptId: z.string().uuid(),
    captionId: z.string().uuid(),
  })
  .strict();

export const reelCaptionErrorCodeSchema = z.enum([
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "STRATEGY_NOT_APPROVED",
  "SLOT_NOT_FOUND",
  "SCRIPT_NOT_FOUND",
  "SCRIPT_PENDING",
  "RATE_LIMITED",
  "GENERATION_IN_FLIGHT",
  "PROFILE_INCOMPLETE",
  "CAPTION_OUTPUT_INVALID",
  "PROVIDER_UNAVAILABLE",
  "FORBIDDEN_FIELDS",
  "INTERNAL_ERROR",
]);

export type ReelCaptionMutationError = {
  ok: false;
  error: {
    code: z.infer<typeof reelCaptionErrorCodeSchema>;
    messageKey?: string;
    fields?: Record<string, string[]>;
  };
};

export type ReelCaptionErrorCode = z.infer<typeof reelCaptionErrorCodeSchema>;
export type GenerateReelCaptionsInput = z.infer<
  typeof generateReelCaptionsInputSchema
>;
export type GenerateReelCaptionsSuccess = z.infer<
  typeof generateReelCaptionsSuccessSchema
>;
export type GenerateReelCaptionsResult =
  | GenerateReelCaptionsSuccess
  | ReelCaptionMutationError;
export type RegenerateReelCaptionInput = z.infer<
  typeof regenerateReelCaptionInputSchema
>;
export type RegenerateReelCaptionSuccess = z.infer<
  typeof regenerateReelCaptionSuccessSchema
>;
export type RegenerateReelCaptionResult =
  | RegenerateReelCaptionSuccess
  | ReelCaptionMutationError;
