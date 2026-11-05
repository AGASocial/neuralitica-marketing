"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { AgentCard } from "@/components/agent-cards/AgentCard";
import { OpenChatButton } from "@/components/dashboard/OpenChatButton";
import { ClientLocalDateTime } from "@/components/i18n/ClientLocalDateTime";
import { useOrchestratorChat } from "@/components/orchestrator-chat/OrchestratorChatContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusAlert } from "@/components/ui/status-alert";
import { mapHoyPendingToCard } from "@/lib/agent-cards";
import {
  detectApprovalDevice,
  trackUxEvent,
} from "@/lib/analytics/track-ux-event";
import { decideApproval } from "@/lib/approvals/actions/decide-approval";
import {
  approvalDecideErrorMessage,
  shouldForceApproveError,
  type ApprovalDecideErrorCopy,
} from "@/lib/approvals/approval-decide-error-message";
import { mediaPreviewUrl } from "@/lib/approvals/caption-preview";
import type { ApprovalListItemDto } from "@/lib/contracts/approval";
import type {
  HoyNextSlot,
  HoyNotificationDto,
  HoyTimelineEntry,
} from "@/lib/contracts/hoy-feed";
import type { OwnerHomeNextAction } from "@/lib/contracts/owner-home-dashboard";
import type {
  SetupCompletionDto,
  SetupStepId,
} from "@/lib/contracts/setup-completion";
import type { Locale } from "@/lib/i18n/locales";

export type HoyFeedCopy = {
  title: string;
  subtitle: string;
  needsOk: string;
  whatIDid: string;
  next: string;
  results: string;
  resultsEmpty: string;
  resultsEmptyHint: string;
  approve: string;
  change: string;
  seeAllPending: string;
  pendingStatus: string;
  timelineEmpty: string;
  nextActionCtaOpenChat: string;
  slotDone: string;
  slotNeedsOk: string;
  slotPreparing: string;
  slotScheduled: string;
  loadError?: string;
  approvalErrors: ApprovalDecideErrorCopy;
  setupBanner?: { title: string; body: string };
  timelineMessages: Record<string, string>;
};

type SetupCompletionCopy = {
  title: string;
  progress: string;
  doIt: string;
  optional: string;
  done: string;
  steps: Record<SetupStepId, string>;
};

type NextActionCopy = {
  sectionTitle: string;
  title: string;
  body: string;
  cta: string;
};

type HoyFeedViewProps = {
  locale: Locale;
  copy: HoyFeedCopy;
  pendingApprovals: ApprovalListItemDto[];
  selectedPendingIds: string[];
  pendingOverflowCount: number;
  timeline: HoyTimelineEntry[];
  nextSlots: HoyNextSlot[];
  nextAction: OwnerHomeNextAction;
  showNextActionCard: boolean;
  nextActionCopy: NextActionCopy;
  setupCompletion?: SetupCompletionDto;
  setupCompletionCopy?: SetupCompletionCopy;
  notifications?: HoyNotificationDto[];
};

function pendingTitle(item: ApprovalListItemDto, fallback: string): string {
  const title = item.title?.trim();
  if (title) return title;
  const caption = item.captionPreview?.trim();
  if (caption) return caption;
  return fallback;
}

function formatTimeline(
  entry: HoyTimelineEntry,
  messages: Record<string, string>,
): string {
  let template = messages[entry.messageKey] ?? entry.messageKey;
  for (const [key, value] of Object.entries(entry.params)) {
    template = template.replace(`{${key}}`, value);
  }
  return template;
}

