/**
 * Operator content calendar (Calendario de contenido) contract (US-12.1).
 * FE imports types + constants; Zod validation stays server-side.
 * Cliente calendar (future): separate action — never this aggregate.
 */
import { z } from "zod";

import { approvalStatusSchema } from "@/lib/contracts/approval";
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

/** Sidebar detail — single-fetch superset of card fields (US-12.1 Phase A). */
export const calendarSlotDetailDtoSchema = calendarSlotCardDtoSchema
  .extend({
    strategyId: z.string().uuid(),
    goal: z.string().trim().min(1).max(32),
    approvalStatus: approvalStatusSchema.nullable(),
    /** True when approvalStatus === changes_requested — FE sub-badge on pending color. */
    changesRequested: z.boolean(),
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
