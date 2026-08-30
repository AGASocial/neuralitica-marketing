import "server-only";

import { DEFAULT_LOW_TIER_PROVIDER_KEYS } from "@/lib/contracts/providers";
import type { ExternalJobId } from "@/lib/contracts/providers";
import { getProviderCatalog } from "@/lib/providers/get-provider-catalog";
import {
  initializeProviderRegistryFromCatalog,
  type ProviderRegistry,
} from "@/lib/providers/create-provider-registry";
import { createSadtalkerLowAdapter } from "@/lib/providers/video/sadtalker-low-adapter";
import type { VideoProviderAdapter } from "@/lib/providers/provider-adapters";

import type { VideoJobRow } from "./video-job-row";

function estimateCentsFromCatalog(
  providerKey: string,
  fallbackCents: number,
): number {
  return fallbackCents;
}

export async function getVideoAdapterForJob(
  job: VideoJobRow,
): Promise<VideoProviderAdapter> {
  if (job.providerKey !== DEFAULT_LOW_TIER_PROVIDER_KEYS.talkingHead) {
    const registry = await initializeProviderRegistryFromCatalog();
    return registry.getVideoAdapter(job.providerKey);
  }

  const catalogResult = await getProviderCatalog();
  let defaultEstimateCents = job.estimatedCostCents;
  if (!("loadFailed" in catalogResult) || !catalogResult.loadFailed) {
    const row = catalogResult.providers.find((p) => p.key === job.providerKey);
    if (row?.costModel.billingUnit === "per_run") {
      defaultEstimateCents = row.costModel.unitCostCents;
    }
  }

  const initialJobContexts = new Map<ExternalJobId, {
    clientId: string;
    reelScriptId: string;
  }>([
    [
      job.externalJobId as ExternalJobId,
      { clientId: job.clientId, reelScriptId: job.reelScriptId },
    ],
  ]);

  return createSadtalkerLowAdapter({
    defaultEstimateCents: estimateCentsFromCatalog(
      job.providerKey,
      defaultEstimateCents,
    ),
    initialJobContexts,
  });
}

export async function getProviderRegistryForVideoJobs(): Promise<ProviderRegistry> {
  return initializeProviderRegistryFromCatalog();
}
