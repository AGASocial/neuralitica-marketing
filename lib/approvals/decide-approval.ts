import "server-only";

/**
 * Decide approval orchestration (US-11.1 Phase A).
 * Closed write surface: pending_client → approved | rejected only.
 * Never writes changes_requested.
 */

import type { CurrentUser } from "@/lib/auth/get-current-user-types";
import {
  APPROVAL_DECIDE_AGENT_KEY,
  decideApprovalInputSchema,
  type DecideApprovalResult,
} from "@/lib/contracts/approval";
import {
  checkApprovalRateLimit,
  recordApprovalAttempt,
} from "@/lib/approvals/check-approval-rate-limit";
import { toApprovalListItemDto } from "@/lib/approvals/compose-approval-package";
import {
  approvalForbiddenFieldsError,
  approvalInternalError,
  approvalInvalidTransitionError,
  approvalNotFoundError,
  approvalQaGateNotReadyError,
  approvalRateLimitedError,
  approvalValidationError,
} from "@/lib/approvals/errors";
import { findForbiddenApprovalKeys } from "@/lib/approvals/find-forbidden-approval-keys";
import {
  loadApprovalByIdScoped,
  updateApprovalDecision,
} from "@/lib/approvals/persist-approval";
import { zodInterviewErrorToFieldErrors } from "@/lib/interview/zod-field-errors";
import { getQaGateStatusForAssembledReel } from "@/lib/qa/get-qa-gate-status-for-assembled-reel";

export type DecideApprovalForClientParams = {
  rawInput: unknown;
  user: CurrentUser;
};

export async function decideApprovalForClient(
  params: DecideApprovalForClientParams,
): Promise<DecideApprovalResult> {
  const forbiddenKeys = findForbiddenApprovalKeys(params.rawInput, "decide");
  if (forbiddenKeys.length > 0) {
    const fields: Record<string, string[]> = {};
    for (const key of forbiddenKeys) {
      fields[key] = ["FORBIDDEN"];
    }
    return approvalForbiddenFieldsError(fields);
  }

  const parsed = decideApprovalInputSchema.safeParse(params.rawInput);
  if (!parsed.success) {
    return approvalValidationError(
      zodInterviewErrorToFieldErrors(parsed.error),
    );
  }

  const { approvalId, decision, clientFeedback } = parsed.data;
  const clientId = params.user.id;

  const rateCheck = await checkApprovalRateLimit({
    clientId,
    agentKey: APPROVAL_DECIDE_AGENT_KEY,
  });
  if (!rateCheck.ok) {
    return approvalRateLimitedError();
  }

  const approval = await loadApprovalByIdScoped({
    approvalId,
    clientId,
  });
  if (!approval) {
    return approvalNotFoundError();
  }

  if (approval.status !== "pending_client") {
    return approvalInvalidTransitionError();
  }

  const gate = await getQaGateStatusForAssembledReel(
    approval.assembledReelId,
  );
  if (gate.ready !== true) {
    return approvalQaGateNotReadyError();
  }

  const feedbackValue =
    decision === "rejected" && clientFeedback ? clientFeedback : null;

  const updated = await updateApprovalDecision({
    approvalId,
    clientId,
    decision,
    decidedBy: params.user.id,
    clientFeedback: feedbackValue,
  });

  if (!updated) {
    // Race: another decide won, or row vanished
    const reloaded = await loadApprovalByIdScoped({ approvalId, clientId });
    if (!reloaded || reloaded.status !== "pending_client") {
      return approvalInvalidTransitionError();
    }
    return approvalInternalError();
  }

  await recordApprovalAttempt({
    clientId,
    agentKey: APPROVAL_DECIDE_AGENT_KEY,
  });

  const summary = await toApprovalListItemDto({
    approval: updated,
    clientId,
  });

  return {
    ok: true,
    approvalId: updated.id,
    assembledReelId: updated.assembledReelId,
    status: decision,
    decidedAt: updated.decidedAt ?? new Date().toISOString(),
    summary,
  };
}
