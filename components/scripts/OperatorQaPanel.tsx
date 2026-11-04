"use client";

import { useState } from "react";

import { PencilIcon, RefreshCwIcon, ShieldIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { StatusAlert } from "@/components/ui/status-alert";
import { StatusBadge } from "@/components/ui/status-badge";

import type { AssemblyJobStatus } from "@/lib/contracts/assembly-job";
import type { BrandingJobStatus } from "@/lib/contracts/branding-job";
import {
  computeQaGateReady,
  type OverrideQaCheckSuccess,
  type QaCheckKey,
} from "@/lib/contracts/qa-override";
import type {
  OperatorQaOverrideDto,
  OperatorQaReportDetailDto,
  QaCheckOutcomeStatus,
  QaCheckSeverity,
  QaReportErrorCode,
  QaReportStatus,
  RunQaForAssembledReelSuccess,
} from "@/lib/contracts/qa-report";
import { runQaForAssembledReel } from "@/lib/qa/actions/run-qa-for-assembled-reel";

import {
  QaOverrideDialog,
  type QaOverrideDialogCopy,
} from "@/components/scripts/QaOverrideDialog";

export type OperatorQaCopy = {
  title: string;
  empty: {
    noReport: string;
    prerequisites: string;
  };
  loading: string;
  gateNotReady: string;
  status: Record<QaReportStatus, string>;
  checkStatus: Record<QaCheckOutcomeStatus, string>;
  severity: Record<QaCheckSeverity, string>;
  checks: Record<QaCheckKey, string>;
  evidence: Record<string, string>;
  actions: {
    run: string;
    rerun: string;
    running: string;
  };
  toastSuccess: string;
  override: {
    action: string;
    blockingLocked: string;
    auditTitle: string;
    auditEmpty: string;
    gateReady: string;
    toastSuccess: string;
    dialog: QaOverrideDialogCopy;
  };
  errors: {
    unauthenticated: string;
    forbidden: string;
    validation: string;
    notFound: string;
    forbiddenFields: string;
    assemblyNotReady: string;
    brandingRequired: string;
    captionRequired: string;
    scriptNotFound: string;
    rateLimited: string;
    inFlight: string;
    budgetExceeded: string;
    costPolicyUnavailable: string;
    providerUnavailable: string;
    qaOutputInvalid: string;
    internal: string;
  };
};

type OperatorQaPanelProps = {
  assembledReelId: string;
  assemblyStatus: AssemblyJobStatus | null | undefined;
  brandingStatus: BrandingJobStatus | null | undefined;
  report: OperatorQaReportDetailDto | null | undefined;
  copy: OperatorQaCopy;
  disabled: boolean;
  onSuccess: (result: RunQaForAssembledReelSuccess) => void;
  onOverrideSuccess: (result: OverrideQaCheckSuccess) => void;
  onError: (message: string) => void;
  onToastSuccess: (summary: string) => void;
};

function qaStatusSeverity(
  status: QaReportStatus,
): "success" | "info" | "warning" | "danger" | "secondary" | "contrast" {
  switch (status) {
    case "passed":
      return "success";
    case "running":
    case "pending":
      return "info";
    case "failed":
      return "warning";
    case "blocked":
      return "danger";
    default:
      return "secondary";
  }
}

function checkOutcomeSeverity(
  status: QaCheckOutcomeStatus,
): "success" | "info" | "warning" | "danger" | "secondary" {
  switch (status) {
    case "pass":
      return "success";
    case "fail":
      return "danger";
    case "skipped":
      return "secondary";
    default:
      return "secondary";
  }
}

function severityTagSeverity(
  severity: QaCheckSeverity,
): "danger" | "warning" {
  return severity === "blocking" ? "danger" : "warning";
}

function isQaInFlight(status: QaReportStatus | null | undefined): boolean {
  return status === "pending" || status === "running";
}

function isTerminalQaStatus(status: QaReportStatus | null | undefined): boolean {
  return status === "passed" || status === "failed" || status === "blocked";
}

function prerequisitesMet(
  assemblyStatus: AssemblyJobStatus | null | undefined,
  brandingStatus: BrandingJobStatus | null | undefined,
): boolean {
  return assemblyStatus === "completed" && brandingStatus === "completed";
}

function resolveEvidenceText(
  messageKey: string | undefined,
  detail: string | undefined,
  copy: OperatorQaCopy,
): string | null {
  if (messageKey) {
    const shortKey = messageKey
      .replace(/^qa\.checks\./, "")
      .replace(/^scripts\.qa\.evidence\./, "");
    const fromCopy =
      copy.evidence[messageKey] ??
      copy.evidence[shortKey] ??
      copy.evidence[shortKey.replace(/\./g, "_")];
    if (fromCopy) {
      return fromCopy;
    }
  }
  if (detail && detail.trim().length > 0) {
    return detail;
  }
  return messageKey ?? null;
}

function isFailOverridable(
  status: QaCheckOutcomeStatus,
  severity: QaCheckSeverity,
): boolean {
  return status === "fail" && severity === "overridable";
}

function isFailBlocking(
  status: QaCheckOutcomeStatus,
  severity: QaCheckSeverity,
): boolean {
  return status === "fail" && severity === "blocking";
}

/** Client-side gate badge only — never call getQaGateStatusForAssembledReel from browser. */
function deriveGateReadyFromReport(
  report: OperatorQaReportDetailDto,
): boolean {
  const hasBlockingFailures = report.checks.some((check) =>
    isFailBlocking(check.status, check.severity),
  );
  const overriddenCheckKeys = [
    ...new Set(report.overrides.map((row) => row.checkKey)),
  ];
  return computeQaGateReady({
    status: report.status,
    checks: report.checks,
    overriddenCheckKeys,
    hasBlockingFailures,
  });
}

function formatOverrideTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString();
}

