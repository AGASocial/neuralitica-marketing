"use server";

import { isAuthGuardError, requireActive } from "@/lib/auth/require-user";
import type { ListPendingApprovalsResult } from "@/lib/contracts/approval";
import {
  approvalForbiddenError,
  approvalInternalError,
  approvalUnauthenticatedError,
} from "@/lib/approvals/errors";
import { listPendingApprovalsForClientUser } from "@/lib/approvals/list-get-approvals";

/**
 * Cliente Server Action — list pending Aprobación packages (US-11.1).
 * Runs optional batch-ensure for gated branded assemblies.
 * Frontend: `/approvals` list page.
 *
 * requireActive("handler") is the first await.
 */
export async function listPendingApprovals(): Promise<ListPendingApprovalsResult> {
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

    return await listPendingApprovalsForClientUser({ user });
  } catch (error) {
    if (isAuthGuardError(error)) {
      return error.status === 401
        ? approvalUnauthenticatedError()
        : approvalForbiddenError();
    }
    console.error("[approvals] listPendingApprovals unexpected error");
    return approvalInternalError();
  }
}
