/**
 * Owner home dashboard (Inicio) contracts — KAN-98.
 * FE may import types; Zod parse stays server-side in loaders.
 */
import { z } from "zod";

export const ownerHomeNextStepKeySchema = z.enum([
  "interview",
  "plan",
  "scripts",
  "videos",
  "approve",
  "ready",
]);

export type OwnerHomeNextStepKey = z.infer<typeof ownerHomeNextStepKeySchema>;

export const ownerHomeCtaKindSchema = z.enum(["open_chat", "href"]);

export const ownerHomeNextActionSchema = z
  .object({
    stepKey: ownerHomeNextStepKeySchema,
    titleKey: z.string().min(1),
    bodyKey: z.string().min(1),
    ctaKey: z.string().min(1),
    ctaKind: ownerHomeCtaKindSchema,
    href: z.string().min(1).optional(),
  })
  .strict();

export type OwnerHomeNextAction = z.infer<typeof ownerHomeNextActionSchema>;

export const ownerHomeWeekCountsSchema = z
  .object({
    scheduled: z.number().int().min(0),
    published: z.number().int().min(0),
    waitingForOk: z.number().int().min(0),
    inProduction: z.number().int().min(0),
  })
  .strict();

export type OwnerHomeWeekCounts = z.infer<typeof ownerHomeWeekCountsSchema>;

export const ownerHomeTrafficLightSchema = z.enum([
  "green",
  "yellow",
  "red",
  "neutral",
]);

export type OwnerHomeTrafficLight = z.infer<typeof ownerHomeTrafficLightSchema>;

export const ownerHomeCampaignProgressSchema = z
  .object({
    completed: z.number().int().min(0),
    total: z.number().int().min(0),
    hasPlan: z.boolean(),
  })
  .strict();

export type OwnerHomeCampaignProgress = z.infer<
  typeof ownerHomeCampaignProgressSchema
>;

export const ownerHomeResultsSchema = z
  .object({
    insightsAvailable: z.literal(false),
  })
  .strict()
  .or(
    z
      .object({
        insightsAvailable: z.literal(true),
        reach: z.number().int().min(0).optional(),
        views: z.number().int().min(0).optional(),
        engagement: z.number().min(0).optional(),
        followerChange: z.number().int().optional(),
      })
      .strict(),
  );

export type OwnerHomeResults = z.infer<typeof ownerHomeResultsSchema>;

export const ownerHomeRecentVideoSchema = z
  .object({
    approvalId: z.string().uuid(),
    captionPreview: z.string().optional(),
    href: z.string().min(1),
  })
  .strict();

export type OwnerHomeRecentVideo = z.infer<typeof ownerHomeRecentVideoSchema>;

export const ownerHomeAtajoSchema = z
  .object({
    id: z.enum([
      "interview",
      "profile",
      "preferences",
      "approvals",
      "readyToPublish",
    ]),
    href: z.string().min(1),
  })
  .strict();

export type OwnerHomeAtajo = z.infer<typeof ownerHomeAtajoSchema>;

export const ownerHomeDashboardDtoSchema = z
  .object({
    weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    lastUpdatedAt: z.string().datetime(),
    nextAction: ownerHomeNextActionSchema,
    weekCounts: ownerHomeWeekCountsSchema,
    trafficLight: ownerHomeTrafficLightSchema,
    campaignProgress: ownerHomeCampaignProgressSchema,
    results: ownerHomeResultsSchema,
    recentVideos: z.array(ownerHomeRecentVideoSchema).max(8),
    atajos: z.array(ownerHomeAtajoSchema).min(1),
  })
  .strict();

export type OwnerHomeDashboardDto = z.infer<typeof ownerHomeDashboardDtoSchema>;
