/**
 * Provider policy engine + Operator recommendation contract (US-7.2).
 * FE imports types and i18n key enums only; Zod validation stays server-side.
 */
import { z } from "zod";

import { reelSpendJobKindSchema } from "@/lib/contracts/cost-policy";
import {
  assetRoleSchema,
  providerTierSchema,
  visualModeSchema,
} from "@/lib/contracts/providers";
import { trendWeekStartSchema } from "@/lib/contracts/trend";
import { visualModalitySchema } from "@/lib/contracts/visual-preferences";

/** Default Reel duration for projection estimates (seconds). */
export const DEFAULT_REEL_DURATION_SEC = 30 as const;

/** Default B-roll clip duration when beat metadata lacks per-clip sec (seconds). */
export const DEFAULT_BROLL_CLIP_SEC = 5 as const;

/** Footnote i18n key on every recommendation DTO. */
export const MANUAL_FALLBACK_NOTE_KEY = "manual_upload_available" as const;

/** Closed enum — FE maps to scripts.providerRecommendation.rationale.* */
export const providerRationaleKeySchema = z.enum([
  "cheapest_active_low_tier",
  "cheapest_active_high_tier",
  "llm_variant_default",
  "llm_variant_fallback",
  "reference_loop_prefers_musetalk",
  "own_avatar_talking_head",
  "generic_avatar_talking_head",
  "faceless_broll_wan",
  "tts_voiceover_required",
  "high_tier_inactive",
  "manual_fallback_operator",
]);

export type ProviderRationaleKey = z.infer<typeof providerRationaleKeySchema>;

export const providerDecisionSchema = z
  .object({
    providerKey: z.string().min(1),
    providerTier: providerTierSchema,
    assetRole: assetRoleSchema,
    estimatedCostCents: z.number().int().nonnegative(),
    displayLabel: z.string().min(1),
    rationaleKey: providerRationaleKeySchema,
  })
  .strict();

export type ProviderDecision = z.infer<typeof providerDecisionSchema>;

export const operatorProviderRecommendationComponentSchema = z
  .object({
    assetRole: assetRoleSchema,
    displayLabel: z.string().min(1),
    providerTier: providerTierSchema,
    estimatedCostCents: z.number().int().nonnegative(),
    rationaleKey: providerRationaleKeySchema,
    providerKey: z.string().min(1).optional(),
  })
  .strict();

export type OperatorProviderRecommendationComponentDto = z.infer<
  typeof operatorProviderRecommendationComponentSchema
>;

export const reelProviderRecommendationSchema = z
  .object({
    reelScriptId: z.string().uuid().nullable(),
    slotIndex: z.number().int().min(0).max(6),
    providerTier: providerTierSchema,
    visualMode: visualModeSchema,
    modalidad: visualModalitySchema,
    components: z.array(operatorProviderRecommendationComponentSchema).min(1),
    projectedTotalCents: z.number().int().nonnegative(),
    manualFallbackNoteKey: z.literal(MANUAL_FALLBACK_NOTE_KEY),
  })
  .strict();

export type ReelProviderRecommendation = z.infer<
  typeof reelProviderRecommendationSchema
>;

export const getReelProviderRecommendationsInputSchema = z
  .object({
    clientId: z.string().uuid(),
    weekStart: trendWeekStartSchema,
    slotIndex: z.number().int().min(0).max(6).optional(),
  })
  .strict();

export type GetReelProviderRecommendationsInput = z.infer<
  typeof getReelProviderRecommendationsInputSchema
>;

export const logProviderDecisionInputSchema = z
  .object({
    clientId: z.string().uuid(),
    reelScriptId: z.string().uuid(),
    jobKind: reelSpendJobKindSchema,
    assetRole: assetRoleSchema,
    providerTier: providerTierSchema,
    providerKey: z.string().min(1),
    estimatedCostCents: z.number().int().nonnegative(),
    rationaleKey: providerRationaleKeySchema,
    operatorClientId: z.string().uuid().nullable().optional(),
  })
  .strict();

export type LogProviderDecisionInput = z.infer<
  typeof logProviderDecisionInputSchema
>;

/** Keys rejected on job-creation / spend paths (US-7.2 [SEC]). */
export const FORBIDDEN_PROVIDER_AUTHORITY_KEYS = [
  "providerKey",
  "provider_key",
  "provider",
  "selectedProvider",
  "providerTier",
  "provider_tier",
  "tier",
  "assetRole",
  "asset_role",
  "estimatedCostCents",
  "estimated_cost_cents",
  "catalogKey",
  "catalogRowId",
  "allowManualFallback",
  "allow_manual_fallback",
  "envKeyName",
  "costModel",
  "cost_model",
  "capabilities",
  "hasReferenceLoop",
  "has_reference_loop",
  "visualMode",
  "visual_mode",
  "modalidad",
  "needsBroll",
  "needs_broll",
] as const;
