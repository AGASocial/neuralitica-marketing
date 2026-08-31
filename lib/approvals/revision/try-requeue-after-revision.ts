import "server-only";

import { requeueApprovalAfterRevision } from "@/lib/approvals/requeue-approval-after-revision";

import { loadActiveRevisionForAssembledReel } from "@/lib/approvals/load-active-revision-for-assembled-reel";

/**
 * Completion hook for caption-only and media revision paths.
 * No-op when no active changes_requested approval exists for the assembled reel.
 */
export async function tryRequeueAfterRevisionForAssembledReel(params: {
  assembledReelId: string;
  clientId: string;
}): Promise<void> {
  const active = await loadActiveRevisionForAssembledReel(params);
  if (!active) {
    return;
  }

  await requeueApprovalAfterRevision({
    approvalId: active.id,
    clientId: active.clientId,
    round: active.round,
    pathKind: active.routingPlan.pathKind,
  });
}
