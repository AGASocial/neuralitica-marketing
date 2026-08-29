"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "primereact/button";
import { Calendar } from "primereact/calendar";
import { Column } from "primereact/column";
import { DataTable } from "primereact/datatable";
import { Dialog } from "primereact/dialog";
import { Message } from "primereact/message";
import { Toast } from "primereact/toast";

import type {
  TrendErrorCode,
  TrendWeekListForOperatorResult,
  TrendWeekListItem,
} from "@/lib/contracts/trend";
import { normalizeToIsoMonday, formatWeekRange } from "@/lib/trend/normalize-week-start";
import { publishOrUpdateSnapshot } from "@/lib/trend/publish-or-update-snapshot";

type TrendWeekListCopy = {
  title: string;
  subtitle: string;
  publish: string;
  publishDialogTitle: string;
  publishDialogHint: string;
  publishDialogWeekLabel: string;
  publishDialogSubmit: string;
  publishDialogCancel: string;
  publishing: string;
  empty: string;
  loadError: string;
  backDashboard: string;
  toastPublishSuccess: string;
  columns: {
    weekStart: string;
    entryCount: string;
    activeEntryCount: string;
    publishedAt: string;
    updatedAt: string;
    actions: string;
  };
  manage: string;
  errors: {
    validation: string;
    forbiddenFields: string;
    notFound: string;
    duplicateSlug: string;
    weekStartMismatch: string;
    notMonday: string;
    unauthenticated: string;
    forbidden: string;
    internal: string;
  };
};

type TrendWeekListViewProps = {
  result: TrendWeekListForOperatorResult;
  locale: string;
  copy: TrendWeekListCopy;
};

function formatDate(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function TrendWeekListView({
  result,
  locale,
  copy,
}: TrendWeekListViewProps) {
  const router = useRouter();
  const toastRef = useRef<Toast>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [pickedDate, setPickedDate] = useState<Date | null>(null);
  const [pending, setPending] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  function messageForCode(code: TrendErrorCode, messageKey?: string): string {
    if (messageKey === "trend.errors.notMonday") {
      return copy.errors.notMonday;
    }
    switch (code) {
      case "VALIDATION_ERROR":
        return copy.errors.validation;
      case "FORBIDDEN_FIELDS":
        return copy.errors.forbiddenFields;
      case "NOT_FOUND":
        return copy.errors.notFound;
      case "DUPLICATE_SLUG":
        return copy.errors.duplicateSlug;
      case "WEEK_START_MISMATCH":
        return copy.errors.weekStartMismatch;
      case "UNAUTHENTICATED":
        return copy.errors.unauthenticated;
      case "FORBIDDEN":
        return copy.errors.forbidden;
      default:
        return copy.errors.internal;
    }
  }

  async function handlePublish() {
    if (!pickedDate || pending) {
      return;
    }

    setPending(true);
    setBanner(null);

    const weekStart = normalizeToIsoMonday(pickedDate);

    try {
      const result = await publishOrUpdateSnapshot({ weekStart });

      if (result.ok) {
        toastRef.current?.show({
          severity: "success",
          summary: copy.toastPublishSuccess,
          life: 4000,
        });
        setPublishOpen(false);
        setPickedDate(null);
        router.push(`/operator/trends/${result.weekStart}`);
        router.refresh();
        return;
      }

      setBanner(messageForCode(result.error.code, result.error.messageKey));
    } catch {
      setBanner(copy.errors.internal);
    } finally {
      setPending(false);
    }
  }

  if (!result.ok) {
    return (
      <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
        <PageHeader copy={copy} onPublish={() => setPublishOpen(true)} />
        <Message severity="error" text={copy.loadError} style={{ width: "100%" }} />
        <Button
          type="button"
          label={copy.backDashboard}
          className="p-button-text"
          style={{ marginTop: "1rem" }}
          onClick={() => router.push("/dashboard")}
        />
      </div>
    );
  }

  const weeks = result.weeks;
  const normalizedWeekStart = pickedDate
    ? normalizeToIsoMonday(pickedDate)
    : null;

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
      <Toast ref={toastRef} />
      <PageHeader copy={copy} onPublish={() => setPublishOpen(true)} />

      {weeks.length === 0 ? (
        <Message severity="info" text={copy.empty} style={{ width: "100%" }} />
      ) : (
        <DataTable value={weeks} stripedRows emptyMessage={copy.empty}>
          <Column
            header={copy.columns.weekStart}
            body={(row: TrendWeekListItem) =>
              formatWeekRange(row.weekStart, locale)
            }
          />
          <Column field="entryCount" header={copy.columns.entryCount} />
          <Column field="activeEntryCount" header={copy.columns.activeEntryCount} />
          <Column
            header={copy.columns.publishedAt}
            body={(row: TrendWeekListItem) =>
              formatDate(row.publishedAt, locale)
            }
          />
          <Column
            header={copy.columns.updatedAt}
            body={(row: TrendWeekListItem) => formatDate(row.updatedAt, locale)}
          />
          <Column
            header={copy.columns.actions}
            body={(row: TrendWeekListItem) => (
              <Link href={`/operator/trends/${row.weekStart}`}>
                <Button type="button" label={copy.manage} size="small" />
              </Link>
            )}
          />
        </DataTable>
      )}

      <Dialog
        header={copy.publishDialogTitle}
        visible={publishOpen}
        style={{ width: "min(100%, 28rem)" }}
        onHide={() => {
          if (!pending) {
            setPublishOpen(false);
            setBanner(null);
          }
        }}
        footer={
          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
            <Button
              type="button"
              label={copy.publishDialogCancel}
              severity="secondary"
              outlined
              disabled={pending}
              onClick={() => {
                setPublishOpen(false);
                setBanner(null);
              }}
            />
            <Button
              type="button"
              label={copy.publishDialogSubmit}
              loading={pending}
              disabled={!pickedDate}
              onClick={() => void handlePublish()}
            />
          </div>
        }
      >
        <p style={{ margin: "0 0 1rem", color: "#4b5563" }}>{copy.publishDialogHint}</p>
        <label htmlFor="trend-week-picker" style={{ display: "block", fontWeight: 600 }}>
          {copy.publishDialogWeekLabel}
        </label>
        <Calendar
          inputId="trend-week-picker"
          value={pickedDate}
          onChange={(event) => setPickedDate(event.value ?? null)}
          dateFormat="yy-mm-dd"
          showIcon
          disabled={pending}
          style={{ width: "100%", marginTop: "0.5rem" }}
        />
        {normalizedWeekStart ? (
          <p style={{ margin: "0.75rem 0 0", color: "#6b7280", fontSize: "0.9rem" }}>
            {formatWeekRange(normalizedWeekStart, locale)}
          </p>
        ) : null}
        {banner ? (
          <Message severity="error" text={banner} style={{ width: "100%", marginTop: "1rem" }} />
        ) : null}
      </Dialog>
    </div>
  );
}

function PageHeader({
  copy,
  onPublish,
}: {
  copy: TrendWeekListCopy;
  onPublish: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: "1rem",
        marginBottom: "1.5rem",
        flexWrap: "wrap",
      }}
    >
      <div>
        <h1 style={{ margin: "0 0 0.5rem", fontSize: "2rem" }}>{copy.title}</h1>
        <p style={{ margin: 0, color: "#4b5563" }}>{copy.subtitle}</p>
      </div>
      <Button
        type="button"
        label={copy.publish}
        icon="pi pi-calendar-plus"
        onClick={onPublish}
      />
    </div>
  );
}
