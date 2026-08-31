"use client";

import { useEffect, useState } from "react";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { Message } from "primereact/message";
import { ProgressSpinner } from "primereact/progressspinner";

import type { VideoJobErrorCode } from "@/lib/contracts/video-job";
import { formatCentsForDisplay } from "@/lib/cost-policy/format-cents-for-display";
import { createBrollVideoJobs } from "@/lib/video-jobs/actions/create-broll-video-jobs";
import { previewBrollVideoJobsEstimate } from "@/lib/video-jobs/actions/preview-broll-video-jobs-estimate";

export type BrollGenerateConfirmCopy = {
  button: string;
  title: string;
  confirm: string;
  cancel: string;
  loading: string;
  loadError: string;
  estimated: string;
  clipCount: string;
  providerLabel: string;
  providerWan: string;
  providerLtx: string;
  ineligible: string;
  toastSuccess: string;
  toastPartial: string;
  toastSkippedAll: string;
  errors: {
    unauthenticated: string;
    forbidden: string;
    notFound: string;
    validation: string;
    forbiddenFields: string;
    budgetExceeded: string;
    providerUnavailable: string;
    referenceStillMissing: string;
    brollUnavailable: string;
    internal: string;
  };
};

export type BrollGenerateOutcome =
  | { kind: "full"; createdCount: number }
  | {
      kind: "partial";
      createdCount: number;
      skippedCount: number;
      skipMessages: string[];
    };

type BrollProviderKey = "siliconflow_wan21_turbo" | "ltx_broll_high";

function formatTemplate(
  template: string,
  values: Record<string, string | number>,
): string {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replace(`{${key}}`, String(value)),
    template,
  );
}

function resolveMessageKey(
  key: string | undefined,
  copy: BrollGenerateConfirmCopy,
): string | null {
  switch (key) {
    case "scripts.broll.blocked.jobInFlight":
      return copy.ineligible;
    case "scripts.broll.blocked.referenceStillMissing":
    case "scripts.broll.failure.referenceStillMissing":
      return copy.errors.referenceStillMissing;
    case "scripts.broll.blocked.providerUnavailable":
      return copy.errors.providerUnavailable;
    case "scripts.broll.blocked.budgetExceeded":
      return copy.errors.budgetExceeded;
    case "scripts.broll.generate.errors.budgetExceeded":
      return copy.errors.budgetExceeded;
    case "scripts.broll.generate.errors.providerUnavailable":
      return copy.errors.providerUnavailable;
    case "scripts.broll.generate.errors.validation":
      return copy.errors.validation;
    case "scripts.broll.generate.errors.internal":
      return copy.errors.internal;
    default:
      return null;
  }
}

function messageForErrorCode(
  code: VideoJobErrorCode,
  messageKey: string | undefined,
  copy: BrollGenerateConfirmCopy,
): string {
  const fromKey = resolveMessageKey(messageKey, copy);
  if (fromKey) {
    return fromKey;
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
    case "BUDGET_EXCEEDED":
      return copy.errors.budgetExceeded;
    case "PROVIDER_UNAVAILABLE":
    case "BROLL_PROVIDER_UNAVAILABLE":
      return copy.errors.providerUnavailable;
    case "BROLL_REFERENCE_STILL_MISSING":
      return copy.errors.referenceStillMissing;
    case "BROLL_NOT_NEEDED":
      return copy.ineligible;
    default:
      return copy.errors.internal;
  }
}

function skipReasonMessage(
  reasonCode: string,
  messageKey: string | undefined,
  copy: BrollGenerateConfirmCopy,
): string {
  const fromKey = resolveMessageKey(messageKey, copy);
  if (fromKey) {
    return fromKey;
  }

  switch (reasonCode) {
    case "BUDGET_EXCEEDED":
      return copy.errors.budgetExceeded;
    case "PROVIDER_UNAVAILABLE":
      return copy.errors.providerUnavailable;
    case "VALIDATION_ERROR":
      return copy.errors.validation;
    default:
      return copy.errors.internal;
  }
}

function providerLabel(
  providerKey: BrollProviderKey | undefined,
  copy: BrollGenerateConfirmCopy,
): string | null {
  if (providerKey === "siliconflow_wan21_turbo") {
    return copy.providerWan;
  }
  if (providerKey === "ltx_broll_high") {
    return copy.providerLtx;
  }
  return null;
}

