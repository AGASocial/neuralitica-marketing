import "server-only";

import { runQaForAssembledReelForClient } from "@/lib/qa/run-qa-for-assembled-reel";

/**
 * Auto-chain QA after branding completes (US-10.1).
 * Invoked from applyBrandingJobUpdate when branding_status → completed.
 * Branding stays completed on QA failure — never revert.
 */
export async function onBrandingCompleted(input: {
  assembledReelId: string;
  clientId: string;
}): Promise<void> {
  try {
    const result = await runQaForAssembledReelForClient({
      assembledReelId: input.assembledReelId,
      clientId: input.clientId,
      invokedBy: "system",
      operatorClientId: input.clientId,
    });

    if (!result.ok) {
      console.error("[qa] auto-chain after branding failed", {
        assembledReelId: input.assembledReelId,
        code: result.error.code,
      });
    }
  } catch (error) {
    console.error("[qa] auto-chain after branding threw", {
      assembledReelId: input.assembledReelId,
      message: error instanceof Error ? error.message : "unknown",
    });
  }
}
