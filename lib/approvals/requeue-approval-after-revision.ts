import "server-only";

/**
 * Requeue approval after revision pipeline completes (US-11.2).
 * Invoked from caption-only or media+QA completion hooks — server-only.
 */

import { revalidatePath } from "next/cache";

import { requeueApprovalAfterRevisionParamsSchema } from "@/lib/contracts/approval-revision";
import {
  loadApprovalByIdScoped,
  markRevisionRoutingCompleted,
  requeueApprovalRow,
} from "@/lib/approvals/persist-approval";
import { getQaGateStatusForAssembledReel } from "@/lib/qa/get-qa-gate-status-for-assembled-reel";

export type RequeueApprovalAfterRevisionParams = {
  approvalId: string;
  clientId: string;
  round: number;
  pathKind: "caption_only" | "media";
};

export async function requeueApprovalAfterRevision(
  params: RequeueApprovalAfterRevisionParams,
): Promise<void> {
  const parsed = requeueApprovalAfterRevisionParamsSchema.safeParse(params);
  if (!parsed.success) {
    console.error("[approvals] requeueApprovalAfterRevision invalid params");
    return;
  }

  const input = parsed.data;
  const approval = await loadApprovalByIdScoped({
    approvalId: input.approvalId,
    clientId: input.clientId,
  });
  if (!approval) {
    console.warn("[approvals] requeue skipped — approval not found", {
      approvalId: input.approvalId,
    });
    return;
  }

  if (approval.status !== "changes_requested") {
    return;
  }

  const gate = await getQaGateStatusForAssembledReel(approval.assembledReelId);
  if (gate.ready !== true) {
    return;
  }

  const requeued = await requeueApprovalRow({
    approvalId: input.approvalId,
    clientId: input.clientId,
  });
  if (!requeued) {
    return;
  }

  await markRevisionRoutingCompleted({
    approvalId: input.approvalId,
    clientId: input.clientId,
    round: input.round,
  });

  revalidatePath("/approvals");
  revalidatePath(`/approvals/${input.approvalId}`);
}
