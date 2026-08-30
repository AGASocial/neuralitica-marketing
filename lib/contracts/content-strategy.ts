/**
 * Weekly content strategy (Estrategia semanal) contract (US-4.1).
 * FE imports types only; Zod validation stays server-side.
 */
import { z } from "zod";

import { playbookSlugSchema } from "@/lib/contracts/playbook";
import { trendWeekStartSchema } from "@/lib/contracts/trend";
import { visualModalitySchema } from "@/lib/contracts/visual-preferences";

export const contentStrategyStatusSchema = z.enum(["draft", "approved"]);
export type ContentStrategyStatus = z.infer<typeof contentStrategyStatusSchema>;

export const contentStrategySlotGoalSchema = z.enum([
  "trust",
  "education",
  "local_sale",
  "inbound_dm",
]);
export type ContentStrategySlotGoal = z.infer<
  typeof contentStrategySlotGoalSchema
>;

export const contentStrategyDayOfWeekSchema = z.enum([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]);
export type ContentStrategyDayOfWeek = z.infer<
  typeof contentStrategyDayOfWeekSchema
>;

export const contentStrategySlotSchema = z
  .object({
    slotIndex: z.number().int().min(0).max(6),
    dayOfWeek: contentStrategyDayOfWeekSchema.optional(),
    tema: z.string().trim().min(1).max(200),
    angle: z.string().trim().min(1).max(300).optional(),
    goal: contentStrategySlotGoalSchema,
    formatoPlaybookSlug: playbookSlugSchema,
    modalidad: visualModalitySchema,
    tacticaTendenciaSlug: playbookSlugSchema.optional(),
    ctaHint: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export type ContentStrategySlot = z.infer<typeof contentStrategySlotSchema>;

export const contentStrategyBriefSchema = z
  .object({
    pillars: z.array(z.string().trim().min(1).max(80)).min(1).max(8),
    themes: z.array(z.string().trim().min(1).max(200)).min(1).max(8),
    slots: z.array(contentStrategySlotSchema).min(3).max(7),
  })
  .strict()
  .superRefine((brief, ctx) => {
    const indices = brief.slots.map((s) => s.slotIndex);
    if (new Set(indices).size !== indices.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Duplicate slotIndex values",
        path: ["slots"],
      });
    }
  });

export type ContentStrategyBrief = z.infer<typeof contentStrategyBriefSchema>;

export const generateContentStrategyInputSchema = z
  .object({
    weekStart: trendWeekStartSchema,
  })
  .strict();

export type GenerateContentStrategyInput = z.infer<
  typeof generateContentStrategyInputSchema
>;

export const generateContentStrategySuccessSchema = z
  .object({
    ok: z.literal(true),
    strategyId: z.string().uuid(),
    clientId: z.string().uuid(),
    weekStart: trendWeekStartSchema,
    version: z.number().int().positive(),
    status: z.literal("draft"),
    slotCount: z.number().int().min(3).max(7),
  })
  .strict();

export const contentStrategyDraftViewSchema = z
  .object({
    id: z.string().uuid(),
    clientId: z.string().uuid(),
    weekStart: trendWeekStartSchema,
    version: z.number().int().positive(),
    status: contentStrategyStatusSchema,
    brief: contentStrategyBriefSchema,
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const getLatestContentStrategyInputSchema = z
  .object({
    weekStart: trendWeekStartSchema,
  })
  .strict();

export const getLatestContentStrategyFoundSchema = z
  .object({
    ok: z.literal(true),
    strategy: contentStrategyDraftViewSchema,
    playbookLabels: z.record(playbookSlugSchema, z.string().max(120)).optional(),
  })
  .strict();

export const getLatestContentStrategyEmptySchema = z
  .object({
    ok: z.literal(true),
    strategy: z.null(),
  })
  .strict();

export type GenerateContentStrategySuccess = z.infer<
  typeof generateContentStrategySuccessSchema
>;

export type ContentStrategyDraftView = z.infer<
  typeof contentStrategyDraftViewSchema
>;

export type GetLatestContentStrategyInput = z.infer<
  typeof getLatestContentStrategyInputSchema
>;

export type GetLatestContentStrategyResult =
  | z.infer<typeof getLatestContentStrategyFoundSchema>
  | z.infer<typeof getLatestContentStrategyEmptySchema>;

export type GenerateContentStrategyResult =
  | GenerateContentStrategySuccess
  | ContentStrategyMutationError;

export type ContentStrategyInvoker = "operator" | "system";

export const CONTENT_STRATEGY_AGENT_KEY = "content_strategy_generate" as const;
export const CONTENT_STRATEGY_RATE_WINDOW_MS = 60 * 60 * 1000;
export const CONTENT_STRATEGY_MAX_GENERATES_PER_WINDOW = 3;
export const CONTENT_STRATEGY_IN_FLIGHT_TIMEOUT_MS = 5 * 60 * 1000;

export const contentStrategyErrorCodeSchema = z.enum([
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "RATE_LIMITED",
  "GENERATION_IN_FLIGHT",
  "PROFILE_INCOMPLETE",
  "AGENT_OUTPUT_INVALID",
  "PROVIDER_UNAVAILABLE",
  "FORBIDDEN_FIELDS",
  "INTERNAL_ERROR",
]);

export type ContentStrategyErrorCode = z.infer<
  typeof contentStrategyErrorCodeSchema
>;

export type ContentStrategyMutationError = {
  ok: false;
  error: {
    code: ContentStrategyErrorCode;
    messageKey?: string;
    fields?: Record<string, string[]>;
  };
};

export type BriefAllowlistContext = {
  playbookSlugs: ReadonlySet<string>;
  trendSlugs: ReadonlySet<string>;
  allowedModalidades: ReadonlySet<string>;
};

export type BriefAllowlistViolation = {
  path: string;
  code:
    | "INVALID_PLAYBOOK_SLUG"
    | "INVALID_TREND_SLUG"
    | "MODALIDAD_NOT_ALLOWED";
};

/**
 * Pure validation after Zod parse. Returns [] when valid.
 */
export function validateBriefAgainstAllowlists(
  brief: ContentStrategyBrief,
  ctx: BriefAllowlistContext,
): BriefAllowlistViolation[] {
  const violations: BriefAllowlistViolation[] = [];

  for (let i = 0; i < brief.slots.length; i++) {
    const slot = brief.slots[i]!;

    if (!ctx.playbookSlugs.has(slot.formatoPlaybookSlug)) {
      violations.push({
        path: `slots.${i}.formatoPlaybookSlug`,
        code: "INVALID_PLAYBOOK_SLUG",
      });
    }

    if (
      slot.tacticaTendenciaSlug !== undefined &&
      !ctx.trendSlugs.has(slot.tacticaTendenciaSlug)
    ) {
      violations.push({
        path: `slots.${i}.tacticaTendenciaSlug`,
        code: "INVALID_TREND_SLUG",
      });
    }

    if (!ctx.allowedModalidades.has(slot.modalidad)) {
      violations.push({
        path: `slots.${i}.modalidad`,
        code: "MODALIDAD_NOT_ALLOWED",
      });
    }
  }

  return violations;
}

export function allowlistViolationsToFields(
  violations: BriefAllowlistViolation[],
): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const violation of violations) {
    fields[violation.path] = [...(fields[violation.path] ?? []), violation.code];
  }
  return fields;
}
