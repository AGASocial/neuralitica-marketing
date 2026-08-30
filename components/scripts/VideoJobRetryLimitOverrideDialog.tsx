"use client";

import { useState } from "react";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { InputTextarea } from "primereact/inputtextarea";
import { Message } from "primereact/message";

import type { VideoJobErrorCode } from "@/lib/contracts/video-job";
import { overrideVideoJobRetryLimitRequestSchema } from "@/lib/contracts/video-job";
import { overrideVideoJobRetryLimit } from "@/lib/video-jobs/actions/override-video-job-retry-limit";

export type VideoJobRetryLimitOverrideCopy = {
  title: string;
  confirm: string;
  cancel: string;
  reasonLabel: string;
  reasonRequired: string;
  limitMessage: string;
  errors: {
    unauthenticated: string;
    forbidden: string;
    notFound: string;
    validation: string;
    internal: string;
  };
};

type VideoJobRetryLimitOverrideDialogProps = {
  visible: boolean;
  failedJobId: string | null;
  copy: VideoJobRetryLimitOverrideCopy;
  pending: boolean;
  onHide: () => void;
  onPendingChange: (pending: boolean) => void;
  onSuccess: () => void;
  onError: (message: string) => void;
};

function messageForErrorCode(
  code: VideoJobErrorCode,
  copy: VideoJobRetryLimitOverrideCopy,
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
    default:
      return copy.errors.internal;
  }
}

export function VideoJobRetryLimitOverrideDialog({
  visible,
  failedJobId,
  copy,
  pending,
  onHide,
  onPendingChange,
  onSuccess,
  onError,
}: VideoJobRetryLimitOverrideDialogProps) {
  const [reason, setReason] = useState("");

  const reasonValid =
    reason.trim().length >= 1 && reason.trim().length <= 500;

  function handleHide() {
    if (pending) {
      return;
    }
    setReason("");
    onHide();
  }

  async function handleConfirm() {
    if (!failedJobId || !reasonValid) {
      return;
    }

    onPendingChange(true);

    try {
      const parsed = overrideVideoJobRetryLimitRequestSchema.safeParse({
        failedJobId,
        reason: reason.trim(),
      });
      if (!parsed.success) {
        onError(copy.errors.validation);
        return;
      }

      const result = await overrideVideoJobRetryLimit(parsed.data);

      if (result.ok) {
        setReason("");
        onSuccess();
        onHide();
        return;
      }

      onError(messageForErrorCode(result.error.code, copy));
    } catch {
      onError(copy.errors.internal);
    } finally {
      onPendingChange(false);
    }
  }

  const footer = (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", justifyContent: "flex-end" }}>
      <Button
        type="button"
        label={copy.cancel}
        className="p-button-text"
        disabled={pending}
        onClick={handleHide}
      />
      <Button
        type="button"
        label={copy.confirm}
        disabled={pending || !reasonValid || !failedJobId}
        loading={pending}
        onClick={() => void handleConfirm()}
      />
    </div>
  );

  return (
    <Dialog
      header={copy.title}
      visible={visible}
      style={{ width: "min(480px, 95vw)" }}
      onHide={handleHide}
      footer={footer}
      closable={!pending}
      dismissableMask={!pending}
    >
      <Message
        severity="warn"
        text={copy.limitMessage}
        style={{ width: "100%", marginBottom: "1rem" }}
      />
      <label
        htmlFor="video-job-retry-override-reason"
        style={{ display: "block", fontWeight: 600, marginBottom: "0.35rem" }}
      >
        {copy.reasonLabel}
      </label>
      <InputTextarea
        id="video-job-retry-override-reason"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        rows={3}
        maxLength={500}
        disabled={pending}
        style={{ width: "100%" }}
        autoResize
      />
      {!reasonValid ? (
        <p style={{ margin: "0.35rem 0 0", color: "#6b7280", fontSize: "0.875rem" }}>
          {copy.reasonRequired}
        </p>
      ) : null}
    </Dialog>
  );
}
