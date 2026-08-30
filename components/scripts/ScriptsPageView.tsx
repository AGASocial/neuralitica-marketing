"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "primereact/button";
import { Calendar } from "primereact/calendar";
import { Column } from "primereact/column";
import { DataTable } from "primereact/datatable";
import { Message } from "primereact/message";
import { Skeleton } from "primereact/skeleton";
import { Tag } from "primereact/tag";
import { Toast } from "primereact/toast";

import type {
  ContentStrategyDayOfWeek,
  ContentStrategySlotGoal,
} from "@/lib/contracts/content-strategy";
import type {
  GetReelScriptsForWeekSuccess,
  ReelScriptErrorCode,
  ReelScriptListItem,
} from "@/lib/contracts/reel-script";
import type { VisualModality } from "@/lib/contracts/visual-preferences";
import { generateReelScripts } from "@/lib/reel-scripts/actions/generate-reel-scripts";
import { regenerateReelScriptSlot } from "@/lib/reel-scripts/actions/regenerate-reel-script-slot";
import { formatWeekRange, normalizeToIsoMonday } from "@/lib/trend/normalize-week-start";

type ScriptsPageCopy = {
  title: string;
  subtitle: string;
  weekLabel: string;
  generate: string;
  generating: string;
  regenerate: string;
  regenerating: string;
  emptyNoStrategy: string;
  emptyNoStrategyCta: string;
  emptyNoScripts: string;
  loadError: string;
  backDashboard: string;
  toastGenerateSuccess: string;
  toastRegenerateSuccess: string;
  toastCopySuccess: string;
  strategyVersionWarning: string;
  versionLabel: string;
  columns: {
    tema: string;
    day: string;
    duration: string;
    status: string;
    actions: string;
  };
  status: {
    pending: string;
    generated: string;
  };
  fields: {
    hook: string;
    body: string;
    cta: string;
    onScreenText: string;
    voiceoverText: string;
    brollBeats: string;
    coldOpenNotes: string;
    editingNotes: string;
  };
  copyField: string;
  durationSeconds: string;
  goals: Record<ContentStrategySlotGoal, string>;
  days: Record<ContentStrategyDayOfWeek, string>;
  modalities: Record<VisualModality, string>;
  errors: {
    validation: string;
    forbiddenFields: string;
    notFound: string;
    rateLimited: string;
    inFlight: string;
    profileIncomplete: string;
    scriptOutputInvalid: string;
    providerUnavailable: string;
    strategyNotApproved: string;
    slotNotFound: string;
    strategyVersionChanged: string;
    unauthenticated: string;
    forbidden: string;
    internal: string;
  };
};

type ScriptsPageViewProps = {
  weekStart: string;
  data: GetReelScriptsForWeekSuccess;
  loadFailed: boolean;
  locale: string;
  copy: ScriptsPageCopy;
};

function weekStartToDate(weekStart: string): Date {
  return new Date(`${weekStart}T12:00:00.000Z`);
}

function messageForCode(
  code: ReelScriptErrorCode,
  messageKey: string | undefined,
  copy: ScriptsPageCopy,
): string {
  if (messageKey === "scripts.errors.strategyVersionChanged") {
    return copy.errors.strategyVersionChanged;
  }

  switch (code) {
    case "VALIDATION_ERROR":
      return copy.errors.validation;
    case "FORBIDDEN_FIELDS":
      return copy.errors.forbiddenFields;
    case "NOT_FOUND":
      return copy.errors.notFound;
    case "RATE_LIMITED":
      return copy.errors.rateLimited;
    case "GENERATION_IN_FLIGHT":
      return copy.errors.inFlight;
    case "PROFILE_INCOMPLETE":
      return copy.errors.profileIncomplete;
    case "SCRIPT_OUTPUT_INVALID":
      return copy.errors.scriptOutputInvalid;
    case "PROVIDER_UNAVAILABLE":
      return copy.errors.providerUnavailable;
    case "STRATEGY_NOT_APPROVED":
      return copy.errors.strategyNotApproved;
    case "SLOT_NOT_FOUND":
      return copy.errors.slotNotFound;
    case "UNAUTHENTICATED":
      return copy.errors.unauthenticated;
    case "FORBIDDEN":
      return copy.errors.forbidden;
    default:
      return copy.errors.internal;
  }
}

