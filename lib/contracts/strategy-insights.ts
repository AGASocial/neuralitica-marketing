/**
 * Strategy performance insights contract (US-13.2).
 * FE imports types + constants; Zod validation stays server-side.
 */
import { z } from "zod";

import { agentClientIdSchema } from "@/lib/contracts/profile";
import { REEL_METRICS_MAX_VALUE } from "@/lib/contracts/reel-metrics";
import { trendWeekStartSchema } from "@/lib/contracts/trend";

export const STRATEGY_METRICS_LOOKBACK_DAYS = 28;

/** Optional upper bound for summed engagementScore in prompt/FE DTO sanity checks. */
export const STRATEGY_METRICS_MAX_ENGAGEMENT_SCORE =
  5 * REEL_METRICS_MAX_VALUE * 1000;

export const TRUSTED_METRICS_SUMMARY_TAG = "TRUSTED_METRICS_SUMMARY" as const;

export const STRATEGY_INSIGHTS_MAX_TOP_THEMES = 3;

export const strategyInsightRankSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);

export type StrategyInsightRank = z.infer<typeof strategyInsightRankSchema>;

export const strategyPerformanceThemeRowSchema = z
  .object({
    rank: strategyInsightRankSchema,
    tema: z.string().trim().min(1).max(200),
    reelCount: z.number().int().min(0),
    views: z.number().int().min(0).max(REEL_METRICS_MAX_VALUE),
    likes: z.number().int().min(0).max(REEL_METRICS_MAX_VALUE),
    comments: z.number().int().min(0).max(REEL_METRICS_MAX_VALUE),
    saves: z.number().int().min(0).max(REEL_METRICS_MAX_VALUE),
    dms: z.number().int().min(0).max(REEL_METRICS_MAX_VALUE),
    engagementScore: z
      .number()
      .int()
      .min(0)
      .max(STRATEGY_METRICS_MAX_ENGAGEMENT_SCORE),
  })
  .strict();

export type StrategyPerformanceThemeRow = z.infer<
  typeof strategyPerformanceThemeRowSchema
>;

export const strategyPerformanceInsightsDtoSchema = z
  .object({
    available: z.literal(true),
    windowStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    windowEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    topThemes: z
      .array(strategyPerformanceThemeRowSchema)
      .min(1)
      .max(STRATEGY_INSIGHTS_MAX_TOP_THEMES),
  })
  .strict();

export type StrategyPerformanceInsightsDto = z.infer<
  typeof strategyPerformanceInsightsDtoSchema
>;

export const metricsSummaryForPromptRowSchema = z
  .object({
    rank: z.number().int().min(1).max(3),
    reelCount: z.number().int().min(0),
    views: z.number().int().min(0),
    likes: z.number().int().min(0),
    comments: z.number().int().min(0),
    saves: z.number().int().min(0),
    dms: z.number().int().min(0),
    engagementScore: z.number().int().min(0),
    tema: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export type MetricsSummaryForPromptRow = z.infer<
  typeof metricsSummaryForPromptRowSchema
>;

export const metricsSummaryForPromptSchema = z
  .array(metricsSummaryForPromptRowSchema)
  .min(1)
  .max(STRATEGY_INSIGHTS_MAX_TOP_THEMES);

export type MetricsSummaryForPrompt = z.infer<
  typeof metricsSummaryForPromptSchema
>;

export const getStrategyPerformanceInsightsInputSchema = z
  .object({
    clientId: agentClientIdSchema,
    weekStart: trendWeekStartSchema,
  })
  .strict();

export type GetStrategyPerformanceInsightsInput = z.infer<
  typeof getStrategyPerformanceInsightsInputSchema
>;

export const getStrategyPerformanceInsightsSuccessSchema = z
  .object({
    ok: z.literal(true),
    insights: strategyPerformanceInsightsDtoSchema.nullable(),
  })
  .strict();

export const STRATEGY_INSIGHTS_ERROR_CODES = [
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "FORBIDDEN_FIELDS",
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "INTERNAL_ERROR",
] as const;

export type StrategyInsightsErrorCode =
  (typeof STRATEGY_INSIGHTS_ERROR_CODES)[number];

export const strategyInsightsErrorEnvelopeSchema = z
  .object({
    ok: z.literal(false),
    error: z
      .object({
        code: z.enum(STRATEGY_INSIGHTS_ERROR_CODES),
        fields: z.record(z.string(), z.array(z.string())).optional(),
        messageKey: z.string().optional(),
      })
      .strict(),
  })
  .strict();

export const getStrategyPerformanceInsightsResultSchema = z.union([
  getStrategyPerformanceInsightsSuccessSchema,
  strategyInsightsErrorEnvelopeSchema,
]);

export type GetStrategyPerformanceInsightsResult = z.infer<
  typeof getStrategyPerformanceInsightsResultSchema
>;

const FORBIDDEN_STRATEGY_INSIGHTS_READ_KEYS = new Set([
  "role",
  "auth_user_id",
  "topThemes",
  "top_themes",
  "metrics",
  "metricsSummary",
  "metricsSummaryForPrompt",
  "metrics_summary",
  "insights",
  "brief",
  "engagementScore",
  "engagement_score",
  "available",
  "windowStart",
  "windowEnd",
  "reelCount",
  "reel_count",
  "provider_key",
  "envKeyName",
  "tier",
  "status",
  "approved",
]);

export function findForbiddenStrategyInsightsReadKeys(
  raw: unknown,
): string[] {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return [];
  }
  return Object.keys(raw).filter((key) =>
    FORBIDDEN_STRATEGY_INSIGHTS_READ_KEYS.has(key),
  );
}

export const STRATEGY_INSIGHTS_MESSAGE_KEYS = {
  title: "strategy.insights.title",
  empty: "strategy.insights.empty",
  lookbackLabel: "strategy.insights.lookbackLabel",
  calendarHint: "strategy.insights.calendarHint",
  columns: {
    tema: "strategy.insights.columns.tema",
    reelCount: "strategy.insights.columns.reelCount",
    views: "strategy.insights.columns.views",
    likes: "strategy.insights.columns.likes",
    comments: "strategy.insights.columns.comments",
    saves: "strategy.insights.columns.saves",
    dms: "strategy.insights.columns.dms",
    engagementScore: "strategy.insights.columns.engagementScore",
  },
  errors: {
    validation: "strategy.insights.errors.validation",
    notFound: "strategy.insights.errors.notFound",
    forbiddenFields: "strategy.errors.forbiddenFields",
    forbidden: "auth.errors.forbidden",
    unauthenticated: "auth.errors.unauthenticated",
    internal: "strategy.errors.internal",
  },
} as const;

export const GET_STRATEGY_PERFORMANCE_INSIGHTS_ACTION =
  "getStrategyPerformanceInsights" as const;
