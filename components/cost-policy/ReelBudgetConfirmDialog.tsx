"use client";

import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { InputTextarea } from "primereact/inputtextarea";
import { Message } from "primereact/message";
import { ProgressSpinner } from "primereact/progressspinner";

import type {
  ProjectionHintKey,
  ReelBudgetBatchPreview,
  ReelBudgetPreview,
} from "@/lib/contracts/cost-policy";
import { OVERRIDE_REASON_MAX_LENGTH } from "@/lib/contracts/cost-policy";
import { formatCentsForDisplay } from "@/lib/cost-policy/format-cents-for-display";
import type { ProviderTier } from "@/lib/contracts/providers";

export type ReelBudgetConfirmCopy = {
  title: string;
  confirm: string;
  cancel: string;
  proceedAnyway: string;
  loading: string;
  loadError: string;
  estimated: string;
  cumulative: string;
  cap: string;
  remaining: string;
  providerTier: string;
  providerLabel: string;
  providerTierOptions: Record<ProviderTier, string>;
  slotLabel: string;
  blockedSlots: string;
  aggregateEstimate: string;
  wouldExceedWarning: string;
  overrideReasonLabel: string;
  overrideReasonRequired: string;
  projectionHints: Record<ProjectionHintKey, string>;
  errors: {
    exceeded: string;
    policyUnavailable: string;
    providerUnavailable: string;
  };
};

type ReelBudgetConfirmDialogProps = {
  visible: boolean;
  loading: boolean;
  loadError: string | null;
  preview: ReelBudgetPreview | ReelBudgetBatchPreview | null;
  isBatch: boolean;
  locale: string;
  copy: ReelBudgetConfirmCopy;
  overrideReason: string;
  onOverrideReasonChange: (value: string) => void;
  pending: boolean;
  onHide: () => void;
  onConfirm: () => void;
  onProceedAnyway: () => void;
};

function isBatchPreview(
  preview: ReelBudgetPreview | ReelBudgetBatchPreview,
): preview is ReelBudgetBatchPreview {
  return "items" in preview;
}

function PreviewRow({
  item,
  locale,
  copy,
}: {
  item: ReelBudgetPreview;
  locale: string;
  copy: ReelBudgetConfirmCopy;
}) {
  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: "6px",
        padding: "0.75rem",
        marginBottom: "0.75rem",
        background: item.wouldExceed ? "#fef2f2" : "#ffffff",
      }}
    >
      <p style={{ margin: "0 0 0.5rem", fontWeight: 600 }}>
        {copy.slotLabel.replace("{index}", String(item.slotIndex + 1))}
      </p>
      <BudgetMetrics item={item} locale={locale} copy={copy} />
    </div>
  );
}

function BudgetMetrics({
  item,
  locale,
  copy,
}: {
  item: ReelBudgetPreview;
  locale: string;
  copy: ReelBudgetConfirmCopy;
}) {
  return (
    <dl style={{ margin: 0, display: "grid", gap: "0.35rem", fontSize: "0.9rem" }}>
      <div>
        <dt style={{ display: "inline", color: "#6b7280" }}>{copy.estimated}: </dt>
        <dd style={{ display: "inline", margin: 0 }}>
          {formatCentsForDisplay(item.estimatedCostCents, locale)}
        </dd>
      </div>
      <div>
        <dt style={{ display: "inline", color: "#6b7280" }}>{copy.cumulative}: </dt>
        <dd style={{ display: "inline", margin: 0 }}>
          {formatCentsForDisplay(item.cumulativeCostCents, locale)}
        </dd>
      </div>
      <div>
        <dt style={{ display: "inline", color: "#6b7280" }}>{copy.cap}: </dt>
        <dd style={{ display: "inline", margin: 0 }}>
          {formatCentsForDisplay(item.maxCostCents, locale)}
        </dd>
      </div>
      <div>
        <dt style={{ display: "inline", color: "#6b7280" }}>{copy.remaining}: </dt>
        <dd style={{ display: "inline", margin: 0 }}>
          {formatCentsForDisplay(item.remainingCents, locale)}
        </dd>
      </div>
      <div>
        <dt style={{ display: "inline", color: "#6b7280" }}>{copy.providerTier}: </dt>
        <dd style={{ display: "inline", margin: 0 }}>
          {copy.providerTierOptions[item.providerTier]}
        </dd>
      </div>
      <div>
        <dt style={{ display: "inline", color: "#6b7280" }}>{copy.providerLabel}: </dt>
        <dd style={{ display: "inline", margin: 0 }}>{item.resolvedLlmProviderLabel}</dd>
      </div>
      {item.projectionHintKey ? (
        <div style={{ color: "#6b7280", marginTop: "0.25rem" }}>
          {copy.projectionHints[item.projectionHintKey]}
        </div>
      ) : null}
    </dl>
  );
}

