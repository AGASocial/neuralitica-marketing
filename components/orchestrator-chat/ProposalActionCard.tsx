"use client";

import { useState, useTransition } from "react";

import {
  ScriptPreviewCard,
  VideoPreviewCard,
  type PreviewCardCopy,
} from "@/components/orchestrator-chat/PreviewCards";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { approveContentStrategy } from "@/lib/content-strategy/actions/approve-content-strategy";
import { generateContentStrategy } from "@/lib/content-strategy/actions/generate-content-strategy";
import { decideApproval } from "@/lib/approvals/actions/decide-approval";
import { upsertAvatar } from "@/lib/avatars/upsert-avatar";
import { AVATAR_CONSENT_DISCLOSURE_V1 } from "@/lib/contracts/avatar-consent";
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
  pickVideo?: string;
  videoOption?: string;
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

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function ProposalActionCard({
  proposal,
  copy,
  previewCopy,
  onChangeSomething,
}: ProposalActionCardProps) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);
  const initialTts =
    proposal.kind === "confirm_tts_generation"
      ? (proposal.eligibleVideos.find(
          (v) => v.reelScriptId === proposal.reelScriptId,
        ) ??
        proposal.eligibleVideos[0] ?? {
          reelScriptId: proposal.reelScriptId,
          slotIndex: proposal.slotIndex,
          tema: proposal.tema ?? "",
          estimatedCostCents: proposal.estimatedCostCents,
          confirmEstimateCents: proposal.confirmEstimateCents,
          charCount: proposal.charCount,
        })
      : null;
  const [ttsSelection, setTtsSelection] = useState<TtsEligibleVideo | null>(
    initialTts,
  );

  function onApprove() {
    setFailed(false);
    startTransition(async () => {
      try {
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
          const selected = ttsSelection ?? {
            reelScriptId: proposal.reelScriptId,
            confirmEstimateCents: proposal.confirmEstimateCents,
          };
          const result = await confirmTtsGenerationFromChat({
            reelScriptId: selected.reelScriptId,
            confirmEstimateCents: selected.confirmEstimateCents,
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

  const actionButtons = !done ? (
    <>
      <Button
        type="button"
        onClick={onApprove}
        disabled={pending}
        className="bg-butter text-deep hover:bg-butter/90"
      >
        {pending ? copy.approving : copy.approve}
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="text-dim"
        disabled={pending}
        onClick={() => onChangeSomething?.()}
      >
        {copy.changeSomething}
      </Button>
    </>
  ) : null;

  const spendCents =
    proposal.kind === "confirm_tts_generation" && ttsSelection
      ? ttsSelection.estimatedCostCents
      : proposal.estimatedCostCents;

  const spendNote = proposal.incursSpend ? (
    <p className="text-butter">
      {spendCents != null
        ? copy.spendHint.replace("{amount}", formatCents(spendCents))
        : copy.spendUnknown}
    </p>
  ) : null;

  if (
    (proposal.kind === "approve_pending_video" ||
      proposal.kind === "request_video_changes") &&
    proposal.videoPreviewUrl &&
    previewCopy
  ) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-dim">{proposal.summary}</p>
        {proposal.kind === "request_video_changes" ? (
          <p className="text-sm text-fog/90">{proposal.changeSummary}</p>
        ) : null}
        {spendNote}
        <VideoPreviewCard
          videoPreviewUrl={proposal.videoPreviewUrl}
          coverPreviewUrl={proposal.coverPreviewUrl}
          captionBody={proposal.captionPreview}
          copy={previewCopy}
          footer={
            <>
              {statusNotes}
              {actionButtons}
            </>
          }
        />
      </div>
    );
  }

  if (proposal.kind === "regenerate_script" && previewCopy) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-dim">{proposal.summary}</p>
        {proposal.changeSummary ? (
          <p className="text-sm text-fog/90">{proposal.changeSummary}</p>
        ) : null}
        {spendNote}
        <ScriptPreviewCard
          tema={proposal.tema ?? `Video ${proposal.slotIndex + 1}`}
          status="generated"
          hook={proposal.hook}
          body={proposal.body}
          cta={proposal.cta}
          copy={previewCopy}
          footer={
            <>
              {statusNotes}
              {actionButtons}
            </>
          }
        />
      </div>
    );
  }

  const stylePlain =
    proposal.kind === "confirm_paid_generation"
      ? proposal.styleLabel === "presenter"
        ? copy.stylePresenter
        : copy.styleImages
      : proposal.kind === "confirm_tts_generation"
        ? copy.styleVoice
        : null;

  const ttsTema =
    proposal.kind === "confirm_tts_generation"
      ? (ttsSelection?.tema || proposal.tema)
      : null;

  return (
    <Card className="border-edge bg-panel text-fog shadow-none">
      <CardHeader className="gap-1 px-4 pb-0 pt-4">
        <CardTitle className="font-display text-lg text-fog">{copy.title}</CardTitle>
        <CardDescription className="text-dim">{proposal.summary}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 px-4 py-3 text-sm text-dim">
        {proposal.kind === "approve_strategy" && proposal.themes?.length ? (
          <p>{proposal.themes.join(" · ")}</p>
        ) : null}
        {proposal.kind === "approve_pending_video" && proposal.captionPreview ? (
          <p className="line-clamp-3 text-fog/90">{proposal.captionPreview}</p>
        ) : null}
        {proposal.kind === "confirm_paid_generation" ? (
          <>
            {proposal.tema ? <p className="text-fog/90">{proposal.tema}</p> : null}
            {stylePlain ? <p>{stylePlain}</p> : null}
          </>
        ) : null}
        {proposal.kind === "confirm_tts_generation" ? (
          <>
            {ttsTema ? <p className="text-fog/90">{ttsTema}</p> : null}
            {stylePlain ? <p>{stylePlain}</p> : null}
            {proposal.eligibleVideos.length > 1 ? (
              <div className="space-y-2">
                <p className="text-xs text-dim">
                  {copy.pickVideo ?? "Choose a video"}
                </p>
                <div
                  className="flex flex-wrap gap-2"
                  role="group"
                  aria-label={copy.pickVideo ?? "Choose a video"}
                >
                  {proposal.eligibleVideos.map((video) => {
                    const selected =
                      ttsSelection?.reelScriptId === video.reelScriptId;
                    const label = (copy.videoOption ?? "Video {n}")
                      .replace("{n}", String(video.slotIndex + 1))
                      .replace("{tema}", video.tema);
                    return (
                      <Button
                        key={video.reelScriptId}
                        type="button"
                        size="sm"
                        variant={selected ? "default" : "outline"}
                        disabled={pending || done}
                        aria-pressed={selected}
                        className={
                          selected
                            ? "bg-butter text-deep hover:bg-butter/90"
                            : "border-edge bg-panel text-fog hover:bg-panel/80"
                        }
                        onClick={() => setTtsSelection(video)}
                      >
                        {label}
                      </Button>
                    );
                  })}
                </div>
                <label className="block sm:hidden">
                  <span className="sr-only">
                    {copy.pickVideo ?? "Choose a video"}
                  </span>
                  <select
                    className="w-full rounded-md border border-edge bg-deep px-2 py-2 text-sm text-fog"
                    disabled={pending || done}
                    value={ttsSelection?.reelScriptId ?? proposal.reelScriptId}
                    onChange={(event) => {
                      const next = proposal.eligibleVideos.find(
                        (v) => v.reelScriptId === event.target.value,
                      );
                      if (next) {
                        setTtsSelection(next);
                      }
                    }}
                  >
                    {proposal.eligibleVideos.map((video) => (
                      <option
                        key={video.reelScriptId}
                        value={video.reelScriptId}
                      >
                        {(copy.videoOption ?? "Video {n}")
                          .replace("{n}", String(video.slotIndex + 1))
                          .replace("{tema}", video.tema)}
                        {` · ${formatCents(video.estimatedCostCents)}`}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}
          </>
        ) : null}
        {proposal.kind === "save_interview_answer" ? (
          <p className="text-fog/90">
            {proposal.stepLabel}: {proposal.answerPreview}
          </p>
        ) : null}
        {spendNote}
        {statusNotes}
      </CardContent>
      {actionButtons ? (
        <CardFooter className="flex flex-wrap gap-2 px-4 pb-4">
          {actionButtons}
        </CardFooter>
      ) : null}
    </Card>
  );
}
