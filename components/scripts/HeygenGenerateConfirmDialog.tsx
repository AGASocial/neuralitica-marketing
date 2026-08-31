"use client";

import { useEffect, useState } from "react";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { Message } from "primereact/message";
import { ProgressSpinner } from "primereact/progressspinner";

import type { VideoJobErrorCode } from "@/lib/contracts/video-job";
import { formatCentsForDisplay } from "@/lib/cost-policy/format-cents-for-display";
import {
  createHeygenTalkingHeadVideoJob,
  previewHeygenTalkingHeadEstimate,
} from "@/lib/video-jobs/actions/create-heygen-talking-head-video-job";

export type HeygenGenerateConfirmCopy = {
  button: string;
  title: string;
  confirm: string;
  cancel: string;
  loading: string;
  loadError: string;
  estimated: string;
  pathHighTier: string;
  pathFallback: string;
  ineligible: string;
  blocked: string;
  toastSuccess: string;
  errors: {
    unauthenticated: string;
    forbidden: string;
    notFound: string;
    validation: string;
    forbiddenFields: string;
    budgetExceeded: string;
    consentRevoked: string;
    providerUnavailable: string;
    fallbackIneligible: string;
    configMissing: string;
    internal: string;
  };
};

type HeygenGenerateConfirmDialogProps = {
  visible: boolean;
  reelScriptId: string;
  clientId: string;
  targetDurationSec: number;
  voiceoverAssetId?: string | null;
  portraitAssetId?: string | null;
  locale: string;
  copy: HeygenGenerateConfirmCopy;
  pending: boolean;
  onHide: () => void;
  onPendingChange: (pending: boolean) => void;
  onSuccess: () => void;
  onError: (message: string) => void;
};

type EligibilityPath = "high_tier" | "operator_fallback" | "ineligible";

function resolveMessageKey(
  key: string | undefined,
  copy: HeygenGenerateConfirmCopy,
): string | null {
  switch (key) {
    case "scripts.heygen.blocked.ineligible":
      return copy.ineligible;
    case "scripts.heygen.errors.fallbackIneligible":
      return copy.errors.fallbackIneligible;
    case "scripts.heygen.blocked.budgetExceeded":
    case "scripts.heygen.errors.budgetExceeded":
    case "scripts.videoJob.retry.budgetExceeded":
      return copy.errors.budgetExceeded;
    case "scripts.heygen.blocked.consentRevoked":
    case "scripts.heygen.errors.consentRevoked":
      return copy.errors.consentRevoked;
    case "scripts.heygen.blocked.providerUnavailable":
    case "scripts.heygen.errors.providerUnavailable":
      return copy.errors.providerUnavailable;
    case "scripts.heygen.blocked.configMissing":
    case "scripts.heygen.errors.configMissing":
      return copy.errors.configMissing;
    default:
      return null;
  }
}

function messageForErrorCode(
  code: VideoJobErrorCode,
  messageKey: string | undefined,
  copy: HeygenGenerateConfirmCopy,
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
    case "CONSENT_REVOKED":
      return copy.errors.consentRevoked;
    case "PROVIDER_UNAVAILABLE":
      return copy.errors.providerUnavailable;
    case "HEYGEN_FALLBACK_INELIGIBLE":
      return copy.errors.fallbackIneligible;
    case "HEYGEN_CONFIG_MISSING":
      return copy.errors.configMissing;
    default:
      return copy.errors.internal;
  }
}

function pathLabel(
  path: EligibilityPath,
  copy: HeygenGenerateConfirmCopy,
): string | null {
  if (path === "high_tier") {
    return copy.pathHighTier;
  }
  if (path === "operator_fallback") {
    return copy.pathFallback;
  }
  return null;
}

