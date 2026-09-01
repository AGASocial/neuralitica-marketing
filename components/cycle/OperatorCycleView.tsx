"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "primereact/button";
import { Column } from "primereact/column";
import { DataTable } from "primereact/datatable";
import { Dropdown } from "primereact/dropdown";
import { Message } from "primereact/message";
import { Tag } from "primereact/tag";
import { Toast } from "primereact/toast";

import type { WeeklyCycleRunMode, WeeklyCycleStepKey } from "@/lib/contracts/weekly-cycle";
import type { OperatorClientOption } from "@/lib/content-strategy/load-operator-clients-for-strategy";
// `OperatorWeeklyCycleRunDto` is the loader's own return-type declaration
// (structurally identical to `operatorWeeklyCycleRunDtoSchema` in
// `lib/contracts/weekly-cycle-live.ts` — see that loader file's header comment).
// Sourced here directly so this component always matches what the loader
// actually returns.
import type { OperatorWeeklyCycleRunDto } from "@/lib/orchestration/load-operator-weekly-cycle-runs";
// Manual trigger/preview/resume Server Actions — owned by the
// integrations-engineer agent building in parallel on this branch
// (CONTRACT.md "Manual trigger and loader"). `triggerWeeklyCycleForClient`'s
// exact result type is frozen in `lib/contracts/weekly-cycle-live.ts`
// (`TriggerWeeklyCycleResult`); `previewWeeklyCycleForClient` is documented as
// sharing its auth/input contract. Both are Server Action wrappers around the
// (already-landed) internal `resumeWeeklyCycleRun` implementation in
// `lib/orchestration/resume-weekly-cycle-run.ts` — see that file's header
// comment: "The `actions/resume-weekly-cycle-run.ts` Server Action is the
// only public entrypoint into this function."
import { previewWeeklyCycleForClient } from "@/lib/orchestration/actions/preview-weekly-cycle-for-client";
import { resumeWeeklyCycleRun } from "@/lib/orchestration/actions/resume-weekly-cycle-run";
import { triggerWeeklyCycleForClient } from "@/lib/orchestration/actions/trigger-weekly-cycle-for-client";
import { formatWeekRange } from "@/lib/trend/normalize-week-start";

export type OperatorCycleClientOption = OperatorClientOption;

/** Slot-level error code — derived from the DTO so it always matches the loader's shape. */
type WeeklyCycleErrorCode = NonNullable<
  OperatorWeeklyCycleRunDto["slots"][number]["errorCode"]
>;

type ActionErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "LIVE_DISABLED"
  | "CLIENT_INACTIVE"
  | "RUN_NOT_REPLANNABLE"
  | "RUN_NOT_RESUMABLE"
  | "INTERNAL_ERROR";

export type OperatorCycleCopy = {
  title: string;
  subtitle: string;
  backDashboard: string;
  clientLabel: string;
  clientPlaceholder: string;
  weekLabel: string;
  dryRunCta: string;
  dryRunPending: string;
  runCta: string;
  runPending: string;
  resumeCta: string;
  resumePending: string;
  emptyClients: string;
  emptyRuns: string;
  loadError: string;
  selectClientFirst: string;
  toastDryRunSuccess: string;
  toastRunStarted: string;
  toastAlreadyRunning: string;
  toastAlreadyCompleted: string;
  toastResumeSuccess: string;
  columns: {
    client: string;
    week: string;
    mode: string;
    status: string;
    slots: string;
    started: string;
    finished: string;
    actions: string;
  };
  mode: Record<WeeklyCycleRunMode, string>;
  status: Record<OperatorWeeklyCycleRunDto["status"], string>;
  slotStatus: Record<OperatorWeeklyCycleRunDto["slots"][number]["status"], string>;
  steps: Record<WeeklyCycleStepKey, string>;
  slotLabel: string;
  notStarted: string;
  weekOptionCurrent: string;
  weekOptionNext: string;
  weekOptionNextTwo: string;
  errors: Record<
    | "liveDisabled"
    | "clientInactive"
    | "tenantScopeMismatch"
    | "budgetExceeded"
    | "consentRequired"
    | "consentRevoked"
    | "policyRejected"
    | "providerUnavailable"
    | "validation"
    | "strategyInvalid"
    | "strategyStale"
    | "strategyApprovalConflict"
    | "dispatchTransient"
    | "providerTransient"
    | "workerTransient"
    | "jobTimeout"
    | "dependencyFailed"
    | "qaFailed"
    | "internal"
    | "unauthenticated"
    | "forbidden"
    | "notFound"
    | "runNotReplannable"
    | "runNotResumable",
    string
  >;
};

