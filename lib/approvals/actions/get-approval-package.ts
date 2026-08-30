"use server";

import { isAuthGuardError, requireActive } from "@/lib/auth/require-user";
import type { GetApprovalPackageResult } from "@/lib/contracts/approval";
import {
  approvalForbiddenError,
  approvalInternalError,
  approvalUnauthenticatedError,
} from "@/lib/approvals/errors";
import { getApprovalPackageForClient } from "@/lib/approvals/list-get-approvals";

/**
 * Cliente Server Action — get Aprobación package DTO (US-11.1).
 * Accepts `{ approvalId }` only. Foreign → NOT_FOUND.
 * Frontend: `/approvals/[approvalId]` detail.
 *
 * requireActive("handler") is the first await.
 */
export async function getApprovalPackage(
  rawInput: unknown,
): Promise<GetApprovalPackageResult> {
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

    return await getApprovalPackageForClient({
      rawInput,
      user,
    });
  } catch (error) {
    if (isAuthGuardError(error)) {
      return error.status === 401
        ? approvalUnauthenticatedError()
        : approvalForbiddenError();
    }
    console.error("[approvals] getApprovalPackage unexpected error");
    return approvalInternalError();
  }
}
