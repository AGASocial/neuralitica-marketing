"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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

  return (
    <Card className="border-edge bg-panel text-fog shadow-none">
      <CardHeader className="px-4 pb-0 pt-4">
        <CardTitle className="font-display text-lg">{copy.campaignTitle}</CardTitle>
        {output.weekStart ? (
          <CardDescription className="text-dim">{output.weekStart}</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-1 px-4 py-3 text-sm text-dim">
        <p>
          {copy.pendingVideos.replace(
            "{count}",
            String(output.pendingApprovalsCount),
          )}
        </p>
        <p>
          {copy.readyVideos.replace(
            "{count}",
            String(output.approvedReadyCount),
          )}
        </p>
        <p>{planLabel}</p>
      </CardContent>
    </Card>
  );
}

export function WeeklyPlanCard({
  output,
  copy,
}: {
  output: StrategyOutput;
  copy: StatusCardCopy;
}) {
  if (!output.strategy) {
    return (
      <Card className="border-edge bg-panel text-fog shadow-none">
        <CardHeader className="px-4 pt-4">
          <CardTitle className="font-display text-lg">{copy.planTitle}</CardTitle>
          <CardDescription className="text-dim">{copy.noPlan}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="border-edge bg-panel text-fog shadow-none">
      <CardHeader className="px-4 pb-0 pt-4">
        <CardTitle className="font-display text-lg">{copy.planTitle}</CardTitle>
        <CardDescription className="text-dim">
          {output.strategy.status === "draft" ? copy.planDraft : copy.planApproved}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 px-4 py-3 text-sm text-dim">
        {output.strategy.themes.length > 0 ? (
          <p>{output.strategy.themes.join(" · ")}</p>
        ) : null}
        <ul className="list-disc space-y-1 pl-4">
          {output.strategy.slots.map((slot, index) => (
            <li key={`${index}-${slot.tema}`}>
              {copy.videosLabel.replace("{n}", String(index + 1))}: {slot.tema}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
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

  return (
    <Card className="border-edge bg-panel text-fog shadow-none">
      <CardHeader className="px-4 pb-0 pt-4">
        <CardTitle className="font-display text-lg">{copy.scriptsTitle}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 px-4 py-3 text-sm text-dim">
        {output.items.length === 0 ? (
          <p>{copy.emptyScripts}</p>
        ) : (
          <>
            <p>{copy.scriptsReady.replace("{count}", String(ready))}</p>
            <p>{copy.scriptsWaiting.replace("{count}", String(waiting))}</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
