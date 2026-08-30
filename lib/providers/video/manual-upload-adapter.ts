import "server-only";

import { costEstimateSchema } from "@/lib/contracts/providers";
import type { VideoProviderAdapter } from "@/lib/providers/provider-adapters";
import { MANUAL_UPLOAD_SYNC_ONLY } from "@/lib/contracts/manual-video-upload";

function manualUploadSyncOnlyError(): Error {
  return new Error(MANUAL_UPLOAD_SYNC_ONLY);
}

/**
 * Manual upload provider adapter (US-8.3).
 * estimateCost only — vendor I/O owned by uploadManualVideoJob orchestrator.
 */
export function createManualUploadAdapter(): VideoProviderAdapter {
  return {
    providerKey: "manual",
    videoAssetRole: "primary",
    estimateCost: async () =>
      costEstimateSchema.parse({
        estimatedCostCents: 0,
        currency: "USD",
        providerKey: "manual",
      }),
    createJob: async () => {
      throw manualUploadSyncOnlyError();
    },
    getJobStatus: async () => {
      throw manualUploadSyncOnlyError();
    },
    fetchAsset: async () => {
      throw manualUploadSyncOnlyError();
    },
  };
}