export function messageForQaError(
  code: QaReportErrorCode,
  messageKey: string | undefined,
  copy: OperatorQaCopy,
): string {
  if (messageKey === "scripts.qa.errors.captionRequired") {
    return copy.errors.captionRequired;
  }
  if (messageKey === "scripts.qa.errors.brandingRequired") {
    return copy.errors.brandingRequired;
  }
  if (messageKey === "scripts.qa.errors.assemblyNotReady") {
    return copy.errors.assemblyNotReady;
  }
  if (messageKey === "scripts.qa.errors.forbiddenFields") {
    return copy.errors.forbiddenFields;
  }
  if (messageKey === "scripts.qa.errors.budgetExceeded") {
    return copy.errors.budgetExceeded;
  }
  if (messageKey === "scripts.budget.errors.exceeded") {
    return copy.errors.budgetExceeded;
  }
  if (messageKey === "scripts.qa.errors.costPolicyUnavailable") {
    return copy.errors.costPolicyUnavailable;
  }
  if (messageKey === "scripts.qa.errors.providerUnavailable") {
    return copy.errors.providerUnavailable;
  }

  switch (code) {
    case "UNAUTHENTICATED":
      return copy.errors.unauthenticated;
    case "FORBIDDEN":
      return copy.errors.forbidden;
    case "VALIDATION_ERROR":
      return copy.errors.validation;
    case "NOT_FOUND":
      return copy.errors.notFound;
    case "FORBIDDEN_FIELDS":
      return copy.errors.forbiddenFields;
    case "ASSEMBLY_NOT_READY":
      return copy.errors.assemblyNotReady;
    case "BRANDING_REQUIRED":
      return copy.errors.brandingRequired;
    case "CAPTION_REQUIRED":
      return copy.errors.captionRequired;
    case "SCRIPT_NOT_FOUND":
      return copy.errors.scriptNotFound;
    case "RATE_LIMITED":
      return copy.errors.rateLimited;
    case "GENERATION_IN_FLIGHT":
      return copy.errors.inFlight;
    case "BUDGET_EXCEEDED":
      return copy.errors.budgetExceeded;
    case "COST_POLICY_UNAVAILABLE":
      return copy.errors.costPolicyUnavailable;
    case "PROVIDER_UNAVAILABLE":
      return copy.errors.providerUnavailable;
    case "QA_OUTPUT_INVALID":
      return copy.errors.qaOutputInvalid;
    default:
      return copy.errors.internal;
  }
}

/**
 * Operator Veredicto QA panel (US-10.1 + US-10.2 override).
 * Run: runQaForAssembledReel({ assembledReelId }).
 * Override: overrideQaCheck({ qaReportId, checkKey, reason }) via dialog.
 */
