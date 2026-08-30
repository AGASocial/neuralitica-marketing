"use server";

import { revalidatePath } from "next/cache";

import { isAuthGuardError, requireActive } from "@/lib/auth/require-user";
import type { DecideApprovalResult } from "@/lib/contracts/approval";
import { decideApprovalForClient } from "@/lib/approvals/decide-approval";
import {
  approvalForbiddenError,
  approvalInternalError,
  approvalUnauthenticatedError,
} from "@/lib/approvals/errors";

/**
 * Cliente Server Action — approve / reject Aprobación package (US-11.1 Phase A).
 * Accepts `{ approvalId, decision, clientFeedback? }` only.
 * Frontend: `/approvals/[approvalId]` Approve / Reject CTAs.
 *
 * requireActive("handler") is the first await — failure → 401/403, no UPDATE.
 * Gate re-checked server-side before any status write.
 */
export async function decideApproval(
  rawInput: unknown,
): Promise<DecideApprovalResult> {
  try {
    let user;
    try {
      user = await requireActive("handler");
    } catch (error) {
      if (isAuthGuardError(error)) {
        return error.status === 401
          ? approvalUnauthenticatedError()
          : approvalForbiddenError();
      }
      throw error;
    }

    const result = await decideApprovalForClient({
      rawInput,
      user,
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
    console.error("[approvals] decideApproval unexpected error");
    return approvalInternalError();
  }
}
