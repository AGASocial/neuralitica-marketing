"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "primereact/button";
import { InputNumber } from "primereact/inputnumber";
import { Message } from "primereact/message";

import {
  mapReelMetricsError,
  type ReelMetricsErrorCopy,
} from "@/components/calendar/map-reel-metrics-error";
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
      style={{
        display: "grid",
        gap: "0.75rem",
        paddingTop: "0.25rem",
        borderTop: "1px solid #e5e7eb",
      }}
    >
      <div style={{ fontWeight: 600, fontSize: "0.9375rem" }}>{copy.title}</div>

      {metrics?.recordedAt ? (
        <div style={{ fontSize: "0.8125rem", color: "#6b7280" }}>
          {copy.recordedAtLabel}: {formatRecordedAt(metrics.recordedAt, locale)}
        </div>
      ) : null}

      {!editable ? (
        <Message severity="info" text={copy.editWindowExpired} style={{ width: "100%" }} />
      ) : null}

      {serverError ? (
        <Message severity="error" text={serverError} style={{ width: "100%" }} />
      ) : null}

      {successMessage ? (
        <Message severity="success" text={successMessage} style={{ width: "100%" }} />
      ) : null}

      {fieldConfig.map(({ field, label }) => (
        <div key={field}>
          <label
            htmlFor={`reel-metrics-${field}`}
            style={{ display: "block", fontWeight: 600, marginBottom: "0.5rem", fontSize: "0.875rem" }}
          >
            {label}
          </label>
          <InputNumber
            inputId={`reel-metrics-${field}`}
            value={values[field]}
            onValueChange={(event) => updateField(field, event.value ?? null)}
            useGrouping={false}
            min={0}
            max={REEL_METRICS_MAX_VALUE}
            disabled={pending || !editable}
            style={{ width: "100%" }}
            inputStyle={{ width: "100%" }}
            invalid={Boolean(fieldErrors[field])}
          />
          {fieldErrors[field] ? (
            <small style={{ color: "#dc2626", display: "block", marginTop: "0.35rem" }}>
              {fieldErrors[field]}
            </small>
          ) : null}
        </div>
      ))}

      {editable ? (
        <Button
          type="button"
          label={pending ? copy.savePending : copy.save}
          icon={pending ? "pi pi-spin pi-spinner" : "pi pi-save"}
          disabled={pending}
          style={{ width: "100%" }}
          onClick={handleSave}
        />
      ) : null}
    </div>
  );
}
