"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  Pencil,
} from "lucide-react";

import { WeekPicker } from "@/components/campana/WeekPicker";
import { CalendarStatusTag } from "@/components/calendar/CalendarStatusTag";
import { MediaThumbnail } from "@/components/media/MediaThumbnail";
import {
  MarkPublishedDialog,
  type MarkPublishedDialogCopy,
} from "@/components/calendar/MarkPublishedDialog";
import {
  ReelMetricsSection,
  type ReelMetricsSectionCopy,
} from "@/components/calendar/ReelMetricsSection";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { StatusAlert } from "@/components/ui/status-alert";
import type {
  CalendarPipelineStatus,
  CalendarSlotDetailDto,
  ClientGapWarningDto,
  GetOperatorCalendarForWeekSuccess,
} from "@/lib/contracts/calendar";
import type { ContentStrategySlotGoal } from "@/lib/contracts/content-strategy";
import type { ReelMetricsDto } from "@/lib/contracts/reel-metrics";
import { formatWeekRange, normalizeToIsoMonday } from "@/lib/trend/normalize-week-start";
import { cn } from "@/lib/utils";

type CalendarPageCopy = {
  title: string;
  subtitle: string;
  weekLabel: string;
  prevWeek: string;
  nextWeek: string;
  emptyWeek: string;
  loadError: string;
  backDashboard: string;
  gapWarning: string;
  clientsWithoutStrategy: string;
  sidebar: {
    title: string;
    client: string;
    tema: string;
    goal: string;
    scheduledDate: string;
    slotIndex: string;
    pipelineStatus: string;
    openScripts: string;
    viewStrategy: string;
    deepLinkDisabledHint: string;
    close: string;
  };
  status: Record<CalendarPipelineStatus, string>;
  changesRequestedLabel: string;
  goals: Record<ContentStrategySlotGoal, string>;
  markPublished: MarkPublishedDialogCopy & {
    markCta: string;
    updateCta: string;
    publishedOnLabel: string;
    viewOnInstagram: string;
  };
  metrics: ReelMetricsSectionCopy;
};

type OperatorCalendarViewProps = {
  weekStart: string;
  sessionClientId: string;
  data: GetOperatorCalendarForWeekSuccess;
  loadFailed: boolean;
  locale: string;
  copy: CalendarPageCopy;
};

function shiftWeek(weekStart: string, deltaDays: number): string {
  const date = new Date(`${weekStart}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return normalizeToIsoMonday(date);
}

function getWeekDates(weekStart: string): string[] {
  const dates: string[] = [];
  const start = new Date(`${weekStart}T12:00:00.000Z`);
  for (let i = 0; i < 7; i += 1) {
    const day = new Date(start);
    day.setUTCDate(day.getUTCDate() + i);
    dates.push(day.toISOString().slice(0, 10));
  }
  return dates;
}

function formatScheduledDate(isoDate: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      weekday: "long",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${isoDate}T12:00:00.000Z`));
  } catch {
    return isoDate;
  }
}