export function ReelBudgetConfirmDialog({
  visible,
  loading,
  loadError,
  preview,
  isBatch,
  locale,
  copy,
  overrideReason,
  onOverrideReasonChange,
  pending,
  onHide,
  onConfirm,
  onProceedAnyway,
}: ReelBudgetConfirmDialogProps) {
  const wouldExceedAny =
    preview !== null &&
    (isBatchPreview(preview) ? preview.wouldExceedAny : preview.wouldExceed);

  const overrideReasonValid =
    overrideReason.trim().length >= 1 &&
    overrideReason.trim().length <= OVERRIDE_REASON_MAX_LENGTH;

  const footer = (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", justifyContent: "flex-end" }}>
      <Button
        type="button"
        label={copy.cancel}
        className="p-button-text"
        disabled={pending}
        onClick={onHide}
      />
      {wouldExceedAny ? (
        <Button
          type="button"
          label={copy.proceedAnyway}
          severity="danger"
          disabled={pending || loading || !overrideReasonValid || preview === null}
          loading={pending}
          onClick={onProceedAnyway}
        />
      ) : (
        <Button
          type="button"
          label={copy.confirm}
          disabled={pending || loading || preview === null || loadError !== null}
          loading={pending}
          onClick={onConfirm}
        />
      )}
    </div>
  );

  return (
    <Dialog
      header={copy.title}
      visible={visible}
      style={{ width: "min(560px, 95vw)" }}
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

      {!loading && preview && !isBatch && !isBatchPreview(preview) ? (
        <>
          {preview.wouldExceed ? (
            <Message
              severity="warn"
              text={copy.wouldExceedWarning}
              style={{ width: "100%", marginBottom: "1rem" }}
            />
          ) : null}
          <BudgetMetrics item={preview} locale={locale} copy={copy} />
        </>
      ) : null}

      {!loading && preview && isBatch && isBatchPreview(preview) ? (
        <>
          {preview.wouldExceedAny ? (
            <Message
              severity="warn"
              text={copy.wouldExceedWarning}
              style={{ width: "100%", marginBottom: "1rem" }}
            />
          ) : null}
          <p style={{ margin: "0 0 0.75rem", color: "#374151" }}>
            {copy.aggregateEstimate.replace(
              "{amount}",
              formatCentsForDisplay(preview.aggregateEstimatedCostCents, locale),
            )}
          </p>
          {preview.blockedSlotIndexes.length > 0 ? (
            <p style={{ margin: "0 0 0.75rem", color: "#b45309", fontSize: "0.9rem" }}>
              {copy.blockedSlots.replace(
                "{slots}",
                preview.blockedSlotIndexes.map((i) => String(i + 1)).join(", "),
              )}
            </p>
          ) : null}
          {preview.items.map((item) => (
            <PreviewRow key={item.slotIndex} item={item} locale={locale} copy={copy} />
          ))}
        </>
      ) : null}

      {!loading && wouldExceedAny ? (
        <div style={{ marginTop: "1rem" }}>
          <label
            htmlFor="budget-override-reason"
            style={{ display: "block", fontWeight: 600, marginBottom: "0.35rem" }}
          >
            {copy.overrideReasonLabel}
          </label>
          <InputTextarea
            id="budget-override-reason"
            value={overrideReason}
            onChange={(event) => onOverrideReasonChange(event.target.value)}
            rows={3}
            maxLength={OVERRIDE_REASON_MAX_LENGTH}
            disabled={pending}
            style={{ width: "100%" }}
            autoResize
          />
          {!overrideReasonValid ? (
            <p style={{ margin: "0.35rem 0 0", color: "#6b7280", fontSize: "0.875rem" }}>
              {copy.overrideReasonRequired}
            </p>
          ) : null}
        </div>
      ) : null}
    </Dialog>
  );
}
