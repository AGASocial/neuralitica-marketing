import "server-only";

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
import { createHeygenHighStubAdapter } from "@/lib/providers/video/heygen-high-stub-adapter";
import { createSadtalkerLowAdapter } from "@/lib/providers/video/sadtalker-low-adapter";
import { createSiliconflowWan21TurboStubAdapter } from "@/lib/providers/video/siliconflow-wan21-turbo-stub-adapter";

const STUB_VIDEO_KEYS = [
  DEFAULT_LOW_TIER_PROVIDER_KEYS.talkingHead,
  DEFAULT_LOW_TIER_PROVIDER_KEYS.broll,
  "heygen_high",
] as const;

const STUB_DEFAULT_ESTIMATE_CENTS: Record<(typeof STUB_VIDEO_KEYS)[number], number> =
  {
    [DEFAULT_LOW_TIER_PROVIDER_KEYS.talkingHead]: 19,
    [DEFAULT_LOW_TIER_PROVIDER_KEYS.broll]: 10,
    heygen_high: 100,
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

function createStubAdapterForKey(
  providerKey: (typeof STUB_VIDEO_KEYS)[number],
  defaultEstimateCents: number,
) {
  switch (providerKey) {
    case DEFAULT_LOW_TIER_PROVIDER_KEYS.talkingHead:
      return createSadtalkerLowAdapter({ defaultEstimateCents });
    case DEFAULT_LOW_TIER_PROVIDER_KEYS.broll:
      return createSiliconflowWan21TurboStubAdapter(defaultEstimateCents);
    case "heygen_high":
      return createHeygenHighStubAdapter(defaultEstimateCents);
    default:
      throw new Error(`Unsupported stub provider key: ${providerKey}`);
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
      active: false,
      costModel: { billingUnit: "per_second", unitCostCents: 7 },
      envKeyName: "HEYGEN_API_KEY",
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

    const adapter = createStubAdapterForKey(providerKey, defaultEstimateCents);

    if (adapter.providerKey !== providerKey) {
      throw new Error(`Stub adapter providerKey mismatch: ${providerKey}`);
    }

    registry.registerVideo(adapter);
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
