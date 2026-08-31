import "server-only";

/**
 * Operator grant extra revision round (US-11.2).
 */

import type { CurrentUser } from "@/lib/auth/get-current-user-types";
import {
  APPROVAL_OPERATOR_GRANT_AGENT_KEY,
  operatorGrantExtraRevisionInputSchema,
  type ApprovalMutationError,
} from "@/lib/contracts/approval";
import type { OperatorGrantExtraRevisionSuccess } from "@/lib/contracts/approval-revision";
import {
  checkApprovalRateLimit,
  recordApprovalAttempt,
} from "@/lib/approvals/check-approval-rate-limit";
import {
  approvalForbiddenFieldsError,
  approvalNotFoundError,
  approvalRateLimitedError,
  approvalValidationError,
} from "@/lib/approvals/errors";
import { findForbiddenApprovalKeys } from "@/lib/approvals/find-forbidden-approval-keys";
import {
  grantExtraRevision,
  loadApprovalByIdScoped,
} from "@/lib/approvals/persist-approval";
import { zodInterviewErrorToFieldErrors } from "@/lib/interview/zod-field-errors";

export type OperatorGrantExtraRevisionResult =
  | OperatorGrantExtraRevisionSuccess
  | ApprovalMutationError;

export type OperatorGrantExtraRevisionForOperatorParams = {
  rawInput: unknown;
  operator: CurrentUser;
};

export async function operatorGrantExtraRevisionForOperator(
  params: OperatorGrantExtraRevisionForOperatorParams,
): Promise<OperatorGrantExtraRevisionResult> {
  const forbiddenKeys = findForbiddenApprovalKeys(params.rawInput, "decide");
  if (forbiddenKeys.length > 0) {
    const fields: Record<string, string[]> = {};
    for (const key of forbiddenKeys) {
      fields[key] = ["FORBIDDEN"];
    }
    return approvalForbiddenFieldsError(fields);
  }

  const parsed = operatorGrantExtraRevisionInputSchema.safeParse(
    params.rawInput,
  );
  if (!parsed.success) {
    return approvalValidationError(
      zodInterviewErrorToFieldErrors(parsed.error),
    );
  }

  const { approvalId, reason } = parsed.data;
  const clientId = params.operator.id;

  const rateCheck = await checkApprovalRateLimit({
    clientId,
    agentKey: APPROVAL_OPERATOR_GRANT_AGENT_KEY,
  });
  if (!rateCheck.ok) {
    return approvalRateLimitedError();
  }

  const existing = await loadApprovalByIdScoped({ approvalId, clientId });
  if (!existing) {
    return approvalNotFoundError();
  }

  const updated = await grantExtraRevision({
    approvalId,
    clientId,
    grantedBy: params.operator.id,
    reason,
  });
  if (!updated) {
    return approvalNotFoundError();
  }

  await recordApprovalAttempt({
    clientId,
    agentKey: APPROVAL_OPERATOR_GRANT_AGENT_KEY,
  });

  const grantEntry = updated.changeRequests.find(
    (entry) => entry.kind === "operator_grant",
  );
  const grantedAt =
    grantEntry?.kind === "operator_grant"
      ? grantEntry.grantedAt
      : new Date().toISOString();

  return {
    ok: true,
    approvalId: updated.id,
    extraRevisionGranted: true,
    grantedAt,
  };
}
