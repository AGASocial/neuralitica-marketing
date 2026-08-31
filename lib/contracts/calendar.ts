/**
 * Operator content calendar (Calendario de contenido) contract (US-12.1 + US-12.2 + US-13.1).
 * FE imports types + constants; Zod validation stays server-side.
 * Cliente calendar (future): separate action — never this aggregate.
 */
import { z } from "zod";

import { approvalStatusSchema } from "@/lib/contracts/approval";
import { reelMetricsDtoSchema } from "@/lib/contracts/reel-metrics";
import { trendWeekStartSchema } from "@/lib/contracts/trend";

/** Display-only pipeline status for calendar cards (derived at read time). */
export const calendarPipelineStatusSchema = z.enum([
  "draft",
  "generating",
  "qa",
  "pending",
  "approved",
  "published",
]);

export type CalendarPipelineStatus = z.infer<
  typeof calendarPipelineStatusSchema
>;

/** DB column on neuramark_content_calendar_slots — US-12.1 reads; US-12.2 writes `published`. */
export const calendarPublishStatusSchema = z.enum(["ready", "published"]);

export type CalendarPublishStatus = z.infer<typeof calendarPublishStatusSchema>;

/** Authenticated media path — never storage_key or absolute URLs (US-11.1 / US-12.1 SEC). */
export const calendarMediaPreviewPathSchema = z
  .string()
  .regex(/^\/api\/media\/assets\/[0-9a-f-]{36}$/i);

export type CalendarMediaPreviewPath = z.infer<
  typeof calendarMediaPreviewPathSchema
>;

/** Keys rejected before Zod parse on Operator aggregate actions. */
export const FORBIDDEN_CALENDAR_AUTHORITY_KEYS = [
  "clientId",
  "client_id",
  "filter",
  "limit",
  "offset",
  "role",
  "auth_user_id",
  "status",
  "publish_status",
  "publishStatus",
  "slotId",
  "slot_id",
  "strategyId",
  "strategy_id",
  "reelScriptId",
  "reel_script_id",
  "assembledReelId",
  "assembled_reel_id",
  "approvalId",
  "approval_id",
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

export type ForbiddenCalendarAuthorityKey =
  (typeof FORBIDDEN_CALENDAR_AUTHORITY_KEYS)[number];

export function findForbiddenCalendarKeys(raw: unknown): string[] {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return [];
  }
  const forbidden = new Set<string>(FORBIDDEN_CALENDAR_AUTHORITY_KEYS);
  return Object.keys(raw).filter((key) => forbidden.has(key));
}

export const getOperatorCalendarForWeekInputSchema = z
  .object({
    weekStart: trendWeekStartSchema,
  })
  .strict();

export type GetOperatorCalendarForWeekInput = z.infer<
  typeof getOperatorCalendarForWeekInputSchema
>;

export const calendarSlotCardDtoSchema = z
  .object({
    slotId: z.string().uuid(),
    clientId: z.string().uuid(),
    clientDisplayName: z.string().trim().min(1).max(120),
    weekStart: trendWeekStartSchema,
    scheduledDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "scheduledDate must be YYYY-MM-DD"),
    slotIndex: z.number().int().min(0).max(6),
    tema: z.string().trim().min(1).max(200),
    reelScriptId: z.string().uuid().nullable(),
    pipelineStatus: calendarPipelineStatusSchema,
    approvalId: z.string().uuid().nullable(),
    assembledReelId: z.string().uuid().nullable(),
    thumbnailPreviewUrl: calendarMediaPreviewPathSchema.nullable(),
  })
  .strict();

export type CalendarSlotCardDto = z.infer<typeof calendarSlotCardDtoSchema>;

/** Validated Instagram post permalink — HTTPS + www host only (US-12.2 SEC). */
export function isCalendarInstagramPostUrl(value: string): boolean {
  try {
    const parsed = new URL(value.trim());
    return (
      parsed.protocol === "https:" &&
      parsed.hostname === "www.instagram.com" &&
      parsed.pathname.length > 1
    );
  } catch {
    return false;
  }
}

