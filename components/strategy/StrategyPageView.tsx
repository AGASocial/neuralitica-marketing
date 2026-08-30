"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "primereact/button";
import { Calendar } from "primereact/calendar";
import { Dropdown } from "primereact/dropdown";
import { Message } from "primereact/message";
import { Skeleton } from "primereact/skeleton";
import { Tag } from "primereact/tag";
import { Toast } from "primereact/toast";

import {
  briefsEqual,
  buildEditablePatch,
  cloneBrief,
  hasValidEditableThemes,
} from "@/components/strategy/strategy-brief-edit";
import { StrategyBriefView } from "@/components/strategy/StrategyBriefView";
import type {
  ContentStrategyBrief,
  ContentStrategyDayOfWeek,
  ContentStrategyErrorCode,
  ContentStrategySlotGoal,
  ContentStrategyView,
} from "@/lib/contracts/content-strategy";
import { approveContentStrategy } from "@/lib/content-strategy/actions/approve-content-strategy";
import { generateContentStrategy } from "@/lib/content-strategy/actions/generate-content-strategy";
import { updateContentStrategyBrief } from "@/lib/content-strategy/actions/update-content-strategy-brief";
import type { OperatorClientOption } from "@/lib/content-strategy/load-operator-clients-for-strategy";
import type { VisualModality } from "@/lib/contracts/visual-preferences";
import { formatWeekRange, normalizeToIsoMonday } from "@/lib/trend/normalize-week-start";

type StrategyPageCopy = {
  title: string;
  subtitle: string;
  generate: string;
  regenerate: string;
  generating: string;
  save: string;
  saving: string;
  approve: string;
  approving: string;
  clientLabel: string;
  clientSessionHint: string;
  weekLabel: string;
  empty: string;
  loadError: string;
  backDashboard: string;
  versionLabel: string;
  versionLabelApproved: string;
  toastGenerateSuccess: string;
  toastSaveSuccess: string;
  toastApproveSuccess: string;
  approvedLockedHint: string;
  approvalCaption: string;
  status: {
    draft: string;
    approved: string;
  };
  sections: {
    pillars: string;
    themes: string;
    slots: string;
  };
  slot: {
    tema: string;
    formato: string;
    modalidad: string;
    tactica: string;
    goal: string;
    day: string;
    slotNumber: string;
    angle: string;
    ctaHint: string;
  };
  themes: {
    add: string;
    remove: string;
  };
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
    agentOutputInvalid: string;
    providerUnavailable: string;
    notMonday: string;
    notDraft: string;
    invalidTransition: string;
    locked: string;
    unauthenticated: string;
    forbidden: string;
    internal: string;
  };
};

type StrategyPageViewProps = {
  weekStart: string;
  sessionClientId: string;
  clients: OperatorClientOption[];
  strategy: ContentStrategyView | null;
  playbookLabels?: Record<string, string>;
  loadFailed: boolean;
  locale: string;
  copy: StrategyPageCopy;
};

function weekStartToDate(weekStart: string): Date {
  return new Date(`${weekStart}T12:00:00.000Z`);
}

