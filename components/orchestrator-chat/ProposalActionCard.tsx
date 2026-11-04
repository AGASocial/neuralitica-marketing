"use client";

import { useState, useTransition } from "react";

import {
  AgentCard,
  type AgentCardActionEvent,
} from "@/components/agent-cards/AgentCard";
import { approveContentStrategy } from "@/lib/content-strategy/actions/approve-content-strategy";
import { generateContentStrategy } from "@/lib/content-strategy/actions/generate-content-strategy";
import { decideApproval } from "@/lib/approvals/actions/decide-approval";
import { upsertAvatar } from "@/lib/avatars/upsert-avatar";
import { AVATAR_CONSENT_DISCLOSURE_V1 } from "@/lib/contracts/avatar-consent";
import { mapProposalToAgentCard } from "@/lib/agent-cards";
import { confirmPaidGenerationFromChat } from "@/lib/orchestrator-chat/actions/confirm-paid-generation";
import { confirmTtsGenerationFromChat } from "@/lib/orchestrator-chat/actions/confirm-tts-generation";
import { generateReelScripts } from "@/lib/reel-scripts/actions/generate-reel-scripts";
import { regenerateReelScriptSlot } from "@/lib/reel-scripts/actions/regenerate-reel-script-slot";
import { persistInterviewDraft } from "@/lib/interview/actions/persist-interview-draft";
import { submitInterview } from "@/lib/interview/actions/submit-interview";
import type { FacelessStyle, VisualModality } from "@/lib/contracts/visual-preferences";
import { grantAvatarConsent } from "@/lib/visual-preferences/grant-avatar-consent";
import { upsertVisualPreferences } from "@/lib/visual-preferences/upsert-visual-preferences";
import { buildInterviewAnswerFragment } from "@/lib/orchestrator-chat/interview-questions";
import type { PreviewCardCopy } from "@/components/orchestrator-chat/PreviewCards";

export type ProposalCardCopy = {
  title: string;
  approve: string;
  changeSomething: string;
  approving: string;
  success: string;
  error: string;
  spendHint: string;
  spendUnknown: string;
  stylePresenter: string;
  styleImages: string;
  styleVoice: string;
  pickVideo: string;
  videoOption: string;
};

type TtsEligibleVideo = {
  reelScriptId: string;
  slotIndex: number;
  tema: string;
  estimatedCostCents: number;
  confirmEstimateCents: number;
  charCount: number;
};

type ProposalBase = {
  kind: string;
  summary: string;
  incursSpend: boolean;
  estimatedCostCents: number | null;
  requiresConfirmation: true;
  mutates: false;
};

type GenerateProposal = ProposalBase & {
  kind: "generate_strategy";
  weekStart: string;
  action: "generateContentStrategy";
};

type ApproveStrategyProposal = ProposalBase & {
  kind: "approve_strategy";
  weekStart: string;
  strategyId: string;
  action: "approveContentStrategy";
  themes?: string[];
};

type ApproveVideoProposal = ProposalBase & {
  kind: "approve_pending_video";
  approvalId: string;
  action: "decideApproval";
  captionPreview?: string;
  videoPreviewUrl?: string;
  coverPreviewUrl?: string;
};

type GenerateScriptsProposal = ProposalBase & {
  kind: "generate_scripts";
  weekStart: string;
  action: "generateReelScripts";
  pendingSlotCount?: number;
};

type GenerateVideosProposal = ProposalBase & {
  kind: "generate_videos";
  weekStart: string;
  action: "generateReelScripts";
  readyScriptCount?: number;
  paidMediaRequiresCostConfirm: true;
};

type RequestVideoChangesProposal = ProposalBase & {
  kind: "request_video_changes";
  approvalId: string;
  action: "decideApproval";
  decision: "request_changes";
  changeSummary: string;
  tags: Array<"script" | "caption" | "assembly" | "branding">;
  captionPreview?: string;
  videoPreviewUrl?: string;
  coverPreviewUrl?: string;
};

type RegenerateScriptProposal = ProposalBase & {
  kind: "regenerate_script";
  weekStart: string;
  slotIndex: number;
  action: "regenerateReelScriptSlot";
  changeSummary?: string;
  tema?: string;
  hook?: string;
  body?: string;
  cta?: string;
};