export const calendarInstagramPostUrlSchema = z
  .string()
  .trim()
  .max(500)
  .url()
  .refine(isCalendarInstagramPostUrl, {
    message: "instagramPostUrl must be https://www.instagram.com/...",
  });

export type CalendarInstagramPostUrl = z.infer<
  typeof calendarInstagramPostUrlSchema
>;

/** Stored publish timestamp — UTC noon anchor for calendar date (US-12.2). */
export const calendarPublishedAtDtoSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T12:00:00\.000Z$/,
    "publishedAt must be UTC noon ISO timestamptz",
  );

export type CalendarPublishedAtDto = z.infer<typeof calendarPublishedAtDtoSchema>;

/** Mark-published action input — date-only YYYY-MM-DD (US-12.2). */
export const calendarPublishedAtInputSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "publishedAt must be YYYY-MM-DD")
  .refine(
    (value) => !Number.isNaN(Date.parse(`${value}T12:00:00.000Z`)),
    "publishedAt must be a valid calendar date",
  );

export type CalendarPublishedAtInput = z.infer<
  typeof calendarPublishedAtInputSchema
>;

function normalizeOptionalInstagramPostUrl(
  value: unknown,
): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    return value as string;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** Optional IG URL input — empty/whitespace → null before allowlist parse. */
export const markCalendarSlotPublishedInstagramPostUrlInputSchema = z.preprocess(
  normalizeOptionalInstagramPostUrl,
  calendarInstagramPostUrlSchema.nullable().optional(),
);

/** Sidebar detail — single-fetch superset of card fields (US-12.1 + US-12.2 + US-13.1 metrics). */
export const calendarSlotDetailDtoSchema = calendarSlotCardDtoSchema
  .extend({
    strategyId: z.string().uuid(),
    goal: z.string().trim().min(1).max(32),
    approvalStatus: approvalStatusSchema.nullable(),
    /** True when approvalStatus === changes_requested — FE sub-badge on pending color. */
    changesRequested: z.boolean(),
    publishedAt: calendarPublishedAtDtoSchema.nullable(),
    instagramPostUrl: calendarInstagramPostUrlSchema.nullable(),
    /**
     * Metrics Lite snapshot for published Reels with assembledReelId (US-13.1).
     * null when pipelineStatus !== published or assembledReelId is null.
     */
    metrics: reelMetricsDtoSchema.nullable(),
  })
  .strict();

export type CalendarSlotDetailDto = z.infer<typeof calendarSlotDetailDtoSchema>;

export const clientGapWarningDtoSchema = z
  .object({
    clientId: z.string().uuid(),
    clientDisplayName: z.string().trim().min(1).max(120),
    scheduledCount: z.number().int().min(0).max(7),
    missingCount: z.number().int().min(1).max(3),
  })
  .strict();

export type ClientGapWarningDto = z.infer<typeof clientGapWarningDtoSchema>;

export const calendarClientSummaryDtoSchema = z
  .object({
    clientId: z.string().uuid(),
    clientDisplayName: z.string().trim().min(1).max(120),
  })
  .strict();

export type CalendarClientSummaryDto = z.infer<
  typeof calendarClientSummaryDtoSchema
>;

export const getOperatorCalendarForWeekSuccessSchema = z
  .object({
    ok: z.literal(true),
    weekStart: trendWeekStartSchema,
    /** Active clients with ≥1 slot or a gap warning this week. */
    clients: z.array(calendarClientSummaryDtoSchema),
    slots: z.array(calendarSlotDetailDtoSchema),
    gapWarnings: z.array(clientGapWarningDtoSchema),
    /** Count of active clients with no approved strategy for weekStart (optional summary). */
    clientsWithoutApprovedStrategyCount: z.number().int().min(0),
  })
  .strict();

export type GetOperatorCalendarForWeekSuccess = z.infer<
  typeof getOperatorCalendarForWeekSuccessSchema
>;

export const CALENDAR_ERROR_CODES = [
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "FORBIDDEN_FIELDS",
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "NOT_APPROVED",
  "SLOT_NOT_READY",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
] as const;

export type CalendarErrorCode = (typeof CALENDAR_ERROR_CODES)[number];

