import "server-only";

import {
  costEstimateSchema,
  createVideoJobResultSchema,
  externalJobIdSchema,
  storedMediaAssetSchema,
  videoJobStatusResultSchema,
  type CreateVideoJobInput,
  type VideoAssetRole,
} from "@/lib/contracts/providers";
import { parseExternalJobId } from "@/lib/providers/normalize-provider-response";
import type { VideoProviderAdapter } from "@/lib/providers/provider-adapters";

export function createStubVideoAdapter(params: {
  providerKey: string;
  videoAssetRole: VideoAssetRole;
  defaultEstimateCents: number;
}): VideoProviderAdapter {
  const { providerKey, videoAssetRole, defaultEstimateCents } = params;

  return {
    providerKey,
    videoAssetRole,

    async estimateCost(input: CreateVideoJobInput) {
      return costEstimateSchema.parse({
        estimatedCostCents: defaultEstimateCents,
        currency: "USD",
        providerKey: input.providerKey,
      });
    },

    async createJob(input: CreateVideoJobInput) {
      const externalJobId = externalJobIdSchema.parse(
        `stub-${providerKey}-${input.reelScriptId}`,
      );

      return createVideoJobResultSchema.parse({
        externalJobId,
        status: "queued",
        estimatedCostCents: defaultEstimateCents,
      });
    },

    async getJobStatus(externalJobId) {
      parseExternalJobId(externalJobId);

      return videoJobStatusResultSchema.parse({
        status: "completed",
        progressPercent: 100,
      });
    },

    async fetchAsset(externalJobId, _rawOutputUrl, _jobContext) {
      parseExternalJobId(externalJobId);

      return storedMediaAssetSchema.parse({
        storageKey: `stub/${providerKey}/${externalJobId}.mp4`,
        mimeType: "video/mp4",
        sizeBytes: 1024,
        actualCostCents: defaultEstimateCents,
      });
    },
  };
}
