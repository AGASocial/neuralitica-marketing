"use client";

import { Spinner } from "@/components/ui/spinner";

type PlaybookLoadingProps = {
  label: string;
};

export function PlaybookLoading({ label }: PlaybookLoadingProps) {
  return (
    <div
      className="flex min-h-60 flex-col items-center justify-center gap-4 text-dim"
      aria-busy="true"
      aria-live="polite"
    >
      <Spinner className="size-12" />
      <span>{label}</span>
    </div>
  );
}
