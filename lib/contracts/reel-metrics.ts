/**
 * Reel metrics contract (US-13.1 — Operator Metrics Lite V1).
 * FE imports types + constants; Zod validation stays server-side.
 * Calendar read DTO imports snapshot type from here — write schemas stay in this module.
 */
import { z } from "zod";

/** Default edit window — overridable server-side via env, never client input. */
export const REEL_METRICS_EDIT_WINDOW_DAYS = 7;

/** Per-field integer upper bound (views, likes, comments, saves, dms). */
export const REEL_METRICS_MAX_VALUE = 99_999_999;

export const REEL_METRICS_UPSERT_AGENT_KEY = "reel_metrics_upsert" as const;

export const REEL_METRICS_UPSERT_MAX_PER_WINDOW = 30;

export const REEL_METRICS_UPSERT_RATE_WINDOW_MS = 60 * 60 * 1000;

export const UPSERT_REEL_METRICS_ACTION = "upsertReelMetrics" as const;

/** Single metric counter — non-negative integer with sane upper bound. */
export const reelMetricCounterSchema = z
  .number()
  .int("Metric must be an integer")
  .min(0, "Metric must be non-negative")
  .max(
    REEL_METRICS_MAX_VALUE,
    `Metric must be at most ${REEL_METRICS_MAX_VALUE}`,
  );

export type ReelMetricCounter = z.infer<typeof reelMetricCounterSchema>;

/**
 * Coalesce blank FE InputNumber submits to 0 before integer validation.
 * null / undefined / "" → 0; non-numeric strings fail parse.
 */
function coalesceBlankMetricToZero(value: unknown): unknown {
  if (value === null || value === undefined) {
    return 0;
  }
  if (typeof value === "string" && value.trim() === "") {
    return 0;
  }
  return value;
}

const reelMetricCounterInputSchema = z.preprocess(
  coalesceBlankMetricToZero,
  reelMetricCounterSchema,
);

/** Read + success-response snapshot (Sidebar + upsert return). */
export const reelMetricsDtoSchema = z
  .object({
    views: reelMetricCounterSchema,
    likes: reelMetricCounterSchema,
    comments: reelMetricCounterSchema,
    saves: reelMetricCounterSchema,
    dms: reelMetricCounterSchema,
    /** ISO 8601 UTC when persisted; null when no row yet. */
    recordedAt: z.string().datetime().nullable(),
    /** Server-computed UX hint — handler still enforces window on write. */
    editable: z.boolean(),
  })
  .strict();

export type ReelMetricsDto = z.infer<typeof reelMetricsDtoSchema>;

/**
 * Keys rejected before Zod parse on upsert action.
 * Allowlist input: assembledReelId + five counters only.
 */
export const FORBIDDEN_REEL_METRICS_AUTHORITY_KEYS = [
  "clientId",
  "client_id",
  "slotId",
  "slot_id",
  "weekStart",
  "week_start",
  "filter",
  "limit",
  "offset",
  "role",
  "auth_user_id",
  "status",
  "publish_status",
  "publishStatus",
  "pipelineStatus",
  "recorded_at",
  "recordedAt",
  "editable",
  "created_at",
  "createdAt",
  "updated_at",
  "updatedAt",
  "strategyId",
  "strategy_id",
  "reelScriptId",
  "reel_script_id",
  "approvalId",
  "approval_id",
  "published_at",
  "publishedAt",
  "instagram_post_url",
  "instagramPostUrl",
  "storage_key",
  "storageKey",
  "previewUrl",
  "thumbnailPreviewUrl",
  "costCents",
  "estimated_cost_cents",
  "actual_cost_cents",
  "costSummary",
  "reelCostRollups",
  "provider_key",
  "envKeyName",
  "tier",
  "brief",
  "caption",
  "hook",
  "body",
  "cta",
] as const;

export type ForbiddenReelMetricsAuthorityKey =
  (typeof FORBIDDEN_REEL_METRICS_AUTHORITY_KEYS)[number];

export function findForbiddenReelMetricsKeys(raw: unknown): string[] {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return [];
  }
  const forbidden = new Set<string>(FORBIDDEN_REEL_METRICS_AUTHORITY_KEYS);
  return Object.keys(raw).filter((key) => forbidden.has(key));
}

export const upsertReelMetricsInputSchema = z
  .object({
    assembledReelId: z.string().uuid(),
    views: reelMetricCounterInputSchema,
    likes: reelMetricCounterInputSchema,
    comments: reelMetricCounterInputSchema,
    saves: reelMetricCounterInputSchema,
    dms: reelMetricCounterInputSchema,
  })
  .strict();

export type UpsertReelMetricsInput = z.infer<typeof upsertReelMetricsInputSchema>;

export const upsertReelMetricsSuccessSchema = z
  .object({
    ok: z.literal(true),
    metrics: reelMetricsDtoSchema,
  })
  .strict();

export type UpsertReelMetricsSuccess = z.infer<
  typeof upsertReelMetricsSuccessSchema
>;

export const REEL_METRICS_ERROR_CODES = [
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "FORBIDDEN_FIELDS",
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "NOT_PUBLISHED",
  "EDIT_WINDOW_EXPIRED",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
] as const;

export type ReelMetricsErrorCode = (typeof REEL_METRICS_ERROR_CODES)[number];

export const reelMetricsErrorEnvelopeSchema = z
  .object({
    ok: z.literal(false),
    error: z
      .object({
        code: z.enum(REEL_METRICS_ERROR_CODES),
        fields: z.record(z.string(), z.array(z.string())).optional(),
        messageKey: z.string().optional(),
      })
      .strict(),
  })
  .strict();

export type ReelMetricsErrorEnvelope = z.infer<
  typeof reelMetricsErrorEnvelopeSchema
>;

export const upsertReelMetricsResultSchema = z.union([
  upsertReelMetricsSuccessSchema,
  reelMetricsErrorEnvelopeSchema,
]);

export type UpsertReelMetricsResult = z.infer<
  typeof upsertReelMetricsResultSchema
>;

/** i18n keys for metrics validation and gate errors. */
export const REEL_METRICS_MESSAGE_KEYS = {
  notFound: "calendar.metrics.errors.notFound",
  notPublished: "calendar.metrics.errors.notPublished",
  editWindowExpired: "calendar.metrics.errors.editWindowExpired",
  rateLimited: "calendar.metrics.errors.rateLimited",
  validation: "calendar.metrics.errors.validation",
  forbiddenFields: "calendar.errors.forbiddenFields",
} as const;
