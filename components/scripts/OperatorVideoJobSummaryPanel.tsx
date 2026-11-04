"use client";

import { useEffect, useState } from "react";

import { CheckIcon, CircleXIcon, LockOpenIcon, RefreshCwIcon } from "lucide-react";

import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { StatusAlert } from "@/components/ui/status-alert";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";

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
    const timer = setInterval(() => {
      void pollOnce();
    }, VIDEO_JOB_POLL_INTERVAL_MS_DEFAULT);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [job?.jobId, job?.status]);

  if (!job) {
    return (
      <section
        className="mb-4 py-[0.85rem] px-4 rounded-lg border border-edge bg-panel"
        aria-label={copy.title}
      >
        <h3 className="font-display text-fog mt-0 mx-0 mb-2 text-[0.95rem] font-semibold">
          {copy.title}
        </h3>
        <p className="m-0 text-sm text-dim">
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
      className="mb-4 py-[0.85rem] px-4 rounded-lg border border-edge bg-panel"
      aria-label={copy.title}
    >
      <div
        className="flex flex-wrap items-center justify-between gap-2 mb-3"
      >
        <h3 className="font-display text-fog m-0 text-[0.95rem] font-semibold">
          {copy.title}
        </h3>
        <div className="flex flex-wrap gap-[0.35rem] items-center">
          <StatusBadge
            value={copy.status[job.status]}
            severity={videoJobStatusSeverity(job.status)}
            icon={
              job.status === "processing"
                ? <Spinner className="size-3 text-current" />
                : job.status === "failed"
                  ? <CircleXIcon />
                  : job.status === "completed"
                    ? <CheckIcon />
                    : undefined
            }
          />
          {polling ? (
            <span className="text-[0.8125rem] text-dim">
              {copy.polling}
            </span>
          ) : null}
        </div>
      </div>

      <dl
        className="mt-0 mx-0 mb-3 grid gap-[0.35rem] text-sm"
      >
        <div>
          <dt className="inline text-dim">
            {formatTemplate(copy.attempt, { attempt: job.attempt })}
          </dt>
        </div>
        <div>
          <dt className="inline text-dim">
            {formatTemplate(copy.regenerationCount, {
              count: job.regenerationCount,
            })}
          </dt>
        </div>
        <div>
          <dt className="inline text-dim">
            {copy.costEstimated}:{" "}
          </dt>
          <dd className="inline m-0 text-fog">
            {costValues.estimated}
          </dd>
        </div>
        <div>
          <dt className="inline text-dim">
            {copy.costActual}:{" "}
          </dt>
          <dd
            className={cn(
              "m-0 inline",
              costValues.actualSubdued ? "text-dim" : "text-fog",
            )}
          >
            {costValues.actual}
          </dd>
        </div>
      </dl>

      {failureText ? (
        <StatusAlert
          severity="error"
          className="w-full mb-3"
        >
          <div className="text-sm">
              <span className="font-semibold mr-[0.35rem]">
                {copy.failureReasonLabel}
              </span>
              <span>{failureText}</span>
            </div>
        </StatusAlert>
      ) : null}

      {blockedText && !showRetry ? (
        <StatusAlert
          severity="warn"
          text={blockedText}
          className="w-full mb-3"
        />
      ) : null}

      <div className="flex flex-wrap gap-2">
        {showRetry ? (
          <Button
            type="button"
            disabled={isBusy}
            onClick={() => onRequestRetry(job.jobId)}
            size="sm"
          >
            <RefreshCwIcon />
            {copy.retryButton}
          </Button>
        ) : null}
        {showOverride ? (
          <Button
            type="button"
            disabled={isBusy}
            onClick={() => onRequestOverride(job.jobId)}
            variant="secondary"
            size="sm"
          >
            <LockOpenIcon />
            {copy.retry.overrideButton}
          </Button>
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
    <StatusBadge
      value={copy.status[status]}
      severity={videoJobStatusSeverity(status)}
      icon={
        status === "processing"
          ? <Spinner className="size-3 text-current" />
          : status === "failed"
            ? <CircleXIcon />
            : undefined
      }
    />
  );
}
