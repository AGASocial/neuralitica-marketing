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

export const providerCatalogRowSchema = z.object({
  key: z.string().min(1),
  assetRole: assetRoleSchema,
  tier: providerTierSchema,
  active: z.boolean(),
  capabilities: z.record(z.string(), z.unknown()),
  costModel: providerCostModelSchema,
  envKeyName: z.string().min(1),
});

export const createVideoJobInputSchema = z.object({
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

export const synthesizeSpeechInputSchema = z.object({
  reelScriptId: z.string().uuid(),
  clientId: z.string().uuid(),
  providerKey: z.string().min(1),
  text: z.string().min(1).max(50_000),
  voiceId: z.string().min(1),
  locale: supportedLocaleSchema,
});

export const llmCompletionInputSchema = z.object({
  clientId: z.string().uuid(),
  providerKey: z.string().min(1),
  locale: supportedLocaleSchema,
  systemPrompt: z.string().min(1),
  userPrompt: z.string().min(1),
  structuredOutputSchema: z.string().optional(),
});

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
export type CreateVideoJobInput = z.infer<typeof createVideoJobInputSchema>;
export type CreateVideoJobResult = z.infer<typeof createVideoJobResultSchema>;
export type StoredMediaAsset = z.infer<typeof storedMediaAssetSchema>;

/** Default V1 low-tier catalog seed keys (US-X.4). */
export const DEFAULT_LOW_TIER_PROVIDER_KEYS = {
  llm: "siliconflow_deepseek_flash",
  tts: "siliconflow_cosyvoice2",
  talkingHead: "sadtalker_low",
  talkingHeadLoop: "musetalk_low",
  broll: "siliconflow_wan21_turbo",
  manual: "manual",
} as const;