function formatDuration(
  seconds: number | null,
  template: string,
): string {
  if (seconds === null) {
    return "—";
  }
  return template.replace("{seconds}", String(seconds));
}

export function ScriptsPageView({
  weekStart,
  data,
  loadFailed,
  locale,
  copy,
}: ScriptsPageViewProps) {
  const router = useRouter();
  const toastRef = useRef<Toast>(null);
  const [batchPending, setBatchPending] = useState(false);
  const [regeneratingSlot, setRegeneratingSlot] = useState<number | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<ReelScriptListItem[]>([]);

  const weekDate = weekStartToDate(weekStart);
  const weekRangeLabel = formatWeekRange(weekStart, locale);
  const isBusy = batchPending || regeneratingSlot !== null;
  const hasApprovedStrategy = data.approvedStrategy !== null;
  const hasAnyGenerated = data.items.some((item) => item.status === "generated");
  const allPending =
    hasApprovedStrategy && data.items.length > 0 && !hasAnyGenerated;

  function navigateWeek(nextWeekStart: string) {
    const params = new URLSearchParams();
    params.set("weekStart", nextWeekStart);
    router.push(`/operator/scripts?${params.toString()}`);
    router.refresh();
  }

  async function handleGenerate() {
    if (isBusy) {
      return;
    }

    setBatchPending(true);
    setBanner(null);

    try {
      const result = await generateReelScripts({ weekStart });

      if (result.ok) {
        toastRef.current?.show({
          severity: "success",
          summary: copy.toastGenerateSuccess,
          life: 4000,
        });
        router.refresh();
        return;
      }

      setBanner(messageForCode(result.error.code, result.error.messageKey, copy));
    } catch {
      setBanner(copy.errors.internal);
    } finally {
      setBatchPending(false);
    }
  }

  async function handleRegenerate(slotIndex: number) {
    if (isBusy) {
      return;
    }

    setRegeneratingSlot(slotIndex);
    setBanner(null);

    try {
      const result = await regenerateReelScriptSlot({ weekStart, slotIndex });

      if (result.ok) {
        toastRef.current?.show({
          severity: "success",
          summary: copy.toastRegenerateSuccess,
          life: 4000,
        });
        router.refresh();
        return;
      }

      setBanner(messageForCode(result.error.code, result.error.messageKey, copy));
    } catch {
      setBanner(copy.errors.internal);
    } finally {
      setRegeneratingSlot(null);
    }
  }

  function copyToClipboard(text: string) {
    void navigator.clipboard.writeText(text).then(() => {
      toastRef.current?.show({
        severity: "success",
        summary: copy.toastCopySuccess,
        life: 2500,
      });
    });
  }

  if (loadFailed) {
    return (
      <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
        <PageHeader copy={copy} />
        <Message severity="error" text={copy.loadError} style={{ width: "100%" }} />
        <Button
          type="button"
          label={copy.backDashboard}
          className="p-button-text"
          style={{ marginTop: "1rem" }}
          onClick={() => router.push("/dashboard")}
        />
      </div>
    );
  }

  const versionLabel = data.approvedStrategy
    ? copy.versionLabel.replace("{version}", String(data.approvedStrategy.version))
    : null;

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
      <Toast ref={toastRef} />
      <PageHeader copy={copy} />

      <div style={{ marginBottom: "1.5rem", maxWidth: "320px" }}>
        <label
          htmlFor="scripts-week-picker"
          style={{ display: "block", fontWeight: 600, marginBottom: "0.5rem" }}
        >
          {copy.weekLabel}
        </label>
        <Calendar
          inputId="scripts-week-picker"
          value={weekDate}
          onChange={(event) => {
            if (!event.value || isBusy) {
              return;
            }
            navigateWeek(normalizeToIsoMonday(event.value));
          }}
          dateFormat="yy-mm-dd"
          showIcon
          disabled={isBusy}
          style={{ width: "100%" }}
        />
        <p style={{ margin: "0.5rem 0 0", color: "#6b7280", fontSize: "0.875rem" }}>
          {weekRangeLabel}
        </p>
      </div>

      {hasApprovedStrategy ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            flexWrap: "wrap",
            marginBottom: "1rem",
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
            {versionLabel ? <TagLine text={versionLabel} /> : null}
          </div>
          <Button
            type="button"
            label={batchPending ? copy.generating : copy.generate}
            icon="pi pi-sparkles"
            loading={batchPending}
            disabled={isBusy}
            onClick={() => void handleGenerate()}
          />
        </div>
      ) : null}

      {data.strategyVersionChanged ? (
        <Message
          severity="warn"
          text={copy.strategyVersionWarning}
          style={{ width: "100%", marginBottom: "1rem" }}
        />
      ) : null}

      {banner ? (
        <Message severity="error" text={banner} style={{ width: "100%", marginBottom: "1rem" }} />
      ) : null}

      {batchPending ? (
        <GeneratingSkeleton copy={copy} />
      ) : !hasApprovedStrategy ? (
        <div>
          <Message severity="info" text={copy.emptyNoStrategy} style={{ width: "100%" }} />
          <Link href={`/operator/strategy?weekStart=${weekStart}`}>
            <Button
              type="button"
              label={copy.emptyNoStrategyCta}
              className="p-button-outlined"
              style={{ marginTop: "1rem" }}
            />
          </Link>
        </div>
      ) : (
        <>
          {allPending ? (
            <Message
              severity="info"
              text={copy.emptyNoScripts}
              style={{ width: "100%", marginBottom: "1rem" }}
            />
          ) : null}
          <DataTable
            value={data.items}
            dataKey="slotIndex"
            stripedRows
            expandedRows={expandedRows}
            onRowToggle={(event) => setExpandedRows(event.data as ReelScriptListItem[])}
            rowExpansionTemplate={(row: ReelScriptListItem) => (
              <ScriptDetailPanel
                row={row}
                copy={copy}
                onCopy={copyToClipboard}
              />
            )}
          >
            <Column expander style={{ width: "3rem" }} />
            <Column
              field="tema"
              header={copy.columns.tema}
              body={(row: ReelScriptListItem) => (
                <span style={{ fontWeight: 600 }}>{row.tema}</span>
              )}
            />
            <Column
              header={copy.columns.day}
              body={(row: ReelScriptListItem) =>
                row.dayOfWeek ? copy.days[row.dayOfWeek as ContentStrategyDayOfWeek] ?? row.dayOfWeek : "—"
              }
            />
            <Column
              header={copy.columns.duration}
              body={(row: ReelScriptListItem) =>
                formatDuration(row.targetDurationSec, copy.durationSeconds)
              }
            />
            <Column
              header={copy.columns.status}
              body={(row: ReelScriptListItem) => (
                <Tag
                  value={
                    row.status === "generated"
                      ? copy.status.generated
                      : copy.status.pending
                  }
                  severity={row.status === "generated" ? "success" : "warning"}
                />
              )}
            />
            <Column
              header={copy.columns.actions}
              body={(row: ReelScriptListItem) => (
                <Button
                  type="button"
                  label={
                    regeneratingSlot === row.slotIndex
                      ? copy.regenerating
                      : copy.regenerate
                  }
                  size="small"
                  severity="secondary"
                  loading={regeneratingSlot === row.slotIndex}
                  disabled={isBusy}
                  onClick={() => void handleRegenerate(row.slotIndex)}
                />
              )}
            />
          </DataTable>
        </>
      )}
    </div>
  );
}