function formatDayHeader(isoDate: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${isoDate}T12:00:00.000Z`));
  } catch {
    return isoDate;
  }
}

function PageHeader({ copy }: { copy: CalendarPageCopy }) {
  return (
    <div className="mb-8">
      <h1 className="font-display text-4xl text-fog sm:text-5xl">{copy.title}</h1>
      <p className="mt-2 max-w-3xl text-dim">{copy.subtitle}</p>
    </div>
  );
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-dim">
        {label}
      </div>
      <div className="text-fog">{children}</div>
    </div>
  );
}

type SlotCardProps = {
  slot: CalendarSlotDetailDto;
  copy: CalendarPageCopy;
  onSelect: (slot: CalendarSlotDetailDto) => void;
};

function SlotCard({ slot, copy, onSelect }: SlotCardProps) {
  const isPublished = slot.pipelineStatus === "published";

  return (
    <div className="mb-2 overflow-hidden rounded-xl border border-edge bg-panel transition-colors focus-within:ring-2 focus-within:ring-butter hover:bg-edge/60">
      <button
        type="button"
        onClick={() => onSelect(slot)}
        className="block w-full p-2.5 text-left focus-visible:outline-none"
      >
        {slot.thumbnailPreviewUrl ? (
          <MediaThumbnail
            src={slot.thumbnailPreviewUrl}
            kind="video"
            className="mb-2 aspect-[9/16] w-full rounded-lg bg-deep"
          />
        ) : null}
        <div className="mb-1 text-xs text-dim">{slot.clientDisplayName}</div>
        <div className="mb-2 text-sm font-bold leading-snug text-fog">
          {slot.tema}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <CalendarStatusTag
            status={slot.pipelineStatus}
            label={copy.status[slot.pipelineStatus]}
            changesRequested={slot.changesRequested}
            changesRequestedLabel={copy.changesRequestedLabel}
          />
          {isPublished ? (
            <span
              aria-hidden
              className="inline-flex size-5 items-center justify-center rounded-full bg-butter text-deep"
            >
              <Check className="size-3" />
            </span>
          ) : null}
        </div>
      </button>
      {isPublished && slot.instagramPostUrl ? (
        <a
          href={slot.instagramPostUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={copy.markPublished.viewOnInstagram}
          className="mx-2.5 mb-2.5 inline-flex size-6 items-center justify-center rounded text-butter hover:bg-deep"
        >
          <ExternalLink className="size-4" aria-hidden />
        </a>
      ) : null}
    </div>
  );
}

type GapWarningsProps = {
  warnings: ClientGapWarningDto[];
  copy: CalendarPageCopy;
};

function GapWarnings({ warnings, copy }: GapWarningsProps) {
  if (warnings.length === 0) {
    return null;
  }

  return (
    <div className="mb-5 grid gap-2">
      {warnings.map((warning) => (
        <StatusAlert
          key={warning.clientId}
          severity="warn"
          text={copy.gapWarning
            .replace("{client}", warning.clientDisplayName)
            .replace("{count}", String(warning.missingCount))}
        />
      ))}
    </div>
  );
}

export function OperatorCalendarView({
  weekStart,
  sessionClientId,
  data,
  loadFailed,
  locale,
  copy,
}: OperatorCalendarViewProps) {
  const router = useRouter();
  const [selectedSlot, setSelectedSlot] = useState<CalendarSlotDetailDto | null>(null);
  const [markPublishedOpen, setMarkPublishedOpen] = useState(false);

  const weekRangeLabel = formatWeekRange(weekStart, locale);
  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart]);

  const slotsByDate = useMemo(() => {
    const map = new Map<string, CalendarSlotDetailDto[]>();
    for (const date of weekDates) {
      map.set(date, []);
    }
    for (const slot of data.slots) {
      const bucket = map.get(slot.scheduledDate);
      if (bucket) {
        bucket.push(slot);
      }
    }
    return map;
  }, [data.slots, weekDates]);

  const canDeepLink = selectedSlot?.clientId === sessionClientId;

  function navigateWeek(nextWeekStart: string) {
    const params = new URLSearchParams();
    params.set("weekStart", nextWeekStart);
    router.push(`/operator/calendar?${params.toString()}`);
    router.refresh();
  }

  function goalLabel(goal: string): string {
    const key = goal as ContentStrategySlotGoal;
    return copy.goals[key] ?? goal;
  }

  function formatPublishedAt(isoTimestamp: string): string {
    return formatScheduledDate(isoTimestamp.slice(0, 10), locale);
  }

  function handleMarkPublishedSuccess(slot: CalendarSlotDetailDto) {
    setMarkPublishedOpen(false);
    setSelectedSlot(slot);
    router.refresh();
  }

  function handleMetricsSuccess(metrics: ReelMetricsDto) {
    setSelectedSlot((current) =>
      current ? { ...current, metrics } : current,
    );
  }

  const showMarkPublishedCta = selectedSlot?.pipelineStatus === "approved";
  const showUpdatePublishedCta = selectedSlot?.pipelineStatus === "published";
  const showMetricsSection =
    selectedSlot?.pipelineStatus === "published" &&
    selectedSlot.assembledReelId != null;

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader copy={copy} />

      <div className="mb-6 flex flex-wrap items-end gap-4">
        <div className="max-w-xs flex-1 basis-60 space-y-2">
          <Label htmlFor="calendar-week-picker" className="text-fog">
            {copy.weekLabel}
          </Label>
          <WeekPicker
            id="calendar-week-picker"
            weekStart={weekStart}
            locale={locale}
            onSelectWeek={navigateWeek}
          />
          <p className="text-sm text-dim">{weekRangeLabel}</p>
        </div>

        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="rounded-full border-edge bg-transparent text-fog hover:bg-panel hover:text-fog"
            onClick={() => navigateWeek(shiftWeek(weekStart, -7))}
          >
            <ChevronLeft aria-hidden />
            {copy.prevWeek}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="rounded-full border-edge bg-transparent text-fog hover:bg-panel hover:text-fog"
            onClick={() => navigateWeek(shiftWeek(weekStart, 7))}
          >
            {copy.nextWeek}
            <ChevronRight aria-hidden />
          </Button>
        </div>
      </div>

      {loadFailed ? (
        <div className="mb-4 space-y-4">
          <StatusAlert severity="error" text={copy.loadError} />
          <Button
            asChild
            variant="ghost"
            className="text-butter hover:text-butter"
          >
            <Link href="/dashboard">{copy.backDashboard}</Link>
          </Button>
        </div>
      ) : null}

      {!loadFailed && data.clientsWithoutApprovedStrategyCount > 0 ? (
        <StatusAlert
          severity="info"
          className="mb-4"
          text={copy.clientsWithoutStrategy.replace(
            "{count}",
            String(data.clientsWithoutApprovedStrategyCount),
          )}
        />
      ) : null}

      {!loadFailed ? <GapWarnings warnings={data.gapWarnings} copy={copy} /> : null}

      {!loadFailed && data.slots.length === 0 ? (
        <StatusAlert severity="info" text={copy.emptyWeek} />
      ) : null}

      {!loadFailed && data.slots.length > 0 ? (
        <div className="grid grid-cols-[repeat(7,minmax(150px,1fr))] gap-3 overflow-x-auto pb-2">
          {weekDates.map((date) => (
            <div key={date} className="min-w-[150px]">
              <div className="mb-3 border-b-2 border-edge pb-2 text-sm font-bold text-fog">
                {formatDayHeader(date, locale)}
              </div>
              {(slotsByDate.get(date) ?? []).map((slot) => (
                <SlotCard
                  key={slot.slotId}
                  slot={slot}
                  copy={copy}
                  onSelect={setSelectedSlot}
                />
              ))}
            </div>
          ))}
        </div>
      ) : null}

      {/*
        The sheet yields to the mark-published dialog while it is open (modal
        focus traps must not stack); selectedSlot is retained so the sheet
        returns when the dialog closes.
      */}
      <Sheet
        open={selectedSlot !== null && !markPublishedOpen}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedSlot(null);
            setMarkPublishedOpen(false);
          }
        }}
      >
        <SheetContent
          side="right"
          showCloseButton={false}
          className="w-full overflow-y-auto border-edge bg-panel p-0 text-fog sm:max-w-md"
        >
          <SheetHeader className="border-b border-edge p-5">
            <SheetTitle className="font-display text-3xl font-normal text-fog">
              {copy.sidebar.title}
            </SheetTitle>
            <SheetDescription className="sr-only">
              {selectedSlot?.tema ?? copy.sidebar.title}
            </SheetDescription>
          </SheetHeader>

          {selectedSlot ? (
            <div className="grid gap-4 px-5 pb-5">
              <DetailRow label={copy.sidebar.client}>
                <span className="font-semibold">
                  {selectedSlot.clientDisplayName}
                </span>
              </DetailRow>

              <DetailRow label={copy.sidebar.tema}>
                <span className="font-semibold">{selectedSlot.tema}</span>
              </DetailRow>

              <DetailRow label={copy.sidebar.goal}>
                {goalLabel(selectedSlot.goal)}
              </DetailRow>

              <DetailRow label={copy.sidebar.scheduledDate}>
                {formatScheduledDate(selectedSlot.scheduledDate, locale)}
              </DetailRow>

              <DetailRow label={copy.sidebar.slotIndex}>
                {selectedSlot.slotIndex + 1}
              </DetailRow>

              <DetailRow label={copy.sidebar.pipelineStatus}>
                <CalendarStatusTag
                  status={selectedSlot.pipelineStatus}
                  label={copy.status[selectedSlot.pipelineStatus]}
                  changesRequested={selectedSlot.changesRequested}
                  changesRequestedLabel={copy.changesRequestedLabel}
                />
              </DetailRow>

              {showUpdatePublishedCta && selectedSlot.publishedAt ? (
                <DetailRow label={copy.markPublished.publishedOnLabel}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5">
                      <CheckCircle2 className="size-4 text-butter" aria-hidden />
                      {formatPublishedAt(selectedSlot.publishedAt)}
                    </span>
                    {selectedSlot.instagramPostUrl ? (
                      <a
                        href={selectedSlot.instagramPostUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm font-semibold text-butter underline-offset-4 hover:underline"
                      >
                        <ExternalLink className="size-4" aria-hidden />
                        {copy.markPublished.viewOnInstagram}
                      </a>
                    ) : null}
                  </div>
                </DetailRow>
              ) : null}

              {showMarkPublishedCta ? (
                <Button
                  type="button"
                  className="w-full rounded-full"
                  onClick={() => setMarkPublishedOpen(true)}
                >
                  <CheckCircle2 aria-hidden />
                  {copy.markPublished.markCta}
                </Button>
              ) : null}

              {showUpdatePublishedCta ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full rounded-full border-edge bg-transparent text-fog hover:bg-deep hover:text-fog"
                  onClick={() => setMarkPublishedOpen(true)}
                >
                  <Pencil aria-hidden />
                  {copy.markPublished.updateCta}
                </Button>
              ) : null}

              {showMetricsSection ? (
                <ReelMetricsSection
                  slot={selectedSlot}
                  copy={copy.metrics}
                  locale={locale}
                  onSuccess={handleMetricsSuccess}
                />
              ) : null}

              {canDeepLink ? (
                <div className="flex flex-col gap-2">
                  <Button asChild className="w-full rounded-full">
                    <Link
                      href={`/operator/scripts?weekStart=${weekStart}&highlightSlot=${selectedSlot.slotIndex}`}
                    >
                      <FileText aria-hidden />
                      {copy.sidebar.openScripts}
                    </Link>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    className="w-full rounded-full border-edge bg-transparent text-fog hover:bg-deep hover:text-fog"
                  >
                    <Link href={`/operator/strategy?weekStart=${weekStart}`}>
                      <CalendarDays aria-hidden />
                      {copy.sidebar.viewStrategy}
                    </Link>
                  </Button>
                </div>
              ) : (
                <StatusAlert
                  severity="info"
                  text={copy.sidebar.deepLinkDisabledHint}
                />
              )}

              <Button
                type="button"
                variant="ghost"
                className={cn("text-dim hover:text-fog")}
                onClick={() => setSelectedSlot(null)}
              >
                {copy.sidebar.close}
              </Button>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      {selectedSlot && markPublishedOpen ? (
        <MarkPublishedDialog
          visible={markPublishedOpen}
          slot={selectedSlot}
          isUpdate={selectedSlot.pipelineStatus === "published"}
          copy={copy.markPublished}
          onHide={() => setMarkPublishedOpen(false)}
          onSuccess={handleMarkPublishedSuccess}
        />
      ) : null}
    </div>
  );
}
