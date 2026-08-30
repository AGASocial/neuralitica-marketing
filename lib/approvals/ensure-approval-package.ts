import "server-only";

/**
 * Ensure approval package orchestration (US-11.1).
 * Closed write surface for INSERT pending_client only.
 */

import type { CurrentUser } from "@/lib/auth/get-current-user-types";
import {
  APPROVAL_ENSURE_AGENT_KEY,
  ensureApprovalPackageInputSchema,
  type EnsureApprovalPackageResult,
} from "@/lib/contracts/approval";
import { resolveSelectedCtaVariant } from "@/lib/contracts/reel-caption";
import { loadAssemblyJobScoped } from "@/lib/assembly/load-assembly-job";
import {
  checkApprovalRateLimit,
  recordApprovalAttempt,
} from "@/lib/approvals/check-approval-rate-limit";
import { composeApprovalPackage } from "@/lib/approvals/compose-approval-package";
import {
  approvalAssemblyNotReadyError,
  approvalBrandingRequiredError,
  approvalCaptionCtaNotSelectedError,
  approvalCaptionRequiredError,
  approvalForbiddenFieldsError,
  approvalInternalError,
  approvalNotFoundError,
  approvalQaGateNotReadyError,
  approvalRateLimitedError,
  approvalValidationError,
} from "@/lib/approvals/errors";
import { findForbiddenApprovalKeys } from "@/lib/approvals/find-forbidden-approval-keys";
import {
  insertPendingApproval,
  loadApprovalByAssembledReelScoped,
} from "@/lib/approvals/persist-approval";
import { zodInterviewErrorToFieldErrors } from "@/lib/interview/zod-field-errors";
import { getQaGateStatusForAssembledReel } from "@/lib/qa/get-qa-gate-status-for-assembled-reel";
import { getReelCaptionByScriptId } from "@/lib/reel-captions/persist-reel-caption";

export type EnsureApprovalPackageForClientParams = {
  rawInput: unknown;
  user: CurrentUser;
};

export async function ensureApprovalPackageForAssembledReelForClient(
  params: EnsureApprovalPackageForClientParams,
): Promise<EnsureApprovalPackageResult> {
  const forbiddenKeys = findForbiddenApprovalKeys(params.rawInput, "ensure");
  if (forbiddenKeys.length > 0) {
    const fields: Record<string, string[]> = {};
    for (const key of forbiddenKeys) {
      fields[key] = ["FORBIDDEN"];
    }
    return approvalForbiddenFieldsError(fields);
  }

  const parsed = ensureApprovalPackageInputSchema.safeParse(params.rawInput);
  if (!parsed.success) {
    return approvalValidationError(
      zodInterviewErrorToFieldErrors(parsed.error),
    );
  }

  const { assembledReelId } = parsed.data;
  const clientId = params.user.id;

  const rateCheck = await checkApprovalRateLimit({
    clientId,
    agentKey: APPROVAL_ENSURE_AGENT_KEY,
  });
  if (!rateCheck.ok) {
    return approvalRateLimitedError();
  }

  const assembly = await loadAssemblyJobScoped({
    jobId: assembledReelId,
    clientId,
  });
  if (!assembly) {
    return approvalNotFoundError();
  }

  if (assembly.status !== "completed") {
    return approvalAssemblyNotReadyError();
  }

  if (
    assembly.brandingStatus !== "completed" ||
    !assembly.outputMediaAssetId
  ) {
    return approvalBrandingRequiredError();
  }

  const gate = await getQaGateStatusForAssembledReel(assembledReelId);
  if (gate.ready !== true) {
    return approvalQaGateNotReadyError();
  }

  const caption = await getReelCaptionByScriptId({
    clientId,
    reelScriptId: assembly.reelScriptId,
  });
  if (!caption) {
    return approvalCaptionRequiredError();
  }
  if (caption.selectedCtaIndex === null) {
    return approvalCaptionCtaNotSelectedError();
  }
  const selectedCtaText = resolveSelectedCtaVariant(
    caption.record,
    caption.selectedCtaIndex,
  );
  if (!selectedCtaText) {
    return approvalCaptionCtaNotSelectedError();
  }

  const existing = await loadApprovalByAssembledReelScoped({
    assembledReelId,
    clientId,
  });

  let approval = existing;
  let created = false;

  if (!approval) {
    const inserted = await insertPendingApproval({
      clientId,
      assembledReelId,
    });
    if (!inserted) {
      return approvalInternalError();
    }
    approval = inserted;
    created = true;
  }

  await recordApprovalAttempt({
    clientId,
    agentKey: APPROVAL_ENSURE_AGENT_KEY,
  });

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

  return {
    ok: true,
    created,
    package: composed.package,
  };
}
