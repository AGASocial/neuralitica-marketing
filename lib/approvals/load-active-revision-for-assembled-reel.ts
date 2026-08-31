import "server-only";

import {
  computeRevisionRoutingPlan,
  type RevisionRoutingPlan,
} from "@/lib/contracts/approval-revision";
import { findClientRevisionRound } from "@/lib/approvals/parse-change-requests";
import {
  loadApprovalByAssembledReelScoped,
  type ApprovalRow,
} from "@/lib/approvals/persist-approval";

export type ActiveRevisionForAssembledReel = ApprovalRow & {
  round: number;
  routingPlan: RevisionRoutingPlan;
};

export async function loadActiveRevisionForAssembledReel(params: {
  assembledReelId: string;
  clientId: string;
}): Promise<ActiveRevisionForAssembledReel | null> {
  const approval = await loadApprovalByAssembledReelScoped(params);
  if (!approval || approval.status !== "changes_requested") {
    return null;
  }

  const activeRound = findClientRevisionRound(
    approval.changeRequests,
    approval.revisionCount,
  );
  if (!activeRound) {
    return null;
  }

  return {
    ...approval,
    round: activeRound.round,
    routingPlan: computeRevisionRoutingPlan(activeRound.tags),
  };
}
