"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarIcon, CalendarPlusIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { StatusAlert } from "@/components/ui/status-alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

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
        toast.success(copy.toastPublishSuccess, { duration: 4000 });
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

  const weeks = result.ok ? result.weeks : [];
  const normalizedWeekStart = pickedDate
    ? normalizeToIsoMonday(pickedDate)
    : null;

  function closePublishDialog() {
    setPublishOpen(false);
    setBanner(null);
  }

  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHeader copy={copy} onPublish={() => setPublishOpen(true)} />

      {!result.ok ? (
        <>
          <StatusAlert severity="error" text={copy.loadError} className="w-full" />
          <Button
            type="button"
            variant="ghost"
            className="mt-4"
            onClick={() => router.push("/dashboard")}
          >
            {copy.backDashboard}
          </Button>
        </>
      ) : weeks.length === 0 ? (
        <StatusAlert severity="info" text={copy.empty} className="w-full" />
      ) : (
        <div className="rounded-xl border border-edge bg-panel">
          <Table>
            <TableHeader>
              <TableRow className="border-edge hover:bg-transparent">
                <TableHead className="px-4 font-semibold text-dim">
                  {copy.columns.weekStart}
                </TableHead>
                <TableHead className="px-4 font-semibold text-dim">
                  {copy.columns.entryCount}
                </TableHead>
                <TableHead className="px-4 font-semibold text-dim">
                  {copy.columns.activeEntryCount}
                </TableHead>
                <TableHead className="px-4 font-semibold text-dim">
                  {copy.columns.publishedAt}
                </TableHead>
                <TableHead className="px-4 font-semibold text-dim">
                  {copy.columns.updatedAt}
                </TableHead>
                <TableHead className="px-4 font-semibold text-dim">
                  {copy.columns.actions}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {weeks.map((row: TrendWeekListItem) => (
                <TableRow
                  key={row.weekStart}
                  className="border-edge hover:bg-edge/20"
                >
                  <TableCell className="px-4 py-3 text-fog">
                    {formatWeekRange(row.weekStart, locale)}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-fog">{row.entryCount}</TableCell>
                  <TableCell className="px-4 py-3 text-fog">
                    {row.activeEntryCount}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-fog">
                    {formatDate(row.publishedAt, locale)}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-fog">
                    {formatDate(row.updatedAt, locale)}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <Button asChild size="sm">
                      <Link href={`/operator/trends/${row.weekStart}`}>
                        {copy.manage}
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog
        open={publishOpen}
        onOpenChange={(open) => {
          if (!open && !pending) {
            closePublishDialog();
          }
        }}
      >
        <DialogContent
          className="w-[min(100%,28rem)] border-edge bg-panel text-fog sm:max-w-md"
          showCloseButton={!pending}
          aria-describedby={undefined}
          onInteractOutside={(event) => {
            if (pending) {
              event.preventDefault();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">
              {copy.publishDialogTitle}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <p className="text-dim">{copy.publishDialogHint}</p>
            <div>
              <Label htmlFor="trend-week-picker" className="mb-2 block font-semibold">
                {copy.publishDialogWeekLabel}
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    id="trend-week-picker"
                    type="button"
                    variant="outline"
                    disabled={pending}
                    className="w-full justify-between font-normal"
                  >
                    {pickedDate ? toDateInputValue(pickedDate) : ""}
                    <CalendarIcon />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto border-edge bg-panel p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={pickedDate ?? undefined}
                    defaultMonth={pickedDate ?? undefined}
                    onSelect={(date) => setPickedDate(date instanceof Date ? date : null)}
                  />
                </PopoverContent>
              </Popover>
            </div>
            {normalizedWeekStart ? (
              <p className="text-[0.9rem] text-dim">
                {formatWeekRange(normalizedWeekStart, locale)}
              </p>
            ) : null}
            {banner ? (
              <StatusAlert severity="error" text={banner} className="w-full" />
            ) : null}
          </div>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={closePublishDialog}
            >
              {copy.publishDialogCancel}
            </Button>
            <Button
              type="button"
              disabled={!pickedDate || pending}
              onClick={() => void handlePublish()}
            >
              {pending ? <Spinner className="size-4 text-current" /> : null}
              {copy.publishDialogSubmit}
            </Button>
          </DialogFooter>
        </DialogContent>
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
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="mb-2 font-display text-4xl text-fog">{copy.title}</h1>
        <p className="text-dim">{copy.subtitle}</p>
      </div>
      <Button type="button" onClick={onPublish}>
        <CalendarPlusIcon />
        {copy.publish}
      </Button>
    </div>
  );
}