type ScriptDetailPanelProps = {
  row: ReelScriptListItem;
  copy: ScriptsPageCopy;
  onCopy: (text: string) => void;
};

function ScriptDetailPanel({ row, copy, onCopy }: ScriptDetailPanelProps) {
  if (!row.package) {
    return (
      <p style={{ margin: 0, color: "#6b7280", fontStyle: "italic" }}>
        {copy.status.pending}
      </p>
    );
  }

  const pkg = row.package;

  return (
    <div style={{ display: "grid", gap: "1rem", padding: "0.5rem 0" }}>
      <ScriptField
        label={copy.fields.hook}
        value={pkg.hook}
        highlighted
        copyLabel={copy.copyField}
        onCopy={onCopy}
      />
      <ScriptField
        label={copy.fields.body}
        value={pkg.body}
        copyLabel={copy.copyField}
        onCopy={onCopy}
      />
      <ScriptField
        label={copy.fields.cta}
        value={pkg.cta}
        copyLabel={copy.copyField}
        onCopy={onCopy}
      />
      <ScriptField
        label={copy.fields.onScreenText}
        value={pkg.onScreenText}
        preserveWhitespace
        copyLabel={copy.copyField}
        onCopy={onCopy}
      />
      <ScriptField
        label={copy.fields.voiceoverText}
        value={pkg.voiceoverText}
        copyLabel={copy.copyField}
        onCopy={onCopy}
      />
      {pkg.brollBeats && pkg.brollBeats.length > 0 ? (
        <ScriptField
          label={copy.fields.brollBeats}
          value={pkg.brollBeats.map((beat, index) => `${index + 1}. ${beat}`).join("\n")}
          preserveWhitespace
          copyLabel={copy.copyField}
          onCopy={onCopy}
        />
      ) : null}
      {pkg.coldOpenNotes ? (
        <ScriptField
          label={copy.fields.coldOpenNotes}
          value={pkg.coldOpenNotes}
          copyLabel={copy.copyField}
          onCopy={onCopy}
        />
      ) : null}
      {pkg.editingNotes ? (
        <ScriptField
          label={copy.fields.editingNotes}
          value={pkg.editingNotes}
          copyLabel={copy.copyField}
          onCopy={onCopy}
        />
      ) : null}
    </div>
  );
}

