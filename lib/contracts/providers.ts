/**
 * Zod mirrors of lib/providers/provider-adapters.ts (US-X.4 contract).
 * Import types from here in FE-safe modules; validate on the server at boundaries.
 */
import { z } from "zod";

export const providerTierSchema = z.enum(["low", "high"]);
export const assetRoleSchema = z.enum(["llm", "tts", "talking_head", "broll"]);
export const videoJobStatusSchema = z.enum([
  "queued",
  "processing",
  "completed",
  "failed",
  "cancelled",
]);
export const videoAssetRoleSchema = z.enum(["primary", "broll"]);
export const visualModeSchema = z.enum(["own_avatar", "generic_avatar", "faceless"]);
export const supportedLocaleSchema = z.enum(["en", "es"]);
export const costBillingUnitSchema = z.enum([
  "per_run",
  "per_second",
  "per_clip",
  "per_1m_tokens",
  "per_1m_chars",
]);

export const providerCostModelSchema = z.object({
  billingUnit: costBillingUnitSchema,
  unitCostCents: z.number().int().nonnegative(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const envKeyNameSchema = z
  .string()
  .min(1)
  .regex(/^[A-Z][A-Z0-9_]+$/, "envKeyName must be UPPER_SNAKE_CASE")
  .refine((v) => !v.startsWith("NEXT_PUBLIC_"), "NEXT_PUBLIC_* forbidden");

export const llmVariantSchema = z.enum(["default", "fallback"]);
export type LlmVariant = z.infer<typeof llmVariantSchema>;

/** Closed enum — FE maps to scripts.providerRecommendation.rationale.* (US-7.2). */
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

export const providerCatalogRowSchema = z.object({
  key: z.string().min(1),
  assetRole: assetRoleSchema,
  tier: providerTierSchema,
  active: z.boolean(),
  capabilities: z.record(z.string(), z.unknown()),
  costModel: providerCostModelSchema,
  envKeyName: envKeyNameSchema,
});

export const costPolicyRowSchema = z.object({
  id: z.string().uuid(),
  clientId: z.string().uuid().nullable(),
  providerTier: providerTierSchema,
  maxCostCents: z.number().int().positive(),
  rules: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

export type CostPolicyRow = z.infer<typeof costPolicyRowSchema>;

export const providerCatalogSuccessSchema = z.object({
  providers: z.array(providerCatalogRowSchema),
});

export const providerCatalogLoadFailedSchema = z.object({
  providers: z.array(providerCatalogRowSchema).length(0),
  loadFailed: z.literal(true),
});

export type ProviderCatalogResult =
  | z.infer<typeof providerCatalogSuccessSchema>
  | z.infer<typeof providerCatalogLoadFailedSchema>;

export const defaultCostPolicySuccessSchema = z.object({
  policy: costPolicyRowSchema,
});

export const defaultCostPolicyLoadFailedSchema = z.object({
  policy: z.null(),
  loadFailed: z.literal(true),
});

export type DefaultCostPolicyResult =
  | z.infer<typeof defaultCostPolicySuccessSchema>
  | z.infer<typeof defaultCostPolicyLoadFailedSchema>;

/** Error codes for provider catalog / cost policy loaders and resolver. */
export const PROVIDER_CATALOG_ROW_INVALID = "PROVIDER_CATALOG_ROW_INVALID" as const;
export const PROVIDER_CATALOG_LOAD_FAILED = "PROVIDER_CATALOG_LOAD_FAILED" as const;
export const COST_POLICY_ROW_INVALID = "COST_POLICY_ROW_INVALID" as const;
export const COST_POLICY_GLOBAL_MISSING = "COST_POLICY_GLOBAL_MISSING" as const;
export const COST_POLICY_LOAD_FAILED = "COST_POLICY_LOAD_FAILED" as const;
export const PROVIDER_NOT_FOUND = "PROVIDER_NOT_FOUND" as const;

/** Client/handler request — provider assigned by policy engine (US-7.2). */
export const createVideoJobRequestSchema = z
  .object({
    reelScriptId: z.string().uuid(),
    clientId: z.string().uuid(),
    targetDurationSec: z.number().int().positive().max(120),
    voiceoverAssetId: z.string().uuid().optional(),
    portraitAssetId: z.string().uuid().optional(),
    referenceVideoAssetId: z.string().uuid().optional(),
    prompt: z.string().max(4000).optional(),
    referenceImageAssetId: z.string().uuid().optional(),
  })
  .strict();

/** Internal adapter input — engine sets providerKey/tier/role after resolveProviderForJob. */
export const resolvedCreateVideoJobInputSchema = z.object({
  reelScriptId: z.string().uuid(),
  clientId: z.string().uuid(),
  providerKey: z.string().min(1),
  providerTier: providerTierSchema,
  assetRole: videoAssetRoleSchema,
  targetDurationSec: z.number().int().positive().max(120),
  voiceoverAssetId: z.string().uuid().optional(),
  portraitAssetId: z.string().uuid().optional(),
  referenceVideoAssetId: z.string().uuid().optional(),
  prompt: z.string().max(4000).optional(),
  referenceImageAssetId: z.string().uuid().optional(),
});

/** @deprecated Use createVideoJobRequestSchema at boundaries; resolvedCreateVideoJobInputSchema internally. */
export const createVideoJobInputSchema = resolvedCreateVideoJobInputSchema;

export const createVideoJobResultSchema = z.object({
  externalJobId: z.string().min(1),
  status: videoJobStatusSchema,
  estimatedCostCents: z.number().int().nonnegative(),
});

export const videoJobStatusResultSchema = z.object({
  status: videoJobStatusSchema,
  progressPercent: z.number().min(0).max(100).optional(),
  sanitizedErrorMessage: z.string().max(2000).optional(),
  rawOutputUrl: z.string().url().optional(),
});

export const storedMediaAssetSchema = z.object({
  storageKey: z.string().min(1),
  mimeType: z.string().min(1),
  durationSec: z.number().positive().optional(),
  sizeBytes: z.number().int().nonnegative(),
  actualCostCents: z.number().int().nonnegative(),
});

/** Client/handler request — provider assigned by policy engine (US-7.2). */
export const synthesizeSpeechRequestSchema = z
  .object({
    reelScriptId: z.string().uuid(),
    clientId: z.string().uuid(),
    text: z.string().min(1).max(50_000),
    voiceId: z.string().min(1),
    locale: supportedLocaleSchema,
  })
  .strict();

/** Internal adapter input — engine sets providerKey after resolveProviderForJob. */
export const resolvedSynthesizeSpeechInputSchema = z.object({
  reelScriptId: z.string().uuid(),
  clientId: z.string().uuid(),
  providerKey: z.string().min(1),
  text: z.string().min(1).max(50_000),
  voiceId: z.string().min(1),
  locale: supportedLocaleSchema,
});

/** @deprecated Use synthesizeSpeechRequestSchema at boundaries; resolvedSynthesizeSpeechInputSchema internally. */
export const synthesizeSpeechInputSchema = resolvedSynthesizeSpeechInputSchema;

/** Internal adapter input — engine sets providerKey after resolveProviderForJob. */
export const resolvedLlmCompletionInputSchema = z.object({
  clientId: z.string().uuid(),
  providerKey: z.string().min(1),
  locale: supportedLocaleSchema,
  systemPrompt: z.string().min(1),
  userPrompt: z.string().min(1),
  structuredOutputSchema: z.string().optional(),
});

/** @deprecated Use resolvedLlmCompletionInputSchema; providerKey is server-assigned. */
export const llmCompletionInputSchema = resolvedLlmCompletionInputSchema;

export const llmCompletionResultSchema = z.object({
  content: z.string(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  actualCostCents: z.number().int().nonnegative(),
});

export type ProviderTier = z.infer<typeof providerTierSchema>;
export type AssetRole = z.infer<typeof assetRoleSchema>;
export type VideoJobStatus = z.infer<typeof videoJobStatusSchema>;
export type VideoAssetRole = z.infer<typeof videoAssetRoleSchema>;
export type VisualMode = z.infer<typeof visualModeSchema>;
export type SupportedLocale = z.infer<typeof supportedLocaleSchema>;
export type CostBillingUnit = z.infer<typeof costBillingUnitSchema>;
export type ProviderCostModel = z.infer<typeof providerCostModelSchema>;
export type ProviderCatalogRow = z.infer<typeof providerCatalogRowSchema>;
export type CreateVideoJobRequest = z.infer<typeof createVideoJobRequestSchema>;
export type ResolvedCreateVideoJobInput = z.infer<
  typeof resolvedCreateVideoJobInputSchema
>;
export type CreateVideoJobInput = ResolvedCreateVideoJobInput;
export type SynthesizeSpeechRequest = z.infer<
  typeof synthesizeSpeechRequestSchema
>;
export type ResolvedSynthesizeSpeechInput = z.infer<
  typeof resolvedSynthesizeSpeechInputSchema
>;
export type CreateVideoJobResult = z.infer<typeof createVideoJobResultSchema>;
export type StoredMediaAsset = z.infer<typeof storedMediaAssetSchema>;

/** Default V1 low-tier catalog seed keys (US-X.4). */
export const DEFAULT_LOW_TIER_PROVIDER_KEYS = {
  llm: "siliconflow_deepseek_flash",
  llmFallback: "siliconflow_qwen",
  tts: "siliconflow_cosyvoice2",
  talkingHead: "sadtalker_low",
  talkingHeadLoop: "musetalk_low",
  broll: "siliconflow_wan21_turbo",
  manual: "manual",
} as const;

/** All 10 V1 catalog seed keys (7 low active + 3 high inactive). */
export const V1_CATALOG_SEED_KEYS = [
  DEFAULT_LOW_TIER_PROVIDER_KEYS.llm,
  DEFAULT_LOW_TIER_PROVIDER_KEYS.llmFallback,
  DEFAULT_LOW_TIER_PROVIDER_KEYS.tts,
  DEFAULT_LOW_TIER_PROVIDER_KEYS.talkingHead,
  DEFAULT_LOW_TIER_PROVIDER_KEYS.talkingHeadLoop,
  DEFAULT_LOW_TIER_PROVIDER_KEYS.broll,
  DEFAULT_LOW_TIER_PROVIDER_KEYS.manual,
  "heygen_high",
  "ltx_broll_high",
  "elevenlabs_tts_high",
] as const;
