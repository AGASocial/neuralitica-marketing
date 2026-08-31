"use client";

import { useEffect, useState } from "react";
import { Button } from "primereact/button";
import { Message } from "primereact/message";
import { Tag } from "primereact/tag";

import type {
  ActualCostUnavailableReason,
  OperatorProductionJobCostStatus,
} from "@/lib/contracts/actual-cost";
import type {
  OperatorVideoJobStatusDto,
  OperatorVideoJobSummaryDto,
} from "@/lib/contracts/video-job";
import {
  VIDEO_JOB_POLL_INTERVAL_MS_DEFAULT,
  VIDEO_JOB_STALE_FAILURE_MESSAGE_KEY,
} from "@/lib/contracts/video-job";
import type { VideoJobStatus } from "@/lib/contracts/providers";
import { formatCentsForDisplay } from "@/lib/cost-policy/format-cents-for-display";

export type OperatorVideoJobCopy = {
  title: string;
  empty: string;
  status: Record<VideoJobStatus, string>;
  attempt: string;
  regenerationCount: string;
  failureReasonLabel: string;
  costEstimated: string;
  costActual: string;
  costPending: string;
  costUnavailable: Record<ActualCostUnavailableReason, string>;
  retryButton: string;
  retryBlocked: string;
  polling: string;
  failure: {
    staleTimeout: string;
  };
  retry: {
    notRetryable: string;
    limitExceeded: string;
    budgetExceeded: string;
    providerUnavailable: string;
    overrideButton: string;
  };
};

type OperatorVideoJobSummaryPanelProps = {
  initialJob: OperatorVideoJobSummaryDto | null | undefined;
  locale: string;
  copy: OperatorVideoJobCopy;
  isBusy: boolean;
  onRequestRetry: (failedJobId: string) => void;
  onRequestOverride: (failedJobId: string) => void;
};

function formatTemplate(
  template: string,
  values: Record<string, string | number>,
): string {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replace(`{${key}}`, String(value)),
    template,
  );
}

function videoJobStatusSeverity(
  status: VideoJobStatus,
): "success" | "info" | "warning" | "danger" | "secondary" | "contrast" {
  switch (status) {
    case "completed":
      return "success";
    case "processing":
      return "info";
    case "queued":
      return "secondary";
    case "failed":
      return "danger";
    case "cancelled":
      return "warning";
    default:
      return "secondary";
  }
}

function resolveFailureReasonText(
  failureReason: string | null,
  copy: OperatorVideoJobCopy,
): string | null {
  if (!failureReason) {
    return null;
  }

  if (
    failureReason === VIDEO_JOB_STALE_FAILURE_MESSAGE_KEY ||
    failureReason === "scripts.videoJob.failure.staleTimeout"
  ) {
    return copy.failure.staleTimeout;
  }

  return failureReason;
}

function resolveBlockedReasonText(
  retryBlockedReasonKey: string | null | undefined,
  copy: OperatorVideoJobCopy,
): string | null {
  if (!retryBlockedReasonKey) {
    return null;
  }

  switch (retryBlockedReasonKey) {
    case "scripts.videoJob.retry.notRetryable":
      return copy.retry.notRetryable;
    case "scripts.videoJob.retry.limitExceeded":
      return copy.retry.limitExceeded;
    case "scripts.videoJob.retry.budgetExceeded":
      return copy.retry.budgetExceeded;
    case "scripts.videoJob.retry.providerUnavailable":
      return copy.retry.providerUnavailable;
    default:
      return copy.retryBlocked;
  }
}

function renderJobCostValue(
  costStatus: OperatorProductionJobCostStatus,
  estimatedCostCents: number,
  actualCostCents: number | null,
  unavailableReasonKey: ActualCostUnavailableReason | undefined,
  locale: string,
  copy: OperatorVideoJobCopy,
): { estimated: string; actual: string; actualSubdued: boolean } {
  const estimated =
    estimatedCostCents > 0
      ? formatCentsForDisplay(estimatedCostCents, locale)
      : "—";

  if (actualCostCents !== null) {
    return {
      estimated,
      actual: formatCentsForDisplay(actualCostCents, locale),
      actualSubdued: false,
    };
  }

  if (costStatus === "pending") {
    return { estimated, actual: copy.costPending, actualSubdued: true };
  }

  if (costStatus === "unavailable" && unavailableReasonKey) {
    return {
      estimated,
      actual: copy.costUnavailable[unavailableReasonKey],
      actualSubdued: true,
    };
  }

  return { estimated, actual: "—", actualSubdued: true };
}

