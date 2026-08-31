/**
 * Video job orchestration contract (US-8.4).
 * FE imports types and constants only; Zod validation stays server-side.
 */
import { z } from "zod";

import { operatorProductionJobCostDtoSchema } from "@/lib/contracts/actual-cost";
import {
  persistedVideoJobStatusSchema,
  videoJobStatusSchema,
} from "@/lib/contracts/providers";

/** Default max primary talking-head attempts per Reel (env override). */
export const VIDEO_MAX_RETRIES_PER_REEL_DEFAULT = 3 as const;

/** Default stale timeout — 120 minutes in milliseconds. */
export const VIDEO_JOB_STALE_TIMEOUT_MS_DEFAULT = 7_200_000 as const;

/** Poll interval between vendor status checks. */
export const VIDEO_JOB_POLL_INTERVAL_MS_DEFAULT = 5_000 as const;

export const videoJobPollModeSchema = z.enum(["fly", "in_process"]);

export type VideoJobPollMode = z.infer<typeof videoJobPollModeSchema>;

export const videoJobStatusUpdateSourceSchema = z.enum(["poller", "webhook"]);

export type VideoJobStatusUpdateSource = z.infer<
  typeof videoJobStatusUpdateSourceSchema
>;

export const videoJobErrorCodeSchema = z.enum([
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION_ERROR",
  "FORBIDDEN_FIELDS",
  "BUDGET_EXCEEDED",
  "CONSENT_REVOKED",
  "RETRY_LIMIT_EXCEEDED",
  "JOB_NOT_RETRYABLE",
  "PROVIDER_UNAVAILABLE",
  "INTERNAL_ERROR",
  /** US-8.3 manual upload slot guards */
  "SLOT_JOB_IN_FLIGHT",
  "SLOT_COMPLETED_JOB_EXISTS",
  /** US-8.7 HeyGen fallback eligibility */
  "HEYGEN_FALLBACK_INELIGIBLE",
  "HEYGEN_CONFIG_MISSING",
  /** US-8.5 Wan B-roll orchestrator */
  "BROLL_REFERENCE_STILL_MISSING",
  "BROLL_NOT_NEEDED",
  "BROLL_PROVIDER_UNAVAILABLE",
]);

export type VideoJobErrorCode = z.infer<typeof videoJobErrorCodeSchema>;

export const videoJobMutationErrorSchema = z
  .object({
    ok: z.literal(false),
    error: z.object({
      code: videoJobErrorCodeSchema,
      messageKey: z.string().optional(),
      fields: z.record(z.string(), z.array(z.string())).optional(),
    }),
  })
  .strict();

export type VideoJobMutationError = z.infer<typeof videoJobMutationErrorSchema>;

/** Keys rejected on create/retry/HeyGen paths (US-8.4 / US-8.6 / US-8.7 SECURITY). */
export const FORBIDDEN_VIDEO_JOB_AUTHORITY_KEYS = [
  "status",
  "outputUrl",
  "output_url",
  "externalJobId",
  "external_job_id",
  "progressPercent",
  "progress_percent",
  "failureReason",
  "failure_reason",
  "outputMediaAssetId",
  "output_media_asset_id",
  /** Server-resolved only — never client authority (US-8.6 SECURITY). */
  "referenceVideoAssetId",
  "reference_video_asset_id",
  "skipBudgetCheck",
  "skip_budget_check",
  "skipRetryLimit",
  "skip_retry_limit",
  "overrideRetryLimit",
  "override_retry_limit",
  /** US-8.7 — server forces heygen_high / engine / avatar inputs. */
  "providerKey",
  "provider_key",
  "providerTier",
  "provider_tier",
  "tier",
  "engine",
  "heygenEngine",
  "heygen_engine",
  "avatarIv",
  "avatar_iv",
  "avatarV",
  "avatar_v",
  "avatarId",
  "avatar_id",
  "imageUrl",
  "image_url",
  "audioUrl",
  "audio_url",
  "sourceUrl",
  "source_url",
  "forceHeygen",
  "force_heygen",
  "unitCostCents",
  "unit_cost_cents",
  "estimatedCostCents",
  "estimated_cost_cents",
  /** US-8.5 — server-authored B-roll prompt / still; never client authority. */
  "prompt",
  "brollPrompt",
  "broll_prompt",
  "freeformPrompt",
  "freeform_prompt",
  "negativePrompt",
  "negative_prompt",
  "referenceImageAssetId",
  "reference_image_asset_id",
  "referenceStillAssetId",
  "reference_still_asset_id",
  "image",
  "clipCount",
  "clip_count",
  "brollClipCount",
  "broll_clip_count",
  "duration",
  "clipDurationSec",
  "clip_duration_sec",
  /** US-8.9 — session-only operator identity; never client authority. */
  "operatorClientId",
  "operator_client_id",
] as const;

