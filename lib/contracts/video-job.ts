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

/** Keys rejected on create/retry paths (US-8.4 SECURITY). */
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
  "skipBudgetCheck",
  "skip_budget_check",
  "skipRetryLimit",
  "skip_retry_limit",
  "overrideRetryLimit",
  "override_retry_limit",
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
