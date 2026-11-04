"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { StatusAlert } from "@/components/ui/status-alert";
import type { InterviewAnswers, InterviewStepKey } from "@/lib/contracts/interview";

import {
  INTERVIEW_STEP_ORDER,
  getDescription,
  getListItems,
  isTextStep,
} from "./step-helpers";

type InterviewCompletedCopy = {
  title: string;
  completedTitle: string;
  completedBody: string;
  none: string;
  backToDashboard: string;
  viewProfile: string;
  steps: Record<
    InterviewStepKey,
    {
      label: string;
    }
  >;
};

type InterviewCompletedViewProps = {
  answers: InterviewAnswers;
  copy: InterviewCompletedCopy;
  banner?: string;
};

export function InterviewCompletedView({
  answers,
  copy,
  banner,
}: InterviewCompletedViewProps) {
  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-5">
      <div>
        <h1 className="mb-2 font-display text-4xl text-fog">{copy.title}</h1>
        <p className="text-dim">{copy.completedTitle}</p>
      </div>

      {banner ? (
        <StatusAlert severity="warn" text={banner} className="w-full" />
      ) : null}

      <StatusAlert severity="info" text={copy.completedBody} className="w-full" />

      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/profile">{copy.viewProfile}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/dashboard">{copy.backToDashboard}</Link>
        </Button>
      </div>

      {INTERVIEW_STEP_ORDER.map((step) => (
        <section
          key={step}
          className="rounded-xl border border-edge bg-panel px-5 py-4"
        >
          <h2 className="mb-3 font-display text-xl text-fog">
            {copy.steps[step].label}
          </h2>
          {isTextStep(step) ? (
            <p className="whitespace-pre-wrap text-fog">
              {getDescription(answers, step) || copy.none}
            </p>
          ) : (
            <CompletedList
              items={getListItems(answers, step)}
              noneLabel={copy.none}
            />
          )}
        </section>
      ))}
    </div>
  );
}

function CompletedList({
  items,
  noneLabel,
}: {
  items: string[];
  noneLabel: string;
}) {
  if (items.length === 0) {
    return <p className="text-fog">{noneLabel}</p>;
  }

  return (
    <ul className="list-disc pl-5 text-fog">
      {items.map((item, index) => (
        <li key={`${index}-${item}`}>{item}</li>
      ))}
    </ul>
  );
}
