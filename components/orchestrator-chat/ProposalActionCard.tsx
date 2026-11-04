"use client";

import { useState, useTransition } from "react";

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
};

export type KnownProposal =
  | GenerateProposal
  | ApproveStrategyProposal
  | ApproveVideoProposal;

type ProposalActionCardProps = {
  proposal: KnownProposal;
  copy: ProposalCardCopy;
};

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function ProposalActionCard({ proposal, copy }: ProposalActionCardProps) {
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
        {proposal.incursSpend ? (
          <p className="text-butter">
            {proposal.estimatedCostCents != null
              ? copy.spendHint.replace(
                  "{amount}",
                  formatCents(proposal.estimatedCostCents),
                )
              : copy.spendUnknown}
          </p>
        ) : null}
        {done ? <p className="text-fog">{copy.success}</p> : null}
        {failed ? <p className="text-rose">{copy.error}</p> : null}
      </CardContent>
      {!done ? (
        <CardFooter className="flex flex-wrap gap-2 px-4 pb-4">
          <Button
            type="button"
            onClick={onApprove}
            disabled={pending}
            className="bg-butter text-deep hover:bg-butter/90"
          >
            {pending ? copy.approving : copy.approve}
          </Button>
          <Button type="button" variant="ghost" className="text-dim" disabled={pending}>
            {copy.changeSomething}
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  );
}
