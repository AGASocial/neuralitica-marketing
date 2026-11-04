"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { StatusAlert } from "@/components/ui/status-alert";
import { Textarea } from "@/components/ui/textarea";

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

  return (
    <Dialog
      open={visible}
      onOpenChange={(open) => {
        if (!open) {
          handleHide();
        }
      }}
    >
      <DialogContent
        className="w-[min(480px,95vw)] border-edge bg-panel text-fog sm:max-w-[480px]"
        showCloseButton={!pending}
        aria-describedby={undefined}
        onInteractOutside={(event) => {
          if (pending) {
            event.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">{copy.title}</DialogTitle>
        </DialogHeader>
        <StatusAlert severity="warn" text={`${copy.confirmMessage}${checkLabel ? ` (${checkLabel})` : ""}`} className="w-full" />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="qa-override-reason" className="font-semibold">
            {copy.reasonLabel}
          </Label>
          <Textarea
            id="qa-override-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            maxLength={OVERRIDE_REASON_MAX_LENGTH}
            disabled={pending}
            className="w-full"
          />
          {!reasonValid ? (
            <p className="m-0 text-sm text-dim">{copy.reasonRequired}</p>
          ) : null}
        </div>
        <DialogFooter className="flex-wrap gap-2">
          <Button type="button" variant="ghost" disabled={pending} onClick={handleHide}>
            {copy.cancel}
          </Button>
          <Button
            type="button"
            disabled={pending || !reasonValid || !qaReportId || !checkKey}
            onClick={() => void handleConfirm()}
          >
            {pending ? <Spinner className="size-4 text-current" /> : null}
            {copy.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
