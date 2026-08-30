import "server-only";

import { getVideoAdapterForJob } from "./get-video-adapter-for-job";
import { insertGeneratedVideoMediaAsset } from "./insert-generated-video-media-asset";
import type { VideoJobRow } from "./video-job-row";

export async function persistVideoJobOutputAsset(params: {
  job: VideoJobRow;
  rawOutputUrl: string;
}): Promise<{ outputMediaAssetId: string; actualCostCents: number }> {
  const adapter = await getVideoAdapterForJob(params.job);
  const stored = await adapter.fetchAsset(
    params.job.externalJobId,
    params.rawOutputUrl,
    { clientId: params.job.clientId, reelScriptId: params.job.reelScriptId },
  );

  const inserted = await insertGeneratedVideoMediaAsset({
    clientId: params.job.clientId,
    storedAsset: stored,
  });

  if (!inserted) {
    throw new Error("Failed to insert generated video media asset");
  }

  return {
    outputMediaAssetId: inserted.mediaAssetId,
    actualCostCents: stored.actualCostCents,
  };
}
