"use client";

import { useEffect, useState, useTransition } from "react";
import { CalendarIcon } from "lucide-react";

import {
  mapMarkPublishedError,
  type MarkPublishedErrorCopy,
} from "@/components/calendar/map-mark-published-error";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { StatusAlert } from "@/components/ui/status-alert";

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
      open={visible}
      onOpenChange={(open) => {
        if (!open) {
          handleHide();
        }
      }}
    >
      <DialogContent
        className="w-[min(420px,100vw)] border-edge bg-panel text-fog sm:max-w-[420px]"
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">{dialogTitle}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          {serverError ? (
            <StatusAlert severity="error" text={serverError} className="w-full" />
          ) : null}

          <div>
            <Label htmlFor="mark-published-date" className="mb-2 block font-semibold">
              {copy.publishedDateLabel}
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  id="mark-published-date"
                  type="button"
                  variant="outline"
                  disabled={pending}
                  aria-invalid={Boolean(fieldErrors.publishedAt)}
                  className="w-full justify-between font-normal"
                >
                  {toDateInputValue(publishedDate)}
                  <CalendarIcon />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto border-edge bg-panel p-0" align="start">
                <Calendar
                  mode="single"
                  selected={publishedDate}
                  defaultMonth={publishedDate}
                  onSelect={(date) => {
                    if (date instanceof Date) {
                      setPublishedDate(date);
                    }
                  }}
                />
              </PopoverContent>
            </Popover>
            {fieldErrors.publishedAt ? (
              <small className="mt-[0.35rem] block text-rose">
                {fieldErrors.publishedAt}
              </small>
            ) : null}
          </div>

          <div>
            <Label htmlFor="mark-published-ig-url" className="mb-2 block font-semibold">
              {copy.instagramUrlLabel}
            </Label>
            <Input
              id="mark-published-ig-url"
              value={instagramPostUrl}
              onChange={(event) => setInstagramPostUrl(event.target.value)}
              placeholder={copy.instagramUrlHint}
              disabled={pending}
              aria-invalid={Boolean(fieldErrors.instagramPostUrl)}
              className="w-full"
            />
            {fieldErrors.instagramPostUrl ? (
              <small className="mt-[0.35rem] block text-rose">
                {fieldErrors.instagramPostUrl}
              </small>
            ) : null}
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" disabled={pending} onClick={handleHide}>
            {copy.cancel}
          </Button>
          <Button type="button" disabled={pending} onClick={handleSubmit}>
            {pending ? <Spinner className="size-4 text-current" /> : null}
            {pending ? copy.submitPending : copy.submit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