function isInFlightStatus(status: VideoJobStatus): boolean {
  return status === "queued" || status === "processing";
}

function hasPolledCost(
  polled: OperatorVideoJobStatusDto | OperatorVideoJobSummaryDto,
): polled is OperatorVideoJobSummaryDto {
  return "cost" in polled && polled.cost != null;
}

/** Merge Operator GET poll into panel state. Copy `cost` when present so Costo real updates without a full reload. */
export function mergePolledStatus(
  current: OperatorVideoJobSummaryDto,
  polled: OperatorVideoJobStatusDto | OperatorVideoJobSummaryDto,
): OperatorVideoJobSummaryDto {
  return {
    ...current,
    status: polled.status,
    progressPercent: polled.progressPercent ?? current.progressPercent,
    sanitizedErrorMessage:
      polled.sanitizedErrorMessage ?? current.sanitizedErrorMessage,
    jobId: polled.jobId,
    reelScriptId: polled.reelScriptId,
    attempt: polled.attempt,
    regenerationCount: polled.regenerationCount,
    failureReason: polled.failureReason,
    canRetry: polled.canRetry,
    retryBlockedReasonKey: polled.retryBlockedReasonKey ?? null,
    createdAt: polled.createdAt ?? current.createdAt,
    updatedAt: polled.updatedAt,
    cost: hasPolledCost(polled) ? polled.cost : current.cost,
  };
}

