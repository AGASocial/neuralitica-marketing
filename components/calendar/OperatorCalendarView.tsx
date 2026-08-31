"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "primereact/button";
import { Calendar } from "primereact/calendar";
import { Message } from "primereact/message";
import { Sidebar } from "primereact/sidebar";

import { CalendarStatusTag } from "@/components/calendar/CalendarStatusTag";
import {
  MarkPublishedDialog,
  type MarkPublishedDialogCopy,
} from "@/components/calendar/MarkPublishedDialog";
import type {
  CalendarPipelineStatus,
  CalendarSlotDetailDto,
  ClientGapWarningDto,
  GetOperatorCalendarForWeekSuccess,
} from "@/lib/contracts/calendar";
import type { ContentStrategySlotGoal } from "@/lib/contracts/content-strategy";
import { formatWeekRange, normalizeToIsoMonday } from "@/lib/trend/normalize-week-start";

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
};

type OperatorCalendarViewProps = {
  weekStart: string;
  sessionClientId: string;
  data: GetOperatorCalendarForWeekSuccess;
  loadFailed: boolean;
  locale: string;
  copy: CalendarPageCopy;
};

function weekStartToDate(weekStart: string): Date {
  return new Date(`${weekStart}T12:00:00.000Z`);
}

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
    <div style={{ marginBottom: "1.5rem" }}>
      <h1 style={{ margin: "0 0 0.35rem", fontSize: "1.75rem", fontWeight: 700 }}>
        {copy.title}
      </h1>
      <p style={{ margin: 0, color: "#6b7280", maxWidth: "48rem" }}>{copy.subtitle}</p>
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
    <button
      type="button"
      onClick={() => onSelect(slot)}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: "0.65rem",
        marginBottom: "0.5rem",
        border: "1px solid #e5e7eb",
        borderRadius: "0.5rem",
        background: "#ffffff",
        cursor: "pointer",
      }}
    >
      {slot.thumbnailPreviewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={slot.thumbnailPreviewUrl}
          alt=""
          style={{
            width: "100%",
            aspectRatio: "9 / 16",
            objectFit: "cover",
            borderRadius: "0.35rem",
            marginBottom: "0.5rem",
            background: "#f3f4f6",
          }}
        />
      ) : null}
      <div style={{ fontSize: "0.75rem", color: "#6b7280", marginBottom: "0.25rem" }}>
        {slot.clientDisplayName}
      </div>
      <div
        style={{
          fontWeight: 600,
          fontSize: "0.875rem",
          marginBottom: "0.5rem",
          lineHeight: 1.3,
        }}
      >
        {slot.tema}
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.35rem",
          alignItems: "center",
        }}
      >
        <CalendarStatusTag
          status={slot.pipelineStatus}
          label={copy.status[slot.pipelineStatus]}
          changesRequested={slot.changesRequested}
          changesRequestedLabel={copy.changesRequestedLabel}
        />
        {isPublished ? (
          <span
            aria-hidden
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "1.25rem",
              height: "1.25rem",
              borderRadius: "9999px",
              background: "#7c3aed",
              color: "#ffffff",
              fontSize: "0.65rem",
            }}
          >
            <i className="pi pi-check" />
          </span>
        ) : null}
        {isPublished && slot.instagramPostUrl ? (
          <a
            href={slot.instagramPostUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={copy.markPublished.viewOnInstagram}
            onClick={(event) => event.stopPropagation()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "1.25rem",
              height: "1.25rem",
              borderRadius: "0.25rem",
              color: "#7c3aed",
              fontSize: "0.85rem",
            }}
          >
            <i className="pi pi-instagram" />
          </a>
        ) : null}
      </div>
    </button>
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
    <div style={{ display: "grid", gap: "0.5rem", marginBottom: "1.25rem" }}>
      {warnings.map((warning) => (
        <Message
          key={warning.clientId}
          severity="warn"
          text={copy.gapWarning
            .replace("{client}", warning.clientDisplayName)
            .replace("{count}", String(warning.missingCount))}
          style={{ width: "100%" }}
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

  const weekDate = weekStartToDate(weekStart);
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

  const showMarkPublishedCta = selectedSlot?.pipelineStatus === "approved";
  const showUpdatePublishedCta = selectedSlot?.pipelineStatus === "published";

  return (
    <div>
      <PageHeader copy={copy} />

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-end",
          gap: "1rem",
          marginBottom: "1.5rem",
        }}
      >
        <div style={{ flex: "1 1 240px", maxWidth: "320px" }}>
          <label
            htmlFor="calendar-week-picker"
            style={{ display: "block", fontWeight: 600, marginBottom: "0.5rem" }}
          >
            {copy.weekLabel}
          </label>
          <Calendar
            inputId="calendar-week-picker"
            value={weekDate}
            onChange={(event) => {
              if (!event.value) {
                return;
              }
              navigateWeek(normalizeToIsoMonday(event.value));
            }}
            dateFormat="yy-mm-dd"
            showIcon
            style={{ width: "100%" }}
          />
          <p style={{ margin: "0.5rem 0 0", color: "#6b7280", fontSize: "0.875rem" }}>
            {weekRangeLabel}
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Button
            type="button"
            icon="pi pi-chevron-left"
            label={copy.prevWeek}
            className="p-button-outlined"
            onClick={() => navigateWeek(shiftWeek(weekStart, -7))}
          />
          <Button
            type="button"
            icon="pi pi-chevron-right"
            iconPos="right"
            label={copy.nextWeek}
            className="p-button-outlined"
            onClick={() => navigateWeek(shiftWeek(weekStart, 7))}
          />
        </div>
      </div>

      {loadFailed ? (
        <div style={{ marginBottom: "1rem" }}>
          <Message severity="error" text={copy.loadError} style={{ width: "100%" }} />
          <Link href="/dashboard" style={{ display: "inline-block", marginTop: "1rem" }}>
            <Button type="button" label={copy.backDashboard} className="p-button-text" />
          </Link>
        </div>
      ) : null}

      {!loadFailed && data.clientsWithoutApprovedStrategyCount > 0 ? (
        <Message
          severity="info"
          text={copy.clientsWithoutStrategy.replace(
            "{count}",
            String(data.clientsWithoutApprovedStrategyCount),
          )}
          style={{ width: "100%", marginBottom: "1rem" }}
        />
      ) : null}

      {!loadFailed ? <GapWarnings warnings={data.gapWarnings} copy={copy} /> : null}

      {!loadFailed && data.slots.length === 0 ? (
        <Message severity="info" text={copy.emptyWeek} style={{ width: "100%" }} />
      ) : null}

      {!loadFailed && data.slots.length > 0 ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, minmax(140px, 1fr))",
            gap: "0.75rem",
            overflowX: "auto",
            paddingBottom: "0.5rem",
          }}
        >
          {weekDates.map((date) => (
            <div key={date} style={{ minWidth: "140px" }}>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: "0.875rem",
                  marginBottom: "0.75rem",
                  paddingBottom: "0.5rem",
                  borderBottom: "2px solid #e5e7eb",
                  color: "#374151",
                }}
              >
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

      <Sidebar
        visible={selectedSlot !== null}
        position="right"
        onHide={() => {
          setSelectedSlot(null);
          setMarkPublishedOpen(false);
        }}
        style={{ width: "min(420px, 100vw)" }}
        header={copy.sidebar.title}
      >
        {selectedSlot ? (
          <div style={{ display: "grid", gap: "1rem" }}>
            <div>
              <div style={{ fontSize: "0.75rem", color: "#6b7280", marginBottom: "0.25rem" }}>
                {copy.sidebar.client}
              </div>
              <div style={{ fontWeight: 600 }}>{selectedSlot.clientDisplayName}</div>
            </div>

            <div>
              <div style={{ fontSize: "0.75rem", color: "#6b7280", marginBottom: "0.25rem" }}>
                {copy.sidebar.tema}
              </div>
              <div style={{ fontWeight: 600 }}>{selectedSlot.tema}</div>
            </div>

            <div>
              <div style={{ fontSize: "0.75rem", color: "#6b7280", marginBottom: "0.25rem" }}>
                {copy.sidebar.goal}
              </div>
              <div>{goalLabel(selectedSlot.goal)}</div>
            </div>

            <div>
              <div style={{ fontSize: "0.75rem", color: "#6b7280", marginBottom: "0.25rem" }}>
                {copy.sidebar.scheduledDate}
              </div>
              <div>{formatScheduledDate(selectedSlot.scheduledDate, locale)}</div>
            </div>

            <div>
              <div style={{ fontSize: "0.75rem", color: "#6b7280", marginBottom: "0.25rem" }}>
                {copy.sidebar.slotIndex}
              </div>
              <div>{selectedSlot.slotIndex + 1}</div>
            </div>

            <div>
              <div style={{ fontSize: "0.75rem", color: "#6b7280", marginBottom: "0.25rem" }}>
                {copy.sidebar.pipelineStatus}
              </div>
              <CalendarStatusTag
                status={selectedSlot.pipelineStatus}
                label={copy.status[selectedSlot.pipelineStatus]}
                changesRequested={selectedSlot.changesRequested}
                changesRequestedLabel={copy.changesRequestedLabel}
              />
            </div>

            {showUpdatePublishedCta && selectedSlot.publishedAt ? (
              <div>
                <div style={{ fontSize: "0.75rem", color: "#6b7280", marginBottom: "0.25rem" }}>
                  {copy.markPublished.publishedOnLabel}
                </div>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                    <i className="pi pi-check" style={{ color: "#7c3aed" }} aria-hidden />
                    {formatPublishedAt(selectedSlot.publishedAt)}
                  </span>
                  {selectedSlot.instagramPostUrl ? (
                    <a
                      href={selectedSlot.instagramPostUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.35rem",
                        color: "#7c3aed",
                        fontWeight: 600,
                        fontSize: "0.875rem",
                      }}
                    >
                      <i className="pi pi-instagram" aria-hidden />
                      {copy.markPublished.viewOnInstagram}
                    </a>
                  ) : null}
                </div>
              </div>
            ) : null}

            {showMarkPublishedCta ? (
              <Button
                type="button"
                label={copy.markPublished.markCta}
                icon="pi pi-check-circle"
                style={{ width: "100%" }}
                onClick={() => setMarkPublishedOpen(true)}
              />
            ) : null}

            {showUpdatePublishedCta ? (
              <Button
                type="button"
                label={copy.markPublished.updateCta}
                icon="pi pi-pencil"
                className="p-button-outlined"
                style={{ width: "100%" }}
                onClick={() => setMarkPublishedOpen(true)}
              />
            ) : null}

            {canDeepLink ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <Link
                  href={`/operator/scripts?weekStart=${weekStart}&highlightSlot=${selectedSlot.slotIndex}`}
                >
                  <Button
                    type="button"
                    label={copy.sidebar.openScripts}
                    icon="pi pi-file-edit"
                    style={{ width: "100%" }}
                  />
                </Link>
                <Link href={`/operator/strategy?weekStart=${weekStart}`}>
                  <Button
                    type="button"
                    label={copy.sidebar.viewStrategy}
                    icon="pi pi-calendar"
                    className="p-button-outlined"
                    style={{ width: "100%" }}
                  />
                </Link>
              </div>
            ) : (
              <Message
                severity="info"
                text={copy.sidebar.deepLinkDisabledHint}
                style={{ width: "100%" }}
              />
            )}

            <Button
              type="button"
              label={copy.sidebar.close}
              className="p-button-text"
              onClick={() => setSelectedSlot(null)}
            />
          </div>
        ) : null}
      </Sidebar>

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