export function OperatorQaPanel({
  assembledReelId,
  assemblyStatus,
  brandingStatus,
  report,
  copy,
  disabled,
  onSuccess,
  onOverrideSuccess,
  onError,
  onToastSuccess,
}: OperatorQaPanelProps) {
  const [pending, setPending] = useState(false);
  const [overridePending, setOverridePending] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [overrideDialogVisible, setOverrideDialogVisible] = useState(false);
  const [overrideCheckKey, setOverrideCheckKey] = useState<QaCheckKey | null>(
    null,
  );

  const readyForRun = prerequisitesMet(assemblyStatus, brandingStatus);
  const inFlight = isQaInFlight(report?.status) || pending;
  const hasReport = report != null;
  const canRun = readyForRun && !inFlight && !disabled && !hasReport;
  const canRerun =
    readyForRun && !inFlight && !disabled && isTerminalQaStatus(report?.status);
  const gateReady = report ? deriveGateReadyFromReport(report) : false;
  const showGateNotReady =
    report != null &&
    report.status !== "passed" &&
    isTerminalQaStatus(report.status) &&
    !gateReady;
  const overrides: OperatorQaOverrideDto[] = report?.overrides ?? [];

  async function handleRun() {
    if (pending || disabled || !readyForRun) {
      return;
    }

    setPending(true);
    setBanner(null);

    try {
      const result = await runQaForAssembledReel({ assembledReelId });

      if (result.ok) {
        onSuccess(result);
        if (!result.idempotent) {
          onToastSuccess(copy.toastSuccess);
        }
        return;
      }

      // Prefer idempotent success for in-flight; GENERATION_IN_FLIGHT is fallback only.
      if (result.error.code === "GENERATION_IN_FLIGHT") {
        setBanner(copy.errors.inFlight);
        return;
      }

      const message = messageForQaError(
        result.error.code,
        result.error.messageKey,
        copy,
      );
      setBanner(message);
      onError(message);
    } catch {
      const message = copy.errors.internal;
      setBanner(message);
      onError(message);
    } finally {
      setPending(false);
    }
  }

  function openOverrideDialog(checkKey: QaCheckKey) {
    if (disabled || overridePending || !report) {
      return;
    }
    setBanner(null);
    setOverrideCheckKey(checkKey);
    setOverrideDialogVisible(true);
  }

  function handleOverrideSuccess(result: OverrideQaCheckSuccess) {
    onOverrideSuccess(result);
    onToastSuccess(copy.override.toastSuccess);
  }

  function handleOverrideError(message: string) {
    setBanner(message);
    onError(message);
  }

  return (
    <section
      className="bg-panel border border-edge rounded-lg py-4 px-5 mb-4 flex flex-col gap-3"
    >
      <div
        className="flex justify-between items-start gap-3 flex-wrap"
      >
        <h3 className="font-display text-fog m-0 text-base">{copy.title}</h3>
        <div
          className="flex flex-wrap gap-2 items-center"
        >
          {gateReady ? (
            <StatusBadge value={copy.override.gateReady} severity="success" />
          ) : null}
          {report ? (
            <StatusBadge
              value={copy.status[report.status]}
              severity={qaStatusSeverity(report.status)}
            />
          ) : (
            <StatusBadge value={copy.status.pending} severity="secondary" />
          )}
        </div>
      </div>

      {banner ? (
        <StatusAlert severity="error" text={banner} className="w-full" />
      ) : null}

      {!readyForRun ? (
        <p className="m-0 text-dim text-sm">
          {copy.empty.prerequisites}
        </p>
      ) : null}

      {readyForRun && !hasReport && !pending ? (
        <p className="m-0 text-dim text-sm">
          {copy.empty.noReport}
        </p>
      ) : null}

      {pending && !hasReport ? (
        <p className="m-0 text-dim text-sm">
          {copy.loading}
        </p>
      ) : null}

      {showGateNotReady ? (
        <StatusAlert
          severity="warn"
          text={copy.gateNotReady}
          className="w-full"
        />
      ) : null}

      {report && report.checks.length > 0 ? (
        <ul
          className="list-none m-0 p-0 grid gap-2"
        >
          {report.checks.map((check) => {
            const evidenceText = resolveEvidenceText(
              check.evidence?.messageKey,
              check.evidence?.detail,
              copy,
            );
            const canOverride = isFailOverridable(check.status, check.severity);
            const blockingLocked = isFailBlocking(check.status, check.severity);

            return (
              <li
                key={check.checkKey}
                className="flex flex-col gap-[0.35rem] py-2 px-0 border-b border-edge"
              >
                <div
                  className="flex flex-wrap items-center gap-2"
                >
                  <span className="font-semibold text-sm">
                    {copy.checks[check.checkKey] ?? check.checkKey}
                  </span>
                  <StatusBadge
                    value={copy.checkStatus[check.status]}
                    severity={checkOutcomeSeverity(check.status)}
                  />
                  <StatusBadge
                    value={copy.severity[check.severity]}
                    severity={severityTagSeverity(check.severity)}
                  />
                  {canOverride ? (
                    <Button
                      type="button"
                      disabled={disabled || overridePending || inFlight}
                      onClick={() => openOverrideDialog(check.checkKey)}
                      variant="outline"
                      size="sm"
                    >
                      <PencilIcon />
                      {copy.override.action}
                    </Button>
                  ) : null}
                </div>
                {evidenceText ? (
                  <p
                    className="m-0 text-dim text-[0.8125rem] whitespace-pre-wrap"
                  >
                    {evidenceText}
                  </p>
                ) : null}
                {blockingLocked ? (
                  <p
                    className="m-0 text-butter text-[0.8125rem]"
                  >
                    {copy.override.blockingLocked}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {report && isTerminalQaStatus(report.status) ? (
        <div
          className="flex flex-col gap-2 pt-1"
        >
          <h4 className="font-display text-fog m-0 text-sm">
            {copy.override.auditTitle}
          </h4>
          {overrides.length === 0 ? (
            <p className="m-0 text-dim text-[0.8125rem]">
              {copy.override.auditEmpty}
            </p>
          ) : (
            <ul
              className="list-none m-0 p-0 grid gap-2"
            >
              {overrides.map((row) => (
                <li
                  key={row.overrideId}
                  className="py-2 px-0 border-b border-edge text-[0.8125rem]"
                >
                  <div className="font-semibold">
                    {copy.checks[row.checkKey] ?? row.checkKey}
                  </div>
                  <p
                    className="my-1 mx-0 whitespace-pre-wrap text-fog"
                  >
                    {row.reason}
                  </p>
                  <p className="m-0 text-dim">
                    {formatOverrideTimestamp(row.createdAt)}
                    {row.operatorDisplayName
                      ? ` · ${row.operatorDisplayName}`
                      : null}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {canRun || canRerun ? (
        <div className="flex flex-wrap gap-2">
          {canRun ? (
            <Button
              type="button"
              onClick={() => void handleRun()}
              disabled={disabled || pending}
            >
              {pending ? <Spinner className="size-4 text-current" /> : <ShieldIcon />}
              {pending ? copy.actions.running : copy.actions.run}
            </Button>
          ) : null}
          {canRerun ? (
            <Button
              type="button"
              onClick={() => void handleRun()}
              variant="outline"
              disabled={disabled || pending}
            >
              {pending ? <Spinner className="size-4 text-current" /> : <RefreshCwIcon />}
              {pending ? copy.actions.running : copy.actions.rerun}
            </Button>
          ) : null}
        </div>
      ) : null}

      {inFlight && hasReport ? (
        <p className="m-0 text-dim text-[0.8125rem]">
          {copy.loading}
        </p>
      ) : null}

      <QaOverrideDialog
        visible={overrideDialogVisible}
        qaReportId={report?.qaReportId ?? null}
        checkKey={overrideCheckKey}
        checkLabel={
          overrideCheckKey
            ? (copy.checks[overrideCheckKey] ?? overrideCheckKey)
            : ""
        }
        copy={copy.override.dialog}
        pending={overridePending}
        onHide={() => {
          setOverrideDialogVisible(false);
          setOverrideCheckKey(null);
        }}
        onPendingChange={setOverridePending}
        onSuccess={handleOverrideSuccess}
        onError={handleOverrideError}
      />
    </section>
  );
}