export const createTalkingHeadVideoJobSuccessSchema = z
  .object({
    ok: z.literal(true),
    jobId: z.string().uuid(),
    status: videoJobStatusSchema,
    estimatedCostCents: z.number().int().nonnegative(),
    attempt: z.number().int().min(1),
  })
  .strict();

export type CreateTalkingHeadVideoJobSuccess = z.infer<
  typeof createTalkingHeadVideoJobSuccessSchema
>;

export const retryVideoJobRequestSchema = z
  .object({
    failedJobId: z.string().uuid(),
    confirmRetry: z.literal(true),
    confirmEstimateCents: z.number().int().nonnegative(),
  })
  .strict();

export type RetryVideoJobRequest = z.infer<typeof retryVideoJobRequestSchema>;

export const retryVideoJobSuccessSchema = z
  .object({
    ok: z.literal(true),
    jobId: z.string().uuid(),
    status: videoJobStatusSchema,
    estimatedCostCents: z.number().int().nonnegative(),
    attempt: z.number().int().min(1),
  })
  .strict();

export type RetryVideoJobSuccess = z.infer<typeof retryVideoJobSuccessSchema>;

export type RetryVideoJobResult = RetryVideoJobSuccess | VideoJobMutationError;

export const previewRetryVideoJobEstimateRequestSchema = z
  .object({
    failedJobId: z.string().uuid(),
  })
  .strict();

export const previewRetryVideoJobEstimateSuccessSchema = z
  .object({
    ok: z.literal(true),
    estimatedCostCents: z.number().int().nonnegative(),
    canRetry: z.boolean(),
    retryBlockedReasonKey: z.string().optional(),
  })
  .strict();

export type PreviewRetryVideoJobEstimateRequest = z.infer<
  typeof previewRetryVideoJobEstimateRequestSchema
>;
export type PreviewRetryVideoJobEstimateSuccess = z.infer<
  typeof previewRetryVideoJobEstimateSuccessSchema
>;

