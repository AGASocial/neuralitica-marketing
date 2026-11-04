"use client";

import Link from "next/link";

import { OpenChatButton } from "@/components/dashboard/OpenChatButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusAlert } from "@/components/ui/status-alert";
import type {
  OwnerHomeAtajo,
  OwnerHomeCampaignProgress,
  OwnerHomeNextAction,
  OwnerHomeRecentVideo,
  OwnerHomeTrafficLight,
  OwnerHomeWeekCounts,
} from "@/lib/contracts/owner-home-dashboard";
import type {
  SetupCompletionDto,
  SetupStepId,
} from "@/lib/contracts/setup-completion";

export type DashboardCard = {
  title: string;
  body: string;
  cta: string;
  href?: string;
  error?: boolean;
};

type NextActionCopy = {
  sectionTitle: string;
  title: string;
  body: string;
  cta: string;
};

type ThisWeekCopy = {
  title: string;
  scheduled: string;
  published: string;
  waitingForOk: string;
  inProduction: string;
  statusLabel: string;
};

type CampaignCopy = {
  title: string;
  ofVideos: string;
  empty: string;
};

type ResultsCopy = {
  title: string;
  empty: string;
  emptyHint: string;
};

type RecentCopy = {
  title: string;
  empty: string;
  openAll: string;
  untitled: string;
};

type AtajosCopy = {
  title: string;
  labels: Record<OwnerHomeAtajo["id"], string>;
};

type SetupCompletionCopy = {
  title: string;
  progress: string;
  doIt: string;
  optional: string;
  done: string;
  steps: Record<SetupStepId, string>;
};

type DashboardViewProps = {
  title: string;
  subtitle: string;
  lastUpdatedLabel: string;
  setupBanner?: {
    title: string;
    body: string;
  };
  loadError?: string;
  nextAction: OwnerHomeNextAction;
  nextActionCopy: NextActionCopy;
  weekCounts: OwnerHomeWeekCounts;
  trafficLight: OwnerHomeTrafficLight;
  thisWeekCopy: ThisWeekCopy;
  campaignProgress: OwnerHomeCampaignProgress;
  campaignCopy: CampaignCopy;
  resultsCopy: ResultsCopy;
  recentVideos: OwnerHomeRecentVideo[];
  recentCopy: RecentCopy;
  atajos: OwnerHomeAtajo[];
  atajosCopy: AtajosCopy;
  setupCompletion?: SetupCompletionDto;
  setupCompletionCopy?: SetupCompletionCopy;
};

function trafficDotClass(light: OwnerHomeTrafficLight): string {
  switch (light) {
    case "green":
      return "bg-emerald-500";
    case "yellow":
      return "bg-amber-400";
    case "red":
      return "bg-rose-500";
    default:
      return "bg-dim";
  }
}

function progressPercent(progress: OwnerHomeCampaignProgress): number {
  if (progress.total <= 0) return 0;
  return Math.round((progress.completed / progress.total) * 100);
}

