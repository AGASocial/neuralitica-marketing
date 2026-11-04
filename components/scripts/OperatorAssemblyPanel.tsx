"use client";

import { useEffect, useState } from "react";

import { CheckIcon, CircleXIcon, DownloadIcon, PaletteIcon, RefreshCwIcon, VideoIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { StatusAlert } from "@/components/ui/status-alert";
import { StatusBadge } from "@/components/ui/status-badge";

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
    const timer = setInterval(() => {
      void pollOnce();
    }, ASSEMBLY_JOB_POLL_INTERVAL_MS_DEFAULT);

    return () => {
      cancelled = true;
      clearInterval(timer);
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
      className="mb-4 py-[0.85rem] px-4 rounded-lg border border-edge bg-panel"
      aria-label={copy.title}
    >
      <div
        className="flex flex-wrap items-center justify-between gap-2 mb-3"
      >
        <h3 className="font-display text-fog m-0 text-[0.95rem] font-semibold">
          {copy.title}
        </h3>
        {isPersistedAssemblyJob(job) ? (
          <div className="flex flex-wrap gap-[0.35rem] items-center">
            <StatusBadge
              value={copy.status[job.status]}
              severity={assemblyStatusSeverity(job.status)}
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
        ) : null}
      </div>

      {!job || isReadinessCompanion(job) ? (
        <p className="mt-0 mx-0 mb-3 text-sm text-dim">
          {copy.empty}
        </p>
      ) : null}

      {banner ? (
        <StatusAlert severity="error" text={banner} className="w-full mb-3" />
      ) : null}

      {job ? (
        <dl
          className="mt-0 mx-0 mb-3 grid gap-[0.35rem] text-sm"
        >
          <div>
            <dt className="inline text-dim">
              {formatTemplate(copy.durationTarget, {
                seconds: job.targetDurationSec,
              })}
            </dt>
          </div>
          {job.actualDurationSec !== null ? (
            <div>
              <dt className="inline text-dim">
                {formatTemplate(copy.durationActual, {
                  seconds: job.actualDurationSec,
                })}
              </dt>
            </div>
          ) : null}
        </dl>
      ) : null}

      {assemblyFailureText ? (
        <StatusAlert
          severity="error"
          className="w-full mb-3"
        >
          <div className="text-sm">
              <span className="font-semibold mr-[0.35rem]">
                {copy.failureReasonLabel}
              </span>
              <span>{assemblyFailureText}</span>
            </div>
        </StatusAlert>
      ) : null}

      {previewAssetId ? (
        <div className="mb-3">
          <p className="mt-0 mx-0 mb-[0.35rem] text-sm font-semibold text-fog">
            {brandingCopy.preview}
          </p>
          {showPendingBanner ? (
            <StatusAlert
              severity="info"
              text={brandingCopy.previewPending}
              className="w-full mb-2"
            />
          ) : null}
          {showProcessingBadge ? (
            <StatusAlert
              severity="info"
              text={brandingCopy.previewProcessing}
              className="w-full mb-2"
            />
          ) : null}
          {previewError ? (
            <StatusAlert severity="warn" text={brandingCopy.previewError} className="w-full" />
          ) : (
            <video
              controls
              preload="metadata"
              src={`/api/media/assets/${previewAssetId}`}
              className="w-full max-w-[270px] aspect-[9/16] bg-deep rounded-md"
              onError={() => setPreviewError(true)}
            />
          )}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {showAssemble ? (
          <Button
            type="button"
            onClick={() => void handleAssemble()}
            size="sm"
            disabled={(panelBusy) || (pending)}
          >
            {pending ? <Spinner className="size-4 text-current" /> : <VideoIcon />}
            {pending ? copy.actions.assembling : copy.actions.assemble}
          </Button>
        ) : null}
        {showReassemble ? (
          <Button
            type="button"
            disabled={panelBusy}
            onClick={() => onRequestReassemble(reelScriptId)}
            variant="outline"
            size="sm"
          >
            <RefreshCwIcon />
            {copy.actions.reassemble}
          </Button>
        ) : null}
      </div>

      {job !== null && isPersistedAssemblyJob(job) && job.status === "completed" ? (
        <section
          className="mt-4 pt-[0.85rem] border-t border-edge"
          aria-label={brandingCopy.title}
        >
          <div
            className="flex flex-wrap items-center justify-between gap-2 mb-3"
          >
            <h4 className="font-display text-fog m-0 text-[0.9rem] font-semibold">
              {brandingCopy.title}
            </h4>
            <StatusBadge
              value={brandingStatusLabel}
              severity={
                job.brandingStatus != null
                  ? brandingStatusSeverity(job.brandingStatus)
                  : "secondary"
              }
              icon={
                job.brandingStatus === "processing"
                  ? <Spinner className="size-3 text-current" />
                  : job.brandingStatus === "failed"
                    ? <CircleXIcon />
                    : job.brandingStatus === "completed"
                      ? <CheckIcon />
                      : undefined
              }
            />
          </div>

          {brandingFailureText ? (
            <StatusAlert
              severity="error"
              className="w-full mb-3"
            >
              <div className="text-sm">
                  <span className="font-semibold mr-[0.35rem]">
                    {brandingCopy.failureReasonLabel}
                  </span>
                  <span>{brandingFailureText}</span>
                </div>
            </StatusAlert>
          ) : null}

          <div
            className="flex flex-col gap-[0.65rem] mb-3"
          >
            <div className="flex items-center gap-2">
              <Checkbox
                id={`branding-subtitles-${job.jobId}`}
                checked={subtitlesEnabled}
                disabled={panelBusy || brandingInFlight}
                onCheckedChange={(checked) => setSubtitlesEnabled(checked === true)}
              />
              <Label htmlFor={`branding-subtitles-${job.jobId}`} className="text-sm">
                {brandingCopy.toggles.subtitles}
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id={`branding-logo-${job.jobId}`}
                checked={logoEnabled}
                disabled={panelBusy || brandingInFlight}
                onCheckedChange={(checked) => setLogoEnabled(checked === true)}
              />
              <Label htmlFor={`branding-logo-${job.jobId}`} className="text-sm">
                {brandingCopy.toggles.logo}
              </Label>
            </div>
            <div>
              <Label
                htmlFor={`branding-cover-frame-${job.jobId}`}
                className="mb-[0.35rem] block text-sm"
              >
                {brandingCopy.coverFrame.label}
              </Label>
              <Input
                id={`branding-cover-frame-${job.jobId}`}
                type="number"
                inputMode="decimal"
                value={coverFrameSec ?? ""}
                onChange={(event) => {
                  const raw = event.target.value;
                  if (raw === "") {
                    setCoverFrameSec(null);
                    return;
                  }
                  const parsed = Number(raw);
                  if (Number.isNaN(parsed)) {
                    return;
                  }
                  setCoverFrameSec(
                    Math.min(45, Math.max(0, Math.round(parsed * 10) / 10)),
                  );
                }}
                min={0}
                max={45}
                step={0.1}
                disabled={panelBusy || brandingInFlight}
                className="w-[8rem]"
              />
              <p className="mt-[0.35rem] mx-0 mb-0 text-[0.8125rem] text-dim">
                {brandingCopy.coverFrame.help}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            {showApplyBranding ? (
              <Button
                type="button"
                onClick={() => void handleApplyBranding()}
                size="sm"
                disabled={(panelBusy) || (brandingPending)}
              >
                {brandingPending ? <Spinner className="size-4 text-current" /> : <PaletteIcon />}
                {
                                  brandingPending
                                    ? brandingCopy.actions.applying
                                    : brandingCopy.actions.apply
                                }
              </Button>
            ) : null}
            {showRebrand ? (
              <Button
                type="button"
                disabled={panelBusy}
                onClick={() =>
                onRequestRebrand(
                job.jobId,
                subtitlesEnabled,
                logoEnabled,
                resolveCoverFrameSecForApply(coverFrameSec),
                )
                }
                variant="outline"
                size="sm"
              >
                <RefreshCwIcon />
                {brandingCopy.actions.rebrand}
              </Button>
            ) : null}
            {job.coverMediaAssetId ? (
              <a
                href={`/api/media/assets/${job.coverMediaAssetId}`}
                download
                className="no-underline"
              >
                <Button
                  type="button"
                  disabled={panelBusy}
                  variant="outline"
                  size="sm"
                >
                  <DownloadIcon />
                  {brandingCopy.downloadCover}
                </Button>
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
    <StatusBadge
      value={copy.status[status]}
      severity={assemblyStatusSeverity(status)}
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
