import "server-only";

/**
 * Decide approval orchestration (US-11.1 + US-11.2 request_changes).
 * Closed write surface: pending_client → approved | rejected | changes_requested.
 */

import type { CurrentUser } from "@/lib/auth/get-current-user-types";
import {
  APPROVAL_DECIDE_AGENT_KEY,
  decideApprovalInputSchema,
  findForbiddenChangeRequestKeys,
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
  approvalRevisionLimitExceededError,
  approvalValidationError,
} from "@/lib/approvals/errors";
import { findForbiddenApprovalKeys } from "@/lib/approvals/find-forbidden-approval-keys";
import { computeRevisionsRemaining } from "@/lib/approvals/get-max-revision-rounds";
import {
  isRevisionLimitExhausted,
  loadApprovalByIdScoped,
  updateApprovalDecision,
  updateApprovalRequestChanges,
} from "@/lib/approvals/persist-approval";
import { routeApprovalChangeRequest } from "@/lib/approvals/route-approval-change-request";
import { zodInterviewErrorToFieldErrors } from "@/lib/interview/zod-field-errors";
import { getQaGateStatusForAssembledReel } from "@/lib/qa/get-qa-gate-status-for-assembled-reel";
import { getMaxRevisionRounds } from "@/lib/approvals/get-max-revision-rounds";

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

  const rawRecord =
    params.rawInput !== null &&
    typeof params.rawInput === "object" &&
    !Array.isArray(params.rawInput)
      ? (params.rawInput as Record<string, unknown>)
      : null;

  if (rawRecord?.changeRequest !== undefined) {
    const nestedForbidden = findForbiddenChangeRequestKeys(
      rawRecord.changeRequest,
    );
    if (nestedForbidden.length > 0) {
      const fields: Record<string, string[]> = {};
      for (const key of nestedForbidden) {
        fields[`changeRequest.${key}`] = ["FORBIDDEN"];
      }
      return approvalForbiddenFieldsError(fields);
    }
  }

  const parsed = decideApprovalInputSchema.safeParse(params.rawInput);
  if (!parsed.success) {
    return approvalValidationError(
      zodInterviewErrorToFieldErrors(parsed.error),
    );
  }

  const { approvalId, decision, clientFeedback, changeRequest } = parsed.data;
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

  if (decision === "request_changes") {
    const updated = await updateApprovalRequestChanges({
      approvalId,
      clientId,
      decidedBy: params.user.id,
      changeRequest: changeRequest!,
      summary: changeRequest!.summary ?? null,
    });

    if (!updated) {
      const reloaded = await loadApprovalByIdScoped({ approvalId, clientId });
      if (!reloaded) {
        return approvalNotFoundError();
      }
      if (reloaded.status !== "pending_client") {
        return approvalInvalidTransitionError();
      }
      if (await isRevisionLimitExhausted(reloaded)) {
        return approvalRevisionLimitExceededError();
      }
      return approvalInvalidTransitionError();
    }

    await recordApprovalAttempt({
      clientId,
      agentKey: APPROVAL_DECIDE_AGENT_KEY,
    });

    try {
      await routeApprovalChangeRequest({
        approvalId,
        assembledReelId: updated.assembledReelId,
        clientId,
        round: updated.revisionCount,
        changeRequest: changeRequest!,
      });
    } catch (error) {
      console.error("[approvals] revision routing failed", {
        approvalId,
        round: updated.revisionCount,
        error,
      });
    }

    const maxRevisionRounds = getMaxRevisionRounds();
    const revisionsRemaining = computeRevisionsRemaining({
      revisionCount: updated.revisionCount,
      maxRevisionRounds,
      extraRevisionGranted: updated.extraRevisionGranted,
      status: updated.status,
    });

    const summary = await toApprovalListItemDto({
      approval: updated,
      clientId,
    });

    return {
      ok: true,
      approvalId: updated.id,
      assembledReelId: updated.assembledReelId,
      status: "changes_requested",
      decidedAt: updated.decidedAt ?? new Date().toISOString(),
      revisionCount: updated.revisionCount,
      revisionsRemaining,
      summary,
    };
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

  const decidedAt = updated.decidedAt ?? new Date().toISOString();

  if (decision === "approved") {
    console.log(
      JSON.stringify({
        event: "approval_ready_to_publish",
        approvalId: updated.id,
        assembledReelId: updated.assembledReelId,
        clientId,
        decidedAt,
      }),
    );
  }

  const summary = await toApprovalListItemDto({
    approval: updated,
    clientId,
  });

  return {
    ok: true,
    approvalId: updated.id,
    assembledReelId: updated.assembledReelId,
    status: decision,
    decidedAt,
    summary,
  };
}
