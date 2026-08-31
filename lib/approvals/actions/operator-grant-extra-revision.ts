"use server";

import { revalidatePath } from "next/cache";

import { isAuthGuardError, requireOperator } from "@/lib/auth/require-user";
import type { ApprovalMutationError } from "@/lib/contracts/approval";
import type { OperatorGrantExtraRevisionSuccess } from "@/lib/contracts/approval-revision";
import {
  approvalForbiddenError,
  approvalInternalError,
  approvalUnauthenticatedError,
} from "@/lib/approvals/errors";
import { operatorGrantExtraRevisionForOperator } from "@/lib/approvals/operator-grant-extra-revision";

export type OperatorGrantExtraRevisionResult =
  | OperatorGrantExtraRevisionSuccess
  | ApprovalMutationError;

/**
 * Operator Server Action — grant one extra client revision round (US-11.2).
 * Consumer: operator dev/admin stub; no Cliente exposure.
 */
export async function operatorGrantExtraRevision(
  rawInput: unknown,
): Promise<OperatorGrantExtraRevisionResult> {
  try {
    let operator;
    try {
      operator = await requireOperator("handler");
    } catch (error) {
      if (isAuthGuardError(error)) {
        return error.status === 401
          ? approvalUnauthenticatedError()
          : approvalForbiddenError();
      }
      throw error;
    }

    const result = await operatorGrantExtraRevisionForOperator({
      rawInput,
      operator,
    });

    if (result.ok) {
      revalidatePath("/approvals");
      revalidatePath(`/approvals/${result.approvalId}`);
    }

    return result;
  } catch (error) {
    if (isAuthGuardError(error)) {
      return error.status === 401
        ? approvalUnauthenticatedError()
        : approvalForbiddenError();
    }
    console.error("[approvals] operatorGrantExtraRevision unexpected error");
    return approvalInternalError();
  }
}
