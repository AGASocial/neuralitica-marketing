"use client";

import { useState } from "react";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { InputTextarea } from "primereact/inputtextarea";
import { Message } from "primereact/message";

import {
  OVERRIDE_REASON_MAX_LENGTH,
  OVERRIDE_REASON_MIN_LENGTH,
  overrideQaCheckInputSchema,
  type OverrideQaCheckSuccess,
  type QaCheckKey,
  type QaOverrideErrorCode,
} from "@/lib/contracts/qa-override";
import { overrideQaCheck } from "@/lib/qa/actions/override-qa-check";

export type QaOverrideDialogCopy = {
  title: string;
  confirm: string;
  cancel: string;
  reasonLabel: string;
  reasonRequired: string;
  confirmMessage: string;
  errors: {
    unauthenticated: string;
    forbidden: string;
    validation: string;
    notFound: string;
    forbiddenFields: string;
    checkBlocking: string;
    checkNotFailed: string;
    rateLimited: string;
    internal: string;
  };
};

type QaOverrideDialogProps = {
  visible: boolean;
  qaReportId: string | null;
  checkKey: QaCheckKey | null;
  checkLabel: string;
  copy: QaOverrideDialogCopy;
  pending: boolean;
  onHide: () => void;
  onPendingChange: (pending: boolean) => void;
  onSuccess: (result: OverrideQaCheckSuccess) => void;
  onError: (message: string) => void;
};

export function messageForQaOverrideError(
  code: QaOverrideErrorCode,
  messageKey: string | undefined,
  copy: QaOverrideDialogCopy,
): string {
  if (messageKey === "scripts.qa.override.errors.checkBlocking") {
    return copy.errors.checkBlocking;
  }
  if (messageKey === "scripts.qa.override.errors.checkNotFailed") {
    return copy.errors.checkNotFailed;
  }
  if (messageKey === "scripts.qa.override.errors.forbiddenFields") {
    return copy.errors.forbiddenFields;
  }
  if (messageKey === "scripts.qa.override.errors.rateLimited") {
    return copy.errors.rateLimited;
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
    case "CHECK_BLOCKING":
      return copy.errors.checkBlocking;
    case "CHECK_NOT_FAILED":
      return copy.errors.checkNotFailed;
    case "RATE_LIMITED":
      return copy.errors.rateLimited;
    default:
      return copy.errors.internal;
  }
}

/**
 * Operator QA check override dialog (US-10.2).
 * Mirrors VideoJobRetryLimitOverrideDialog — reason 1–500, single checkKey.
 */
export function QaOverrideDialog({
  visible,
  qaReportId,
  checkKey,
  checkLabel,
  copy,
  pending,
  onHide,
  onPendingChange,
  onSuccess,
  onError,
}: QaOverrideDialogProps) {
  const [reason, setReason] = useState("");

  const trimmed = reason.trim();
  const reasonValid =
    trimmed.length >= OVERRIDE_REASON_MIN_LENGTH &&
    trimmed.length <= OVERRIDE_REASON_MAX_LENGTH;

  function handleHide() {
    if (pending) {
      return;
    }
    setReason("");
    onHide();
  }

  async function handleConfirm() {
    if (!qaReportId || !checkKey || !reasonValid) {
      return;
    }

    onPendingChange(true);

    try {
      const parsed = overrideQaCheckInputSchema.safeParse({
        qaReportId,
        checkKey,
        reason: trimmed,
      });
      if (!parsed.success) {
        onError(copy.errors.validation);
        return;
      }

      const result = await overrideQaCheck(parsed.data);

      if (result.ok) {
        setReason("");
        onSuccess(result);
        onHide();
        return;
      }

      onError(
        messageForQaOverrideError(
          result.error.code,
          result.error.messageKey,
          copy,
        ),
      );
    } catch {
      onError(copy.errors.internal);
    } finally {
      onPendingChange(false);
    }
  }

  const footer = (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "0.5rem",
        justifyContent: "flex-end",
      }}
    >
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
        disabled={pending || !reasonValid || !qaReportId || !checkKey}
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
        text={`${copy.confirmMessage}${checkLabel ? ` (${checkLabel})` : ""}`}
        style={{ width: "100%", marginBottom: "1rem" }}
      />
      <label
        htmlFor="qa-override-reason"
        style={{ display: "block", fontWeight: 600, marginBottom: "0.35rem" }}
      >
        {copy.reasonLabel}
      </label>
      <InputTextarea
        id="qa-override-reason"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        rows={3}
        maxLength={OVERRIDE_REASON_MAX_LENGTH}
        disabled={pending}
        style={{ width: "100%" }}
        autoResize
      />
      {!reasonValid ? (
        <p
          style={{
            margin: "0.35rem 0 0",
            color: "#6b7280",
            fontSize: "0.875rem",
          }}
        >
          {copy.reasonRequired}
        </p>
      ) : null}
    </Dialog>
  );
}
