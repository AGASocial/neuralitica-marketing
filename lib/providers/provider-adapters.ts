/**
 * Provider adapter interfaces (US-8.1, US-X.4).
 *
 * Server-only module: import only from Route Handlers, Server Actions, and
 * server helpers — never from Client Components.
 *
 * Swapping vendors = new adapter class + catalog row + env var.
 * Assembly (US-9.x), approval, and FE flows stay unchanged.
 */
import type {
  AssetRole,
  CreateVideoJobInput,
  CreateVideoJobResult,
  ProviderCatalogRow,
  ProviderTier,
  StoredMediaAsset,
  SupportedLocale,
  VideoAssetRole,
  VideoJobStatus,
} from "../contracts/providers";

export type {
  AssetRole,
  CreateVideoJobInput,
  CreateVideoJobResult,
  ProviderCatalogRow,
  ProviderTier,
  StoredMediaAsset,
  SupportedLocale,
  VideoAssetRole,
  VideoJobStatus,
} from "../contracts/providers";

export {
  assetRoleSchema,
  costBillingUnitSchema,
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
}

/**
 * Pick the active catalog row for an asset role at the given tier.
 * Throws if no matching active row exists (caller maps to 503 / operator message).
 */
export function resolveProvider(
  catalog: readonly ProviderCatalogRow[],
  context: ResolveProviderContext,
): ProviderCatalogRow {
  const candidates = catalog.filter(
    (row) =>
      row.active &&
      row.tier === context.tier &&
      row.assetRole === context.assetRole,
  );

  if (candidates.length === 0) {
    throw new Error(
      `No active provider for assetRole=${context.assetRole} tier=${context.tier}`,
    );
  }

  if (context.assetRole === "talking_head" && context.hasReferenceLoop) {
    const loopPreferred = candidates.find((r) =>
      r.capabilities.prefersReferenceLoop === true,
    );
    if (loopPreferred) return loopPreferred;
  }

  return candidates[0];
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

  getJobStatus(externalJobId: string): Promise<VideoJobStatusResult>;

  /**
   * Download provider output and persist under our storage layer.
   * `rawOutputUrl` comes from getJobStatus when the vendor returns a URL.
   */
  fetchAsset(
    externalJobId: string,
    rawOutputUrl?: string,
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

  registerVideo(adapter: VideoProviderAdapter): void {
    this.video.set(adapter.providerKey, adapter);
  }

  registerTts(adapter: TtsProviderAdapter): void {
    this.tts.set(adapter.providerKey, adapter);
  }

  registerLlm(adapter: LlmProviderAdapter): void {
    this.llm.set(adapter.providerKey, adapter);
  }

  getVideoAdapter(providerKey: string): VideoProviderAdapter {
    const adapter = this.video.get(providerKey);
    if (!adapter) {
      throw new Error(`Video adapter not registered: ${providerKey}`);
    }
    return adapter;
  }

  getTtsAdapter(providerKey: string): TtsProviderAdapter {
    const adapter = this.tts.get(providerKey);
    if (!adapter) {
      throw new Error(`TTS adapter not registered: ${providerKey}`);
    }
    return adapter;
  }

  getLlmAdapter(providerKey: string): LlmProviderAdapter {
    const adapter = this.llm.get(providerKey);
    if (!adapter) {
      throw new Error(`LLM adapter not registered: ${providerKey}`);
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
  registry: ProviderRegistry,
  context: ResolveProviderContext,
  jobInput: Omit<CreateVideoJobInput, "providerKey" | "providerTier" | "assetRole"> & {
    assetRole: VideoAssetRole;
  },
): Promise<CostEstimate> {
  const row = resolveProvider(catalog, {
    ...context,
    assetRole: jobInput.assetRole === "broll" ? "broll" : "talking_head",
  });
  const adapter = registry.getVideoAdapter(row.key);
  return adapter.estimateCost({
    ...jobInput,
    providerKey: row.key,
    providerTier: row.tier,
  });
}
