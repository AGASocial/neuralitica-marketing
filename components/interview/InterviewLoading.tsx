"use client";

import { Spinner } from "@/components/ui/spinner";
import { StatusAlert } from "@/components/ui/status-alert";

type InterviewLoadingProps = {
  label: string;
};

export function InterviewLoading({ label }: InterviewLoadingProps) {
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

type InterviewErrorStateProps = {
  title: string;
  message: string;
};

export function InterviewErrorState({ title, message }: InterviewErrorStateProps) {
  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-4">
      <h1 className="m-0 font-display text-4xl text-fog">{title}</h1>
      <StatusAlert severity="error" text={message} className="w-full" />
    </div>
  );
}
