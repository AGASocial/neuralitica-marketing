import "server-only";

/**
 * Post-persist revision routing (US-11.2).
 * Server-only — never exported as Cliente Server Action.
 */

import {
  computeRevisionRoutingPlan,
  routeApprovalChangeRequestParamsSchema,
  type RouteApprovalChangeRequestParams,
} from "@/lib/contracts/approval-revision";
import { buildRevisionContext } from "@/lib/approvals/build-revision-context";
import { findClientRevisionRound } from "@/lib/approvals/parse-change-requests";
import {
  loadApprovalByIdScoped,
  markRevisionRoutingStarted,
} from "@/lib/approvals/persist-approval";
import {
  enqueueRevisionPipelineStep,
  getFirstRevisionPipelineStep,
  resolveRevisionPipelineContext,
} from "@/lib/approvals/revision-pipeline-seams";

export async function routeApprovalChangeRequest(
  params: RouteApprovalChangeRequestParams,
): Promise<void> {
  const parsed = routeApprovalChangeRequestParamsSchema.safeParse(params);
  if (!parsed.success) {
    console.error("[approvals] routeApprovalChangeRequest invalid params");
    return;
  }

  const input = parsed.data;
  const approval = await loadApprovalByIdScoped({
    approvalId: input.approvalId,
    clientId: input.clientId,
  });
  if (!approval || approval.status !== "changes_requested") {
    return;
  }

  const roundEntry = findClientRevisionRound(
    approval.changeRequests,
    input.round,
  );
  if (roundEntry?.routingStartedAt) {
    return;
  }

  await markRevisionRoutingStarted({
    approvalId: input.approvalId,
    clientId: input.clientId,
    round: input.round,
  });

  const plan = computeRevisionRoutingPlan(input.changeRequest.tags);
  const revisionContext = buildRevisionContext({
    approvalId: input.approvalId,
    round: input.round,
    changeRequest: input.changeRequest,
  });

  const ctx = await resolveRevisionPipelineContext({
    approvalId: input.approvalId,
    assembledReelId: input.assembledReelId,
    clientId: input.clientId,
    round: input.round,
    changeRequest: input.changeRequest,
    revisionContext,
    plan,
  });

  if (!ctx) {
    console.error("[approvals] revision pipeline context unresolved", {
      approvalId: input.approvalId,
      round: input.round,
    });
    return;
  }

  const firstStep = getFirstRevisionPipelineStep(plan);
  await enqueueRevisionPipelineStep(ctx, firstStep);
}
