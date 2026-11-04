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
import { generateReelScripts } from "@/lib/reel-scripts/actions/generate-reel-scripts";
import { regenerateReelScriptSlot } from "@/lib/reel-scripts/actions/regenerate-reel-script-slot";

export type ProposalCardCopy = {
  title: string;
  approve: string;
  changeSomething: string;
  approving: string;
  success: string;
  error: string;
  spendHint: string;
  spendUnknown: string;
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

export type KnownProposal =
  | GenerateProposal
  | ApproveStrategyProposal
  | ApproveVideoProposal
  | GenerateScriptsProposal
  | GenerateVideosProposal
  | RequestVideoChangesProposal
  | RegenerateScriptProposal;

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

  const spendNote = proposal.incursSpend ? (
    <p className="text-butter">
      {proposal.estimatedCostCents != null
        ? copy.spendHint.replace(
            "{amount}",
            formatCents(proposal.estimatedCostCents),
          )
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