function PendingHoyCard({
  item,
  locale,
  copy,
}: {
  item: ApprovalListItemDto;
  locale: Locale;
  copy: HoyFeedCopy;
}) {
  const router = useRouter();
  const { openChangeForCard } = useOrchestratorChat();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const contentReadyAt = useRef(Date.now());
  const title = pendingTitle(item, copy.pendingStatus);
  const videoPreviewUrl = item.videoAssetId
    ? mediaPreviewUrl(item.videoAssetId)
    : undefined;

  const card = mapHoyPendingToCard({
    item: { ...item, videoPreviewUrl },
    title,
    summary: item.captionPreview,
    approveLabel: copy.approve,
    changeLabel: copy.change,
    badges: [copy.pendingStatus],
    locale,
  });

  return (
    <AgentCard
      card={card}
      disabled={pending}
      statusNote={error ? <StatusAlert severity="error" text={error} /> : null}
      onAction={(event) => {
        if (event.id === "change") {
          trackUxEvent("hoy_action", { action: "change", approval_id: item.approvalId });
          openChangeForCard({
            cardId: item.approvalId,
            title,
            locale,
          });
          return;
        }
        if (event.id !== "approve") {
          return;
        }
        setError(null);
        startTransition(async () => {
          try {
            if (
              typeof window !== "undefined" &&
              shouldForceApproveError(window.location.search)
            ) {
              setError(
                approvalDecideErrorMessage(
                  {
                    code: "INVALID_TRANSITION",
                    messageKey: "approvals.errors.invalidTransition",
                  },
                  copy.approvalErrors,
                ),
              );
              return;
            }
            const result = await decideApproval({
              approvalId: item.approvalId,
              decision: "approved",
            });
            if (!result.ok) {
              setError(
                approvalDecideErrorMessage(result.error, copy.approvalErrors),
              );
              return;
            }
            trackUxEvent("hoy_action", { action: "approve", approval_id: item.approvalId });
            trackUxEvent("approval", {
              device: detectApprovalDevice(),
              ms_since_content_ready: Date.now() - contentReadyAt.current,
              kind: "approve_pending_video",
              surface: "hoy",
            });
            router.refresh();
          } catch {
            setError(approvalDecideErrorMessage(null, copy.approvalErrors));
          }
        });
      }}
    />
  );
}

