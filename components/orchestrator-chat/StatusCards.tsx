"use client";

import { AgentCard } from "@/components/agent-cards/AgentCard";
import { parseAgentCard } from "@/lib/agent-cards";

export type StatusCardCopy = {
  campaignTitle: string;
  planTitle: string;
  scriptsTitle: string;
  pendingVideos: string;
  readyVideos: string;
  planNone: string;
  planDraft: string;
  planApproved: string;
  planUnknown: string;
  noPlan: string;
  videosLabel: string;
  scriptsReady: string;
  scriptsWaiting: string;
  emptyScripts: string;
};

type CampaignStatusOutput = {
  ok: true;
  pendingApprovalsCount: number;
  approvedReadyCount: number;
  strategyStatus?: "none" | "draft" | "approved" | "unknown";
  weekStart?: string;
};

type StrategyOutput = {
  ok: true;
  weekStart: string;
  strategy: {
    status: "draft" | "approved";
    themes: string[];
    slots: Array<{ tema: string }>;
  } | null;
};

type ScriptsOutput = {
  ok: true;
  items: Array<{ tema: string; status: "pending" | "generated" }>;
};

export function CampaignStatusCard({
  output,
  copy,
}: {
  output: CampaignStatusOutput;
  copy: StatusCardCopy;
}) {
  const planLabel =
    output.strategyStatus === "draft"
      ? copy.planDraft
      : output.strategyStatus === "approved"
        ? copy.planApproved
        : output.strategyStatus === "none"
          ? copy.planNone
          : copy.planUnknown;

  const card = parseAgentCard({
    type: "status_summary",
    title: copy.campaignTitle,
    summary: output.weekStart,
    props: {
      lines: [
        copy.pendingVideos.replace(
          "{count}",
          String(output.pendingApprovalsCount),
        ),
        copy.readyVideos.replace("{count}", String(output.approvedReadyCount)),
        planLabel,
      ],
    },
    actions: [],
  });

  return <AgentCard card={card} />;
}

export function WeeklyPlanCard({
  output,
  copy,
}: {
  output: StrategyOutput;
  copy: StatusCardCopy;
}) {
  if (!output.strategy) {
    const card = parseAgentCard({
      type: "status_summary",
      title: copy.planTitle,
      summary: copy.noPlan,
      props: { lines: [] },
      actions: [],
    });
    return <AgentCard card={card} />;
  }

  const card = parseAgentCard({
    type: "status_summary",
    title: copy.planTitle,
    summary:
      output.strategy.status === "draft" ? copy.planDraft : copy.planApproved,
    props: {
      lines:
        output.strategy.themes.length > 0
          ? [output.strategy.themes.join(" · ")]
          : [],
      listItems: output.strategy.slots.map(
        (slot, index) =>
          `${copy.videosLabel.replace("{n}", String(index + 1))}: ${slot.tema}`,
      ),
    },
    actions: [],
  });

  return <AgentCard card={card} />;
}

export function ScriptsStatusCard({
  output,
  copy,
}: {
  output: ScriptsOutput;
  copy: StatusCardCopy;
}) {
  const ready = output.items.filter((i) => i.status === "generated").length;
  const waiting = output.items.filter((i) => i.status === "pending").length;

  const card = parseAgentCard({
    type: "status_summary",
    title: copy.scriptsTitle,
    props: {
      lines:
        output.items.length === 0
          ? [copy.emptyScripts]
          : [
              copy.scriptsReady.replace("{count}", String(ready)),
              copy.scriptsWaiting.replace("{count}", String(waiting)),
            ],
    },
    actions: [],
  });

  return <AgentCard card={card} />;
}
