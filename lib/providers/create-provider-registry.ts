import "server-only";

import {
  HEYGEN_APPROX_PER_MINUTE_CENTS,
  HEYGEN_DEFAULT_AVATAR_ID_ENV,
  HEYGEN_UNIT_COST_CENTS_PER_SECOND,
} from "@/lib/contracts/heygen-high";
import type { ProviderCatalogRow } from "@/lib/contracts/providers";
import {
  DEFAULT_LOW_TIER_PROVIDER_KEYS,
  providerCatalogRowSchema,
} from "@/lib/contracts/providers";
import { getProviderCatalog } from "@/lib/providers/get-provider-catalog";
import {
  InMemoryProviderRegistry,
  type ProviderRegistry,
} from "@/lib/providers/provider-adapters";
import { createHeygenHighAdapter } from "@/lib/providers/video/heygen-high-adapter";
import { createManualUploadAdapter } from "@/lib/providers/video/manual-upload-adapter";
import { createMusetalkLowAdapter } from "@/lib/providers/video/musetalk-low-adapter";
import { createSadtalkerLowAdapter } from "@/lib/providers/video/sadtalker-low-adapter";
import { createSiliconflowCosyvoice2Adapter } from "@/lib/providers/tts/siliconflow-cosyvoice2-adapter";
import { createSiliconflowWan21TurboAdapter } from "@/lib/providers/video/siliconflow-wan21-turbo-adapter";

const STUB_VIDEO_KEYS = [
  DEFAULT_LOW_TIER_PROVIDER_KEYS.talkingHead,
  DEFAULT_LOW_TIER_PROVIDER_KEYS.broll,
  "heygen_high",
] as const;

const STUB_DEFAULT_ESTIMATE_CENTS: Record<(typeof STUB_VIDEO_KEYS)[number], number> =
  {
    [DEFAULT_LOW_TIER_PROVIDER_KEYS.talkingHead]: 19,
    /** US-8.5 — catalog per_clip 21¢ (kill 10¢ stub leftover). */
    [DEFAULT_LOW_TIER_PROVIDER_KEYS.broll]: 21,
    /** Fallback when duration missing — 30s × 2¢. */
    heygen_high: 60,
  };

let singletonRegistry: ProviderRegistry | null = null;

function estimateCentsFromCatalog(
  catalog: readonly ProviderCatalogRow[],
  providerKey: string,
  fallbackCents: number,
): number {
  const row = catalog.find((entry) => entry.key === providerKey);
  if (!row) {
    return fallbackCents;
  }

  const { billingUnit, unitCostCents } = row.costModel;
  if (billingUnit === "per_run" || billingUnit === "per_clip") {
    return unitCostCents;
  }

  return fallbackCents;
}

function unitCostCentsFromCatalog(
  catalog: readonly ProviderCatalogRow[],
  providerKey: string,
  fallbackCents: number,
): number {
  const row = catalog.find((entry) => entry.key === providerKey);
  return row?.costModel.unitCostCents ?? fallbackCents;
}

function createAdapterForKey(
  providerKey: (typeof STUB_VIDEO_KEYS)[number],
  defaultEstimateCents: number,
  catalog: readonly ProviderCatalogRow[],
) {
  switch (providerKey) {
    case DEFAULT_LOW_TIER_PROVIDER_KEYS.talkingHead:
      return createSadtalkerLowAdapter({ defaultEstimateCents });
    case DEFAULT_LOW_TIER_PROVIDER_KEYS.broll:
      return createSiliconflowWan21TurboAdapter({
        defaultEstimateCents,
        unitCostCentsPerClip: unitCostCentsFromCatalog(
          catalog,
          DEFAULT_LOW_TIER_PROVIDER_KEYS.broll,
          21,
        ),
      });
    case "heygen_high":
      return createHeygenHighAdapter({
        defaultEstimateCents,
        unitCostCentsPerSecond: unitCostCentsFromCatalog(
          catalog,
          "heygen_high",
          HEYGEN_UNIT_COST_CENTS_PER_SECOND,
        ),
        heygenAvatarId: process.env[HEYGEN_DEFAULT_AVATAR_ID_ENV],
      });
    default:
      throw new Error(`Unsupported video provider key: ${providerKey}`);
  }
}

