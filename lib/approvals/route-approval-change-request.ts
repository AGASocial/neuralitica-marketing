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
import { loadApprovalByIdScoped } from "@/lib/approvals/persist-approval";
import { executeRevisionMediaSteps } from "@/lib/approvals/revision/execute-revision-media-steps";
import { tryMarkRevisionRoutingStarted } from "@/lib/approvals/revision/persist-revision-routing";
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

  const started = await tryMarkRevisionRoutingStarted({
    approvalId: input.approvalId,
    clientId: input.clientId,
    round: input.round,
  });
  if (!started) {
    return;
  }

  const firstStep = getFirstRevisionPipelineStep(plan);

  if (firstStep === "assembly" || firstStep === "branding") {
    const mediaResult = await executeRevisionMediaSteps({
      approvalId: input.approvalId,
      assembledReelId: input.assembledReelId,
      clientId: input.clientId,
      round: input.round,
      reelScriptId: ctx.reelScriptId,
      steps: plan.steps,
    });
    if (!mediaResult.ok) {
      console.error("[approvals] revision media steps failed", {
        approvalId: input.approvalId,
        round: input.round,
        step: mediaResult.step,
        code: mediaResult.code,
      });
    }
    return;
  }

  await enqueueRevisionPipelineStep(ctx, firstStep);
}
