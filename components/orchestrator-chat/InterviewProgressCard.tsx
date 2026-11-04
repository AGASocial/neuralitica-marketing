"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type InterviewProgressCardCopy = {
  title: string;
  progress: string;
  completed: string;
  readyToSubmit: string;
  listHint: string;
  textHint: string;
};

type InterviewProgressCardProps = {
  progressLabel: string;
  stepLabel: string;
  question: string;
  helper: string;
  status: "not_started" | "in_progress" | "completed";
  canSubmit: boolean;
  answerKind: "list" | "text";
  copy: InterviewProgressCardCopy;
};

export function InterviewProgressCard({
  progressLabel,
  stepLabel,
  question,
  helper,
  status,
  canSubmit,
  answerKind,
  copy,
}: InterviewProgressCardProps) {
  return (
    <Card className="border-edge bg-panel text-fog shadow-none">
      <CardHeader className="gap-1 px-4 pb-0 pt-4">
        <CardTitle className="font-display text-lg text-fog">{copy.title}</CardTitle>
        <CardDescription className="text-dim">
          {copy.progress.replace("{progress}", progressLabel)} · {stepLabel}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 px-4 py-3 text-sm text-dim">
        {status === "completed" ? (
          <p className="text-fog/90">{copy.completed}</p>
        ) : (
          <>
            <p className="text-fog/90">{question}</p>
            <p>{helper}</p>
            <p>{answerKind === "list" ? copy.listHint : copy.textHint}</p>
            {canSubmit ? (
              <p className="text-butter">{copy.readyToSubmit}</p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
