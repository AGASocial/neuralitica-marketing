"use client";

import Link from "next/link";
import { Message } from "primereact/message";
import { ProgressSpinner } from "primereact/progressspinner";

type ApprovalsLoadingProps = {
  label: string;
};

export function ApprovalsLoading({ label }: ApprovalsLoadingProps) {
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
    <div
      style={{
        maxWidth: 640,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
      }}
    >
      <Link
        href={backHref}
        style={{ color: "#4b5563", textDecoration: "none", fontSize: "0.9rem" }}
      >
        ← {backLabel}
      </Link>
      <h1 style={{ margin: 0, fontSize: "1.75rem" }}>{title}</h1>
      <Message severity="error" text={message} style={{ width: "100%" }} />
    </div>
  );
}
