"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SaveIcon } from "lucide-react";

import {
  mapReelMetricsError,
  type ReelMetricsErrorCopy,
} from "@/components/calendar/map-reel-metrics-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { StatusAlert } from "@/components/ui/status-alert";
import type { CalendarSlotDetailDto } from "@/lib/contracts/calendar";
import { REEL_METRICS_MAX_VALUE, type ReelMetricsDto } from "@/lib/contracts/reel-metrics";
import { upsertReelMetrics } from "@/lib/metrics/actions/upsert-reel-metrics";

export type ReelMetricsSectionCopy = {
  title: string;
  views: string;
  likes: string;
  comments: string;
  saves: string;
  dms: string;
  recordedAtLabel: string;
  save: string;
  savePending: string;
  success: string;
  editWindowExpired: string;
  errors: ReelMetricsErrorCopy;
};

type MetricField = "views" | "likes" | "comments" | "saves" | "dms";

type ReelMetricsSectionProps = {
  slot: CalendarSlotDetailDto;
  copy: ReelMetricsSectionCopy;
  locale: string;
  onSuccess?: (metrics: ReelMetricsDto) => void;
};

function defaultCounters(metrics: ReelMetricsDto | null | undefined): Record<MetricField, number | null> {
  return {
    views: metrics?.views ?? null,
    likes: metrics?.likes ?? null,
    comments: metrics?.comments ?? null,
    saves: metrics?.saves ?? null,
    dms: metrics?.dms ?? null,
  };
}

function formatRecordedAt(isoTimestamp: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(new Date(isoTimestamp));
  } catch {
    return isoTimestamp;
  }
}

export function ReelMetricsSection({
  slot,
  copy,
  locale,
  onSuccess,
}: ReelMetricsSectionProps) {
  const router = useRouter();
  const metrics = slot.metrics;
  const editable = metrics?.editable === true;

  const [values, setValues] = useState<Record<MetricField, number | null>>(() =>
    defaultCounters(metrics),
  );
  const [serverError, setServerError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setValues(defaultCounters(slot.metrics));
    setServerError(null);
    setFieldErrors({});
    setSuccessMessage(null);
  }, [slot.slotId, slot.metrics]);

  if (!slot.assembledReelId) {
    return null;
  }

  function updateField(field: MetricField, value: number | null) {
    setValues((current) => ({ ...current, [field]: value }));
    setSuccessMessage(null);
  }

  function handleSave() {
    if (pending || !editable || !slot.assembledReelId) {
      return;
    }

    setServerError(null);
    setFieldErrors({});
    setSuccessMessage(null);

    startTransition(async () => {
      const result = await upsertReelMetrics({
        assembledReelId: slot.assembledReelId!,
        views: values.views,
        likes: values.likes,
        comments: values.comments,
        saves: values.saves,
        dms: values.dms,
      });

      if (!result.ok) {
        const mapped = mapReelMetricsError(result.error, copy.errors);
        setServerError(mapped.message);
        setFieldErrors(mapped.fieldErrors);
        return;
      }

      setValues({
        views: result.metrics.views,
        likes: result.metrics.likes,
        comments: result.metrics.comments,
        saves: result.metrics.saves,
        dms: result.metrics.dms,
      });
      setSuccessMessage(copy.success);
      onSuccess?.(result.metrics);
      router.refresh();
    });
  }

  const fieldConfig: Array<{ field: MetricField; label: string }> = [
    { field: "views", label: copy.views },
    { field: "likes", label: copy.likes },
    { field: "comments", label: copy.comments },
    { field: "saves", label: copy.saves },
    { field: "dms", label: copy.dms },
  ];

  return (
    <div
      className="grid gap-3 pt-1 border-t border-edge"
    >
      <div className="font-display text-lg font-semibold text-fog">{copy.title}</div>

      {metrics?.recordedAt ? (
        <div className="text-[0.8125rem] text-dim">
          {copy.recordedAtLabel}: {formatRecordedAt(metrics.recordedAt, locale)}
        </div>
      ) : null}

      {!editable ? (
        <StatusAlert severity="info" text={copy.editWindowExpired} className="w-full" />
      ) : null}

      {serverError ? (
        <StatusAlert severity="error" text={serverError} className="w-full" />
      ) : null}

      {successMessage ? (
        <StatusAlert severity="success" text={successMessage} className="w-full" />
      ) : null}

      {fieldConfig.map(({ field, label }) => (
        <div key={field}>
          <Label
            htmlFor={`reel-metrics-${field}`}
            className="mb-2 block text-sm font-semibold"
          >
            {label}
          </Label>
          <Input
            id={`reel-metrics-${field}`}
            type="number"
            inputMode="numeric"
            step={1}
            value={values[field] ?? ""}
            onChange={(event) => {
              const raw = event.target.value;
              if (raw === "") {
                updateField(field, null);
                return;
              }
              const parsed = Math.trunc(Number(raw));
              if (Number.isNaN(parsed)) {
                return;
              }
              updateField(
                field,
                Math.min(REEL_METRICS_MAX_VALUE, Math.max(0, parsed)),
              );
            }}
            min={0}
            max={REEL_METRICS_MAX_VALUE}
            disabled={pending || !editable}
            aria-invalid={Boolean(fieldErrors[field])}
            className="w-full"
          />
          {fieldErrors[field] ? (
            <small className="text-rose block mt-[0.35rem]">
              {fieldErrors[field]}
            </small>
          ) : null}
        </div>
      ))}

      {editable ? (
        <Button
          type="button"
          disabled={pending}
          className="w-full"
          onClick={handleSave}
        >
          {pending ? <Spinner className="size-4 text-current" /> : <SaveIcon />}
          {pending ? copy.savePending : copy.save}
        </Button>
      ) : null}
    </div>
  );
}