type ConfirmPaidGenerationProposal = ProposalBase & {
  kind: "confirm_paid_generation";
  weekStart: string;
  slotIndex: number;
  reelScriptId: string;
  tema?: string;
  styleLabel: "presenter" | "images_and_text";
  paidKind: "broll" | "heygen";
  action: "confirmPaidGenerationFromChat";
  confirmEstimateCents: number;
  targetDurationSec?: number;
  incursSpend: true;
  estimatedCostCents: number;
};

type GrantPresenterConsentProposal = ProposalBase & {
  kind: "grant_presenter_consent";
  action: "grantAvatarConsent";
  incursSpend: false;
  estimatedCostCents: null;
};

type SetPresenterVoiceProposal = ProposalBase & {
  kind: "set_presenter_voice";
  action: "upsertAvatar";
  gender: "male" | "female";
  language: "en" | "es";
  incursSpend: false;
  estimatedCostCents: null;
};

type SaveInterviewAnswerProposal = ProposalBase & {
  kind: "save_interview_answer";
  action: "persistInterviewDraft";
  currentStep:
    | "services"
    | "zone"
    | "tone"
    | "offers"
    | "objections"
    | "style"
    | "restrictions";
  stepLabel: string;
  answerPreview: string;
  description?: string;
  items?: string[];
  incursSpend: false;
  estimatedCostCents: null;
};

type SubmitInterviewProposal = ProposalBase & {
  kind: "submit_interview";
  action: "submitInterview";
  incursSpend: false;
  estimatedCostCents: null;
};

type EnableOwnAvatarProposal = ProposalBase & {
  kind: "enable_own_avatar";
  action: "upsertVisualPreferences";
  allowedModes: VisualModality[];
  facelessStyle: FacelessStyle | null;
  incursSpend: false;
  estimatedCostCents: null;
};

type ConfirmTtsGenerationProposal = ProposalBase & {
  kind: "confirm_tts_generation";
  weekStart: string;
  slotIndex: number;
  reelScriptId: string;
  tema?: string;
  styleLabel: "voice";
  paidKind: "tts";
  action: "confirmTtsGenerationFromChat";
  confirmEstimateCents: number;
  charCount: number;
  incursSpend: true;
  estimatedCostCents: number;
  eligibleVideos: TtsEligibleVideo[];
};

export type KnownProposal =
  | GenerateProposal
  | ApproveStrategyProposal
  | ApproveVideoProposal
  | GenerateScriptsProposal
  | GenerateVideosProposal
  | RequestVideoChangesProposal
  | RegenerateScriptProposal
  | ConfirmPaidGenerationProposal
  | ConfirmTtsGenerationProposal
  | GrantPresenterConsentProposal
  | SetPresenterVoiceProposal
  | SaveInterviewAnswerProposal
  | SubmitInterviewProposal
  | EnableOwnAvatarProposal;

type ProposalActionCardProps = {
  proposal: KnownProposal;
  copy: ProposalCardCopy;
  previewCopy?: PreviewCardCopy;
  onChangeSomething?: () => void;
};

