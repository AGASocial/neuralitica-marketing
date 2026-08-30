"use server";

import { revalidatePath } from "next/cache";

import { isAuthGuardError, requireActive } from "@/lib/auth/require-user";
import type { EnsureApprovalPackageResult } from "@/lib/contracts/approval";
import {
  approvalForbiddenError,
  approvalInternalError,
  approvalUnauthenticatedError,
} from "@/lib/approvals/errors";
import { ensureApprovalPackageForAssembledReelForClient } from "@/lib/approvals/ensure-approval-package";

/**
 * Cliente Server Action — ensure Aprobación package for branded Ensamblado (US-11.1).
 * Accepts `{ assembledReelId }` only.
 * Frontend: `/approvals` batch-ensure · detail hydrate.
 *
 * requireActive("handler") is the first await — failure → 401/403, no INSERT.
 */
export async function ensureApprovalPackageForAssembledReel(
  rawInput: unknown,
): Promise<EnsureApprovalPackageResult> {
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

    const result = await ensureApprovalPackageForAssembledReelForClient({
      rawInput,
      user,
    });

    if (result.ok) {
      revalidatePath("/approvals");
      revalidatePath(`/approvals/${result.package.approvalId}`);
    }

    return result;
  } catch (error) {
    if (isAuthGuardError(error)) {
      return error.status === 401
        ? approvalUnauthenticatedError()
        : approvalForbiddenError();
    }
    console.error("[approvals] ensureApprovalPackage unexpected error");
    return approvalInternalError();
  }
}
