"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { Message } from "primereact/message";

import type { OperatorVideoJobSummaryDto } from "@/lib/contracts/video-job";
import type { UploadManualVideoJobErrorCode } from "@/lib/contracts/manual-video-upload";
import {
  MANUAL_UPLOAD_HINT_MAX_DURATION_SEC,
  MANUAL_UPLOAD_HINT_MAX_VIDEO_MIB,
} from "@/lib/contracts/manual-video-upload";
import { uploadManualVideoJob } from "@/lib/video-jobs/actions/upload-manual-video-job";

export type ManualVideoUploadCopy = {
  button: string;
  title: string;
  hint: string;
  submit: string;
  cancel: string;
  success: string;
  errors: {
    unauthenticated: string;
    forbidden: string;
    notFound: string;
    validation: string;
    forbiddenFields: string;
    missingFile: string;
    invalidFileType: string;
    fileTooLarge: string;
    durationExceeded: string;
    consentRevoked: string;
    slotJobInFlight: string;
    slotCompletedJobExists: string;
    internal: string;
  };
};

type ManualVideoUploadDialogProps = {
  reelScriptId: string;
  clientId: string;
  parentJobId?: string | null;
  visible: boolean;
  copy: ManualVideoUploadCopy;
  disabled: boolean;
  onHide: () => void;
  onSuccess: (job: OperatorVideoJobSummaryDto) => void;
};

function messageForUploadError(
  code: UploadManualVideoJobErrorCode,
  copy: ManualVideoUploadCopy,
): string {
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
    case "MISSING_FILE":
      return copy.errors.missingFile;
    case "INVALID_FILE_TYPE":
      return copy.errors.invalidFileType;
    case "FILE_TOO_LARGE":
      return copy.errors.fileTooLarge;
    case "VIDEO_TOO_LONG":
      return copy.errors.durationExceeded;
    case "CONSENT_REVOKED":
      return copy.errors.consentRevoked;
    case "SLOT_JOB_IN_FLIGHT":
      return copy.errors.slotJobInFlight;
    case "SLOT_COMPLETED_JOB_EXISTS":
      return copy.errors.slotCompletedJobExists;
    default:
      return copy.errors.internal;
  }
}

function formatUploadErrorMessage(
  code: UploadManualVideoJobErrorCode,
  copy: ManualVideoUploadCopy,
): string {
  const message = messageForUploadError(code, copy);
  if (code === "FILE_TOO_LARGE" || code === "VIDEO_TOO_LONG") {
    return message
      .replace("{videoMax}", String(MANUAL_UPLOAD_HINT_MAX_VIDEO_MIB))
      .replace("{durationMax}", String(MANUAL_UPLOAD_HINT_MAX_DURATION_SEC));
  }
  return message;
}

