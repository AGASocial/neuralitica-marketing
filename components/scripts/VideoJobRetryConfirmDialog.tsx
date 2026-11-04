"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { StatusAlert } from "@/components/ui/status-alert";

import type { VideoJobErrorCode } from "@/lib/contracts/video-job";
import { formatCentsForDisplay } from "@/lib/cost-policy/format-cents-for-display";
import { previewRetryVideoJobEstimate } from "@/lib/video-jobs/actions/retry-video-job";
import { retryVideoJob } from "@/lib/video-jobs/actions/retry-video-job";

export type VideoJobRetryConfirmCopy = {
  title: string;
  confirm: string;
  cancel: string;
  loading: string;
  loadError: string;
  estimated: string;
  blocked: string;
  notRetryable: string;
  limitExceeded: string;
  budgetExceeded: string;
  providerUnavailable: string;
  overrideButton: string;
  errors: {
    unauthenticated: string;
    forbidden: string;
    notFound: string;
    validation: string;
    internal: string;
  };
};

type VideoJobRetryConfirmDialogProps = {
  visible: boolean;
  failedJobId: string | null;
  locale: string;
  copy: VideoJobRetryConfirmCopy;
  pending: boolean;
  onHide: () => void;
  onPendingChange: (pending: boolean) => void;
  onSuccess: () => void;
  onRetryLimitExceeded: (failedJobId: string) => void;
  onError: (message: string) => void;
};

function resolveBlockedReason(
  key: string | undefined,
  copy: VideoJobRetryConfirmCopy,
): string {
  switch (key) {
    case "scripts.videoJob.retry.notRetryable":
      return copy.notRetryable;
    case "scripts.videoJob.retry.limitExceeded":
      return copy.limitExceeded;
    case "scripts.videoJob.retry.budgetExceeded":
      return copy.budgetExceeded;
    case "scripts.videoJob.retry.providerUnavailable":
      return copy.providerUnavailable;
    default:
      return copy.blocked;
  }
}

function messageForErrorCode(
  code: VideoJobErrorCode,
  messageKey: string | undefined,
  copy: VideoJobRetryConfirmCopy,
): string {
  if (messageKey) {
    return resolveBlockedReason(messageKey, copy);
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
    default:
      return copy.errors.internal;
  }
}

export function VideoJobRetryConfirmDialog({
  visible,
  failedJobId,
  locale,
  copy,
  pending,
  onHide,
  onPendingChange,
  onSuccess,
  onRetryLimitExceeded,
  onError,
}: VideoJobRetryConfirmDialogProps) {
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [estimatedCostCents, setEstimatedCostCents] = useState<number | null>(
    null,
  );
  const [canRetry, setCanRetry] = useState(false);
  const [blockedReasonKey, setBlockedReasonKey] = useState<string | undefined>(
    undefined,
  );

  useEffect(() => {
    if (!visible || !failedJobId) {
      setLoading(false);
      setLoadError(null);
      setEstimatedCostCents(null);
      setCanRetry(false);
      setBlockedReasonKey(undefined);
      return;
    }

    let cancelled = false;

    async function loadPreview() {
      setLoading(true);
      setLoadError(null);
      setEstimatedCostCents(null);
      setCanRetry(false);
      setBlockedReasonKey(undefined);

      try {
        const result = await previewRetryVideoJobEstimate({ failedJobId });
        if (cancelled) {
          return;
        }

        if (!result.ok) {
          setLoadError(
            messageForErrorCode(result.error.code, result.error.messageKey, copy),
          );
          return;
        }

        setEstimatedCostCents(result.estimatedCostCents);
        setCanRetry(result.canRetry);
        setBlockedReasonKey(result.retryBlockedReasonKey);
      } catch {
        if (!cancelled) {
          setLoadError(copy.loadError);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadPreview();

    return () => {
      cancelled = true;
    };
  }, [visible, failedJobId, copy]);

  async function handleConfirm() {
    if (!failedJobId || estimatedCostCents === null || !canRetry) {
      return;
    }

    onPendingChange(true);

    try {
      const result = await retryVideoJob({
        failedJobId,
        confirmRetry: true,
        confirmEstimateCents: estimatedCostCents,
      });

      if (result.ok) {
        onSuccess();
        onHide();
        return;
      }

      if (result.error.code === "RETRY_LIMIT_EXCEEDED") {
        onHide();
        onRetryLimitExceeded(failedJobId);
        return;
      }

      onError(messageForErrorCode(result.error.code, result.error.messageKey, copy));
    } catch {
      onError(copy.errors.internal);
    } finally {
      onPendingChange(false);
    }
  }

  const showOverridePrompt =
    !loading &&
    !loadError &&
    !canRetry &&
    blockedReasonKey === "scripts.videoJob.retry.limitExceeded";

  return (
    <Dialog
      open={visible}
      onOpenChange={(open) => {
        if (!open && !pending) {
          onHide();
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
        {loading ? (
          <div className="flex items-center gap-3 py-4">
            <Spinner className="size-7" />
            <span>{copy.loading}</span>
          </div>
        ) : null}

        {!loading && loadError ? (
          <StatusAlert severity="error" text={loadError} className="w-full" />
        ) : null}

        {!loading && !loadError && estimatedCostCents !== null ? (
          <>
            {!canRetry && blockedReasonKey ? (
              <StatusAlert
                severity="warn"
                text={resolveBlockedReason(blockedReasonKey, copy)}
                className="mb-4 w-full"
              />
            ) : null}
            <dl className="m-0 text-[0.9rem]">
              <div>
                <dt className="inline text-dim">{copy.estimated}: </dt>
                <dd className="m-0 inline font-semibold text-fog">
                  {formatCentsForDisplay(estimatedCostCents, locale)}
                </dd>
              </div>
            </dl>
          </>
        ) : null}
        <DialogFooter className="flex-wrap gap-2">
          <Button type="button" variant="ghost" disabled={pending} onClick={onHide}>
            {copy.cancel}
          </Button>
          {showOverridePrompt ? (
            <Button
              type="button"
              variant="outline"
              disabled={pending || !failedJobId}
              onClick={() => {
                if (failedJobId) {
                  onHide();
                  onRetryLimitExceeded(failedJobId);
                }
              }}
            >
              {copy.overrideButton}
            </Button>
          ) : (
            <Button
              type="button"
              disabled={
                pending ||
                loading ||
                loadError !== null ||
                !canRetry ||
                estimatedCostCents === null
              }
              onClick={() => void handleConfirm()}
            >
              {pending ? <Spinner className="size-4 text-current" /> : null}
              {copy.confirm}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
