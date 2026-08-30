"use client";

import { useEffect, useState } from "react";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { Message } from "primereact/message";
import { ProgressSpinner } from "primereact/progressspinner";

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

  const footer = (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", justifyContent: "flex-end" }}>
      <Button
        type="button"
        label={copy.cancel}
        className="p-button-text"
        disabled={pending}
        onClick={onHide}
      />
      {showOverridePrompt ? (
        <Button
          type="button"
          label={copy.overrideButton}
          severity="secondary"
          disabled={pending || !failedJobId}
          onClick={() => {
            if (failedJobId) {
              onHide();
              onRetryLimitExceeded(failedJobId);
            }
          }}
        />
      ) : (
        <Button
          type="button"
          label={copy.confirm}
          disabled={
            pending ||
            loading ||
            loadError !== null ||
            !canRetry ||
            estimatedCostCents === null
          }
          loading={pending}
          onClick={() => void handleConfirm()}
        />
      )}
    </div>
  );

  return (
    <Dialog
      header={copy.title}
      visible={visible}
      style={{ width: "min(480px, 95vw)" }}
      onHide={onHide}
      footer={footer}
      closable={!pending}
      dismissableMask={!pending}
    >
      {loading ? (
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "1rem 0" }}>
          <ProgressSpinner style={{ width: "28px", height: "28px" }} />
          <span>{copy.loading}</span>
        </div>
      ) : null}

      {!loading && loadError ? (
        <Message severity="error" text={loadError} style={{ width: "100%" }} />
      ) : null}

      {!loading && !loadError && estimatedCostCents !== null ? (
        <>
          {!canRetry && blockedReasonKey ? (
            <Message
              severity="warn"
              text={resolveBlockedReason(blockedReasonKey, copy)}
              style={{ width: "100%", marginBottom: "1rem" }}
            />
          ) : null}
          <dl style={{ margin: 0, fontSize: "0.9rem" }}>
            <div>
              <dt style={{ display: "inline", color: "#6b7280" }}>{copy.estimated}: </dt>
              <dd style={{ display: "inline", margin: 0, fontWeight: 600 }}>
                {formatCentsForDisplay(estimatedCostCents, locale)}
              </dd>
            </div>
          </dl>
        </>
      ) : null}
    </Dialog>
  );
}
