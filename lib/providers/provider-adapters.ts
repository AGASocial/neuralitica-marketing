/**
 * Provider adapter interfaces (US-8.1, US-X.4).
 *
 * Server-only module: import only from Route Handlers, Server Actions, and
 * server helpers — never from Client Components.
 *
 * Swapping vendors = new adapter class + catalog row + env var.
 * Assembly (US-9.x), approval, and FE flows stay unchanged.
 */
import "server-only";

import type {
  AssetRole,
  CreateVideoJobInput,
  CreateVideoJobResult,
  ExternalJobId,
  LlmVariant,
  ProviderCatalogRow,
  ProviderTier,
  StoredMediaAsset,
  SupportedLocale,
  VideoAssetRole,
  VideoJobStatus,
} from "../contracts/providers";
import {
  DEFAULT_LOW_TIER_PROVIDER_KEYS,
  PROVIDER_ADAPTER_NOT_FOUND,
  PROVIDER_NOT_FOUND,
} from "../contracts/providers";
import { rankCatalogCandidatesByCost } from "./rank-catalog-candidates-by-cost";

export type {
  AssetRole,
  CreateVideoJobInput,
  CreateVideoJobResult,
  ExternalJobId,
  LlmVariant,
  ProviderCatalogRow,
  ProviderTier,
  StoredMediaAsset,
  SupportedLocale,
  VideoAssetRole,
  VideoJobStatus,
} from "../contracts/providers";

export {
  DEFAULT_LOW_TIER_PROVIDER_KEYS,
  PROVIDER_ADAPTER_NOT_FOUND,
  PROVIDER_NOT_FOUND,
  assetRoleSchema,
  costBillingUnitSchema,
  llmVariantSchema,
  providerTierSchema,
  supportedLocaleSchema,
  videoAssetRoleSchema,
  videoJobStatusSchema,
  visualModeSchema,
} from "../contracts/providers";

export const PROVIDER_TIERS = ["low", "high"] as const;
export const ASSET_ROLES = ["llm", "tts", "talking_head", "broll"] as const;
export const VIDEO_JOB_STATUSES = [
  "queued",
  "processing",
  "completed",
  "failed",
  "cancelled",
] as const;
export const VIDEO_ASSET_ROLES = ["primary", "broll"] as const;
export const VISUAL_MODES = ["own_avatar", "generic_avatar", "faceless"] as const;
export const SUPPORTED_LOCALES = ["en", "es"] as const;

export type VisualMode = "own_avatar" | "generic_avatar" | "faceless";
export type CostBillingUnit =
  | "per_run"
  | "per_second"
  | "per_clip"
  | "per_1m_tokens"
  | "per_1m_chars";

export interface CostEstimate {
  estimatedCostCents: number;
  currency: "USD";
  providerKey: string;
  breakdown?: Record<string, number>;
}

export interface ResolveProviderContext {
  assetRole: AssetRole;
  tier: ProviderTier;
  visualMode?: VisualMode;
  /** True when generic_avatar has a reference video loop (may prefer MuseTalk). */
  hasReferenceLoop?: boolean;
  needsBroll?: boolean;
  /** When assetRole is "llm" and multiple active rows share tier, pick by variant. */
  llmVariant?: LlmVariant;
  /** When true, allows selecting rows with capabilities.manualFallback === true. Default false. */
  allowManualFallback?: boolean;
}

export class ProviderResolveError extends Error {
  readonly code = PROVIDER_NOT_FOUND;

  constructor(
    public readonly assetRole: AssetRole,
    public readonly tier: ProviderTier,
    public readonly llmVariant?: LlmVariant,
  ) {
    super(`No active provider for assetRole=${assetRole} tier=${tier}`);
    this.name = "ProviderResolveError";
  }
}

export class ProviderAdapterNotFoundError extends Error {
  readonly code = PROVIDER_ADAPTER_NOT_FOUND;

  constructor(public readonly providerKey: string) {
    super(`Video adapter not registered: ${providerKey}`);
    this.name = "ProviderAdapterNotFoundError";
  }
}

export class RegistryFrozenError extends Error {
  readonly code = "REGISTRY_FROZEN" as const;

