"use client";

import { useEffect, useState } from "react";
import { Button } from "primereact/button";
import { Message } from "primereact/message";
import { Tag } from "primereact/tag";

import type {
  AssemblyJobErrorCode,
  AssemblyJobStatus,
  AssembleReelForScriptSuccess,
  OperatorAssemblyJobDto,
  OperatorAssemblyJobStatusDto,
} from "@/lib/contracts/assembly-job";
import {
  ASSEMBLY_JOB_POLL_INTERVAL_MS_DEFAULT,
  ASSEMBLY_STALE_FAILURE_MESSAGE_KEY,
} from "@/lib/contracts/assembly-job";
import type { OperatorVideoJobSummaryDto } from "@/lib/contracts/video-job";
import { assembleReelForScript } from "@/lib/assembly/actions/assemble-reel-for-script";

export type OperatorAssemblyCopy = {
  title: string;
  empty: string;
  status: Record<AssemblyJobStatus, string>;
  failureReasonLabel: string;
  durationTarget: string;
  durationActual: string;
  preview: string;
  previewLoading: string;
  previewError: string;
  polling: string;
  actions: {
    assemble: string;
    reassemble: string;
    assembling: string;
  };
  toastAssembleSuccess: string;
  failure: {
    staleTimeout: string;
  };
  errors: {
    unauthenticated: string;
    forbidden: string;
    notFound: string;
    validation: string;
    forbiddenFields: string;
    inputsIncomplete: string;
    facelessNoPrimary: string;
    missingAudio: string;
    internal: string;
  };
};

type OperatorAssemblyPanelProps = {
  reelScriptId: string;
  initialJob: OperatorAssemblyJobDto | null | undefined;
  primaryVideoJob: OperatorVideoJobSummaryDto | null | undefined;
  copy: OperatorAssemblyCopy;
  disabled: boolean;
  onRequestReassemble: (reelScriptId: string) => void;
  onAssembleSuccess: (result: AssembleReelForScriptSuccess) => void;
  onError: (message: string) => void;
  onToastSuccess: (summary: string) => void;
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

function assemblyStatusSeverity(
  status: AssemblyJobStatus,
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
    default:
      return "secondary";
  }
}

function isInFlightStatus(status: AssemblyJobStatus): boolean {
  return status === "queued" || status === "processing";
}

function resolveFailureReasonText(
  failureReason: string | null,
  copy: OperatorAssemblyCopy,
): string | null {
  if (!failureReason) {
    return null;
  }

  if (
    failureReason === ASSEMBLY_STALE_FAILURE_MESSAGE_KEY ||
    failureReason === "scripts.assembly.failure.staleTimeout"
  ) {
    return copy.failure.staleTimeout;
  }

  return failureReason;
}

function messageForAssemblyError(
  code: AssemblyJobErrorCode,
  messageKey: string | undefined,
  copy: OperatorAssemblyCopy,
): string {
  if (messageKey === "scripts.assembly.errors.facelessNoPrimary") {
    return copy.errors.facelessNoPrimary;
  }
  if (messageKey === "scripts.assembly.errors.missingAudio") {
    return copy.errors.missingAudio;
  }
  if (messageKey === "scripts.assembly.errors.inputsIncomplete") {
    return copy.errors.inputsIncomplete;
  }

  switch (code) {
    case "UNAUTHENTICATED":
      return copy.errors.unauthenticated;
    case "FORBIDDEN":
      return copy.errors.forbidden;
    case "NOT_FOUND":
      return copy.errors.notFound;
    case "VALIDATION_ERROR":
      return copy.errors.validation;
    case "FORBIDDEN_FIELDS":
      return copy.errors.forbiddenFields;
    case "ASSEMBLY_INPUTS_INCOMPLETE":
      return copy.errors.inputsIncomplete;
    default:
      return copy.errors.internal;
  }
}

function mergePolledStatus(
  current: OperatorAssemblyJobDto,
  polled: OperatorAssemblyJobStatusDto,
): OperatorAssemblyJobDto {
  return {
    ...current,
    status: polled.status,
    actualDurationSec: polled.actualDurationSec,
    outputMediaAssetId: polled.outputMediaAssetId,
    failureReason: polled.failureReason,
    canReassemble: polled.canReassemble,
    updatedAt: polled.updatedAt,
  };
}

function primaryVideoCompleted(
  videoJob: OperatorVideoJobSummaryDto | null | undefined,
): boolean {
  return videoJob?.status === "completed";
}

/**
 * Operator assembly panel (US-9.1).
 * Calls assembleReelForScript({ reelScriptId }) only.
 */