function isEligiblePreview(
  result: Awaited<ReturnType<typeof previewBrollVideoJobsEstimate>>,
): result is Extract<typeof result, { ok: true }> & {
  needsBroll: true;
  providerKey: BrollProviderKey;
  blockedReasonKey?: undefined;
} {
  return (
    result.ok === true &&
    result.needsBroll === true &&
    result.providerKey != null &&
    result.blockedReasonKey == null
  );
}

type BrollGenerateConfirmDialogProps = {
  visible: boolean;
  reelScriptId: string;
  clientId: string;
  locale: string;
  copy: BrollGenerateConfirmCopy;
  pending: boolean;
  onHide: () => void;
  onPendingChange: (pending: boolean) => void;
  onSuccess: (outcome: BrollGenerateOutcome) => void;
  onError: (message: string) => void;
};

export function BrollGenerateConfirmDialog({
  visible,
  reelScriptId,
  clientId,
  locale,
  copy,
  pending,
  onHide,
  onPendingChange,
  onSuccess,
  onError,
}: BrollGenerateConfirmDialogProps) {
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [estimatedCostCents, setEstimatedCostCents] = useState<number | null>(
    null,
  );
  const [clipCount, setClipCount] = useState<number | null>(null);
  const [providerKey, setProviderKey] = useState<BrollProviderKey | undefined>(
    undefined,
  );
  const [eligible, setEligible] = useState(false);
  const [blockedReasonKey, setBlockedReasonKey] = useState<string | undefined>(
    undefined,
  );

  useEffect(() => {
    if (!visible) {
      setLoading(false);
      setLoadError(null);
      setEstimatedCostCents(null);
      setClipCount(null);
      setProviderKey(undefined);
      setEligible(false);
      setBlockedReasonKey(undefined);
      return;
    }

    let cancelled = false;

    async function loadPreview() {
      setLoading(true);
      setLoadError(null);
      setEstimatedCostCents(null);
      setClipCount(null);
      setProviderKey(undefined);
      setEligible(false);
      setBlockedReasonKey(undefined);

      try {
        const result = await previewBrollVideoJobsEstimate({
          reelScriptId,
          clientId,
        });
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
        setClipCount(result.clipCount);
        setProviderKey(result.providerKey);
        setEligible(isEligiblePreview(result));
        setBlockedReasonKey(result.blockedReasonKey);
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
  }, [visible, reelScriptId, clientId, copy]);

  const canConfirm =
    eligible && estimatedCostCents !== null && clipCount !== null && clipCount > 0;

  async function handleConfirm() {
    if (!canConfirm) {
      return;
    }

    onPendingChange(true);

    try {
      const result = await createBrollVideoJobs({ reelScriptId, clientId });

      if (result.ok) {
        if (result.createdCount > 0 && result.skippedCount === 0) {
          onSuccess({ kind: "full", createdCount: result.createdCount });
          onHide();
          return;
        }

        if (result.createdCount > 0 && result.skippedCount > 0) {
          onSuccess({
            kind: "partial",
            createdCount: result.createdCount,
            skippedCount: result.skippedCount,
            skipMessages: result.skipped.map((item) =>
              skipReasonMessage(item.reasonCode, item.messageKey, copy),
            ),
          });
          onHide();
          return;
        }

        if (result.createdCount === 0 && result.skippedCount > 0) {
          const messages = result.skipped.map((item) =>
            skipReasonMessage(item.reasonCode, item.messageKey, copy),
          );
          onError(messages.join(" ") || copy.toastSkippedAll);
          return;
        }

        if (result.skippedNoNeedsBroll) {
          onError(copy.ineligible);
          return;
        }

        onSuccess({ kind: "full", createdCount: 0 });
        onHide();
        return;
      }

      onError(
        messageForErrorCode(result.error.code, result.error.messageKey, copy),
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
        onClick={onHide}
      />
      <Button
        type="button"
        label={copy.confirm}
        disabled={pending || loading || loadError !== null || !canConfirm}
        loading={pending}
        onClick={() => void handleConfirm()}
      />
    </div>
  );

  const providerDisplay = providerLabel(providerKey, copy);

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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            padding: "1rem 0",
          }}
        >
          <ProgressSpinner style={{ width: "28px", height: "28px" }} />
          <span>{copy.loading}</span>
        </div>
      ) : null}

      {!loading && loadError ? (
        <Message severity="error" text={loadError} style={{ width: "100%" }} />
      ) : null}

      {!loading && !loadError && estimatedCostCents !== null ? (
        <>
          {!canConfirm ? (
            <Message
              severity="warn"
              text={
                resolveMessageKey(blockedReasonKey, copy) ?? copy.ineligible
              }
              style={{ width: "100%", marginBottom: "1rem" }}
            />
          ) : null}
          <dl style={{ margin: 0, fontSize: "0.9rem", display: "grid", gap: "0.5rem" }}>
            {providerDisplay ? (
              <div>
                <dt style={{ display: "inline", color: "#6b7280" }}>
                  {copy.providerLabel}:{" "}
                </dt>
                <dd style={{ display: "inline", margin: 0, fontWeight: 600 }}>
                  {providerDisplay}
                </dd>
              </div>
            ) : null}
            {clipCount !== null ? (
              <div>
                <dt style={{ display: "inline", color: "#6b7280" }}>
                  {copy.clipCount}:{" "}
                </dt>
                <dd style={{ display: "inline", margin: 0, fontWeight: 600 }}>
                  {clipCount}
                </dd>
              </div>
            ) : null}
            <div>
              <dt style={{ display: "inline", color: "#6b7280" }}>
                {copy.estimated}:{" "}
              </dt>
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

type BrollGenerateControlProps = {
  reelScriptId: string;
  clientId: string;
  locale: string;
  copy: BrollGenerateConfirmCopy;
  disabled: boolean;
  onSuccess: (outcome: BrollGenerateOutcome) => void;
  onError: (message: string) => void;
  /** Soft hint only — preview remains authoritative. */
  brollJobInFlight?: boolean;
};

/**
 * Operator-only “Generate B-roll” — visibility from server preview
 * (`needsBroll`, `providerKey`, no `blockedReasonKey`). Submit sends only
 * `{ reelScriptId, clientId }` — no provider or cost authority fields.
 */
export function BrollGenerateControl({
  reelScriptId,
  clientId,
  locale,
  copy,
  disabled,
  onSuccess,
  onError,
  brollJobInFlight = false,
}: BrollGenerateControlProps) {
  const [dialogVisible, setDialogVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [eligibilityLoading, setEligibilityLoading] = useState(true);
  const [showButton, setShowButton] = useState(false);

  useEffect(() => {
    if (brollJobInFlight) {
      setEligibilityLoading(false);
      setShowButton(false);
      return;
    }

    let cancelled = false;

    async function checkEligibility() {
      setEligibilityLoading(true);
      setShowButton(false);

      try {
        const result = await previewBrollVideoJobsEstimate({
          reelScriptId,
          clientId,
        });
        if (cancelled) {
          return;
        }

        setShowButton(isEligiblePreview(result));
      } catch {
        if (!cancelled) {
          setShowButton(false);
        }
      } finally {
        if (!cancelled) {
          setEligibilityLoading(false);
        }
      }
    }

    void checkEligibility();

    return () => {
      cancelled = true;
    };
  }, [reelScriptId, clientId, brollJobInFlight]);

  if (eligibilityLoading || !showButton) {
    return null;
  }

  return (
    <div style={{ marginBottom: "0.75rem" }}>
      <Button
        type="button"
        label={copy.button}
        icon="pi pi-images"
        size="small"
        severity="secondary"
        disabled={disabled || pending}
        onClick={() => setDialogVisible(true)}
      />
      <BrollGenerateConfirmDialog
        visible={dialogVisible}
        reelScriptId={reelScriptId}
        clientId={clientId}
        locale={locale}
        copy={copy}
        pending={pending}
        onHide={() => {
          if (!pending) {
            setDialogVisible(false);
          }
        }}
        onPendingChange={setPending}
        onSuccess={onSuccess}
        onError={onError}
      />
    </div>
  );
}

export { formatTemplate as formatBrollGenerateTemplate };