type OperatorCycleViewProps = {
  clients: OperatorCycleClientOption[];
  runs: OperatorWeeklyCycleRunDto[];
  loadFailed: boolean;
  locale: string;
  currentWeekStart: string;
  copy: OperatorCycleCopy;
};

type PendingAction =
  | { kind: "dryRun" }
  | { kind: "run" }
  | { kind: "resume"; runId: string }
  | null;

function shiftWeek(weekStart: string, deltaDays: number): string {
  const date = new Date(`${weekStart}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

function statusSeverity(
  status: OperatorWeeklyCycleRunDto["status"],
): "success" | "info" | "warning" | "danger" | "secondary" {
  switch (status) {
    case "completed":
      return "success";
    case "running":
      return "info";
    case "paused":
    case "partial_failed":
      return "warning";
    case "failed":
      return "danger";
    case "dry_run":
    default:
      return "secondary";
  }
}

function slotSeverity(
  status: OperatorWeeklyCycleRunDto["slots"][number]["status"],
): "success" | "info" | "warning" | "danger" | "secondary" {
  switch (status) {
    case "ready_for_approval":
      return "success";
    case "processing":
      return "info";
    case "failed":
      return "danger";
    case "pending":
    default:
      return "secondary";
  }
}

function PageHeader({ copy }: { copy: OperatorCycleCopy }) {
  return (
    <div style={{ marginBottom: "1.5rem" }}>
      <h1 style={{ margin: "0 0 0.35rem", fontSize: "1.75rem", fontWeight: 700 }}>
        {copy.title}
      </h1>
      <p style={{ margin: 0, color: "#6b7280", maxWidth: "48rem" }}>{copy.subtitle}</p>
    </div>
  );
}

export function OperatorCycleView({
  clients,
  runs,
  loadFailed,
  locale,
  currentWeekStart,
  copy,
}: OperatorCycleViewProps) {
  const router = useRouter();
  const toastRef = useRef<Toast>(null);

  const [selectedClientId, setSelectedClientId] = useState<string | null>(
    clients[0]?.id ?? null,
  );
  const [selectedWeekStart, setSelectedWeekStart] = useState(currentWeekStart);
  const [pending, setPending] = useState<PendingAction>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const weekOptions = useMemo(
    () => [
      {
        label: copy.weekOptionCurrent.replace(
          "{range}",
          formatWeekRange(currentWeekStart, locale),
        ),
        value: currentWeekStart,
      },
      {
        label: copy.weekOptionNext.replace(
          "{range}",
          formatWeekRange(shiftWeek(currentWeekStart, 7), locale),
        ),
        value: shiftWeek(currentWeekStart, 7),
      },
      {
        label: copy.weekOptionNextTwo.replace(
          "{range}",
          formatWeekRange(shiftWeek(currentWeekStart, 14), locale),
        ),
        value: shiftWeek(currentWeekStart, 14),
      },
    ],
    [copy, currentWeekStart, locale],
  );

  const clientDropdownOptions = clients.map((client) => ({
    label: client.displayName,
    value: client.id,
  }));

  function messageForActionError(code: ActionErrorCode): string {
    switch (code) {
      case "UNAUTHENTICATED":
        return copy.errors.unauthenticated;
      case "FORBIDDEN":
        return copy.errors.forbidden;
      case "NOT_FOUND":
        return copy.errors.notFound;
      case "VALIDATION_ERROR":
        return copy.errors.validation;
      case "LIVE_DISABLED":
        return copy.errors.liveDisabled;
      case "CLIENT_INACTIVE":
        return copy.errors.clientInactive;
      case "RUN_NOT_REPLANNABLE":
        return copy.errors.runNotReplannable;
      case "RUN_NOT_RESUMABLE":
        return copy.errors.runNotResumable;
      case "INTERNAL_ERROR":
      default:
        return copy.errors.internal;
    }
  }

  function messageForSlotError(code: WeeklyCycleErrorCode | undefined): string | null {
    if (!code) {
      return null;
    }
    switch (code) {
      case "LIVE_DISABLED":
        return copy.errors.liveDisabled;
      case "CLIENT_INACTIVE":
        return copy.errors.clientInactive;
      case "TENANT_SCOPE_MISMATCH":
        return copy.errors.tenantScopeMismatch;
      case "BUDGET_EXCEEDED":
        return copy.errors.budgetExceeded;
      case "CONSENT_REQUIRED":
        return copy.errors.consentRequired;
      case "CONSENT_REVOKED":
        return copy.errors.consentRevoked;
      case "POLICY_REJECTED":
        return copy.errors.policyRejected;
      case "PROVIDER_UNAVAILABLE":
        return copy.errors.providerUnavailable;
      case "VALIDATION_ERROR":
        return copy.errors.validation;
      case "STRATEGY_INVALID":
        return copy.errors.strategyInvalid;
      case "STRATEGY_STALE":
        return copy.errors.strategyStale;
      case "STRATEGY_APPROVAL_CONFLICT":
        return copy.errors.strategyApprovalConflict;
      case "DISPATCH_TRANSIENT":
        return copy.errors.dispatchTransient;
      case "PROVIDER_TRANSIENT":
        return copy.errors.providerTransient;
      case "WORKER_TRANSIENT":
        return copy.errors.workerTransient;
      case "JOB_TIMEOUT":
        return copy.errors.jobTimeout;
      case "DEPENDENCY_FAILED":
        return copy.errors.dependencyFailed;
      case "QA_FAILED":
        return copy.errors.qaFailed;
      case "INTERNAL_ERROR":
      default:
        return copy.errors.internal;
    }
  }

  async function handleDryRun() {
    if (pending || !selectedClientId) {
      if (!selectedClientId) {
        setBanner(copy.selectClientFirst);
      }
      return;
    }

    setPending({ kind: "dryRun" });
    setBanner(null);

    try {
      const result = await previewWeeklyCycleForClient({
        clientId: selectedClientId,
        weekStart: selectedWeekStart,
      });

      if (result.ok) {
        toastRef.current?.show({
          severity: "success",
          summary: copy.toastDryRunSuccess,
          life: 4000,
        });
        router.refresh();
        return;
      }

      setBanner(messageForActionError(result.error.code));
    } catch {
      setBanner(copy.errors.internal);
    } finally {
      setPending(null);
    }
  }

  async function handleRunCycle() {
    if (pending || !selectedClientId) {
      if (!selectedClientId) {
        setBanner(copy.selectClientFirst);
      }
      return;
    }

    setPending({ kind: "run" });
    setBanner(null);

    try {
      const result = await triggerWeeklyCycleForClient({
        clientId: selectedClientId,
        weekStart: selectedWeekStart,
      });

      if (result.ok) {
        const summary =
          result.outcome === "ALREADY_RUNNING"
            ? copy.toastAlreadyRunning
            : result.outcome === "ALREADY_COMPLETED"
              ? copy.toastAlreadyCompleted
              : copy.toastRunStarted;
        toastRef.current?.show({
          severity: result.outcome === "STARTED" ? "success" : "info",
          summary,
          life: 4000,
        });
        router.refresh();
        return;
      }

      setBanner(messageForActionError(result.error.code));
    } catch {
      setBanner(copy.errors.internal);
    } finally {
      setPending(null);
    }
  }

  async function handleResume(runId: string) {
    if (pending) {
      return;
    }

    setPending({ kind: "resume", runId });
    setBanner(null);

    try {
      const result = await resumeWeeklyCycleRun({ runId });

      if (result.ok) {
        toastRef.current?.show({
          severity: "success",
          summary: copy.toastResumeSuccess,
          life: 4000,
        });
        router.refresh();
        return;
      }

      setBanner(messageForActionError(result.error.code));
    } catch {
      setBanner(copy.errors.internal);
    } finally {
      setPending(null);
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

  const dryRunPending = pending?.kind === "dryRun";
  const runPending = pending?.kind === "run";
  const anyPending = pending !== null;

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
      <Toast ref={toastRef} position="top-right" />
      <PageHeader copy={copy} />

      {banner ? (
        <Message
          severity="error"
          text={banner}
          style={{ width: "100%", marginBottom: "1rem" }}
        />
      ) : null}

      {clients.length === 0 ? (
        <Message
          severity="info"
          text={copy.emptyClients}
          style={{ width: "100%", marginBottom: "1.5rem" }}
        />
      ) : (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "1rem",
            alignItems: "flex-end",
            marginBottom: "1.5rem",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            <label htmlFor="cycle-client-select" style={{ fontWeight: 600, fontSize: "0.9rem" }}>
              {copy.clientLabel}
            </label>
            <Dropdown
              inputId="cycle-client-select"
              value={selectedClientId}
              options={clientDropdownOptions}
              onChange={(event) => setSelectedClientId(event.value as string)}
              placeholder={copy.clientPlaceholder}
              disabled={anyPending}
              style={{ minWidth: "240px" }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            <label htmlFor="cycle-week-select" style={{ fontWeight: 600, fontSize: "0.9rem" }}>
              {copy.weekLabel}
            </label>
            <Dropdown
              inputId="cycle-week-select"
              value={selectedWeekStart}
              options={weekOptions}
              onChange={(event) => setSelectedWeekStart(event.value as string)}
              disabled={anyPending}
              style={{ minWidth: "260px" }}
            />
          </div>

          <Button
            type="button"
            label={dryRunPending ? copy.dryRunPending : copy.dryRunCta}
            className="p-button-outlined"
            loading={dryRunPending}
            disabled={anyPending || !selectedClientId}
            onClick={() => void handleDryRun()}
          />
          <Button
            type="button"
            label={runPending ? copy.runPending : copy.runCta}
            loading={runPending}
            disabled={anyPending || !selectedClientId}
            onClick={() => void handleRunCycle()}
          />
        </div>
      )}

      {runs.length === 0 ? (
        <Message severity="info" text={copy.emptyRuns} style={{ width: "100%" }} />
      ) : (
        <DataTable value={runs} dataKey="runId" stripedRows loading={anyPending}>
          <Column
            field="clientDisplayName"
            header={copy.columns.client}
            body={(row: OperatorWeeklyCycleRunDto) => row.clientDisplayName}
          />
          <Column
            field="weekStart"
            header={copy.columns.week}
            body={(row: OperatorWeeklyCycleRunDto) => formatWeekRange(row.weekStart, locale)}
          />
          <Column
            field="mode"
            header={copy.columns.mode}
            body={(row: OperatorWeeklyCycleRunDto) => (
              <Tag value={copy.mode[row.mode]} severity="secondary" />
            )}
          />
          <Column
            field="status"
            header={copy.columns.status}
            body={(row: OperatorWeeklyCycleRunDto) => (
              <Tag value={copy.status[row.status]} severity={statusSeverity(row.status)} />
            )}
          />
          <Column
            header={copy.columns.slots}
            body={(row: OperatorWeeklyCycleRunDto) => (
              <div style={{ display: "flex", gap: "0.35rem" }}>
                {row.slots.map((slot) => {
                  const stepLabel = slot.currentStep ? copy.steps[slot.currentStep] : null;
                  const errorLabel = messageForSlotError(slot.errorCode);
                  const title = [
                    copy.slotLabel.replace("{index}", String(slot.slotIndex + 1)),
                    stepLabel,
                    errorLabel,
                  ]
                    .filter(Boolean)
                    .join(" — ");
                  return (
                    <Tag
                      key={slot.slotIndex}
                      value={String(slot.slotIndex + 1)}
                      severity={slotSeverity(slot.status)}
                      title={title}
                    />
                  );
                })}
              </div>
            )}
          />
          <Column
            header={copy.columns.started}
            body={(row: OperatorWeeklyCycleRunDto) =>
              row.startedAt
                ? new Intl.DateTimeFormat(locale, {
                    dateStyle: "short",
                    timeStyle: "short",
                  }).format(new Date(row.startedAt))
                : copy.notStarted
            }
          />
          <Column
            header={copy.columns.finished}
            body={(row: OperatorWeeklyCycleRunDto) =>
              row.finishedAt
                ? new Intl.DateTimeFormat(locale, {
                    dateStyle: "short",
                    timeStyle: "short",
                  }).format(new Date(row.finishedAt))
                : copy.notStarted
            }
          />
          <Column
            header={copy.columns.actions}
            body={(row: OperatorWeeklyCycleRunDto) =>
              row.canResume ? (
                <Button
                  type="button"
                  label={
                    pending?.kind === "resume" && pending.runId === row.runId
                      ? copy.resumePending
                      : copy.resumeCta
                  }
                  className="p-button-sm p-button-outlined"
                  loading={pending?.kind === "resume" && pending.runId === row.runId}
                  disabled={anyPending}
                  onClick={() => void handleResume(row.runId)}
                />
              ) : null
            }
          />
        </DataTable>
      )}
    </div>
  );
}
