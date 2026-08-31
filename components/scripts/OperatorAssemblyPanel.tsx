"use client";

import { useEffect, useState } from "react";
import { Button } from "primereact/button";
import { Checkbox } from "primereact/checkbox";
import { InputNumber } from "primereact/inputnumber";
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
import type {
  ApplyBrandingForAssemblySuccess,
  BrandingJobErrorCode,
  BrandingJobStatus,
} from "@/lib/contracts/branding-job";
import { applyBrandingForAssembly } from "@/lib/assembly/actions/apply-branding-for-assembly";
import { assembleReelForScript } from "@/lib/assembly/actions/assemble-reel-for-script";
import type { OperatorVideoJobSummaryDto } from "@/lib/contracts/video-job";

export type OperatorBrandingCopy = {
  title: string;
  status: Record<Exclude<BrandingJobStatus, never>, string> & {
    pending: string;
  };
  failureReasonLabel: string;
  previewPending: string;
  previewProcessing: string;
  preview: string;
  previewError: string;
  toggles: {
    subtitles: string;
    logo: string;
  };
  coverFrame: {
    label: string;
    help: string;
    invalid: string;
  };
  actions: {
    apply: string;
    rebrand: string;
    applying: string;
  };
  downloadCover: string;
  toastApplySuccess: string;
  failure: {
    staleTimeout: string;
    subtitleSanitize: string;
  };
  errors: {
    unauthenticated: string;
    forbidden: string;
    notFound: string;
    validation: string;
    forbiddenFields: string;
    baseIncomplete: string;
    internal: string;
  };
};

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
    fingerprintMismatch: string;
  };
  errors: {
    unauthenticated: string;
    forbidden: string;
    notFound: string;
    validation: string;
    forbiddenFields: string;
    inputsIncomplete: string;
    facelessNoPrimary: string;
    facelessWaitingForClips: string;
    facelessMissingVoiceover: string;
    missingAudio: string;
    internal: string;
  };
  branding: OperatorBrandingCopy;
};

type OperatorAssemblyPanelProps = {
  reelScriptId: string;
  initialJob: OperatorAssemblyJobDto | null | undefined;
  primaryVideoJob: OperatorVideoJobSummaryDto | null | undefined;
  copy: OperatorAssemblyCopy;
  disabled: boolean;
  onRequestReassemble: (reelScriptId: string) => void;
  onRequestRebrand: (
    assemblyJobId: string,
    subtitlesEnabled: boolean,
    logoEnabled: boolean,
    coverFrameSec: number,
  ) => void;
  onAssembleSuccess: (result: AssembleReelForScriptSuccess) => void;
  onBrandingSuccess: (result: ApplyBrandingForAssemblySuccess) => void;
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

function brandingStatusSeverity(
  status: BrandingJobStatus,
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
    case "skipped":
      return "warning";
    default:
      return "secondary";
  }
}

function isAssemblyInFlight(status: AssemblyJobStatus | null): boolean {
  return status === "queued" || status === "processing";
}

function isPersistedAssemblyJob(
  job: OperatorAssemblyJobDto | null,
): job is OperatorAssemblyJobDto & {
  jobId: string;
  status: AssemblyJobStatus;
} {
  return job !== null && job.jobId !== null && job.status !== null;
}

function isBrandingInFlight(status: BrandingJobStatus | null): boolean {
  return status === "queued" || status === "processing";
}

function defaultBrandingToggles(
  job: OperatorAssemblyJobDto | null,
): { subtitlesEnabled: boolean; logoEnabled: boolean } {
  const config = job?.brandingConfig;
  return {
    subtitlesEnabled: config?.subtitlesEnabled ?? true,
    logoEnabled: config?.logoEnabled ?? true,
  };
}

const DEFAULT_COVER_FRAME_SEC = 1.0;

function defaultCoverFrameSec(job: OperatorAssemblyJobDto | null): number {
  const sec = job?.brandingConfig?.coverFrameSec;
  return typeof sec === "number" && Number.isFinite(sec) ? sec : DEFAULT_COVER_FRAME_SEC;
}

/** Prefer always pass current InputNumber value when in range (CONTRACT Phase B). */
function resolveCoverFrameSecForApply(value: number | null): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return DEFAULT_COVER_FRAME_SEC;
}

function hasCoverFrameInvalidField(
  fields: Record<string, string[]> | undefined,
): boolean {
  return (
    fields?.coverFrameSec?.some(
      (message) =>
        message === "scripts.branding.coverFrame.invalid" ||
        message.includes("coverFrame"),
    ) === true
  );
}

function resolveAssemblyFailureReasonText(
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

  if (
    failureReason === "scripts.assembly.failure.fingerprintMismatch" ||
    failureReason.includes("fingerprintMismatch")
  ) {
    return copy.failure.fingerprintMismatch;
  }

  return failureReason;
}

