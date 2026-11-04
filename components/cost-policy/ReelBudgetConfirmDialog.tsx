"use client";

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
import { cn } from "@/lib/utils";
import type {
  LlmRecommendation,
  ProjectionHintKey,
  ReelBudgetBatchPreview,
  ReelBudgetPreview,
} from "@/lib/contracts/cost-policy";
import { OVERRIDE_REASON_MAX_LENGTH } from "@/lib/contracts/cost-policy";
import { formatCentsForDisplay } from "@/lib/cost-policy/format-cents-for-display";
import type { ProviderTier } from "@/lib/contracts/providers";
import type { ProviderRecommendationCopy } from "@/components/scripts/ProviderRecommendationPanel";

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
  recommendationCopy: ProviderRecommendationCopy;
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

function MetricRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="inline text-dim">{label}: </dt>
      <dd className="m-0 inline text-fog">{children}</dd>
    </div>
  );
}

function PreviewRow({
  item,
  locale,
  copy,
  recommendationCopy,
}: {
  item: ReelBudgetPreview;
  locale: string;
  copy: ReelBudgetConfirmCopy;
  recommendationCopy: ProviderRecommendationCopy;
}) {
  return (
    <div
      className={cn(
        "mb-3 rounded-md border p-3",
        item.wouldExceed ? "border-rose/50 bg-rose/10" : "border-edge bg-deep/60",
      )}
    >
      <p className="mb-2 font-semibold text-fog">
        {copy.slotLabel.replace("{index}", String(item.slotIndex + 1))}
      </p>
      <BudgetMetrics
        item={item}
        locale={locale}
        copy={copy}
        recommendationCopy={recommendationCopy}
      />
    </div>
  );
}

function LlmRecommendationBlock({
  recommendation,
  locale,
  recommendationCopy,
}: {
  recommendation: LlmRecommendation;
  locale: string;
  recommendationCopy: ProviderRecommendationCopy;
}) {
  return (
    <div className="mb-3 rounded-md border border-info/40 bg-info/10 px-3 py-2.5 text-sm">
      <p className="mb-1.5 font-semibold text-fog">{recommendationCopy.title}</p>
      <dl className="m-0 grid gap-1">
        <MetricRow label={recommendationCopy.providerLabel}>
          {recommendation.displayLabel}
        </MetricRow>
        <MetricRow label={recommendationCopy.costLabel}>
          {formatCentsForDisplay(recommendation.estimatedCostCents, locale)}
        </MetricRow>
        <MetricRow label={recommendationCopy.rationaleLabel}>
          {recommendationCopy.rationale[recommendation.rationaleKey]}
        </MetricRow>
      </dl>
    </div>
  );
}

function BudgetMetrics({
  item,
  locale,
  copy,
  recommendationCopy,
}: {
  item: ReelBudgetPreview;
  locale: string;
  copy: ReelBudgetConfirmCopy;
  recommendationCopy: ProviderRecommendationCopy;
}) {
  return (
    <>
      {item.llmRecommendation ? (
        <LlmRecommendationBlock
          recommendation={item.llmRecommendation}
          locale={locale}
          recommendationCopy={recommendationCopy}
        />
      ) : null}
      <dl className="m-0 grid gap-1.5 text-[0.9rem]">
        <MetricRow label={copy.estimated}>
          {formatCentsForDisplay(item.estimatedCostCents, locale)}
        </MetricRow>
        <MetricRow label={copy.cumulative}>
          {formatCentsForDisplay(item.cumulativeCostCents, locale)}
        </MetricRow>
        <MetricRow label={copy.cap}>
          {formatCentsForDisplay(item.maxCostCents, locale)}
        </MetricRow>
        <MetricRow label={copy.remaining}>
          {formatCentsForDisplay(item.remainingCents, locale)}
        </MetricRow>
        <MetricRow label={copy.providerTier}>
          {copy.providerTierOptions[item.providerTier]}
        </MetricRow>
        <MetricRow label={copy.providerLabel}>{item.resolvedLlmProviderLabel}</MetricRow>
        {item.projectionHintKey ? (
          <div className="mt-1 text-dim">
            {copy.projectionHints[item.projectionHintKey]}
          </div>
        ) : null}
      </dl>
    </>
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
  recommendationCopy,
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
        className="max-h-[90vh] w-[min(560px,95vw)] overflow-y-auto border-edge bg-panel text-fog sm:max-w-[560px]"
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

        {!loading && preview && !isBatch && !isBatchPreview(preview) ? (
          <>
            {preview.wouldExceed ? (
              <StatusAlert
                severity="warn"
                text={copy.wouldExceedWarning}
                className="mb-4 w-full"
              />
            ) : null}
            <BudgetMetrics
              item={preview}
              locale={locale}
              copy={copy}
              recommendationCopy={recommendationCopy}
            />
          </>
        ) : null}

        {!loading && preview && isBatch && isBatchPreview(preview) ? (
          <>
            {preview.wouldExceedAny ? (
              <StatusAlert
                severity="warn"
                text={copy.wouldExceedWarning}
                className="mb-4 w-full"
              />
            ) : null}
            <p className="mb-3 text-fog">
              {copy.aggregateEstimate.replace(
                "{amount}",
                formatCentsForDisplay(preview.aggregateEstimatedCostCents, locale),
              )}
            </p>
            {preview.blockedSlotIndexes.length > 0 ? (
              <p className="mb-3 text-[0.9rem] text-butter">
                {copy.blockedSlots.replace(
                  "{slots}",
                  preview.blockedSlotIndexes.map((i) => String(i + 1)).join(", "),
                )}
              </p>
            ) : null}
            {preview.items.map((item) => (
              <PreviewRow
                key={item.slotIndex}
                item={item}
                locale={locale}
                copy={copy}
                recommendationCopy={recommendationCopy}
              />
            ))}
          </>
        ) : null}

        {!loading && wouldExceedAny ? (
          <div className="mt-4">
            <Label
              htmlFor="budget-override-reason"
              className="mb-1.5 block font-semibold"
            >
              {copy.overrideReasonLabel}
            </Label>
            <Textarea
              id="budget-override-reason"
              value={overrideReason}
              onChange={(event) => onOverrideReasonChange(event.target.value)}
              rows={3}
              maxLength={OVERRIDE_REASON_MAX_LENGTH}
              disabled={pending}
              className="w-full"
            />
            {!overrideReasonValid ? (
              <p className="mt-1.5 text-sm text-dim">{copy.overrideReasonRequired}</p>
            ) : null}
          </div>
        ) : null}

        <DialogFooter className="flex-wrap gap-2">
          <Button type="button" variant="ghost" disabled={pending} onClick={onHide}>
            {copy.cancel}
          </Button>
          {wouldExceedAny ? (
            <Button
              type="button"
              variant="destructive"
              disabled={pending || loading || !overrideReasonValid || preview === null}
              onClick={onProceedAnyway}
            >
              {pending ? <Spinner className="size-4 text-current" /> : null}
              {copy.proceedAnyway}
            </Button>
          ) : (
            <Button
              type="button"
              disabled={pending || loading || preview === null || loadError !== null}
              onClick={onConfirm}
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