export function ManualVideoUploadDialog({
  reelScriptId,
  clientId,
  parentJobId,
  visible,
  copy,
  disabled,
  onHide,
  onSuccess,
}: ManualVideoUploadDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const hintText = copy.hint
    .replace("{videoMax}", String(MANUAL_UPLOAD_HINT_MAX_VIDEO_MIB))
    .replace("{durationMax}", String(MANUAL_UPLOAD_HINT_MAX_DURATION_SEC));

  function resetDialogState() {
    setSelectedFile(null);
    setErrorMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleHide() {
    if (pending) {
      return;
    }
    resetDialogState();
    onHide();
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    setErrorMessage(null);
  }

  async function handleSubmit() {
    if (pending || disabled) {
      return;
    }

    if (!selectedFile) {
      setErrorMessage(copy.errors.missingFile);
      return;
    }

    setPending(true);
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.set("reelScriptId", reelScriptId);
      formData.set("clientId", clientId);
      formData.set("file", selectedFile);
      if (parentJobId) {
        formData.set("parentJobId", parentJobId);
      }

      const result = await uploadManualVideoJob(formData);

      if (result.ok) {
        resetDialogState();
        onSuccess(result.job);
        onHide();
        return;
      }

      setErrorMessage(formatUploadErrorMessage(result.error.code, copy));
    } catch {
      setErrorMessage(copy.errors.internal);
    } finally {
      setPending(false);
    }
  }

  const footer = (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", justifyContent: "flex-end" }}>
      <Button
        type="button"
        label={copy.cancel}
        severity="secondary"
        outlined
        disabled={pending}
        onClick={handleHide}
      />
      <Button
        type="button"
        label={copy.submit}
        icon="pi pi-upload"
        loading={pending}
        disabled={pending || disabled || !selectedFile}
        onClick={() => void handleSubmit()}
      />
    </div>
  );

  return (
    <Dialog
      header={copy.title}
      visible={visible}
      onHide={handleHide}
      footer={footer}
      style={{ width: "min(100%, 32rem)" }}
      modal
      closable={!pending}
      dismissableMask={!pending}
    >
      <p style={{ margin: "0 0 1rem", fontSize: "0.875rem", color: "#6b7280" }}>
        {hintText}
      </p>

      <input
        ref={fileInputRef}
        type="file"
        accept=".mp4,.mov,video/mp4,video/quicktime"
        disabled={pending || disabled}
        onChange={handleFileChange}
        style={{ width: "100%", fontSize: "0.875rem" }}
      />

      {selectedFile ? (
        <p style={{ margin: "0.75rem 0 0", fontSize: "0.8125rem", color: "#374151" }}>
          {selectedFile.name}
        </p>
      ) : null}

      {errorMessage ? (
        <Message
          severity="error"
          text={errorMessage}
          style={{ width: "100%", marginTop: "1rem" }}
        />
      ) : null}
    </Dialog>
  );
}

type ManualVideoUploadControlProps = {
  reelScriptId: string;
  clientId: string;
  videoJob: OperatorVideoJobSummaryDto | null | undefined;
  copy: ManualVideoUploadCopy;
  disabled: boolean;
  onSuccess: (job: OperatorVideoJobSummaryDto) => void;
};

export function isManualUploadVisible(
  videoJob: OperatorVideoJobSummaryDto | null | undefined,
): boolean {
  if (!videoJob) {
    return true;
  }

  if (
    videoJob.status === "queued" ||
    videoJob.status === "processing" ||
    videoJob.status === "completed"
  ) {
    return false;
  }

  return videoJob.status === "failed" || videoJob.status === "cancelled";
}

export function isManualUploadPrimaryEmphasis(
  videoJob: OperatorVideoJobSummaryDto | null | undefined,
): boolean {
  if (!videoJob) {
    return false;
  }

  if (videoJob.status === "failed" || videoJob.status === "cancelled") {
    return true;
  }

  return (
    videoJob.retryBlockedReasonKey === "scripts.videoJob.retry.budgetExceeded"
  );
}

export function ManualVideoUploadControl({
  reelScriptId,
  clientId,
  videoJob,
  copy,
  disabled,
  onSuccess,
}: ManualVideoUploadControlProps) {
  const [dialogVisible, setDialogVisible] = useState(false);

  if (!isManualUploadVisible(videoJob)) {
    return null;
  }

  const primary = isManualUploadPrimaryEmphasis(videoJob);
  const parentJobId =
    videoJob?.status === "failed" || videoJob?.status === "cancelled"
      ? videoJob.jobId
      : null;

  return (
    <div style={{ marginBottom: "0.75rem" }}>
      <Button
        type="button"
        label={copy.button}
        icon="pi pi-upload"
        size="small"
        severity={primary ? undefined : "secondary"}
        outlined={!primary}
        disabled={disabled}
        onClick={() => setDialogVisible(true)}
      />
      <ManualVideoUploadDialog
        reelScriptId={reelScriptId}
        clientId={clientId}
        parentJobId={parentJobId}
        visible={dialogVisible}
        copy={copy}
        disabled={disabled}
        onHide={() => setDialogVisible(false)}
        onSuccess={onSuccess}
      />
    </div>
  );
}