function resolveBrandingFailureReasonText(
  failureReason: string | null,
  copy: OperatorBrandingCopy,
): string | null {
  if (!failureReason) {
    return null;
  }

  if (
    failureReason === "scripts.branding.failure.staleTimeout" ||
    failureReason.includes("branding.failure.staleTimeout")
  ) {
    return copy.failure.staleTimeout;
  }

  if (
    failureReason === "scripts.branding.failure.subtitleSanitize" ||
    failureReason.includes("subtitleSanitize")
  ) {
    return copy.failure.subtitleSanitize;
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
  if (messageKey === "scripts.assembly.errors.facelessWaitingForClips") {
    return copy.errors.facelessWaitingForClips;
  }
  if (messageKey === "scripts.assembly.errors.facelessMissingVoiceover") {
    return copy.errors.facelessMissingVoiceover;
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

function messageForBrandingError(
  code: BrandingJobErrorCode,
  messageKey: string | undefined,
  copy: OperatorBrandingCopy,
  fields?: Record<string, string[]>,
): string {
  if (messageKey === "scripts.branding.failure.subtitleSanitize") {
    return copy.failure.subtitleSanitize;
  }

  if (code === "VALIDATION_ERROR" && hasCoverFrameInvalidField(fields)) {
    return copy.coverFrame.invalid;
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
    case "BRANDING_BASE_INCOMPLETE":
      return copy.errors.baseIncomplete;
    case "SUBTITLE_SANITIZE_FAILED":
      return copy.failure.subtitleSanitize;
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
    brandingStatus: polled.brandingStatus,
    brandingConfig: polled.brandingConfig,
    coverMediaAssetId: polled.coverMediaAssetId,
    preBrandingOutputMediaAssetId: polled.preBrandingOutputMediaAssetId,
    brandingFailureReason: polled.brandingFailureReason,
    canApplyBranding: polled.canApplyBranding,
    canRebrand: polled.canRebrand,
    // Poll DTO omits canAssemble — preserve batch/server readiness.
    canAssemble: current.canAssemble,
    canReassemble: polled.canReassemble,
    updatedAt: polled.updatedAt,
  };
}

function mergeBrandingSuccess(
  current: OperatorAssemblyJobDto,
  result: ApplyBrandingForAssemblySuccess,
): OperatorAssemblyJobDto {
  return {
    ...current,
    brandingStatus: result.brandingStatus,
    outputMediaAssetId:
      result.outputMediaAssetId ?? current.outputMediaAssetId,
    coverMediaAssetId:
      result.coverMediaAssetId ?? current.coverMediaAssetId,
    canApplyBranding: result.brandingStatus !== "queued" && result.brandingStatus !== "processing",
    canRebrand:
      result.brandingStatus === "completed" || result.brandingStatus === "failed",
    updatedAt: new Date().toISOString(),
  };
}

function showBrandingPendingBanner(job: OperatorAssemblyJobDto): boolean {
  return (
    job.status === "completed" &&
    (job.brandingStatus === null || job.brandingStatus === "queued") &&
    job.outputMediaAssetId !== null
  );
}

/** True when map entry is a null-job readiness companion (no row yet). */
function isReadinessCompanion(job: OperatorAssemblyJobDto | null): boolean {
  return job !== null && job.jobId === null;
}

function primaryVideoCompleted(
  videoJob: OperatorVideoJobSummaryDto | null | undefined,
): boolean {
  return videoJob?.status === "completed";
}

/**
 * Operator assembly + branding panel (US-9.1 + US-9.2).
 */
export function OperatorAssemblyPanel({
  reelScriptId,
  initialJob,
  primaryVideoJob,
  copy,
  disabled,
  onRequestReassemble,
  onRequestRebrand,
  onAssembleSuccess,
  onBrandingSuccess,
  onError,
  onToastSuccess,
}: OperatorAssemblyPanelProps) {
  const brandingCopy = copy.branding;
  const [job, setJob] = useState<OperatorAssemblyJobDto | null>(initialJob ?? null);
  const [pending, setPending] = useState(false);
  const [brandingPending, setBrandingPending] = useState(false);
  const [polling, setPolling] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(() =>
    defaultBrandingToggles(initialJob ?? null).subtitlesEnabled,
  );
  const [logoEnabled, setLogoEnabled] = useState(() =>
    defaultBrandingToggles(initialJob ?? null).logoEnabled,
  );
  const [coverFrameSec, setCoverFrameSec] = useState<number | null>(() =>
    defaultCoverFrameSec(initialJob ?? null),
  );

  useEffect(() => {
    setJob(initialJob ?? null);
    setPreviewError(false);
    const toggles = defaultBrandingToggles(initialJob ?? null);
    setSubtitlesEnabled(toggles.subtitlesEnabled);
    setLogoEnabled(toggles.logoEnabled);
    setCoverFrameSec(defaultCoverFrameSec(initialJob ?? null));
  }, [initialJob]);

  const shouldPoll =
    isPersistedAssemblyJob(job) &&
    (isAssemblyInFlight(job.status) || isBrandingInFlight(job.brandingStatus));

  useEffect(() => {
    if (!isPersistedAssemblyJob(job) || !shouldPoll) {
      setPolling(false);
      return;
    }

    const jobId = job.jobId;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function pollOnce() {
      if (cancelled) {
        return;
      }

      setPolling(true);

      try {
        const response = await fetch(`/api/assembly-jobs/${jobId}`, {
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
  }, [job?.jobId, job?.status, job?.brandingStatus, shouldPoll]);

  const hasPrimaryVideo = primaryVideoCompleted(primaryVideoJob);
  const assemblyInFlight = job !== null && isAssemblyInFlight(job.status);
  const brandingInFlight =
    job !== null && isBrandingInFlight(job.brandingStatus);
  // Server-authoritative readiness (faceless stitch or primary/degrade).
  // Never invent faceless broll readiness from client video-job maps.
  const canAssembleFromServer =
    job?.canAssemble === true && !pending && !assemblyInFlight;
  // Legacy: map entry still null (no companion) — primary-only convenience.
  // Do not use for faceless stitch when companion says canAssemble.
  const canAssembleNoJobPrimaryFallback =
    job === null && hasPrimaryVideo && !assemblyInFlight && !pending;
  const showAssemble = canAssembleFromServer || canAssembleNoJobPrimaryFallback;
  const showReassemble =
    job?.canReassemble === true && !pending && !assemblyInFlight;
  const showApplyBranding =
    job?.canApplyBranding === true && !brandingPending && !brandingInFlight;
  const showRebrand =
    job?.canRebrand === true && !brandingPending && !brandingInFlight;
  const panelBusy = disabled || pending || brandingPending;

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

  async function handleApplyBranding() {
    if (!isPersistedAssemblyJob(job) || brandingPending || !showApplyBranding) {
      return;
    }

    setBrandingPending(true);
    setBanner(null);

    try {
      const result = await applyBrandingForAssembly({
        assemblyJobId: job.jobId,
        subtitlesEnabled,
        logoEnabled,
        coverFrameSec: resolveCoverFrameSecForApply(coverFrameSec),
      });

      if (result.ok) {
        setJob((current) =>
          current ? mergeBrandingSuccess(current, result) : current,
        );
        onBrandingSuccess(result);
        onToastSuccess(brandingCopy.toastApplySuccess);
        return;
      }

      const message = messageForBrandingError(
        result.error.code,
        result.error.messageKey,
        brandingCopy,
        result.error.fields,
      );
      setBanner(message);
      onError(message);
    } catch {
      const message = brandingCopy.errors.internal;
      setBanner(message);
      onError(message);
    } finally {
      setBrandingPending(false);
    }
  }

  const assemblyFailureText = job
    ? resolveAssemblyFailureReasonText(job.failureReason, copy)
    : null;
  const brandingFailureText = job
    ? resolveBrandingFailureReasonText(job.brandingFailureReason, brandingCopy)
    : null;

  const previewAssetId =
    job?.status === "completed" ? job.outputMediaAssetId : null;
  const showPendingBanner = job ? showBrandingPendingBanner(job) : false;
  const showProcessingBadge =
    job?.brandingStatus === "processing" && previewAssetId !== null;

  const brandingStatusLabel =
    job?.brandingStatus != null
      ? brandingCopy.status[job.brandingStatus]
      : brandingCopy.status.pending;

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
        {isPersistedAssemblyJob(job) ? (
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

      {!job || isReadinessCompanion(job) ? (
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

      {assemblyFailureText ? (
        <Message
          severity="error"
          style={{ width: "100%", marginBottom: "0.75rem" }}
          content={
            <div style={{ fontSize: "0.875rem" }}>
              <span style={{ fontWeight: 600, marginRight: "0.35rem" }}>
                {copy.failureReasonLabel}
              </span>
              <span>{assemblyFailureText}</span>
            </div>
          }
        />
      ) : null}

      {previewAssetId ? (
        <div style={{ marginBottom: "0.75rem" }}>
          <p style={{ margin: "0 0 0.35rem", fontSize: "0.875rem", fontWeight: 600, color: "#374151" }}>
            {brandingCopy.preview}
          </p>
          {showPendingBanner ? (
            <Message
              severity="info"
              text={brandingCopy.previewPending}
              style={{ width: "100%", marginBottom: "0.5rem" }}
            />
          ) : null}
          {showProcessingBadge ? (
            <Message
              severity="info"
              text={brandingCopy.previewProcessing}
              style={{ width: "100%", marginBottom: "0.5rem" }}
            />
          ) : null}
          {previewError ? (
            <Message severity="warn" text={brandingCopy.previewError} style={{ width: "100%" }} />
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
            disabled={panelBusy}
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
            disabled={panelBusy}
            onClick={() => onRequestReassemble(reelScriptId)}
          />
        ) : null}
      </div>

      {job !== null && isPersistedAssemblyJob(job) && job.status === "completed" ? (
        <section
          style={{
            marginTop: "1rem",
            paddingTop: "0.85rem",
            borderTop: "1px solid #e5e7eb",
          }}
          aria-label={brandingCopy.title}
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
            <h4 style={{ margin: 0, fontSize: "0.9rem", fontWeight: 600 }}>
              {brandingCopy.title}
            </h4>
            <Tag
              value={brandingStatusLabel}
              severity={
                job.brandingStatus != null
                  ? brandingStatusSeverity(job.brandingStatus)
                  : "secondary"
              }
              icon={
                job.brandingStatus === "processing"
                  ? "pi pi-spin pi-spinner"
                  : job.brandingStatus === "failed"
                    ? "pi pi-times-circle"
                    : job.brandingStatus === "completed"
                      ? "pi pi-check"
                      : undefined
              }
            />
          </div>

          {brandingFailureText ? (
            <Message
              severity="error"
              style={{ width: "100%", marginBottom: "0.75rem" }}
              content={
                <div style={{ fontSize: "0.875rem" }}>
                  <span style={{ fontWeight: 600, marginRight: "0.35rem" }}>
                    {brandingCopy.failureReasonLabel}
                  </span>
                  <span>{brandingFailureText}</span>
                </div>
              }
            />
          ) : null}

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.65rem",
              marginBottom: "0.75rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Checkbox
                inputId={`branding-subtitles-${job.jobId}`}
                checked={subtitlesEnabled}
                disabled={panelBusy || brandingInFlight}
                onChange={(event) => setSubtitlesEnabled(event.checked === true)}
              />
              <label htmlFor={`branding-subtitles-${job.jobId}`} style={{ fontSize: "0.875rem" }}>
                {brandingCopy.toggles.subtitles}
              </label>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Checkbox
                inputId={`branding-logo-${job.jobId}`}
                checked={logoEnabled}
                disabled={panelBusy || brandingInFlight}
                onChange={(event) => setLogoEnabled(event.checked === true)}
              />
              <label htmlFor={`branding-logo-${job.jobId}`} style={{ fontSize: "0.875rem" }}>
                {brandingCopy.toggles.logo}
              </label>
            </div>
            <div>
              <label
                htmlFor={`branding-cover-frame-${job.jobId}`}
                style={{ display: "block", fontSize: "0.875rem", marginBottom: "0.35rem" }}
              >
                {brandingCopy.coverFrame.label}
              </label>
              <InputNumber
                inputId={`branding-cover-frame-${job.jobId}`}
                value={coverFrameSec}
                onValueChange={(event) => setCoverFrameSec(event.value ?? null)}
                min={0}
                max={45}
                step={0.1}
                minFractionDigits={0}
                maxFractionDigits={1}
                disabled={panelBusy || brandingInFlight}
                style={{ width: "8rem" }}
              />
              <p style={{ margin: "0.35rem 0 0", fontSize: "0.8125rem", color: "#6b7280" }}>
                {brandingCopy.coverFrame.help}
              </p>
            </div>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
            {showApplyBranding ? (
              <Button
                type="button"
                label={
                  brandingPending
                    ? brandingCopy.actions.applying
                    : brandingCopy.actions.apply
                }
                icon="pi pi-palette"
                size="small"
                loading={brandingPending}
                disabled={panelBusy}
                onClick={() => void handleApplyBranding()}
              />
            ) : null}
            {showRebrand ? (
              <Button
                type="button"
                label={brandingCopy.actions.rebrand}
                icon="pi pi-refresh"
                size="small"
                severity="secondary"
                outlined
                disabled={panelBusy}
                onClick={() =>
                  onRequestRebrand(
                    job.jobId,
                    subtitlesEnabled,
                    logoEnabled,
                    resolveCoverFrameSecForApply(coverFrameSec),
                  )
                }
              />
            ) : null}
            {job.coverMediaAssetId ? (
              <a
                href={`/api/media/assets/${job.coverMediaAssetId}`}
                download
                style={{ textDecoration: "none" }}
              >
                <Button
                  type="button"
                  label={brandingCopy.downloadCover}
                  icon="pi pi-download"
                  size="small"
                  severity="help"
                  outlined
                  disabled={panelBusy}
                />
              </a>
            ) : null}
          </div>
        </section>
      ) : null}
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