export const overrideVideoJobRetryLimitRequestSchema = z
  .object({
    failedJobId: z.string().uuid(),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

export type OverrideVideoJobRetryLimitRequest = z.infer<
  typeof overrideVideoJobRetryLimitRequestSchema
>;

export const overrideVideoJobRetryLimitSuccessSchema = z
  .object({
    ok: z.literal(true),
    overrideId: z.string().uuid(),
  })
  .strict();

export type OverrideVideoJobRetryLimitSuccess = z.infer<
  typeof overrideVideoJobRetryLimitSuccessSchema
>;

export type OverrideVideoJobRetryLimitResult =
  | OverrideVideoJobRetryLimitSuccess
  | VideoJobMutationError;

export const operatorVideoJobStatusDtoSchema = persistedVideoJobStatusSchema
  .extend({
    jobId: z.string().uuid(),
    reelScriptId: z.string().uuid(),
    attempt: z.number().int().min(1),
    regenerationCount: z.number().int().min(0),
    failureReason: z.string().max(2000).nullable(),
    canRetry: z.boolean(),
    retryBlockedReasonKey: z.string().nullable().optional(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type OperatorVideoJobStatusDto = z.infer<
  typeof operatorVideoJobStatusDtoSchema
>;

export const operatorVideoJobSummaryDtoSchema = operatorVideoJobStatusDtoSchema
  .extend({
    cost: operatorProductionJobCostDtoSchema,
  })
  .strict();

export type OperatorVideoJobSummaryDto = z.infer<
  typeof operatorVideoJobSummaryDtoSchema
>;

export const operatorVideoJobsByReelMapSchema = z.record(
  z.string().uuid(),
  operatorVideoJobSummaryDtoSchema.nullable(),
);

export type OperatorVideoJobsByReelMap = z.infer<
  typeof operatorVideoJobsByReelMapSchema
>;

export const applyVideoJobStatusUpdateInputSchema = z
  .object({
    jobId: z.string().uuid(),
    source: videoJobStatusUpdateSourceSchema,
    normalizedStatus: z.object({
      status: videoJobStatusSchema,
      progressPercent: z.number().min(0).max(100).optional(),
      sanitizedErrorMessage: z.string().max(2000).optional(),
      rawOutputUrl: z.string().url().optional(),
    }),
  })
  .strict();

export const applyVideoJobStatusUpdateSuccessSchema = z
  .object({
    ok: z.literal(true),
    jobId: z.string().uuid(),
    status: videoJobStatusSchema,
    idempotent: z.boolean(),
  })
  .strict();

export type ApplyVideoJobStatusUpdateInput = z.infer<
  typeof applyVideoJobStatusUpdateInputSchema
>;
export type ApplyVideoJobStatusUpdateSuccess = z.infer<
  typeof applyVideoJobStatusUpdateSuccessSchema
>;

export const videoJobRetryOverrideRowSchema = z
  .object({
    id: z.string().uuid(),
    clientId: z.string().uuid(),
    reelScriptId: z.string().uuid(),
    failedJobId: z.string().uuid(),
    operatorClientId: z.string().uuid(),
    priorAttempt: z.number().int().min(1),
    reason: z.string().min(1).max(500),
    consumedAt: z.string().datetime({ offset: true }).nullable(),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type VideoJobRetryOverrideRow = z.infer<
  typeof videoJobRetryOverrideRowSchema
>;

/** i18n key stored server-side for stale timeout failures. */
export const VIDEO_JOB_STALE_FAILURE_MESSAGE_KEY =
  "scripts.videoJob.failure.staleTimeout" as const;

/** Low-tier talking-head keys eligible as HeyGen fallback parents (US-8.7). */
export const HEYGEN_FALLBACK_PARENT_PROVIDER_KEYS = [
  "sadtalker_low",
  "musetalk_low",
] as const;

export type HeygenFallbackParentProviderKey =
  (typeof HEYGEN_FALLBACK_PARENT_PROVIDER_KEYS)[number];

/**
 * Operator “Generate with HeyGen” request (US-8.7 Phase B).
 * Server decides high-tier vs fallback force — no provider_key / engine fields.
 */
export const createHeygenTalkingHeadVideoJobRequestSchema = z
  .object({
    reelScriptId: z.string().uuid(),
    clientId: z.string().uuid(),
    targetDurationSec: z.number().int().positive().max(120),
    voiceoverAssetId: z.string().uuid().optional(),
    portraitAssetId: z.string().uuid().optional(),
    confirmEstimateCents: z.number().int().nonnegative(),
  })
  .strict();

export type CreateHeygenTalkingHeadVideoJobRequest = z.infer<
  typeof createHeygenTalkingHeadVideoJobRequestSchema
>;

export const createHeygenTalkingHeadVideoJobSuccessSchema = z
  .object({
    ok: z.literal(true),
    jobId: z.string().uuid(),
    status: videoJobStatusSchema,
    estimatedCostCents: z.number().int().nonnegative(),
    attempt: z.number().int().min(1),
    /** true when created via failed-low-tier fallback (audit row written). */
    usedOperatorFallback: z.boolean(),
  })
  .strict();

export type CreateHeygenTalkingHeadVideoJobSuccess = z.infer<
  typeof createHeygenTalkingHeadVideoJobSuccessSchema
>;

export type CreateHeygenTalkingHeadVideoJobResult =
  | CreateHeygenTalkingHeadVideoJobSuccess
  | VideoJobMutationError;

/** Preview estimate before Operator confirms HeyGen generate (Phase B FE). */
export const previewHeygenTalkingHeadEstimateRequestSchema = z
  .object({
    reelScriptId: z.string().uuid(),
    clientId: z.string().uuid(),
    targetDurationSec: z.number().int().positive().max(120).optional(),
  })
  .strict();

export const previewHeygenTalkingHeadEstimateSuccessSchema = z
  .object({
    ok: z.literal(true),
    estimatedCostCents: z.number().int().nonnegative(),
    unitCostCentsPerSecond: z.number().int().nonnegative(),
    durationSec: z.number().int().positive(),
    eligible: z.boolean(),
    eligibilityPath: z.enum(["high_tier", "operator_fallback", "ineligible"]),
    blockedReasonKey: z.string().optional(),
  })
  .strict();

export type PreviewHeygenTalkingHeadEstimateRequest = z.infer<
  typeof previewHeygenTalkingHeadEstimateRequestSchema
>;
export type PreviewHeygenTalkingHeadEstimateSuccess = z.infer<
  typeof previewHeygenTalkingHeadEstimateSuccessSchema
>;

/** Append-only HeyGen fallback override audit row (US-8.7 Phase B migration). */
export const heygenFallbackOverrideRowSchema = z
  .object({
    id: z.string().uuid(),
    clientId: z.string().uuid(),
    reelScriptId: z.string().uuid(),
    parentJobId: z.string().uuid(),
    newJobId: z.string().uuid().nullable(),
    operatorClientId: z.string().uuid(),
    rationaleKey: z.literal("operator_heygen_fallback"),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type HeygenFallbackOverrideRow = z.infer<
  typeof heygenFallbackOverrideRowSchema
>;

// ─── US-8.5 Wan B-roll orchestrator ─────────────────────────────────────────

/**
 * Operator create B-roll jobs request (US-8.5 Phase B).
 * Server owns provider_key, prompts, reference still, clip count, duration.
 */
export const createBrollVideoJobsRequestSchema = z
  .object({
    reelScriptId: z.string().uuid(),
    clientId: z.string().uuid(),
  })
  .strict();

export type CreateBrollVideoJobsRequest = z.infer<
  typeof createBrollVideoJobsRequestSchema
>;

export const createBrollVideoJobCreatedItemSchema = z
  .object({
    jobId: z.string().uuid(),
    status: videoJobStatusSchema,
    estimatedCostCents: z.number().int().nonnegative(),
    beatIndex: z.number().int().nonnegative(),
    attempt: z.number().int().min(1),
  })
  .strict();

export type CreateBrollVideoJobCreatedItem = z.infer<
  typeof createBrollVideoJobCreatedItemSchema
>;

export const createBrollVideoJobSkippedItemSchema = z
  .object({
    beatIndex: z.number().int().nonnegative(),
    reasonCode: z.enum([
      "BUDGET_EXCEEDED",
      "PROVIDER_UNAVAILABLE",
      "VALIDATION_ERROR",
      "INTERNAL_ERROR",
    ]),
    messageKey: z.string().optional(),
  })
  .strict();

export type CreateBrollVideoJobSkippedItem = z.infer<
  typeof createBrollVideoJobSkippedItemSchema
>;

export const createBrollVideoJobsSuccessSchema = z
  .object({
    ok: z.literal(true),
    jobs: z.array(createBrollVideoJobCreatedItemSchema),
    skipped: z.array(createBrollVideoJobSkippedItemSchema),
    createdCount: z.number().int().nonnegative(),
    skippedCount: z.number().int().nonnegative(),
    /** True when script does not need B-roll — no jobs created (not an error). */
    skippedNoNeedsBroll: z.boolean(),
  })
  .strict();

export type CreateBrollVideoJobsSuccess = z.infer<
  typeof createBrollVideoJobsSuccessSchema
>;

export type CreateBrollVideoJobsResult =
  | CreateBrollVideoJobsSuccess
  | VideoJobMutationError;

/** Preview total B-roll estimate before Operator confirms (optional Phase B). */
export const previewBrollVideoJobsEstimateRequestSchema = z
  .object({
    reelScriptId: z.string().uuid(),
    clientId: z.string().uuid(),
  })
  .strict();

export const previewBrollVideoJobsEstimateSuccessSchema = z
  .object({
    ok: z.literal(true),
    estimatedCostCents: z.number().int().nonnegative(),
    unitCostCentsPerClip: z.number().int().nonnegative(),
    clipCount: z.number().int().nonnegative(),
    needsBroll: z.boolean(),
    providerKey: z
      .enum(["siliconflow_wan21_turbo", "ltx_broll_high"])
      .optional(),
    blockedReasonKey: z.string().optional(),
  })
  .strict();

export type PreviewBrollVideoJobsEstimateRequest = z.infer<
  typeof previewBrollVideoJobsEstimateRequestSchema
>;
export type PreviewBrollVideoJobsEstimateSuccess = z.infer<
  typeof previewBrollVideoJobsEstimateSuccessSchema
>;
