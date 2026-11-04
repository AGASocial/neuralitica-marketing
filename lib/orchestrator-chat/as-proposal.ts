import type { KnownProposal } from "@/components/orchestrator-chat/ProposalActionCard";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Extract a KnownProposal from a propose-* tool output envelope. */
export function asProposal(output: unknown): KnownProposal | null {
  if (!isRecord(output) || output.ok !== true || !isRecord(output.proposal)) {
    return null;
  }
  const p = output.proposal;
  if (
    p.requiresConfirmation !== true ||
    p.mutates !== false ||
    typeof p.kind !== "string" ||
    typeof p.summary !== "string"
  ) {
    return null;
  }
  if (p.kind === "generate_strategy" && typeof p.weekStart === "string") {
    return p as KnownProposal;
  }
  if (
    p.kind === "approve_strategy" &&
    typeof p.weekStart === "string" &&
    typeof p.strategyId === "string"
  ) {
    return p as KnownProposal;
  }
  if (p.kind === "approve_pending_video" && typeof p.approvalId === "string") {
    return p as KnownProposal;
  }
  if (p.kind === "generate_scripts" && typeof p.weekStart === "string") {
    return p as KnownProposal;
  }
  if (
    p.kind === "generate_videos" &&
    typeof p.weekStart === "string" &&
    p.paidMediaRequiresCostConfirm === true
  ) {
    return p as KnownProposal;
  }
  if (
    p.kind === "request_video_changes" &&
    typeof p.approvalId === "string" &&
    typeof p.changeSummary === "string" &&
    Array.isArray(p.tags)
  ) {
    return p as KnownProposal;
  }
  if (
    p.kind === "regenerate_script" &&
    typeof p.weekStart === "string" &&
    typeof p.slotIndex === "number"
  ) {
    return p as KnownProposal;
  }
  if (
    p.kind === "confirm_paid_generation" &&
    typeof p.reelScriptId === "string" &&
    typeof p.confirmEstimateCents === "number" &&
    typeof p.estimatedCostCents === "number" &&
    (p.paidKind === "broll" || p.paidKind === "heygen")
  ) {
    return p as KnownProposal;
  }
  if (
    p.kind === "confirm_tts_generation" &&
    typeof p.reelScriptId === "string" &&
    typeof p.confirmEstimateCents === "number" &&
    typeof p.estimatedCostCents === "number" &&
    p.paidKind === "tts" &&
    p.styleLabel === "voice" &&
    Array.isArray(p.eligibleVideos) &&
    p.eligibleVideos.length > 0
  ) {
    return p as KnownProposal;
  }
  if (p.kind === "grant_presenter_consent") {
    return p as KnownProposal;
  }
  if (
    p.kind === "set_presenter_voice" &&
    (p.gender === "male" || p.gender === "female") &&
    (p.language === "en" || p.language === "es")
  ) {
    return p as KnownProposal;
  }
  if (
    p.kind === "save_interview_answer" &&
    typeof p.currentStep === "string" &&
    typeof p.stepLabel === "string" &&
    typeof p.answerPreview === "string"
  ) {
    return p as KnownProposal;
  }
  if (p.kind === "submit_interview") {
    return p as KnownProposal;
  }
  if (
    p.kind === "enable_own_avatar" &&
    Array.isArray(p.allowedModes) &&
    p.allowedModes.includes("own_avatar")
  ) {
    return p as KnownProposal;
  }
  if (p.kind === "enable_auto_pilot") {
    return p as KnownProposal;
  }
  return null;
}

export const PROPOSE_TOOL_TYPES = [
  "tool-proposeGenerateStrategy",
  "tool-proposeApproveStrategy",
  "tool-proposeApprovePendingVideo",
  "tool-proposeGenerateScripts",
  "tool-proposeGenerateVideos",
  "tool-proposeRequestVideoChanges",
  "tool-proposeRegenerateScript",
  "tool-proposeConfirmPaidGeneration",
  "tool-proposeConfirmTtsGeneration",
  "tool-proposeGrantPresenterConsent",
  "tool-proposeSetPresenterVoice",
  "tool-proposeSaveInterviewAnswer",
  "tool-proposeSubmitInterview",
  "tool-proposeEnableOwnAvatar",
  "tool-proposeEnableAutoPilot",
] as const;

export function isProposeToolType(type: string): boolean {
  return (PROPOSE_TOOL_TYPES as readonly string[]).includes(type);
}