  constructor() {
    super("Provider registry is frozen");
    this.name = "RegistryFrozenError";
  }
}

export {
  INVALID_PROVIDER_OUTPUT_URL,
  ProviderAdapterError,
} from "./normalize-provider-response";

/**
 * Lookup a catalog row by key (explicit selection / policy override).
 */
export function getCatalogRowByKey(
  catalog: readonly ProviderCatalogRow[],
  key: string,
): ProviderCatalogRow | undefined {
  return catalog.find((row) => row.key === key);
}

/**
 * Pick the active catalog row for an asset role at the given tier.
 * Throws ProviderResolveError if no matching active row exists (caller maps to 503 / operator message).
 */
export function resolveProvider(
  catalog: readonly ProviderCatalogRow[],
  context: ResolveProviderContext,
): ProviderCatalogRow {
  const allowManual = context.allowManualFallback === true;

  const candidates = catalog.filter(
    (row) =>
      row.active &&
      row.tier === context.tier &&
      row.assetRole === context.assetRole &&
      (allowManual || row.capabilities.manualFallback !== true),
  );

  if (candidates.length === 0) {
    throw new ProviderResolveError(
      context.assetRole,
      context.tier,
      context.llmVariant,
    );
  }

  if (context.assetRole === "talking_head" && context.hasReferenceLoop) {
    const loopPreferred = candidates.find(
      (r) => r.capabilities.prefersReferenceLoop === true,
    );
    if (loopPreferred) return loopPreferred;
  }

  let resolvedCandidates = candidates;

  if (context.assetRole === "talking_head" && !context.hasReferenceLoop) {
    const nonLoop = candidates.filter(
      (row) => row.capabilities.prefersReferenceLoop !== true,
    );
    if (nonLoop.length > 0) {
      resolvedCandidates = nonLoop;
    }
  }

  if (context.assetRole === "llm" && resolvedCandidates.length > 1) {
    const targetKey =
      context.llmVariant === "fallback"
        ? DEFAULT_LOW_TIER_PROVIDER_KEYS.llmFallback
        : DEFAULT_LOW_TIER_PROVIDER_KEYS.llm;
    const matched = resolvedCandidates.find((row) => row.key === targetKey);
    if (!matched) {
      throw new ProviderResolveError(
        context.assetRole,
        context.tier,
        context.llmVariant,
      );
    }
    return matched;
  }

  return rankCatalogCandidatesByCost(resolvedCandidates)[0]!;
}

/**
 * Normalized status from vendor — treat all fields as untrusted (US-8.1 [SEC]).
 * `rawOutputUrl` is transient for server-side download only; do not persist.
 */
export interface VideoJobStatusResult {
  status: VideoJobStatus;
  progressPercent?: number;
  sanitizedErrorMessage?: string;
  rawOutputUrl?: string;
}

/**
 * Contract every video vendor adapter must implement.
 * Method names match US-8.1 acceptance criteria.
 */
export interface VideoProviderAdapter {
  readonly providerKey: string;
  readonly videoAssetRole: VideoAssetRole;

  estimateCost(input: CreateVideoJobInput): Promise<CostEstimate>;

  createJob(input: CreateVideoJobInput): Promise<CreateVideoJobResult>;

  getJobStatus(externalJobId: ExternalJobId): Promise<VideoJobStatusResult>;

  /**
   * Download provider output and persist under our storage layer.
   * `rawOutputUrl` comes from getJobStatus when the vendor returns a URL.
   * `jobContext` is required for stateless poller paths (US-8.4 L1).
   */
  fetchAsset(
    externalJobId: ExternalJobId,
    rawOutputUrl?: string,
    jobContext?: { clientId: string; reelScriptId: string },
  ): Promise<StoredMediaAsset>;
}

// ---------------------------------------------------------------------------
// TTS provider adapter (US-9.3)
// ---------------------------------------------------------------------------

export interface SynthesizeSpeechInput {
  reelScriptId: string;
  clientId: string;
  providerKey: string;
  text: string;
  voiceId: string;
  locale: SupportedLocale;
}

export interface TtsProviderAdapter {
  readonly providerKey: string;

  estimateCost(input: SynthesizeSpeechInput): Promise<CostEstimate>;

