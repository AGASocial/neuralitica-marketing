"use client";

import Link from "next/link";
import { Button } from "primereact/button";
import { Message } from "primereact/message";

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
    <div
      style={{
        maxWidth: 760,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: "1.25rem",
      }}
    >
      <div>
        <h1 style={{ margin: "0 0 0.5rem", fontSize: "2rem" }}>{copy.title}</h1>
        <p style={{ margin: 0, color: "#4b5563" }}>{copy.completedTitle}</p>
      </div>

      {banner ? (
        <Message severity="warn" text={banner} style={{ width: "100%" }} />
      ) : null}

      <Message
        severity="info"
        text={copy.completedBody}
        style={{ width: "100%" }}
      />

      <div
        style={{
          display: "flex",
          gap: "0.75rem",
          flexWrap: "wrap",
        }}
      >
        <Link href="/profile" style={{ textDecoration: "none" }}>
          <Button type="button" label={copy.viewProfile} />
        </Link>
        <Link href="/dashboard" style={{ textDecoration: "none" }}>
          <Button
            type="button"
            label={copy.backToDashboard}
            severity="secondary"
            outlined
          />
        </Link>
      </div>

      {INTERVIEW_STEP_ORDER.map((step) => (
        <section
          key={step}
          style={{
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
            padding: "1rem 1.25rem",
          }}
        >
          <h2 style={{ margin: "0 0 0.75rem", fontSize: "1.1rem" }}>
            {copy.steps[step].label}
          </h2>
          {isTextStep(step) ? (
            <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>
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
    return <p style={{ margin: 0 }}>{noneLabel}</p>;
  }

  return (
    <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
      {items.map((item, index) => (
        <li key={`${index}-${item}`}>{item}</li>
      ))}
    </ul>
  );
}