/** Offline bootstrap catalog for sync registry init when DB is unavailable. */
function buildBootstrapCatalog(): ProviderCatalogRow[] {
  const rows: Array<Omit<ProviderCatalogRow, "capabilities"> & {
    capabilities?: Record<string, unknown>;
  }> = [
    {
      key: "sadtalker_low",
      assetRole: "talking_head",
      tier: "low",
      active: true,
      costModel: { billingUnit: "per_run", unitCostCents: 10 },
      envKeyName: "REPLICATE_API_TOKEN",
    },
    {
      key: "musetalk_low",
      assetRole: "talking_head",
      tier: "low",
      active: true,
      costModel: { billingUnit: "per_run", unitCostCents: 19 },
      envKeyName: "REPLICATE_API_TOKEN",
      capabilities: { prefersReferenceLoop: true },
    },
    {
      key: DEFAULT_LOW_TIER_PROVIDER_KEYS.tts,
      assetRole: "tts",
      tier: "low",
      active: true,
      costModel: {
        billingUnit: "per_1m_chars",
        unitCostCents: 1,
        metadata: { model: "cosyvoice2" },
      },
      envKeyName: "SILICONFLOW_API_KEY",
    },
    {
      key: "siliconflow_wan21_turbo",
      assetRole: "broll",
      tier: "low",
      active: true,
      costModel: { billingUnit: "per_clip", unitCostCents: 21 },
      envKeyName: "SILICONFLOW_API_KEY",
    },
    {
      key: "heygen_high",
      assetRole: "talking_head",
      tier: "high",
      active: true,
      costModel: {
        billingUnit: "per_second",
        unitCostCents: HEYGEN_UNIT_COST_CENTS_PER_SECOND,
        metadata: {
          plan: "standard",
          vendor: "heygen",
          approxPerMinuteCents: HEYGEN_APPROX_PER_MINUTE_CENTS,
        },
      },
      envKeyName: "HEYGEN_API_KEY",
    },
    {
      key: "manual",
      assetRole: "talking_head",
      tier: "low",
      active: true,
      costModel: { billingUnit: "per_run", unitCostCents: 0 },
      envKeyName: "NEURAMARK_MANUAL_FALLBACK",
      capabilities: { manualFallback: true },
    },
  ];

  return rows.map((row) =>
    providerCatalogRowSchema.parse({
      capabilities: {},
      ...row,
    }),
  );
}

export function createProviderRegistry(
  catalog: readonly ProviderCatalogRow[] = buildBootstrapCatalog(),
): ProviderRegistry {
  const registry = new InMemoryProviderRegistry();
  const catalogKeys = new Set(catalog.map((row) => row.key));

  for (const providerKey of STUB_VIDEO_KEYS) {
    if (!catalogKeys.has(providerKey)) {
      throw new Error(`Catalog missing stub provider key: ${providerKey}`);
    }

    const defaultEstimateCents = estimateCentsFromCatalog(
      catalog,
      providerKey,
      STUB_DEFAULT_ESTIMATE_CENTS[providerKey],
    );

    const adapter = createAdapterForKey(
      providerKey,
      defaultEstimateCents,
      catalog,
    );

    if (adapter.providerKey !== providerKey) {
      throw new Error(`Video adapter providerKey mismatch: ${providerKey}`);
    }

    registry.registerVideo(adapter);
  }

  if (catalogKeys.has(DEFAULT_LOW_TIER_PROVIDER_KEYS.talkingHeadLoop)) {
    const musetalkEstimateCents = estimateCentsFromCatalog(
      catalog,
      DEFAULT_LOW_TIER_PROVIDER_KEYS.talkingHeadLoop,
      19,
    );
    registry.registerVideo(
      createMusetalkLowAdapter({
        defaultEstimateCents: musetalkEstimateCents,
      }),
    );
  }

  if (catalogKeys.has(DEFAULT_LOW_TIER_PROVIDER_KEYS.manual)) {
    registry.registerVideo(createManualUploadAdapter());
  }

  if (catalogKeys.has(DEFAULT_LOW_TIER_PROVIDER_KEYS.tts)) {
    const ttsUnitCostCents = estimateCentsFromCatalog(
      catalog,
      DEFAULT_LOW_TIER_PROVIDER_KEYS.tts,
      1,
    );
    const envKeyName =
      catalog.find((row) => row.key === DEFAULT_LOW_TIER_PROVIDER_KEYS.tts)
        ?.envKeyName ?? "SILICONFLOW_API_KEY";
    const apiKey = process.env[envKeyName];
    if (apiKey && apiKey.trim().length > 0) {
      registry.registerTts(
        createSiliconflowCosyvoice2Adapter({
          defaultUnitCostCents: ttsUnitCostCents,
          envKeyName,
        }),
      );
    }
  }

  registry.freeze();
  return registry;
}

export async function buildProviderRegistryFromCatalog(): Promise<ProviderRegistry> {
  const catalogResult = await getProviderCatalog();
  if ("loadFailed" in catalogResult && catalogResult.loadFailed) {
    throw new Error("Provider catalog unavailable for registry bootstrap");
  }

  return createProviderRegistry(catalogResult.providers);
}

export function getProviderRegistry(): ProviderRegistry {
  if (!singletonRegistry) {
    singletonRegistry = createProviderRegistry();
  }

  return singletonRegistry;
}

export async function initializeProviderRegistryFromCatalog(): Promise<ProviderRegistry> {
  if (!singletonRegistry) {
    singletonRegistry = await buildProviderRegistryFromCatalog();
  }

  return singletonRegistry;
}

/** Test-only: reset singleton between isolated test cases. */
export function resetProviderRegistryForTests(): void {
  singletonRegistry = null;
}
