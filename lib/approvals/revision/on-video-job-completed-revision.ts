import "server-only";

import { continueRevisionPipelineAfterStep } from "@/lib/approvals/revision-pipeline-seams";

/**
 * Chain revision pipeline after async video_job completes (US-11.2 script path).
 */
export async function onVideoJobCompletedRevision(input: {
  reelScriptId: string;
  clientId: string;
}): Promise<void> {
  try {
    await continueRevisionPipelineAfterStep({
      reelScriptId: input.reelScriptId,
      clientId: input.clientId,
      completedStep: "video_job",
    });
  } catch (error) {
    console.error("[approvals] revision video_job completion hook failed", {
      reelScriptId: input.reelScriptId,
      message: error instanceof Error ? error.message : "unknown",
    });
  }
}
