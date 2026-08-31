import "server-only";

import type {
  ApprovalListItemDto,
  ApprovalPackageDto,
  ApprovalQaOverrideDto,
} from "@/lib/contracts/approval";
import {
  buildEffectiveInstagramCaption,
  resolveSelectedCtaVariant,
} from "@/lib/contracts/reel-caption";
import type { AssemblyJobRow } from "@/lib/assembly/assembly-job-row";
import { loadAssemblyJobScoped } from "@/lib/assembly/load-assembly-job";
import type { ApprovalRow } from "@/lib/approvals/persist-approval";
import {
  computeRevisionsRemaining,
  getMaxRevisionRounds,
} from "@/lib/approvals/get-max-revision-rounds";
import { getLastClientRevisionRound } from "@/lib/approvals/parse-change-requests";
import { getQaGateStatusForAssembledReel } from "@/lib/qa/get-qa-gate-status-for-assembled-reel";
import {
  loadQaOverridesForReport,
  type QaOverrideRow,
} from "@/lib/qa/persist-qa-override";
import { loadReelScriptForQa } from "@/lib/qa/load-reel-script-for-qa";
import { getReelCaptionByScriptId } from "@/lib/reel-captions/persist-reel-caption";
import {
  GENERIC_AVATAR_DISCLOSURE_MESSAGE_KEY,
  mediaPreviewUrl,
  truncateCaptionPreview,
} from "@/lib/approvals/caption-preview";

export {
  APPROVAL_CAPTION_PREVIEW_MAX,
  GENERIC_AVATAR_DISCLOSURE_MESSAGE_KEY,
  mediaPreviewUrl,
  truncateCaptionPreview,
} from "@/lib/approvals/caption-preview";

export function toApprovalQaOverrideDtos(
  rows: readonly QaOverrideRow[],
): ApprovalQaOverrideDto[] {
  return rows.map((row) => ({
    overrideId: row.id,
    checkKey: row.checkKey,
    reason: row.reason,
    createdAt: row.createdAt,
  }));
}

export type ComposeApprovalPackageResult =
  | { ok: true; package: ApprovalPackageDto; assembly: AssemblyJobRow }
  | {
      ok: false;
      code:
        | "NOT_FOUND"
        | "CAPTION_REQUIRED"
        | "CAPTION_CTA_NOT_SELECTED"
        | "BRANDING_REQUIRED"
        | "INTERNAL_ERROR";
    };

