import "server-only";

/**
 * List pending + get package helpers (US-11.1).
 */

import type { CurrentUser } from "@/lib/auth/get-current-user-types";
import {
  getApprovalPackageInputSchema,
  type GetApprovalPackageResult,
  type ListPendingApprovalsResult,
} from "@/lib/contracts/approval";
import {
  toApprovalListItemDto,
  composeApprovalPackage,
} from "@/lib/approvals/compose-approval-package";
import { ensureApprovalPackageForAssembledReelForClient } from "@/lib/approvals/ensure-approval-package";
import {
  approvalBrandingRequiredError,
  approvalCaptionCtaNotSelectedError,
  approvalCaptionRequiredError,
  approvalForbiddenFieldsError,
  approvalInternalError,
  approvalNotFoundError,
  approvalValidationError,
} from "@/lib/approvals/errors";
import { findForbiddenApprovalKeys } from "@/lib/approvals/find-forbidden-approval-keys";
import {
  listBrandCompletedAssemblyIdsForClient,
  listPendingApprovalsForClient,
  loadApprovalByIdScoped,
} from "@/lib/approvals/persist-approval";
import { zodInterviewErrorToFieldErrors } from "@/lib/interview/zod-field-errors";

export async function listPendingApprovalsForClientUser(params: {
  user: CurrentUser;
}): Promise<ListPendingApprovalsResult> {
  const clientId = params.user.id;

  // Optional batch-ensure: failures skip that reel — do not fail whole list
  const candidateIds = await listBrandCompletedAssemblyIdsForClient({
    clientId,
  });
  for (const assembledReelId of candidateIds) {
    try {
      await ensureApprovalPackageForAssembledReelForClient({
        rawInput: { assembledReelId },
        user: params.user,
      });
    } catch {
      // skip reel
    }
  }

  const rows = await listPendingApprovalsForClient({ clientId });
  const items = [];
  for (const approval of rows) {
    items.push(
      await toApprovalListItemDto({
        approval,
        clientId,
      }),
    );
  }

  return { ok: true, items };
}

export async function getApprovalPackageForClient(params: {
  rawInput: unknown;
  user: CurrentUser;
}): Promise<GetApprovalPackageResult> {
  const forbiddenKeys = findForbiddenApprovalKeys(params.rawInput, "get");
  if (forbiddenKeys.length > 0) {
    const fields: Record<string, string[]> = {};
    for (const key of forbiddenKeys) {
      fields[key] = ["FORBIDDEN"];
    }
    return approvalForbiddenFieldsError(fields);
  }

  const parsed = getApprovalPackageInputSchema.safeParse(params.rawInput);
  if (!parsed.success) {
    return approvalValidationError(
      zodInterviewErrorToFieldErrors(parsed.error),
    );
  }

  const clientId = params.user.id;
  const approval = await loadApprovalByIdScoped({
    approvalId: parsed.data.approvalId,
    clientId,
  });
  if (!approval) {
    return approvalNotFoundError();
  }

  const composed = await composeApprovalPackage({
    approval,
    clientId,
  });
  if (!composed.ok) {
    if (composed.code === "NOT_FOUND") {
      return approvalNotFoundError();
    }
    if (composed.code === "CAPTION_REQUIRED") {
      return approvalCaptionRequiredError();
    }
    if (composed.code === "CAPTION_CTA_NOT_SELECTED") {
      return approvalCaptionCtaNotSelectedError();
    }
    if (composed.code === "BRANDING_REQUIRED") {
      return approvalBrandingRequiredError();
    }
    return approvalInternalError();
  }

  return { ok: true, package: composed.package };
}
