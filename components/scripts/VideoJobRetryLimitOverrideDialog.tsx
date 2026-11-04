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
        <StatusAlert severity="warn" text={copy.limitMessage} className="w-full" />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="video-job-retry-override-reason" className="font-semibold">
            {copy.reasonLabel}
          </Label>
          <Textarea
            id="video-job-retry-override-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            maxLength={500}
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
            disabled={pending || !reasonValid || !failedJobId}
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
