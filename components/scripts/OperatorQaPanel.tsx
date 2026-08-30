"use client";

import { useState } from "react";
import { Button } from "primereact/button";
import { Message } from "primereact/message";
import { Tag } from "primereact/tag";

import type { AssemblyJobStatus } from "@/lib/contracts/assembly-job";
import type { BrandingJobStatus } from "@/lib/contracts/branding-job";
import type {
  OperatorQaReportDetailDto,
  QaCheckKey,
  QaCheckOutcomeStatus,
  QaCheckSeverity,
  QaReportErrorCode,
  QaReportStatus,
  RunQaForAssembledReelSuccess,
} from "@/lib/contracts/qa-report";
import { runQaForAssembledReel } from "@/lib/qa/actions/run-qa-for-assembled-reel";

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
 * Operator Veredicto QA panel (US-10.1 Phase A).
 * Calls runQaForAssembledReel({ assembledReelId }) only — no override UI.
 */
export function OperatorQaPanel({
  assembledReelId,
  assemblyStatus,
  brandingStatus,
  report,
  copy,
  disabled,
  onSuccess,
  onError,
  onToastSuccess,
}: OperatorQaPanelProps) {
  const [pending, setPending] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const readyForRun = prerequisitesMet(assemblyStatus, brandingStatus);
  const inFlight = isQaInFlight(report?.status) || pending;
  const hasReport = report != null;
  const canRun = readyForRun && !inFlight && !disabled && !hasReport;
  const canRerun =
    readyForRun && !inFlight && !disabled && isTerminalQaStatus(report?.status);

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

  return (
    <section
      style={{
        background: "#ffffff",
        border: "1px solid #e5e7eb",
        borderRadius: "8px",
        padding: "1rem 1.25rem",
        marginBottom: "1rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "0.75rem",
          flexWrap: "wrap",
        }}
      >
        <h3 style={{ margin: 0, fontSize: "1rem" }}>{copy.title}</h3>
        {report ? (
          <Tag
            value={copy.status[report.status]}
            severity={qaStatusSeverity(report.status)}
          />
        ) : (
          <Tag value={copy.status.pending} severity="secondary" />
        )}
      </div>

      {banner ? (
        <Message severity="error" text={banner} style={{ width: "100%" }} />
      ) : null}

      {!readyForRun ? (
        <p style={{ margin: 0, color: "#6b7280", fontSize: "0.875rem" }}>
          {copy.empty.prerequisites}
        </p>
      ) : null}

      {readyForRun && !hasReport && !pending ? (
        <p style={{ margin: 0, color: "#6b7280", fontSize: "0.875rem" }}>
          {copy.empty.noReport}
        </p>
      ) : null}

      {pending && !hasReport ? (
        <p style={{ margin: 0, color: "#6b7280", fontSize: "0.875rem" }}>
          {copy.loading}
        </p>
      ) : null}

      {report && report.status !== "passed" && isTerminalQaStatus(report.status) ? (
        <Message
          severity="warn"
          text={copy.gateNotReady}
          style={{ width: "100%" }}
        />
      ) : null}

      {report && report.checks.length > 0 ? (
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "grid",
            gap: "0.5rem",
          }}
        >
          {report.checks.map((check) => {
            const evidenceText = resolveEvidenceText(
              check.evidence?.messageKey,
              check.evidence?.detail,
              copy,
            );
            return (
              <li
                key={check.checkKey}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.35rem",
                  padding: "0.5rem 0",
                  borderBottom: "1px solid #f3f4f6",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>
                    {copy.checks[check.checkKey] ?? check.checkKey}
                  </span>
                  <Tag
                    value={copy.checkStatus[check.status]}
                    severity={checkOutcomeSeverity(check.status)}
                  />
                  <Tag
                    value={copy.severity[check.severity]}
                    severity={severityTagSeverity(check.severity)}
                    rounded
                  />
                </div>
                {evidenceText ? (
                  <p
                    style={{
                      margin: 0,
                      color: "#6b7280",
                      fontSize: "0.8125rem",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {evidenceText}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {canRun || canRerun ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          {canRun ? (
            <Button
              type="button"
              label={pending ? copy.actions.running : copy.actions.run}
              icon="pi pi-shield"
              loading={pending}
              disabled={disabled || pending}
              onClick={() => void handleRun()}
            />
          ) : null}
          {canRerun ? (
            <Button
              type="button"
              label={pending ? copy.actions.running : copy.actions.rerun}
              icon="pi pi-refresh"
              severity="secondary"
              outlined
              loading={pending}
              disabled={disabled || pending}
              onClick={() => void handleRun()}
            />
          ) : null}
        </div>
      ) : null}

      {inFlight && hasReport ? (
        <p style={{ margin: 0, color: "#6b7280", fontSize: "0.8125rem" }}>
          {copy.loading}
        </p>
      ) : null}
    </section>
  );
}
