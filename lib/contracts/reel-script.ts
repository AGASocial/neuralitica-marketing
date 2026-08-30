/**
 * Reel script (Paquete de guion) contract (US-5.1).
 * FE imports types only; Zod validation stays server-side.
 */
import { z } from "zod";

import { trendWeekStartSchema } from "@/lib/contracts/trend";
import { visualModalitySchema } from "@/lib/contracts/visual-preferences";

export const reelScriptBrollBeatSchema = z
  .string()
  .trim()
  .min(1)
  .max(300);

/** LLM agent output + persisted package shape (camelCase in TS). */
export const reelScriptPackageSchema = z
  .object({
    hook: z.string().trim().min(1).max(300),
    body: z.string().trim().min(1).max(2000),
    cta: z.string().trim().min(1).max(200),
    onScreenText: z.string().trim().min(1).max(500),
    voiceoverText: z.string().trim().min(1).max(2000),
    targetDurationSec: z.number().int().min(15).max(45),
    brollBeats: z.array(reelScriptBrollBeatSchema).max(8).optional(),
    coldOpenNotes: z.string().trim().min(1).max(500).optional(),
    editingNotes: z.string().trim().min(1).max(1000).optional(),
  })
  .strict();

export type ReelScriptPackage = z.infer<typeof reelScriptPackageSchema>;

export const generateReelScriptsInputSchema = z
  .object({
    weekStart: trendWeekStartSchema,
  })
  .strict();

export const regenerateReelScriptSlotInputSchema = z
  .object({
    weekStart: trendWeekStartSchema,
    slotIndex: z.number().int().min(0).max(6),
  })
  .strict();

export const getReelScriptsForWeekInputSchema = z
  .object({
    weekStart: trendWeekStartSchema,
  })
  .strict();

export type ReelScriptInvoker = "operator" | "system";

export const reelScriptListItemSchema = z
  .object({
    scriptId: z.string().uuid().nullable(),
    slotIndex: z.number().int().min(0).max(6),
    tema: z.string(),
    dayOfWeek: z.string().optional(),
    goal: z.string(),
    formatoPlaybookSlug: z.string(),
    modalidad: visualModalitySchema,
    targetDurationSec: z.number().int().min(15).max(45).nullable(),
    status: z.enum(["pending", "generated"]),
    package: reelScriptPackageSchema.nullable(),
    mustDiscloseNotOwner: z.boolean().nullable(),
  })
  .strict();

export const getReelScriptsForWeekSuccessSchema = z
  .object({
    ok: z.literal(true),
    weekStart: trendWeekStartSchema,
    approvedStrategy: z
      .object({
        id: z.string().uuid(),
        version: z.number().int().positive(),
        status: z.literal("approved"),
      })
      .nullable(),
    strategyVersionChanged: z.boolean(),
    items: z.array(reelScriptListItemSchema),
  })
  .strict();

export const generateReelScriptsSuccessSchema = z
  .object({
    ok: z.literal(true),
    strategyId: z.string().uuid(),
    weekStart: trendWeekStartSchema,
    slotCount: z.number().int().min(1).max(7),
    scriptIds: z.array(z.string().uuid()),
  })
  .strict();

export const regenerateReelScriptSlotSuccessSchema = z
  .object({
    ok: z.literal(true),
    strategyId: z.string().uuid(),
    weekStart: trendWeekStartSchema,
    slotIndex: z.number().int().min(0).max(6),
    scriptId: z.string().uuid(),
  })
  .strict();

export const reelScriptErrorCodeSchema = z.enum([
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "STRATEGY_NOT_APPROVED",
  "SLOT_NOT_FOUND",
  "RATE_LIMITED",
  "GENERATION_IN_FLIGHT",
  "PROFILE_INCOMPLETE",
  "SCRIPT_OUTPUT_INVALID",
  "PROVIDER_UNAVAILABLE",
  "FORBIDDEN_FIELDS",
  "INTERNAL_ERROR",
]);

export type ReelScriptMutationError = {
  ok: false;
  error: {
    code: z.infer<typeof reelScriptErrorCodeSchema>;
    messageKey?: string;
    fields?: Record<string, string[]>;
  };
};