export function DashboardView({
  title,
  subtitle,
  lastUpdatedLabel,
  setupBanner,
  loadError,
  nextAction,
  nextActionCopy,
  weekCounts,
  trafficLight,
  thisWeekCopy,
  campaignProgress,
  campaignCopy,
  resultsCopy,
  recentVideos,
  recentCopy,
  atajos,
  atajosCopy,
  setupCompletion,
  setupCompletionCopy,
}: DashboardViewProps) {
  const countItems = [
    { label: thisWeekCopy.scheduled, value: weekCounts.scheduled },
    { label: thisWeekCopy.published, value: weekCounts.published },
    { label: thisWeekCopy.waitingForOk, value: weekCounts.waitingForOk },
    { label: thisWeekCopy.inProduction, value: weekCounts.inProduction },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="font-display text-4xl text-fog sm:text-5xl">{title}</h1>
        <p className="mt-2 max-w-3xl text-dim">{subtitle}</p>
        <p className="mt-2 text-xs text-dim">{lastUpdatedLabel}</p>
      </div>

      {setupBanner ? (
        <StatusAlert
          severity="info"
          text={`${setupBanner.title}: ${setupBanner.body}`}
        />
      ) : null}

      {loadError ? <StatusAlert severity="error" text={loadError} /> : null}

      <section aria-labelledby="home-next-action">
        <h2 id="home-next-action" className="sr-only">
          {nextActionCopy.sectionTitle}
        </h2>
        <Card className="gap-4 border-edge bg-panel py-5">
          <CardHeader className="px-5">
            <p className="text-xs uppercase tracking-wide text-dim">
              {nextActionCopy.sectionTitle}
            </p>
            <CardTitle className="font-display text-2xl font-normal text-fog sm:text-3xl">
              {nextActionCopy.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 px-5 sm:flex-row sm:items-end sm:justify-between">
            <p className="max-w-xl text-dim">{nextActionCopy.body}</p>
            {nextAction.ctaKind === "open_chat" ? (
              <OpenChatButton label={nextActionCopy.cta} />
            ) : nextAction.href ? (
              <Button asChild className="w-fit rounded-full">
                <Link href={nextAction.href}>{nextActionCopy.cta}</Link>
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="home-this-week" className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2
            id="home-this-week"
            className="font-display text-2xl font-normal text-fog"
          >
            {thisWeekCopy.title}
          </h2>
          <span className="inline-flex items-center gap-2 rounded-full border border-edge px-3 py-1 text-sm text-fog">
            <span
              className={`size-2.5 rounded-full ${trafficDotClass(trafficLight)}`}
              aria-hidden
            />
            {thisWeekCopy.statusLabel}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {countItems.map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-edge bg-panel px-4 py-5"
            >
              <p className="font-display text-4xl text-fog tabular-nums">
                {item.value}
              </p>
              <p className="mt-1 text-sm text-dim">{item.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="home-campaign" className="space-y-3">
        <h2
          id="home-campaign"
          className="font-display text-2xl font-normal text-fog"
        >
          {campaignCopy.title}
        </h2>
        {campaignProgress.hasPlan && campaignProgress.total > 0 ? (
          <div className="rounded-2xl border border-edge bg-panel px-5 py-5">
            <p className="font-display text-3xl text-fog">
              {campaignCopy.ofVideos}
            </p>
            <div
              className="mt-4 h-2 overflow-hidden rounded-full bg-edge"
              role="progressbar"
              aria-valuenow={progressPercent(campaignProgress)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full bg-fog/80"
                style={{ width: `${progressPercent(campaignProgress)}%` }}
              />
            </div>
          </div>
        ) : (
          <p className="text-dim">{campaignCopy.empty}</p>
        )}
      </section>

      <section aria-labelledby="home-results" className="space-y-3">
        <h2
          id="home-results"
          className="font-display text-2xl font-normal text-fog"
        >
          {resultsCopy.title}
        </h2>
        <div className="rounded-2xl border border-dashed border-edge bg-panel/60 px-5 py-6">
          <p className="font-display text-xl text-fog">{resultsCopy.empty}</p>
          <p className="mt-2 max-w-xl text-sm text-dim">
            {resultsCopy.emptyHint}
          </p>
        </div>
      </section>

      <section aria-labelledby="home-recent" className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2
            id="home-recent"
            className="font-display text-2xl font-normal text-fog"
          >
            {recentCopy.title}
          </h2>
          <Link
            href="/ready-to-publish"
            className="text-sm text-fog underline-offset-4 hover:underline"
          >
            {recentCopy.openAll}
          </Link>
        </div>
        {recentVideos.length === 0 ? (
          <p className="text-dim">{recentCopy.empty}</p>
        ) : (
          <ul className="flex gap-3 overflow-x-auto pb-2">
            {recentVideos.map((video, index) => (
              <li key={video.approvalId} className="min-w-[10.5rem] shrink-0">
                <Link
                  href={video.href}
                  className="block rounded-2xl border border-edge bg-panel px-4 py-4 transition hover:border-fog/40"
                >
                  <p className="text-xs text-dim">
                    {recentCopy.untitled} {index + 1}
                  </p>
                  <p className="mt-2 line-clamp-3 text-sm text-fog">
                    {video.captionPreview?.trim() || recentCopy.untitled}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {setupCompletion && setupCompletionCopy ? (
        <section aria-labelledby="home-setup" className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2
              id="home-setup"
              className="font-display text-2xl font-normal text-fog"
            >
              {setupCompletionCopy.title}
            </h2>
            <p className="text-sm text-dim">{setupCompletionCopy.progress}</p>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-edge"
            role="progressbar"
            aria-valuenow={setupCompletion.percentComplete}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-fog/80"
              style={{ width: `${setupCompletion.percentComplete}%` }}
            />
          </div>
          <ul className="space-y-2">
            {setupCompletion.steps.map((step) => (
              <li
                key={step.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-edge bg-panel px-4 py-3"
              >
                <div>
                  <p className="text-fog">
                    {setupCompletionCopy.steps[step.id]}
                  </p>
                  <p className="text-xs text-dim">
                    {step.done
                      ? setupCompletionCopy.done
                      : step.required
                        ? null
                        : setupCompletionCopy.optional}
                  </p>
                </div>
                {step.done ? null : step.ctaKind === "open_chat" ? (
                  <OpenChatButton
                    label={setupCompletionCopy.doIt}
                    className="w-fit rounded-full"
                  />
                ) : step.href ? (
                  <Button asChild variant="outline" className="rounded-full">
                    <Link href={step.href}>{setupCompletionCopy.doIt}</Link>
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="home-atajos" className="space-y-3">
        <h2
          id="home-atajos"
          className="font-display text-xl font-normal text-fog"
        >
          {atajosCopy.title}
        </h2>
        <ul className="flex flex-wrap gap-2">
          {atajos.map((atajo) => (
            <li key={atajo.id}>
              <Button asChild variant="outline" className="rounded-full">
                <Link href={atajo.href}>{atajosCopy.labels[atajo.id]}</Link>
              </Button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
