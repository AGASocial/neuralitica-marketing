"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "primereact/button";
import { Calendar } from "primereact/calendar";
import { Dialog } from "primereact/dialog";
import { InputText } from "primereact/inputtext";
import { Message } from "primereact/message";

import {
  mapMarkPublishedError,
  type MarkPublishedErrorCopy,
} from "@/components/calendar/map-mark-published-error";
import type { CalendarSlotDetailDto } from "@/lib/contracts/calendar";
import { markCalendarSlotPublished } from "@/lib/calendar/actions/mark-calendar-slot-published";

export type MarkPublishedDialogCopy = {
  dialogTitle: string;
  dialogTitleUpdate: string;
  publishedDateLabel: string;
  instagramUrlLabel: string;
  instagramUrlHint: string;
  submit: string;
  submitPending: string;
  cancel: string;
  errors: MarkPublishedErrorCopy;
};

type MarkPublishedDialogProps = {
  visible: boolean;
  slot: CalendarSlotDetailDto;
  isUpdate: boolean;
  copy: MarkPublishedDialogCopy;
  onHide: () => void;
  onSuccess: (slot: CalendarSlotDetailDto) => void;
};

function localTodayDate(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function publishedAtDtoToDate(publishedAt: string | null): Date {
  if (publishedAt) {
    const dateOnly = publishedAt.slice(0, 10);
    const [year, month, day] = dateOnly.split("-").map(Number);
    if (year && month && day) {
      return new Date(year, month - 1, day);
    }
  }
  return localTodayDate();
}

export function MarkPublishedDialog({
  visible,
  slot,
  isUpdate,
  copy,
  onHide,
  onSuccess,
}: MarkPublishedDialogProps) {
  const [publishedDate, setPublishedDate] = useState<Date>(localTodayDate());
  const [instagramPostUrl, setInstagramPostUrl] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!visible) {
      return;
    }
    setPublishedDate(publishedAtDtoToDate(slot.publishedAt));
    setInstagramPostUrl(slot.instagramPostUrl ?? "");
    setServerError(null);
    setFieldErrors({});
  }, [visible, slot.publishedAt, slot.instagramPostUrl, slot.slotId]);

  function handleHide() {
    if (pending) {
      return;
    }
    onHide();
  }

  function handleSubmit() {
    if (pending) {
      return;
    }

    setServerError(null);
    setFieldErrors({});

    if (!publishedDate) {
      setFieldErrors({ publishedAt: copy.errors.validation });
      return;
    }

    startTransition(async () => {
      const result = await markCalendarSlotPublished({
        slotId: slot.slotId,
        publishedAt: toDateInputValue(publishedDate),
        instagramPostUrl,
      });

      if (!result.ok) {
        const mapped = mapMarkPublishedError(result.error, copy.errors);
        setServerError(mapped.message);
        setFieldErrors(mapped.fieldErrors);
        return;
      }

      onSuccess(result.slot);
    });
  }

  const dialogTitle = isUpdate ? copy.dialogTitleUpdate : copy.dialogTitle;

  return (
    <Dialog
      visible={visible}
      header={dialogTitle}
      onHide={handleHide}
      style={{ width: "min(420px, 100vw)" }}
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
          <Button
            type="button"
            label={copy.cancel}
            className="p-button-text"
            disabled={pending}
            onClick={handleHide}
          />
          <Button
            type="button"
            label={pending ? copy.submitPending : copy.submit}
            icon={pending ? "pi pi-spin pi-spinner" : undefined}
            disabled={pending}
            onClick={handleSubmit}
          />
        </div>
      }
    >
      <div style={{ display: "grid", gap: "1rem" }}>
        {serverError ? (
          <Message severity="error" text={serverError} style={{ width: "100%" }} />
        ) : null}

        <div>
          <label
            htmlFor="mark-published-date"
            style={{ display: "block", fontWeight: 600, marginBottom: "0.5rem" }}
          >
            {copy.publishedDateLabel}
          </label>
          <Calendar
            inputId="mark-published-date"
            value={publishedDate}
            onChange={(event) => {
              if (event.value instanceof Date) {
                setPublishedDate(event.value);
              }
            }}
            dateFormat="yy-mm-dd"
            showIcon
            disabled={pending}
            style={{ width: "100%" }}
            invalid={Boolean(fieldErrors.publishedAt)}
          />
          {fieldErrors.publishedAt ? (
            <small style={{ color: "#dc2626", display: "block", marginTop: "0.35rem" }}>
              {fieldErrors.publishedAt}
            </small>
          ) : null}
        </div>

        <div>
          <label
            htmlFor="mark-published-ig-url"
            style={{ display: "block", fontWeight: 600, marginBottom: "0.5rem" }}
          >
            {copy.instagramUrlLabel}
          </label>
          <InputText
            id="mark-published-ig-url"
            value={instagramPostUrl}
            onChange={(event) => setInstagramPostUrl(event.target.value)}
            placeholder={copy.instagramUrlHint}
            disabled={pending}
            style={{ width: "100%" }}
            invalid={Boolean(fieldErrors.instagramPostUrl)}
          />
          {fieldErrors.instagramPostUrl ? (
            <small style={{ color: "#dc2626", display: "block", marginTop: "0.35rem" }}>
              {fieldErrors.instagramPostUrl}
            </small>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}