export function ProposalActionCard({
  proposal,
  copy,
  previewCopy,
  onChangeSomething,
}: ProposalActionCardProps) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);

  const card = mapProposalToAgentCard(proposal, {
    title: copy.title,
    approve: pending ? copy.approving : copy.approve,
    changeSomething: copy.changeSomething,
    spendHint: copy.spendHint,
    spendUnknown: copy.spendUnknown,
    stylePresenter: copy.stylePresenter,
    styleImages: copy.styleImages,
    styleVoice: copy.styleVoice,
    pickVideo: copy.pickVideo,
    videoOption: copy.videoOption,
    scriptTitle: previewCopy?.scriptTitle,
    hookLabel: previewCopy?.hookLabel,
    bodyLabel: previewCopy?.bodyLabel,
    ctaLabel: previewCopy?.ctaLabel,
    pendingScript: previewCopy?.pendingScript,
  });

  async function runApprove(meta?: Record<string, unknown>) {
    let ok = false;
    if (proposal.kind === "generate_strategy") {
      const result = await generateContentStrategy({
        weekStart: proposal.weekStart,
      });
      ok = result.ok === true;
    } else if (proposal.kind === "approve_strategy") {
      const result = await approveContentStrategy({
        strategyId: proposal.strategyId,
        weekStart: proposal.weekStart,
      });
      ok = result.ok === true;
    } else if (
      proposal.kind === "generate_scripts" ||
      proposal.kind === "generate_videos"
    ) {
      const result = await generateReelScripts({
        weekStart: proposal.weekStart,
      });
      ok = result.ok === true;
    } else if (proposal.kind === "request_video_changes") {
      const result = await decideApproval({
        approvalId: proposal.approvalId,
        decision: "request_changes",
        changeRequest: {
          tags: proposal.tags,
          summary: proposal.changeSummary,
          notesByTag: {
            [proposal.tags[0]!]: proposal.changeSummary,
          },
        },
      });
      ok = result.ok === true;
    } else if (proposal.kind === "regenerate_script") {
      const result = await regenerateReelScriptSlot({
        weekStart: proposal.weekStart,
        slotIndex: proposal.slotIndex,
      });
      ok = result.ok === true;
    } else if (proposal.kind === "confirm_paid_generation") {
      const result = await confirmPaidGenerationFromChat({
        reelScriptId: proposal.reelScriptId,
        paidKind: proposal.paidKind,
        confirmEstimateCents: proposal.confirmEstimateCents,
        ...(proposal.targetDurationSec !== undefined
          ? { targetDurationSec: proposal.targetDurationSec }
          : {}),
      });
      ok = result.ok === true;
    } else if (proposal.kind === "confirm_tts_generation") {
      const reelScriptId =
        typeof meta?.reelScriptId === "string"
          ? meta.reelScriptId
          : proposal.reelScriptId;
      const confirmEstimateCents =
        typeof meta?.confirmEstimateCents === "number"
          ? meta.confirmEstimateCents
          : proposal.confirmEstimateCents;
      const result = await confirmTtsGenerationFromChat({
        reelScriptId,
        confirmEstimateCents,
      });
      ok = result.ok === true;
    } else if (proposal.kind === "grant_presenter_consent") {
      const result = await grantAvatarConsent({
        affirmed: true,
        consentVersion: AVATAR_CONSENT_DISCLOSURE_V1,
      });
      ok = result.ok === true;
    } else if (proposal.kind === "set_presenter_voice") {
      const result = await upsertAvatar({
        gender: proposal.gender,
        language: proposal.language,
      });
      ok = result.ok === true;
    } else if (proposal.kind === "save_interview_answer") {
      const fragment = buildInterviewAnswerFragment({
        currentStep: proposal.currentStep,
        description: proposal.description,
        items: proposal.items,
      });
      if (!fragment) {
        ok = false;
      } else {
        const result = await persistInterviewDraft({
          currentStep: proposal.currentStep,
          answers: fragment,
        });
        ok = result.ok === true;
      }
    } else if (proposal.kind === "submit_interview") {
      const result = await submitInterview({});
      ok = result.ok === true;
    } else if (proposal.kind === "enable_own_avatar") {
      const result = await upsertVisualPreferences({
        allowedModes: proposal.allowedModes,
        facelessStyle: proposal.facelessStyle,
        genericAvatarId: null,
      });
      ok = result.ok === true;
    } else {
      const result = await decideApproval({
        approvalId: proposal.approvalId,
        decision: "approved",
      });
      ok = result.ok === true;
    }
    return ok;
  }

  function onAction(event: AgentCardActionEvent) {
    if (event.id === "change") {
      onChangeSomething?.();
      return;
    }
    if (event.id !== "approve") {
      return;
    }
    setFailed(false);
    startTransition(async () => {
      try {
        const ok = await runApprove(event.meta);
        if (ok) {
          setDone(true);
        } else {
          setFailed(true);
        }
      } catch {
        setFailed(true);
      }
    });
  }

  const statusNotes = (
    <>
      {done ? <p className="w-full text-sm text-fog">{copy.success}</p> : null}
      {failed ? <p className="w-full text-sm text-rose">{copy.error}</p> : null}
    </>
  );

  return (
    <AgentCard
      card={card}
      onAction={onAction}
      disabled={pending || done}
      hideActions={done}
      statusNote={statusNotes}
    />
  );
}
