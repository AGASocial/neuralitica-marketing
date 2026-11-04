"use client";

import { Skeleton } from "@/components/ui/skeleton";

type CalendarLoadingProps = {
  label: string;
};

export function CalendarLoading({ label }: CalendarLoadingProps) {
  return (
    <div
      className="mx-auto flex min-h-60 w-full max-w-5xl flex-col justify-center gap-4 text-dim"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="text-sm">{label}</span>
      <Skeleton className="h-10 w-2/3 bg-panel" />
      <Skeleton className="h-24 w-full bg-panel" />
      <Skeleton className="h-40 w-full bg-panel" />
    </div>
  );
}
