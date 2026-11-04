/**
 * Owner setup completion (KAN-99).
 */
import { z } from "zod";

export const setupStepIdSchema = z.enum([
  "business_profile",
  "interview",
  "visual_preferences",
  "instagram_connected",
  "plan_approved",
  "presenter_avatar",
]);

export type SetupStepId = z.infer<typeof setupStepIdSchema>;

export const setupStepCtaKindSchema = z.enum(["href", "open_chat"]);

export const setupStepSchema = z
  .object({
    id: setupStepIdSchema,
    done: z.boolean(),
    required: z.boolean(),
    ctaKind: setupStepCtaKindSchema,
    href: z.string().min(1).optional(),
  })
  .strict();

export type SetupStep = z.infer<typeof setupStepSchema>;

export const setupCompletionDtoSchema = z
  .object({
    percentComplete: z.number().int().min(0).max(100),
    requiredDone: z.number().int().min(0),
    requiredTotal: z.number().int().min(1),
    steps: z.array(setupStepSchema).min(1),
  })
  .strict();

export type SetupCompletionDto = z.infer<typeof setupCompletionDtoSchema>;

export const REQUIRED_SETUP_STEP_IDS = [
  "business_profile",
  "interview",
  "visual_preferences",
  "instagram_connected",
  "plan_approved",
] as const satisfies readonly SetupStepId[];