export async function composeApprovalPackage(params: {
  approval: ApprovalRow;
  clientId: string;
}): Promise<ComposeApprovalPackageResult> {
  const assembly = await loadAssemblyJobScoped({
    jobId: params.approval.assembledReelId,
    clientId: params.clientId,
  });
  if (!assembly) {
    return { ok: false, code: "NOT_FOUND" };
  }

  if (
    assembly.brandingStatus !== "completed" ||
    !assembly.outputMediaAssetId
  ) {
    return { ok: false, code: "BRANDING_REQUIRED" };
  }

  const caption = await getReelCaptionByScriptId({
    clientId: params.clientId,
    reelScriptId: assembly.reelScriptId,
  });
  if (!caption) {
    return { ok: false, code: "CAPTION_REQUIRED" };
  }

  const selectedCtaText = resolveSelectedCtaVariant(
    caption.record,
    caption.selectedCtaIndex,
  );
  if (!selectedCtaText) {
    return { ok: false, code: "CAPTION_CTA_NOT_SELECTED" };
  }

  const script = await loadReelScriptForQa({
    reelScriptId: assembly.reelScriptId,
    clientId: params.clientId,
  });

  const disclosureRequired = script?.mustDiscloseNotOwner === true;
  const gate = await getQaGateStatusForAssembledReel(
    params.approval.assembledReelId,
  );

  let qaOverrides: ApprovalQaOverrideDto[] = [];
  if (gate.qaReportId) {
    const overrideRows = await loadQaOverridesForReport({
      qaReportId: gate.qaReportId,
      clientId: params.clientId,
    });
    qaOverrides = toApprovalQaOverrideDtos(overrideRows);
  }

  const effectiveCaption = buildEffectiveInstagramCaption({
    caption: caption.record.caption,
    selectedCtaText,
    hashtags: caption.record.hashtags,
  });

  const maxRevisionRounds = getMaxRevisionRounds();
  const revisionsRemaining = computeRevisionsRemaining({
    revisionCount: params.approval.revisionCount,
    maxRevisionRounds,
    extraRevisionGranted: params.approval.extraRevisionGranted,
    status: params.approval.status,
  });
  const lastChangeRequest = getLastClientRevisionRound(
    params.approval.changeRequests,
  );

  const cover =
    assembly.coverMediaAssetId != null
      ? {
          assetId: assembly.coverMediaAssetId,
          previewUrl: mediaPreviewUrl(assembly.coverMediaAssetId),
        }
      : null;

  const pkg: ApprovalPackageDto = {
    approvalId: params.approval.id,
    assembledReelId: params.approval.assembledReelId,
    status: params.approval.status,
    video: {
      assetId: assembly.outputMediaAssetId,
      previewUrl: mediaPreviewUrl(assembly.outputMediaAssetId),
    },
    cover,
    caption: {
      body: caption.record.caption,
      selectedCtaText,
      effectiveCaption,
    },
    hashtags: caption.record.hashtags,
    disclosure: disclosureRequired
      ? {
          required: true,
          messageKey: GENERIC_AVATAR_DISCLOSURE_MESSAGE_KEY,
        }
      : { required: false },
    qaOverrides,
    gate: {
      ready: gate.ready,
      status: gate.status,
      overriddenCheckKeys: gate.overriddenCheckKeys,
      uncoveredFailedCheckKeys: gate.uncoveredFailedCheckKeys,
    },
    revisionCount: params.approval.revisionCount,
    maxRevisionRounds,
    revisionsRemaining,
    extraRevisionGranted: params.approval.extraRevisionGranted,
    ...(lastChangeRequest ? { lastChangeRequest } : {}),
    decidedAt: params.approval.decidedAt,
    createdAt: params.approval.createdAt,
    updatedAt: params.approval.updatedAt,
  };

  return { ok: true, package: pkg, assembly };
}

export async function toApprovalListItemDto(params: {
  approval: ApprovalRow;
  clientId: string;
}): Promise<ApprovalListItemDto> {
  const composed = await composeApprovalPackage(params);
  if (composed.ok) {
    return {
      approvalId: params.approval.id,
      assembledReelId: params.approval.assembledReelId,
      status: params.approval.status,
      createdAt: params.approval.createdAt,
      captionPreview: truncateCaptionPreview(composed.package.caption.body),
      hasDisclosure: composed.package.disclosure.required,
      overrideCount: composed.package.qaOverrides.length,
      videoAssetId: composed.package.video.assetId,
    };
  }

  // Soft fallback — still always populate captionPreview when caption exists
  const assembly = await loadAssemblyJobScoped({
    jobId: params.approval.assembledReelId,
    clientId: params.clientId,
  });
  let captionPreview: string | undefined;
  let hasDisclosure: boolean | undefined;
  let videoAssetId: string | undefined;

  if (assembly) {
    videoAssetId = assembly.outputMediaAssetId ?? undefined;
    const caption = await getReelCaptionByScriptId({
      clientId: params.clientId,
      reelScriptId: assembly.reelScriptId,
    });
    if (caption) {
      captionPreview = truncateCaptionPreview(caption.record.caption);
    }
    const script = await loadReelScriptForQa({
      reelScriptId: assembly.reelScriptId,
      clientId: params.clientId,
    });
    if (script) {
      hasDisclosure = script.mustDiscloseNotOwner;
    }
  }

  return {
    approvalId: params.approval.id,
    assembledReelId: params.approval.assembledReelId,
    status: params.approval.status,
    createdAt: params.approval.createdAt,
    captionPreview: captionPreview ?? "",
    hasDisclosure,
    videoAssetId,
  };
}