export function OperatorAssemblyPanel({
  reelScriptId,
  initialJob,
  primaryVideoJob,
  copy,
  disabled,
  onRequestReassemble,
  onAssembleSuccess,
  onError,
  onToastSuccess,
}: OperatorAssemblyPanelProps) {
  const [job, setJob] = useState<OperatorAssemblyJobDto | null>(initialJob ?? null);
  const [pending, setPending] = useState(false);
  const [polling, setPolling] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState(false);

  useEffect(() => {
    setJob(initialJob ?? null);
    setPreviewError(false);
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
        const response = await fetch(`/api/assembly-jobs/${job.jobId}`, {
          method: "GET",
          cache: "no-store",
        });

        if (!response.ok || cancelled) {
          return;
        }

        const polled = (await response.json()) as OperatorAssemblyJobStatusDto;
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
    }, ASSEMBLY_JOB_POLL_INTERVAL_MS_DEFAULT);

    return () => {
      cancelled = true;
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [job?.jobId, job?.status]);

  const hasPrimaryVideo = primaryVideoCompleted(primaryVideoJob);
  const inFlight = job !== null && isInFlightStatus(job.status);
  const canAssembleInitial =
    job === null && hasPrimaryVideo && !inFlight && !pending;
  const canAssembleFromDto = job?.canAssemble === true && !pending && !inFlight;
  const showAssemble = canAssembleInitial || canAssembleFromDto;
  const showReassemble =
    job?.canReassemble === true && !pending && !inFlight;

  async function handleAssemble() {
    if (pending || disabled || !showAssemble) {
      return;
    }

    setPending(true);
    setBanner(null);

    try {
      const result = await assembleReelForScript({ reelScriptId });

      if (result.ok) {
        onAssembleSuccess(result);
        onToastSuccess(copy.toastAssembleSuccess);
        return;
      }

      const message = messageForAssemblyError(
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

  const failureText = job ? resolveFailureReasonText(job.failureReason, copy) : null;
  const previewAssetId =
    job?.status === "completed" ? job.outputMediaAssetId : null;

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
        {job ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", alignItems: "center" }}>
            <Tag
              value={copy.status[job.status]}
              severity={assemblyStatusSeverity(job.status)}
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
        ) : null}
      </div>

      {!job ? (
        <p style={{ margin: "0 0 0.75rem", fontSize: "0.875rem", color: "#6b7280" }}>
          {copy.empty}
        </p>
      ) : null}

      {banner ? (
        <Message severity="error" text={banner} style={{ width: "100%", marginBottom: "0.75rem" }} />
      ) : null}

      {job ? (
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
              {formatTemplate(copy.durationTarget, {
                seconds: job.targetDurationSec,
              })}
            </dt>
          </div>
          {job.actualDurationSec !== null ? (
            <div>
              <dt style={{ display: "inline", color: "#6b7280" }}>
                {formatTemplate(copy.durationActual, {
                  seconds: job.actualDurationSec,
                })}
              </dt>
            </div>
          ) : null}
        </dl>
      ) : null}

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

      {previewAssetId ? (
        <div style={{ marginBottom: "0.75rem" }}>
          <p style={{ margin: "0 0 0.35rem", fontSize: "0.875rem", fontWeight: 600, color: "#374151" }}>
            {copy.preview}
          </p>
          {previewError ? (
            <Message severity="warn" text={copy.previewError} style={{ width: "100%" }} />
          ) : (
            <video
              controls
              preload="metadata"
              src={`/api/media/assets/${previewAssetId}`}
              style={{
                width: "100%",
                maxWidth: "270px",
                aspectRatio: "9 / 16",
                background: "#111827",
                borderRadius: "0.375rem",
              }}
              onError={() => setPreviewError(true)}
            />
          )}
        </div>
      ) : null}

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
        {showAssemble ? (
          <Button
            type="button"
            label={pending ? copy.actions.assembling : copy.actions.assemble}
            icon="pi pi-video"
            size="small"
            loading={pending}
            disabled={disabled || pending || !hasPrimaryVideo}
            onClick={() => void handleAssemble()}
          />
        ) : null}
        {showReassemble ? (
          <Button
            type="button"
            label={copy.actions.reassemble}
            icon="pi pi-refresh"
            size="small"
            severity="secondary"
            outlined
            disabled={disabled || pending}
            onClick={() => onRequestReassemble(reelScriptId)}
          />
        ) : null}
      </div>
    </section>
  );
}

export function AssemblyStatusTag({
  status,
  copy,
}: {
  status: AssemblyJobStatus;
  copy: Pick<OperatorAssemblyCopy, "status">;
}) {
  return (
    <Tag
      value={copy.status[status]}
      severity={assemblyStatusSeverity(status)}
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
