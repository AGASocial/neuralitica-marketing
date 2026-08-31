"use server";

import { isAuthGuardError, requireActive } from "@/lib/auth/require-user";
import type { ListApprovedApprovalsResult } from "@/lib/contracts/approval";
import {
  approvalForbiddenError,
  approvalInternalError,
  approvalUnauthenticatedError,
} from "@/lib/approvals/errors";
import { listApprovedApprovalsForClientUser } from "@/lib/approvals/list-get-approvals";

/**
 * Cliente Server Action — list approved Aprobación packages (US-11.3).
 * Frontend: `/ready-to-publish` list page.
 *
 * requireActive("handler") is the first await.
 */
export async function listApprovedApprovals(): Promise<ListApprovedApprovalsResult> {
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

    return await listApprovedApprovalsForClientUser({ user });
  } catch (error) {
    if (isAuthGuardError(error)) {
      return error.status === 401
        ? approvalUnauthenticatedError()
        : approvalForbiddenError();
    }
    console.error("[approvals] listApprovedApprovals unexpected error");
    return approvalInternalError();
  }
}