export function HeygenGenerateConfirmDialog({
  visible,
  reelScriptId,
  clientId,
  targetDurationSec,
  voiceoverAssetId,
  portraitAssetId,
  locale,
  copy,
  pending,
  onHide,
  onPendingChange,
  onSuccess,
  onError,
}: HeygenGenerateConfirmDialogProps) {
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [estimatedCostCents, setEstimatedCostCents] = useState<number | null>(
    null,
  );
  const [eligible, setEligible] = useState(false);
  const [eligibilityPath, setEligibilityPath] =
    useState<EligibilityPath>("ineligible");
  const [blockedReasonKey, setBlockedReasonKey] = useState<string | undefined>(
    undefined,
  );

  useEffect(() => {
    if (!visible) {
      setLoading(false);
      setLoadError(null);
      setEstimatedCostCents(null);
      setEligible(false);
      setEligibilityPath("ineligible");
      setBlockedReasonKey(undefined);
      return;
    }

    let cancelled = false;

    async function loadPreview() {
      setLoading(true);
      setLoadError(null);
      setEstimatedCostCents(null);
      setEligible(false);
      setEligibilityPath("ineligible");
      setBlockedReasonKey(undefined);

      try {
        const result = await previewHeygenTalkingHeadEstimate({
          reelScriptId,
          clientId,
          targetDurationSec,
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
        setEligible(result.eligible);
        setEligibilityPath(result.eligibilityPath);
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
  }, [visible, reelScriptId, clientId, targetDurationSec, copy]);

  const canConfirm =
    eligible &&
    (eligibilityPath === "high_tier" ||
      eligibilityPath === "operator_fallback") &&
    estimatedCostCents !== null;

  async function handleConfirm() {
    if (!canConfirm || estimatedCostCents === null) {
      return;
    }

    onPendingChange(true);

    try {
      const body: {
        reelScriptId: string;
        clientId: string;
        targetDurationSec: number;
        confirmEstimateCents: number;
        voiceoverAssetId?: string;
        portraitAssetId?: string;
      } = {
        reelScriptId,
        clientId,
        targetDurationSec,
        confirmEstimateCents: estimatedCostCents,
      };

      if (voiceoverAssetId) {
        body.voiceoverAssetId = voiceoverAssetId;
      }
      if (portraitAssetId) {
        body.portraitAssetId = portraitAssetId;
      }

      const result = await createHeygenTalkingHeadVideoJob(body);

      if (result.ok) {
        onSuccess();
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

  const eligibilityLabel = pathLabel(eligibilityPath, copy);

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
          {canConfirm && eligibilityLabel ? (
            <p
              style={{
                margin: "0 0 0.75rem",
                fontSize: "0.875rem",
                color: "#6b7280",
              }}
            >
              {eligibilityLabel}
            </p>
          ) : null}
          <dl style={{ margin: 0, fontSize: "0.9rem" }}>
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

type HeygenGenerateControlProps = {
  reelScriptId: string;
  clientId: string;
  targetDurationSec: number | null;
  voiceoverAssetId?: string | null;
  portraitAssetId?: string | null;
  /** When true, hide control (e.g. job already queued/processing). */
  jobInFlight?: boolean;
  locale: string;
  copy: HeygenGenerateConfirmCopy;
  disabled: boolean;
  onSuccess: () => void;
  onError: (message: string) => void;
};

/**
 * Operator-only “Generate with HeyGen” — visibility from server preview
 * eligibilityPath ∈ { high_tier, operator_fallback }. Never sends provider_key /
 * engine / tier from the client.
 */
export function HeygenGenerateControl({
  reelScriptId,
  clientId,
  targetDurationSec,
  voiceoverAssetId,
  portraitAssetId,
  jobInFlight = false,
  locale,
  copy,
  disabled,
  onSuccess,
  onError,
}: HeygenGenerateControlProps) {
  const [dialogVisible, setDialogVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [eligibilityLoading, setEligibilityLoading] = useState(true);
  const [showButton, setShowButton] = useState(false);

  useEffect(() => {
    if (jobInFlight || targetDurationSec === null || targetDurationSec < 1) {
      setEligibilityLoading(false);
      setShowButton(false);
      return;
    }

    let cancelled = false;

    async function checkEligibility() {
      setEligibilityLoading(true);
      setShowButton(false);

      try {
        const result = await previewHeygenTalkingHeadEstimate({
          reelScriptId,
          clientId,
          targetDurationSec,
        });
        if (cancelled) {
          return;
        }

        if (
          result.ok &&
          result.eligible &&
          (result.eligibilityPath === "high_tier" ||
            result.eligibilityPath === "operator_fallback")
        ) {
          setShowButton(true);
        } else {
          setShowButton(false);
        }
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
  }, [reelScriptId, clientId, targetDurationSec, jobInFlight]);

  if (eligibilityLoading || !showButton || targetDurationSec === null) {
    return null;
  }

  return (
    <div style={{ marginBottom: "0.75rem" }}>
      <Button
        type="button"
        label={copy.button}
        icon="pi pi-video"
        size="small"
        severity="secondary"
        disabled={disabled || pending}
        onClick={() => setDialogVisible(true)}
      />
      <HeygenGenerateConfirmDialog
        visible={dialogVisible}
        reelScriptId={reelScriptId}
        clientId={clientId}
        targetDurationSec={targetDurationSec}
        voiceoverAssetId={voiceoverAssetId}
        portraitAssetId={portraitAssetId}
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
