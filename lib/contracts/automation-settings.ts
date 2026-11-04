import { z } from "zod";

import { visualModalitySchema } from "@/lib/contracts/visual-preferences";

export const automationPresetSchema = z.enum([
  "auto_pilot",
  "review_all",
  "custom",
]);
export type AutomationPreset = z.infer<typeof automationPresetSchema>;

/** Per content type (visual modality) rule for the `custom` preset. */
export const contentTypeRuleSchema = z.enum(["auto", "review"]);
export type ContentTypeRule = z.infer<typeof contentTypeRuleSchema>;
export const automationContentTypeSchema = visualModalitySchema;
export type AutomationContentType = z.infer<typeof automationContentTypeSchema>;
export const AUTOMATION_CONTENT_TYPES = automationContentTypeSchema.options;

export const contentTypeRulesInputSchema = z
  .object({
    own_avatar: contentTypeRuleSchema.optional(),
    generic_avatar: contentTypeRuleSchema.optional(),
    faceless: contentTypeRuleSchema.optional(),
  })
  .strict();

/** Lenient read: unknown keys / values are dropped (treated as `review`). */
export function parseContentTypeRules(
  raw: unknown,
): Partial<Record<AutomationContentType, ContentTypeRule>> {
  const out: Partial<Record<AutomationContentType, ContentTypeRule>> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const type of AUTOMATION_CONTENT_TYPES) {
    const value = (raw as Record<string, unknown>)[type];
    const parsed = contentTypeRuleSchema.safeParse(value);
    if (parsed.success) out[type] = parsed.data;
  }
  return out;
}

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
    contentTypeRules: contentTypeRulesInputSchema.optional(),
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
  "auto_approved",
  "auto_approve_skipped",
  "notify_pending",
  "reminder_24h",
  "reminder_48h",
  "reminder_72h",
  "email_attempt",
  "email_skipped",
]);
export type AutomationEventKind = z.infer<typeof automationEventKindSchema>;
