"use client";

import { Spinner } from "@/components/ui/spinner";

type ScriptsLoadingProps = {
  label: string;
};

export function ScriptsLoading({ label }: ScriptsLoadingProps) {
  return (
    <div
      className="flex min-h-[240px] flex-col items-center justify-center gap-4 text-dim"
      aria-busy="true"
      aria-live="polite"
    >
      <Spinner className="size-12" />
      <span>{label}</span>
    </div>
  );
}
