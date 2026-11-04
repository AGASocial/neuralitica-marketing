import { z } from "zod";

import { approvalListItemDtoSchema } from "@/lib/contracts/approval";
import { ownerHomeNextActionSchema } from "@/lib/contracts/owner-home-dashboard";

export const hoyTimelineKindSchema = z.enum([
  "published_or_approved",
  "generated_videos",
  "plan_approved",
  "job_progress",
]);

export const hoyTimelineEntrySchema = z
  .object({
    id: z.string().min(1),
    kind: hoyTimelineKindSchema,
    at: z.string().min(1),
    /** i18n template key under dashboard.hoy.timeline.* */
    messageKey: z.string().min(1),
    params: z.record(z.string()),
  })
  .strict();

export type HoyTimelineEntry = z.infer<typeof hoyTimelineEntrySchema>;

export const hoyNextSlotSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    status: z.enum(["done", "needs_ok", "preparing", "scheduled"]),
    scheduledDate: z.string().optional(),
  })
  .strict();

export type HoyNextSlot = z.infer<typeof hoyNextSlotSchema>;

export const hoyFeedDtoSchema = z
  .object({
    weekStart: z.string().min(1),
    lastUpdatedAt: z.string().min(1),
    pendingApprovals: z.array(approvalListItemDtoSchema),
    /** Pending ids selected into the ≤5 proactive budget (needs_ok). */
    selectedPendingIds: z.array(z.string().uuid()),
    pendingOverflowCount: z.number().int().nonnegative(),
    timeline: z.array(hoyTimelineEntrySchema),
    nextSlots: z.array(hoyNextSlotSchema),
    nextAction: ownerHomeNextActionSchema,
    showNextActionCard: z.boolean(),
    results: z.object({ insightsAvailable: z.literal(false) }).strict(),
  })
  .strict();

export type HoyFeedDto = z.infer<typeof hoyFeedDtoSchema>;
