import { z } from "zod";

export const automationPresetSchema = z.enum([
  "auto_pilot",
  "review_all",
  "custom",
]);
export type AutomationPreset = z.infer<typeof automationPresetSchema>;

export const automationSettingsSchema = z
  .object({
    clientId: z.string().uuid(),
    preset: automationPresetSchema,
    weeklySpendCapCents: z.number().int().nonnegative().nullable(),
    maxAutoApproveCostCents: z.number().int().nonnegative().nullable(),
    contentTypeRules: z.record(z.string(), z.unknown()).default({}),
    remindAfter24h: z.boolean(),
    remindAfter48hChannelChange: z.boolean(),
    remindAfter72hFallback: z.boolean(),
  })
  .strict();

export type AutomationSettings = z.infer<typeof automationSettingsSchema>;

export const upsertAutomationSettingsInputSchema = z
  .object({
    preset: automationPresetSchema,
    weeklySpendCapCents: z.number().int().nonnegative().nullable().optional(),
    maxAutoApproveCostCents: z
      .number()
      .int()
      .nonnegative()
      .nullable()
      .optional(),
    contentTypeRules: z.record(z.string(), z.unknown()).optional(),
    remindAfter24h: z.boolean().optional(),
    remindAfter48hChannelChange: z.boolean().optional(),
    remindAfter72hFallback: z.boolean().optional(),
  })
  .strict();

export type UpsertAutomationSettingsInput = z.infer<
  typeof upsertAutomationSettingsInputSchema
>;

/** Default when no row exists (Reviso todo). */
export function defaultAutomationSettings(
  clientId: string,
): AutomationSettings {
  return {
    clientId,
    preset: "review_all",
    weeklySpendCapCents: null,
    maxAutoApproveCostCents: null,
    contentTypeRules: {},
    remindAfter24h: true,
    remindAfter48hChannelChange: true,
    remindAfter72hFallback: true,
  };
}

export const automationEventKindSchema = z.enum([
  "would_auto_approve",
  "notify_pending",
  "reminder_24h",
  "reminder_48h",
  "reminder_72h",
  "email_attempt",
  "email_skipped",
]);
export type AutomationEventKind = z.infer<typeof automationEventKindSchema>;
