import type { ApprovalStatus } from "@/lib/contracts/approval";
import type {
  CalendarPipelineStatus,
  CalendarPublishStatus,
} from "@/lib/contracts/calendar";
import type { AssemblyJobStatus } from "@/lib/contracts/assembly-job";
import type { BrandingJobStatus } from "@/lib/contracts/branding-job";
import type { ReelCaptionSummary } from "@/lib/contracts/reel-caption";
import type { QaReportStatus } from "@/lib/contracts/qa-report";
import { mediaPreviewUrl } from "@/lib/approvals/caption-preview";

export type CalendarPipelineDeriveInput = {
  publishStatus: CalendarPublishStatus;
  reelScriptId: string | null;
  captionSummary: ReelCaptionSummary | null;
  videoJobStatus: string | null;
  assemblyStatus: AssemblyJobStatus | null;
  brandingStatus: BrandingJobStatus | null;
  outputMediaAssetId: string | null;
  qaReportStatus: QaReportStatus | null;
  approvalStatus: ApprovalStatus | null;
  approvalId: string | null;
  assembledReelId: string | null;
};

export type CalendarPipelineDeriveResult = {
  pipelineStatus: CalendarPipelineStatus;
  changesRequested: boolean;
  approvalStatus: ApprovalStatus | null;
  approvalId: string | null;
  assembledReelId: string | null;
  thumbnailPreviewUrl: string | null;
};

function isJobInFlight(status: string | null | undefined): boolean {
  return status === "queued" || status === "processing";
}

function hasBrandedAssemblyOutput(input: CalendarPipelineDeriveInput): boolean {
  return (
    input.outputMediaAssetId !== null &&
    input.assemblyStatus === "completed" &&
    (input.brandingStatus === "completed" ||
      input.brandingStatus === "skipped" ||
      input.brandingStatus === null)
  );
}

function isGeneratingStage(input: CalendarPipelineDeriveInput): boolean {
  if (input.reelScriptId === null) {
    return true;
  }

  const caption = input.captionSummary;
  if (caption === null || caption.status !== "generated") {
    return true;
  }

  if (
    isJobInFlight(input.videoJobStatus) ||
    isJobInFlight(input.assemblyStatus) ||
    isJobInFlight(input.brandingStatus)
  ) {
    return true;
  }

  return false;
}

function isQaStage(input: CalendarPipelineDeriveInput): boolean {
  if (!hasBrandedAssemblyOutput(input)) {
    return false;
  }

  const awaitingApprovalEnqueue =
    input.approvalStatus === null && input.assembledReelId !== null;

  return input.qaReportStatus !== null || awaitingApprovalEnqueue;
}

/**
 * Priority cascade for calendar card color (US-12.1 Rule R1 + R2).
 * `rejected` is never emitted — branches 2–3 skipped when latest approval is rejected.
 */
export function deriveCalendarPipelineStatus(
  input: CalendarPipelineDeriveInput,
): CalendarPipelineDeriveResult {
  const thumbnailPreviewUrl =
    input.outputMediaAssetId !== null
      ? mediaPreviewUrl(input.outputMediaAssetId)
      : null;

  const base = {
    approvalId: input.approvalId,
    assembledReelId: input.assembledReelId,
    thumbnailPreviewUrl,
  };

  if (input.publishStatus === "published") {
    return {
      ...base,
      pipelineStatus: "published",
      changesRequested: false,
      approvalStatus: input.approvalStatus,
    };
  }

  const approvalRejected = input.approvalStatus === "rejected";

  if (!approvalRejected && input.approvalStatus === "approved") {
    return {
      ...base,
      pipelineStatus: "approved",
      changesRequested: false,
      approvalStatus: input.approvalStatus,
    };
  }

  if (
    !approvalRejected &&
    (input.approvalStatus === "pending_client" ||
      input.approvalStatus === "changes_requested")
  ) {
    return {
      ...base,
      pipelineStatus: "pending",
      changesRequested: input.approvalStatus === "changes_requested",
      approvalStatus: input.approvalStatus,
    };
  }

  if (isQaStage(input)) {
    return {
      ...base,
      pipelineStatus: "qa",
      changesRequested: false,
      approvalStatus: approvalRejected ? null : input.approvalStatus,
    };
  }

  if (isGeneratingStage(input)) {
    return {
      ...base,
      pipelineStatus: "generating",
      changesRequested: false,
      approvalStatus: approvalRejected ? null : input.approvalStatus,
    };
  }

  return {
    ...base,
    pipelineStatus: "draft",
    changesRequested: false,
    approvalStatus: approvalRejected ? null : input.approvalStatus,
  };
}