function formatApprovalDate(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function messageForCode(
  code: ContentStrategyErrorCode,
  messageKey: string | undefined,
  copy: StrategyPageCopy,
): string {
  if (messageKey === "strategy.errors.notMonday") {
    return copy.errors.notMonday;
  }
  if (messageKey === "strategy.errors.notDraft") {
    return copy.errors.notDraft;
  }
  if (messageKey === "strategy.errors.invalidTransition") {
    return copy.errors.invalidTransition;
  }
  if (messageKey === "strategy.errors.locked") {
    return copy.errors.locked;
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
    case "AGENT_OUTPUT_INVALID":
      return copy.errors.agentOutputInvalid;
    case "PROVIDER_UNAVAILABLE":
      return copy.errors.providerUnavailable;
    case "STRATEGY_NOT_DRAFT":
      return copy.errors.notDraft;
    case "INVALID_STATE_TRANSITION":
      return copy.errors.invalidTransition;
    case "STRATEGY_LOCKED":
      return copy.errors.locked;
    case "UNAUTHENTICATED":
      return copy.errors.unauthenticated;
    case "FORBIDDEN":
      return copy.errors.forbidden;
    default:
      return copy.errors.internal;
  }
}

export function StrategyPageView({
  weekStart,
  sessionClientId,
  clients,
  strategy,
  playbookLabels,
  loadFailed,
  locale,
  copy,
}: StrategyPageViewProps) {
  const router = useRouter();
  const toastRef = useRef<Toast>(null);
  const [pending, setPending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [editedBrief, setEditedBrief] = useState<ContentStrategyBrief | null>(null);

  useEffect(() => {
    if (strategy) {
      setEditedBrief(cloneBrief(strategy.brief));
    } else {
      setEditedBrief(null);
    }
  }, [strategy]);

  const clientOptions = useMemo(() => {
    if (clients.length > 0) {
      return clients.map((client) => ({
        label: `${client.displayName} (${client.email})`,
        value: client.id,
      }));
    }
    return [
      {
        label: sessionClientId,
        value: sessionClientId,
      },
    ];
  }, [clients, sessionClientId]);

  const weekDate = weekStartToDate(weekStart);
  const weekRangeLabel = formatWeekRange(weekStart, locale);
  const generateLabel = strategy ? copy.regenerate : copy.generate;
  const isBusy = pending || saving || approving;

  const versionLabel = strategy
    ? strategy.status === "approved"
      ? copy.versionLabelApproved.replace("{version}", String(strategy.version))
      : strategy.version > 1
        ? copy.versionLabel.replace("{version}", String(strategy.version))
        : null
    : null;

  const isDirty =
    strategy !== null &&
    editedBrief !== null &&
    !briefsEqual(strategy.brief, editedBrief);

  const hasValidThemes =
    editedBrief !== null && hasValidEditableThemes(editedBrief);

  const canEdit = strategy?.isEditable === true && strategy.status === "draft";
  const displayBrief = editedBrief ?? strategy?.brief ?? null;

  const approvalCaption =
    strategy?.status === "approved" &&
    strategy.approvedBy &&
    strategy.approvedAt
      ? copy.approvalCaption
          .replace("{name}", strategy.approvedBy.displayName)
          .replace("{date}", formatApprovalDate(strategy.approvedAt, locale))
      : null;

  function navigateWeek(nextWeekStart: string) {
    const params = new URLSearchParams();
    params.set("weekStart", nextWeekStart);
    router.push(`/operator/strategy?${params.toString()}`);
    router.refresh();
  }

  async function handleGenerate() {
    if (isBusy) {
      return;
    }

    setPending(true);
    setBanner(null);

    try {
      const result = await generateContentStrategy({ weekStart });

      if (result.ok) {
        toastRef.current?.show({
          severity: "success",
          summary: copy.toastGenerateSuccess,
          life: 4000,
        });
        router.refresh();
        return;
      }

      setBanner(
        messageForCode(result.error.code, result.error.messageKey, copy),
      );
    } catch {
      setBanner(copy.errors.internal);
    } finally {
      setPending(false);
    }
  }

  async function handleSave() {
    if (!strategy || !editedBrief || !canEdit || !isDirty || saving) {
      return;
    }

    setSaving(true);
    setBanner(null);

    try {
      const result = await updateContentStrategyBrief({
        strategyId: strategy.id,
        weekStart,
        editable: buildEditablePatch(editedBrief),
      });

      if (result.ok) {
        toastRef.current?.show({
          severity: "success",
          summary: copy.toastSaveSuccess,
          life: 4000,
        });
        router.refresh();
        return;
      }

      setBanner(
        messageForCode(result.error.code, result.error.messageKey, copy),
      );
    } catch {
      setBanner(copy.errors.internal);
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove() {
    if (!strategy || !canEdit || isDirty || approving) {
      return;
    }

    setApproving(true);
    setBanner(null);

    try {
      const result = await approveContentStrategy({
        strategyId: strategy.id,
        weekStart,
      });

      if (result.ok) {
        toastRef.current?.show({
          severity: "success",
          summary: copy.toastApproveSuccess,
          life: 4000,
        });
        router.refresh();
        return;
      }

      setBanner(
        messageForCode(result.error.code, result.error.messageKey, copy),
      );
    } catch {
      setBanner(copy.errors.internal);
    } finally {
      setApproving(false);
    }
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

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
      <Toast ref={toastRef} />
      <PageHeader copy={copy} />

      <div
        style={{
          display: "grid",
          gap: "1rem",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          marginBottom: "1.5rem",
        }}
      >
        <div>
          <label
            htmlFor="strategy-client-select"
            style={{ display: "block", fontWeight: 600, marginBottom: "0.5rem" }}
          >
            {copy.clientLabel}
          </label>
          <Dropdown
            inputId="strategy-client-select"
            value={sessionClientId}
            options={clientOptions}
            disabled
            style={{ width: "100%" }}
          />
          <p style={{ margin: "0.5rem 0 0", color: "#6b7280", fontSize: "0.875rem" }}>
            {copy.clientSessionHint}
          </p>
        </div>

        <div>
          <label
            htmlFor="strategy-week-picker"
            style={{ display: "block", fontWeight: 600, marginBottom: "0.5rem" }}
          >
            {copy.weekLabel}
          </label>
          <Calendar
            inputId="strategy-week-picker"
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
      </div>

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
          {strategy ? (
            <Tag
              value={
                strategy.status === "approved"
                  ? copy.status.approved
                  : copy.status.draft
              }
              severity={strategy.status === "approved" ? "success" : "warning"}
            />
          ) : null}
          {versionLabel ? <TagLine text={versionLabel} /> : null}
        </div>
        <Button
          type="button"
          label={generateLabel}
          icon="pi pi-sparkles"
          loading={pending}
          disabled={isBusy}
          onClick={() => void handleGenerate()}
        />
      </div>

      {approvalCaption ? (
        <p style={{ margin: "0 0 1rem", color: "#4b5563", fontSize: "0.9rem" }}>
          {approvalCaption}
        </p>
      ) : null}

      {strategy?.status === "approved" ? (
        <Message
          severity="info"
          text={copy.approvedLockedHint}
          style={{ width: "100%", marginBottom: "1rem" }}
        />
      ) : null}

      {strategy && canEdit ? (
        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            flexWrap: "wrap",
            marginBottom: "1rem",
          }}
        >
          <Button
            type="button"
            label={saving ? copy.saving : copy.save}
            icon="pi pi-save"
            loading={saving}
            disabled={!isDirty || !hasValidThemes || isBusy}
            onClick={() => void handleSave()}
          />
          <Button
            type="button"
            label={approving ? copy.approving : copy.approve}
            icon="pi pi-check"
            severity="success"
            loading={approving}
            disabled={isDirty || isBusy}
            onClick={() => void handleApprove()}
          />
        </div>
      ) : null}

      {banner ? (
        <Message severity="error" text={banner} style={{ width: "100%", marginBottom: "1rem" }} />
      ) : null}

      {pending ? (
        <GeneratingSkeleton copy={copy} />
      ) : strategy && displayBrief ? (
        <StrategyBriefView
          brief={displayBrief}
          playbookLabels={playbookLabels}
          isEditable={canEdit}
          onBriefChange={canEdit ? setEditedBrief : undefined}
          copy={{
            sections: copy.sections,
            slot: copy.slot,
            themes: copy.themes,
            goals: copy.goals,
            days: copy.days,
            modalities: copy.modalities,
          }}
        />
      ) : (
        <Message severity="info" text={copy.empty} style={{ width: "100%" }} />
      )}
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

function GeneratingSkeleton({ copy }: { copy: StrategyPageCopy }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <Message
        severity="info"
        text={copy.generating}
        style={{ width: "100%", marginBottom: "1rem" }}
      />
      <Skeleton height="2rem" style={{ marginBottom: "1rem" }} />
      <Skeleton height="6rem" style={{ marginBottom: "1rem" }} />
      <Skeleton height="8rem" style={{ marginBottom: "1rem" }} />
      <Skeleton height="8rem" />
    </div>
  );
}

function PageHeader({ copy }: { copy: Pick<StrategyPageCopy, "title" | "subtitle"> }) {
  return (
    <div style={{ marginBottom: "1.5rem" }}>
      <h1 style={{ margin: "0 0 0.5rem", fontSize: "2rem" }}>{copy.title}</h1>
      <p style={{ margin: 0, color: "#4b5563" }}>{copy.subtitle}</p>
    </div>
  );
}
