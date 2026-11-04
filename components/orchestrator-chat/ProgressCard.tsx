"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type ProgressCardCopy = {
  title: string;
  nextLabel: string;
  openInterview: string;
  openReady: string;
  stepInterview: string;
  stepPlan: string;
  stepScripts: string;
  stepVideos: string;
  stepApprove: string;
  stepReady: string;
  statusTodo: string;
  statusCurrent: string;
  statusDone: string;
};

type Step = {
  key: string;
  status: "todo" | "current" | "done";
};

type ProgressCardProps = {
  steps: Step[];
  nextStepHint: string;
  interviewHref: string;
  nextStepKey: string;
  copy: ProgressCardCopy;
};

function stepLabel(key: string, copy: ProgressCardCopy): string {
  switch (key) {
    case "interview":
      return copy.stepInterview;
    case "plan":
      return copy.stepPlan;
    case "scripts":
      return copy.stepScripts;
    case "videos":
      return copy.stepVideos;
    case "approve":
      return copy.stepApprove;
    case "ready":
      return copy.stepReady;
    default:
      return key;
  }
}

function statusLabel(
  status: Step["status"],
  copy: ProgressCardCopy,
): string {
  if (status === "done") return copy.statusDone;
  if (status === "current") return copy.statusCurrent;
  return copy.statusTodo;
}

export function ProgressCard({
  steps,
  nextStepHint,
  interviewHref,
  nextStepKey,
  copy,
}: ProgressCardProps) {
  return (
    <Card className="border-edge bg-panel text-fog shadow-none">
      <CardHeader className="gap-1 px-4 pb-0 pt-4">
        <CardTitle className="font-display text-lg text-fog">{copy.title}</CardTitle>
        <CardDescription className="text-dim">
          {copy.nextLabel}: {nextStepHint}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 px-4 py-3 text-sm">
        <ol className="space-y-1.5">
          {steps.map((step) => (
            <li
              key={step.key}
              className={
                step.status === "current"
                  ? "text-butter"
                  : step.status === "done"
                    ? "text-fog/80"
                    : "text-dim"
              }
            >
              {stepLabel(step.key, copy)} — {statusLabel(step.status, copy)}
            </li>
          ))}
        </ol>
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2 px-4 pb-4">
        {nextStepKey === "interview" ? (
          <Button asChild className="bg-butter text-deep hover:bg-butter/90">
            <Link href={interviewHref}>{copy.openInterview}</Link>
          </Button>
        ) : null}
        {nextStepKey === "ready" ? (
          <Button asChild variant="outline" className="border-edge">
            <Link href="/ready-to-publish">{copy.openReady}</Link>
          </Button>
        ) : null}
      </CardFooter>
    </Card>
  );
}