export function OperatorVideoJobSummaryPanel({
  initialJob,
  locale,
  copy,
  isBusy,
  onRequestRetry,
  onRequestOverride,
}: OperatorVideoJobSummaryPanelProps) {
  const [job, setJob] = useState<OperatorVideoJobSummaryDto | null>(
    initialJob ?? null,
  );
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    setJob(initialJob ?? null);
  }, [initialJob]);

  useEffect(() => {
    if (!job || !isInFlightStatus(job.status)) {
      setPolling(false);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function pollOnce() {
      if (cancelled || !job) {
        return;
      }

      setPolling(true);

      try {
        const response = await fetch(`/api/video-jobs/${job.jobId}`, {
          method: "GET",
          cache: "no-store",
        });

        if (!response.ok || cancelled) {
          return;
        }

        const polled = (await response.json()) as
          | OperatorVideoJobSummaryDto
          | OperatorVideoJobStatusDto;
        if (cancelled) {
          return;
        }

        setJob((current) =>
          current ? mergePolledStatus(current, polled) : current,
        );
      } catch {
        // Non-authoritative poll — ignore transient errors.
      } finally {
        if (!cancelled) {
          setPolling(false);
        }
      }
    }

    void pollOnce();
    timer = setInterval(() => {
      void pollOnce();
    }, VIDEO_JOB_POLL_INTERVAL_MS_DEFAULT);

    return () => {
      cancelled = true;
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [job?.jobId, job?.status]);

  if (!job) {
    return (
      <section
        style={{
          marginBottom: "1rem",
          padding: "0.85rem 1rem",
          borderRadius: "0.5rem",
          border: "1px solid #e5e7eb",
          background: "#f9fafb",
        }}
        aria-label={copy.title}
      >
        <h3 style={{ margin: "0 0 0.5rem", fontSize: "0.95rem", fontWeight: 600 }}>
          {copy.title}
        </h3>
        <p style={{ margin: 0, fontSize: "0.875rem", color: "#6b7280" }}>
          {copy.empty}
        </p>
      </section>
    );
  }

  const failureText = resolveFailureReasonText(job.failureReason, copy);
  const blockedText = resolveBlockedReasonText(job.retryBlockedReasonKey, copy);
  const costValues = renderJobCostValue(
    job.cost.costStatus,
    job.cost.estimatedCostCents,
    job.cost.actualCostCents,
    job.cost.unavailableReasonKey,
    locale,
    copy,
  );
  const showRetry = job.status === "failed" && job.canRetry;
  const showOverride =
    job.status === "failed" &&
    !job.canRetry &&
    job.retryBlockedReasonKey === "scripts.videoJob.retry.limitExceeded";

  return (
    <section
      style={{
        marginBottom: "1rem",
        padding: "0.85rem 1rem",
        borderRadius: "0.5rem",
        border: "1px solid #e5e7eb",
        background: "#f9fafb",
      }}
      aria-label={copy.title}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.5rem",
          marginBottom: "0.75rem",
        }}
      >
        <h3 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 600 }}>
          {copy.title}
        </h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", alignItems: "center" }}>
          <Tag
            value={copy.status[job.status]}
            severity={videoJobStatusSeverity(job.status)}
            icon={
              job.status === "processing"
                ? "pi pi-spin pi-spinner"
                : job.status === "failed"
                  ? "pi pi-times-circle"
                  : job.status === "completed"
                    ? "pi pi-check"
                    : undefined
            }
          />
          {polling ? (
            <span style={{ fontSize: "0.8125rem", color: "#6b7280" }}>
              {copy.polling}
            </span>
          ) : null}
        </div>
      </div>

      <dl
        style={{
          margin: "0 0 0.75rem",
          display: "grid",
          gap: "0.35rem",
          fontSize: "0.875rem",
        }}
      >
        <div>
          <dt style={{ display: "inline", color: "#6b7280" }}>
            {formatTemplate(copy.attempt, { attempt: job.attempt })}
          </dt>
        </div>
        <div>
          <dt style={{ display: "inline", color: "#6b7280" }}>
            {formatTemplate(copy.regenerationCount, {
              count: job.regenerationCount,
            })}
          </dt>
        </div>
        <div>
          <dt style={{ display: "inline", color: "#6b7280" }}>
            {copy.costEstimated}:{" "}
          </dt>
          <dd style={{ display: "inline", margin: 0, color: "#374151" }}>
            {costValues.estimated}
          </dd>
        </div>
        <div>
          <dt style={{ display: "inline", color: "#6b7280" }}>
            {copy.costActual}:{" "}
          </dt>
          <dd
            style={{
              display: "inline",
              margin: 0,
              color: costValues.actualSubdued ? "#6b7280" : "#374151",
            }}
          >
            {costValues.actual}
          </dd>
        </div>
      </dl>

      {failureText ? (
        <Message
          severity="error"
          style={{ width: "100%", marginBottom: "0.75rem" }}
          content={
            <div style={{ fontSize: "0.875rem" }}>
              <span style={{ fontWeight: 600, marginRight: "0.35rem" }}>
                {copy.failureReasonLabel}
              </span>
              <span>{failureText}</span>
            </div>
          }
        />
      ) : null}

      {blockedText && !showRetry ? (
        <Message
          severity="warn"
          text={blockedText}
          style={{ width: "100%", marginBottom: "0.75rem" }}
        />
      ) : null}

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
        {showRetry ? (
          <Button
            type="button"
            label={copy.retryButton}
            icon="pi pi-refresh"
            size="small"
            disabled={isBusy}
            onClick={() => onRequestRetry(job.jobId)}
          />
        ) : null}
        {showOverride ? (
          <Button
            type="button"
            label={copy.retry.overrideButton}
            icon="pi pi-unlock"
            size="small"
            severity="secondary"
            disabled={isBusy}
            onClick={() => onRequestOverride(job.jobId)}
          />
        ) : null}
      </div>
    </section>
  );
}

export function VideoJobStatusTag({
  status,
  copy,
}: {
  status: VideoJobStatus;
  copy: Pick<OperatorVideoJobCopy, "status">;
}) {
  return (
    <Tag
      value={copy.status[status]}
      severity={videoJobStatusSeverity(status)}
      icon={
        status === "processing"
          ? "pi pi-spin pi-spinner"
          : status === "failed"
            ? "pi pi-times-circle"
            : undefined
      }
    />
  );
}
