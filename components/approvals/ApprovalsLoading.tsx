"use client";

import Link from "next/link";

import { StatusAlert } from "@/components/ui/status-alert";
import { Spinner } from "@/components/ui/spinner";

type ApprovalsLoadingProps = {
  label: string;
};

export function ApprovalsLoading({ label }: ApprovalsLoadingProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center gap-4 px-4 py-12"
    >
      <Spinner className="size-12" />
      <p className="m-0 text-dim">{label}</p>
    </div>
  );
}

type ApprovalsErrorStateProps = {
  title: string;
  message: string;
  backHref: string;
  backLabel: string;
};

export function ApprovalsErrorState({
  title,
  message,
  backHref,
  backLabel,
}: ApprovalsErrorStateProps) {
  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-4">
      <Link href={backHref} className="text-sm text-dim no-underline hover:text-fog">
        ← {backLabel}
      </Link>
      <h1 className="m-0 font-display text-3xl text-fog">{title}</h1>
      <StatusAlert severity="error" text={message} className="w-full" />
    </div>
  );
}
