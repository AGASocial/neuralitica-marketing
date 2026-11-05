import { z } from "zod";

/**
 * Global master prompt (singleton row in neuramark_operator_prompts).
 */
export const operatorPromptsRowSchema = z.object({
  id: z.string().uuid(),
  globalMasterPrompt: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type OperatorPromptsRow = z.infer<typeof operatorPromptsRowSchema>;

/**
 * Per-business master prompt (one row per client in neuramark_business_prompts).
 */
export const businessPromptsRowSchema = z.object({
  id: z.string().uuid(),
  clientId: z.string().uuid(),
  businessMasterPrompt: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type BusinessPromptsRow = z.infer<typeof businessPromptsRowSchema>;

/**
 * Result from loadMasterPrompts({ clientId }).
 */
export const masterPromptsResultSchema = z.object({
  global: z.string().nullable(),
  business: z.string().nullable(),
});

export type MasterPromptsResult = z.infer<typeof masterPromptsResultSchema>;

/**
 * Server action input for updating global master prompt.
 */
export const updateGlobalMasterPromptInputSchema = z.object({
  globalMasterPrompt: z.string().max(4000),
});

export type UpdateGlobalMasterPromptInput = z.infer<
  typeof updateGlobalMasterPromptInputSchema
>;

/**
 * Server action input for updating business master prompt.
 */
export const updateBusinessMasterPromptInputSchema = z.object({
  clientId: z.string().uuid(),
  businessMasterPrompt: z.string().max(4000),
});

export type UpdateBusinessMasterPromptInput = z.infer<
  typeof updateBusinessMasterPromptInputSchema
>;

/**
 * Generic success/error result for prompt update actions.
 */
export type PromptUpdateResult =
  | { ok: true }
  | { ok: false; error: { code: string; messageKey?: string } };