type ScriptFieldProps = {
  label: string;
  value: string;
  copyLabel: string;
  highlighted?: boolean;
  preserveWhitespace?: boolean;
  onCopy: (text: string) => void;
};

function ScriptField({
  label,
  value,
  copyLabel,
  highlighted = false,
  preserveWhitespace = false,
  onCopy,
}: ScriptFieldProps) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.5rem",
          marginBottom: "0.35rem",
        }}
      >
        <span style={{ fontWeight: 600, fontSize: "0.875rem", color: "#374151" }}>
          {label}
        </span>
        <Button
          type="button"
          icon="pi pi-copy"
          label={copyLabel}
          size="small"
          text
          onClick={() => onCopy(value)}
        />
      </div>
      <div
        style={{
          padding: "0.75rem 1rem",
          borderRadius: "0.5rem",
          background: highlighted ? "#fef3c7" : "#f9fafb",
          border: highlighted ? "1px solid #fcd34d" : "1px solid #e5e7eb",
          whiteSpace: preserveWhitespace ? "pre-wrap" : "normal",
          fontSize: "0.95rem",
          lineHeight: 1.5,
          color: "#111827",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function TagLine({ text }: { text: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "0.35rem 0.75rem",
        borderRadius: "9999px",
        background: "#eef2ff",
        color: "#3730a3",
        fontSize: "0.875rem",
        fontWeight: 600,
      }}
    >
      {text}
    </span>
  );
}

function GeneratingSkeleton({ copy }: { copy: Pick<ScriptsPageCopy, "generating"> }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <Message
        severity="info"
        text={copy.generating}
        style={{ width: "100%", marginBottom: "1rem" }}
      />
      <Skeleton height="2.5rem" style={{ marginBottom: "0.75rem" }} />
      <Skeleton height="2.5rem" style={{ marginBottom: "0.75rem" }} />
      <Skeleton height="2.5rem" style={{ marginBottom: "0.75rem" }} />
      <Skeleton height="2.5rem" />
    </div>
  );
}

function PageHeader({ copy }: { copy: Pick<ScriptsPageCopy, "title" | "subtitle"> }) {
  return (
    <div style={{ marginBottom: "1.5rem" }}>
      <h1 style={{ margin: "0 0 0.5rem", fontSize: "2rem" }}>{copy.title}</h1>
      <p style={{ margin: 0, color: "#4b5563" }}>{copy.subtitle}</p>
    </div>
  );
}