  synthesize(input: SynthesizeSpeechInput): Promise<StoredMediaAsset>;
}

// ---------------------------------------------------------------------------
// LLM provider adapter (US-4.x, US-5.x, US-6.x, US-10.x)
// ---------------------------------------------------------------------------

export interface LlmCompletionInput {
  clientId: string;
  providerKey: string;
  locale: SupportedLocale;
  systemPrompt: string;
  userPrompt: string;
  /** When set, adapter must return JSON matching the named contract schema. */
  structuredOutputSchema?: string;
}

export interface LlmCompletionResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  actualCostCents: number;
}

export interface LlmProviderAdapter {
  readonly providerKey: string;

  estimateCost(input: LlmCompletionInput): Promise<CostEstimate>;

  complete(input: LlmCompletionInput): Promise<LlmCompletionResult>;
}

// ---------------------------------------------------------------------------
// Registry (US-8.1) — wire adapters at server startup
// ---------------------------------------------------------------------------

export interface ProviderRegistry {
  getVideoAdapter(providerKey: string): VideoProviderAdapter;
  getTtsAdapter(providerKey: string): TtsProviderAdapter;
  getLlmAdapter(providerKey: string): LlmProviderAdapter;

  registerVideo(adapter: VideoProviderAdapter): void;
  registerTts(adapter: TtsProviderAdapter): void;
  registerLlm(adapter: LlmProviderAdapter): void;
}

export class InMemoryProviderRegistry implements ProviderRegistry {
  private readonly video = new Map<string, VideoProviderAdapter>();
  private readonly tts = new Map<string, TtsProviderAdapter>();
  private readonly llm = new Map<string, LlmProviderAdapter>();
  private frozen = false;

  freeze(): void {
    this.frozen = true;
  }

  isFrozen(): boolean {
    return this.frozen;
  }

  private assertMutable(): void {
    if (this.frozen) {
      throw new RegistryFrozenError();
    }
  }

  registerVideo(adapter: VideoProviderAdapter): void {
    this.assertMutable();
    this.video.set(adapter.providerKey, adapter);
  }

  registerTts(adapter: TtsProviderAdapter): void {
    this.assertMutable();
    this.tts.set(adapter.providerKey, adapter);
  }

  registerLlm(adapter: LlmProviderAdapter): void {
    this.assertMutable();
    this.llm.set(adapter.providerKey, adapter);
  }

  getVideoAdapter(providerKey: string): VideoProviderAdapter {
    const adapter = this.video.get(providerKey);
    if (!adapter) {
      throw new ProviderAdapterNotFoundError(providerKey);
    }
    return adapter;
  }

  getTtsAdapter(providerKey: string): TtsProviderAdapter {
    const adapter = this.tts.get(providerKey);
    if (!adapter) {
      throw new ProviderAdapterNotFoundError(providerKey);
    }
    return adapter;
  }

  getLlmAdapter(providerKey: string): LlmProviderAdapter {
    const adapter = this.llm.get(providerKey);
    if (!adapter) {
      throw new ProviderAdapterNotFoundError(providerKey);
    }
    return adapter;
  }
}

/**
 * End-to-end helper: resolve catalog row → get adapter → estimate.
 * Used by US-7.2 policy engine before job creation.
 */
export async function estimateVideoJobCost(
  catalog: readonly ProviderCatalogRow[],
  registry: ProviderRegistry | undefined,
  context: ResolveProviderContext,
  jobInput: Omit<CreateVideoJobInput, "providerKey" | "providerTier" | "assetRole"> & {
    assetRole: VideoAssetRole;
  },
): Promise<CostEstimate> {
  const resolvedRegistry =
    registry ??
    (require("./create-provider-registry") as typeof import("./create-provider-registry")).getProviderRegistry();
  const row = resolveProvider(catalog, {
    ...context,
    assetRole: jobInput.assetRole === "broll" ? "broll" : "talking_head",
  });
  const adapter = resolvedRegistry.getVideoAdapter(row.key);
  return adapter.estimateCost({
    ...jobInput,
    providerKey: row.key,
    providerTier: row.tier,
    assetRole: jobInput.assetRole,
  });
}
