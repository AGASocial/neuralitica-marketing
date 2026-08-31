import "server-only";

import { runQaForAssembledReelForClient } from "@/lib/qa/run-qa-for-assembled-reel";
import { loadActiveRevisionForAssembledReel } from "@/lib/approvals/load-active-revision-for-assembled-reel";
import { tryRequeueAfterRevisionForAssembledReel } from "@/lib/approvals/revision/try-requeue-after-revision";

/**
 * Auto-chain QA after branding completes (US-10.1).
 * Invoked from applyBrandingJobUpdate when branding_status → completed.
 * Branding stays completed on QA failure — never revert.
 * US-11.2: uses invokedBy revision when an active changes_requested approval exists.
 */
export async function onBrandingCompleted(input: {
  assembledReelId: string;
  clientId: string;
}): Promise<void> {
  try {
    const activeRevision = await loadActiveRevisionForAssembledReel({
      assembledReelId: input.assembledReelId,
      clientId: input.clientId,
    });
    const invokedBy =
      activeRevision?.routingPlan.steps.includes("qa_rerun") ||
      activeRevision?.routingPlan.pathKind === "media"
        ? "revision"
        : "system";

    const result = await runQaForAssembledReelForClient({
      assembledReelId: input.assembledReelId,
      clientId: input.clientId,
      invokedBy,
      operatorClientId: input.clientId,
    });

    if (!result.ok) {
      console.error("[qa] auto-chain after branding failed", {
        assembledReelId: input.assembledReelId,
        code: result.error.code,
        invokedBy,
      });
      return;
    }

    if (invokedBy === "revision") {
      await tryRequeueAfterRevisionForAssembledReel({
        assembledReelId: input.assembledReelId,
        clientId: input.clientId,
      });
    }
  } catch (error) {
    console.error("[qa] auto-chain after branding threw", {
      assembledReelId: input.assembledReelId,
      message: error instanceof Error ? error.message : "unknown",
    });
  }
}
