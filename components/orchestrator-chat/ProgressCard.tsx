"use client";

import { AgentCard } from "@/components/agent-cards/AgentCard";
import { parseAgentCard } from "@/lib/agent-cards";

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
  const actions =
    nextStepKey === "interview"
      ? [
          {
            id: "open_interview",
            label: copy.openInterview,
            role: "primary" as const,
            href: interviewHref,
          },
        ]
      : nextStepKey === "ready"
        ? [
            {
              id: "open_ready",
              label: copy.openReady,
              role: "primary" as const,
              href: "/ready-to-publish",
            },
          ]
        : [];

  const card = parseAgentCard({
    type: "progress",
    title: copy.title,
    summary: `${copy.nextLabel}: ${nextStepHint}`,
    props: {
      steps: steps.map((step) => ({
        key: step.key,
        label: stepLabel(step.key, copy),
        status: step.status,
        statusLabel: statusLabel(step.status, copy),
      })),
      nextStepHint,
    },
    actions,
  });

  return <AgentCard card={card} />;
}