export const calendarErrorEnvelopeSchema = z
  .object({
    ok: z.literal(false),
    error: z
      .object({
        code: z.enum(CALENDAR_ERROR_CODES),
        fields: z.record(z.string(), z.array(z.string())).optional(),
        messageKey: z.string().optional(),
      })
      .strict(),
  })
  .strict();

export type CalendarErrorEnvelope = z.infer<typeof calendarErrorEnvelopeSchema>;

export const getOperatorCalendarForWeekResultSchema = z.union([
  getOperatorCalendarForWeekSuccessSchema,
  calendarErrorEnvelopeSchema,
]);

export type GetOperatorCalendarForWeekResult = z.infer<
  typeof getOperatorCalendarForWeekResultSchema
>;

/** Future Cliente calendar — name frozen; NOT implemented in US-12.1. */
export const FUTURE_CLIENT_CALENDAR_ACTION = "getClientCalendarForWeek" as const;

/**
 * Keys rejected before Zod parse on mark-published action (US-12.2).
 * Allowlist input: slotId, publishedAt, instagramPostUrl? only.
 */
export const FORBIDDEN_MARK_PUBLISHED_AUTHORITY_KEYS = [
  "clientId",
  "client_id",
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
  "slot_id",
  "strategyId",
  "strategy_id",
  "reelScriptId",
  "reel_script_id",
  "assembledReelId",
  "assembled_reel_id",
  "approvalId",
  "approval_id",
  "published_at",
  "instagram_post_url",
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

export type ForbiddenMarkPublishedAuthorityKey =
  (typeof FORBIDDEN_MARK_PUBLISHED_AUTHORITY_KEYS)[number];

export function findForbiddenMarkPublishedKeys(raw: unknown): string[] {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return [];
  }
  const forbidden = new Set<string>(FORBIDDEN_MARK_PUBLISHED_AUTHORITY_KEYS);
  return Object.keys(raw).filter((key) => forbidden.has(key));
}

export const MARK_CALENDAR_SLOT_PUBLISHED_ACTION =
  "markCalendarSlotPublished" as const;

export const markCalendarSlotPublishedInputSchema = z
  .object({
    slotId: z.string().uuid(),
    publishedAt: calendarPublishedAtInputSchema,
    instagramPostUrl:
      markCalendarSlotPublishedInstagramPostUrlInputSchema.optional(),
  })
  .strict();

export type MarkCalendarSlotPublishedInput = z.infer<
  typeof markCalendarSlotPublishedInputSchema
>;

export const markCalendarSlotPublishedSuccessSchema = z
  .object({
    ok: z.literal(true),
    slot: calendarSlotDetailDtoSchema,
  })
  .strict();

export type MarkCalendarSlotPublishedSuccess = z.infer<
  typeof markCalendarSlotPublishedSuccessSchema
>;

export const markCalendarSlotPublishedResultSchema = z.union([
  markCalendarSlotPublishedSuccessSchema,
  calendarErrorEnvelopeSchema,
]);

export type MarkCalendarSlotPublishedResult = z.infer<
  typeof markCalendarSlotPublishedResultSchema
>;

/** Rate limit for Operator mark-published writes (US-12.2 SEC). */
export const CALENDAR_MARK_PUBLISHED_AGENT_KEY =
  "calendar_mark_published" as const;

export const CALENDAR_MARK_PUBLISHED_MAX_PER_WINDOW = 30;

export const CALENDAR_MARK_PUBLISHED_RATE_WINDOW_MS = 60 * 60 * 1000;

/** i18n keys for mark-published validation (invalid IG URL uses VALIDATION_ERROR envelope). */
export const CALENDAR_MARK_PUBLISHED_MESSAGE_KEYS = {
  notFound: "calendar.markPublished.errors.notFound",
  notApproved: "calendar.markPublished.errors.notApproved",
  slotNotReady: "calendar.markPublished.errors.slotNotReady",
  rateLimited: "calendar.markPublished.errors.rateLimited",
  invalidIgUrl: "calendar.markPublished.errors.invalidIgUrl",
} as const;
