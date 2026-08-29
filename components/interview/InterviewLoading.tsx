"use client";

import { Message } from "primereact/message";
import { ProgressSpinner } from "primereact/progressspinner";

type InterviewLoadingProps = {
  label: string;
};

export function InterviewLoading({ label }: InterviewLoadingProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1rem",
        padding: "3rem 1rem",
      }}
    >
      <ProgressSpinner aria-hidden />
      <p style={{ margin: 0, color: "#4b5563" }}>{label}</p>
    </div>
  );
}

type InterviewErrorStateProps = {
  title: string;
  message: string;
};

export function InterviewErrorState({ title, message }: InterviewErrorStateProps) {
  return (
    <div
      style={{
        maxWidth: 760,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
      }}
    >
      <h1 style={{ margin: 0, fontSize: "2rem" }}>{title}</h1>
      <Message severity="error" text={message} style={{ width: "100%" }} />
    </div>
  );
}