export function HoyFeedView({
  locale,
  copy,
  pendingApprovals,
  selectedPendingIds,
  pendingOverflowCount,
  timeline,
  nextSlots,
  nextAction,
  showNextActionCard,
  nextActionCopy,
  setupCompletion,
  setupCompletionCopy,
  notifications = [],
}: HoyFeedViewProps) {
  const selectedSet = new Set(selectedPendingIds);
  const visiblePending = pendingApprovals.filter((p) =>
    selectedSet.has(p.approvalId),
  );

  useEffect(() => {
    trackUxEvent("hoy_visit", { acted: false });
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-4">
      <header className="space-y-1">
        <h1 className="font-display text-3xl text-fog sm:text-4xl">
          {copy.title}
        </h1>
        <p className="text-dim">{copy.subtitle}</p>
      </header>

      {copy.setupBanner ? (
        <StatusAlert
          severity="info"
          text={`${copy.setupBanner.title} — ${copy.setupBanner.body}`}
        />
      ) : null}
      {copy.loadError ? (
        <StatusAlert severity="error" text={copy.loadError} />
      ) : null}

      {setupCompletion && setupCompletionCopy ? (
        <Card className="border-edge bg-panel/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-fog">
              {setupCompletionCopy.title}
            </CardTitle>
            <p className="text-sm text-dim">{setupCompletionCopy.progress}</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {setupCompletion.steps
              .filter((s) => !s.done)
              .slice(0, 3)
              .map((step) => (
                <div
                  key={step.id}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span className="text-fog">
                    {setupCompletionCopy.steps[step.id] ?? step.id}
                  </span>
                  {step.ctaKind === "open_chat" ? (
                    <OpenChatButton label={setupCompletionCopy.doIt} />
                  ) : step.href ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href={step.href}>{setupCompletionCopy.doIt}</Link>
                    </Button>
                  ) : null}
                </div>
              ))}
          </CardContent>
        </Card>
      ) : null}

      {notifications.length > 0 ? (
        <ul className="flex list-none flex-col gap-2 p-0">
          {notifications.map((note) => (
            <li key={note.id}>
              <StatusAlert
                severity="info"
                text={`${note.title} — ${note.body}`}
              />
            </li>
          ))}
        </ul>
      ) : null}

      <section className="space-y-3" aria-labelledby="hoy-needs-ok">
        <h2
          id="hoy-needs-ok"
          className="text-xs font-semibold uppercase tracking-wide text-rose"
        >
          ● {copy.needsOk}
          {pendingApprovals.length > 0
            ? ` · ${pendingApprovals.length}`
            : ""}
        </h2>
        {visiblePending.length === 0 ? (
          <p className="text-sm text-dim">{copy.timelineEmpty}</p>
        ) : (
          <ul className="flex list-none flex-col gap-3 p-0">
            {visiblePending.map((item) => (
              <li key={item.approvalId}>
                <PendingHoyCard item={item} locale={locale} copy={copy} />
              </li>
            ))}
          </ul>
        )}
        {pendingOverflowCount > 0 ? (
          <Button asChild variant="link" className="px-0 text-butter">
            <Link href="/approvals">
              {copy.seeAllPending.replace(
                "{count}",
                String(pendingOverflowCount),
              )}
            </Link>
          </Button>
        ) : null}
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="space-y-3" aria-labelledby="hoy-what-i-did">
          <h2
            id="hoy-what-i-did"
            className="text-xs font-semibold uppercase tracking-wide text-dim"
          >
            ✓ {copy.whatIDid}
          </h2>
          {timeline.length === 0 ? (
            <Card className="border-edge bg-panel/30">
              <CardContent className="py-4 text-sm text-dim">
                {copy.timelineEmpty}
              </CardContent>
            </Card>
          ) : (
            <Card className="border-edge bg-panel/30">
              <CardContent className="space-y-3 py-4">
                {timeline.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex gap-3 text-sm text-fog"
                  >
                    <ClientLocalDateTime
                      iso={entry.at}
                      locale={locale}
                      className="w-28 shrink-0 text-dim"
                    />
                    <p className="m-0">
                      {formatTimeline(entry, copy.timelineMessages)}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </section>

        <div className="space-y-6">
          <section className="space-y-3" aria-labelledby="hoy-next">
            <h2
              id="hoy-next"
              className="text-xs font-semibold uppercase tracking-wide text-dim"
            >
              {copy.next}
            </h2>
            {nextSlots.length > 0 ? (
              <Card className="border-edge bg-panel/30">
                <CardContent className="flex flex-wrap justify-between gap-2 py-4 text-sm">
                  {nextSlots.map((slot) => {
                    const statusLabel =
                      slot.status === "done"
                        ? copy.slotDone
                        : slot.status === "needs_ok"
                          ? copy.slotNeedsOk
                          : slot.status === "preparing"
                            ? copy.slotPreparing
                            : copy.slotScheduled;
                    return (
                      <span
                        key={slot.id}
                        className={
                          slot.status === "needs_ok"
                            ? "text-butter"
                            : slot.status === "done"
                              ? "text-fog"
                              : "text-dim"
                        }
                      >
                        {slot.label}
                        {slot.status === "done" ? " ✓" : ` · ${statusLabel}`}
                      </span>
                    );
                  })}
                </CardContent>
              </Card>
            ) : null}

            {showNextActionCard ? (
              <Card className="border-edge bg-panel/40">
                <CardHeader className="pb-2">
                  <p className="text-xs uppercase tracking-wide text-dim">
                    {nextActionCopy.sectionTitle}
                  </p>
                  <CardTitle className="text-lg text-fog">
                    {nextActionCopy.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-dim">{nextActionCopy.body}</p>
                  {nextAction.ctaKind === "open_chat" ? (
                    <OpenChatButton label={nextActionCopy.cta} />
                  ) : nextAction.href ? (
                    <Button asChild className="bg-butter text-deep hover:bg-butter/90">
                      <Link href={nextAction.href}>{nextActionCopy.cta}</Link>
                    </Button>
                  ) : (
                    <OpenChatButton
                      label={
                        nextActionCopy.cta || copy.nextActionCtaOpenChat
                      }
                    />
                  )}
                </CardContent>
              </Card>
            ) : null}
          </section>

          <section className="space-y-3" aria-labelledby="hoy-results">
            <h2
              id="hoy-results"
              className="text-xs font-semibold uppercase tracking-wide text-dim"
            >
              {copy.results}
            </h2>
            <Card className="border-dashed border-edge bg-transparent">
              <CardContent className="space-y-1 py-6 text-center">
                <p className="text-fog">{copy.resultsEmpty}</p>
                <p className="text-sm text-dim">{copy.resultsEmptyHint}</p>
              </CardContent>
            </Card>
          </section>
        </div>
      </div>
    </div>
  );
}
