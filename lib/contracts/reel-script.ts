/**
 * Reel script (Paquete de guion) contract (US-5.1).
 * FE imports types only; Zod validation stays server-side.
 */
import { z } from "zod";

import {
  reelCostRollupsMapSchema,
  reelWeekCostSummarySchema,
} from "@/lib/contracts/actual-cost";
import { operatorAssemblyJobsByReelMapSchema } from "@/lib/contracts/assembly-job";
import { operatorQaReportsByAssembledReelMapSchema } from "@/lib/contracts/qa-report";
import { voiceoverSummaryByReelMapSchema } from "@/lib/contracts/tts-voiceover";
import { operatorVideoJobsByReelMapSchema } from "@/lib/contracts/video-job";
import { reelCaptionSummarySchema } from "@/lib/contracts/reel-caption";
import { reelScriptReadabilitySchema } from "@/lib/contracts/reel-script-readability";
import { trendWeekStartSchema } from "@/lib/contracts/trend";
import { budgetOverrideFieldsSchema } from "@/lib/contracts/cost-policy";
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
  .merge(budgetOverrideFieldsSchema)
  .strict();

export const regenerateReelScriptSlotInputSchema = z
  .object({
    weekStart: trendWeekStartSchema,
    slotIndex: z.number().int().min(0).max(6),
  })
  .merge(budgetOverrideFieldsSchema)
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
    /** US-5.2: null when pending; server-computed when package present. */
    readability: reelScriptReadabilitySchema.nullable(),
    /** US-6.1: caption summary for Caption tab. */
    caption: reelCaptionSummarySchema,
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
    /** US-7.3 — Operator-only cost block for /operator/scripts. */
    costSummary: reelWeekCostSummarySchema,
    /** US-7.4 — Operator-only per-Reel roll-ups keyed by reelScriptId. */
    reelCostRollups: reelCostRollupsMapSchema,
    /** US-8.4 — Operator-only latest primary video job per reelScriptId. */
    videoJobsByReelScriptId: operatorVideoJobsByReelMapSchema,
    /** US-9.3 — Operator-only latest voiceover asset per reelScriptId. */
    voiceoverByReelScriptId: voiceoverSummaryByReelMapSchema,
    /** US-9.1 — Operator-only latest assembly job per reelScriptId. */
    assemblyByReelScriptId: operatorAssemblyJobsByReelMapSchema,
    /** US-10.1 — Operator-only QA report detail keyed by assembledReelId. */
    qaByAssembledReelId: operatorQaReportsByAssembledReelMapSchema,
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
  "BUDGET_EXCEEDED",
  "COST_POLICY_UNAVAILABLE",
]);

export type ReelScriptMutationError = {
  ok: false;
  error: {
    code: z.infer<typeof reelScriptErrorCodeSchema>;
    messageKey?: string;
    fields?: Record<string, string[]>;
    blockedSlotIndexes?: number[];
    previews?: import("@/lib/contracts/cost-policy").ReelBudgetPreview[];
  };
};

export type ReelScriptErrorCode = z.infer<typeof reelScriptErrorCodeSchema>;
export type ReelScriptListItem = z.infer<typeof reelScriptListItemSchema>;
export type GetReelScriptsForWeekInput = z.infer<
  typeof getReelScriptsForWeekInputSchema
>;
export type GetReelScriptsForWeekSuccess = z.infer<
  typeof getReelScriptsForWeekSuccessSchema
>;
export type GetReelScriptsForWeekResult =
  | GetReelScriptsForWeekSuccess
  | ReelScriptMutationError;
export type GenerateReelScriptsInput = z.infer<
  typeof generateReelScriptsInputSchema
>;
export type GenerateReelScriptsSuccess = z.infer<
  typeof generateReelScriptsSuccessSchema
>;
export type GenerateReelScriptsResult =
  | GenerateReelScriptsSuccess
  | ReelScriptMutationError;
export type RegenerateReelScriptSlotInput = z.infer<
  typeof regenerateReelScriptSlotInputSchema
>;
export type RegenerateReelScriptSlotSuccess = z.infer<
  typeof regenerateReelScriptSlotSuccessSchema
>;
export type RegenerateReelScriptSlotResult =
  | RegenerateReelScriptSlotSuccess
  | ReelScriptMutationError;

export const VIDEO_SCRIPT_GENERATE_AGENT_KEY = "video_script_generate" as const;
export const VIDEO_SCRIPT_RATE_WINDOW_MS = 60 * 60 * 1000;
export const VIDEO_SCRIPT_MAX_JOBS_PER_WINDOW = 5;
export const VIDEO_SCRIPT_IN_FLIGHT_TIMEOUT_MS = 5 * 60 * 1000;
