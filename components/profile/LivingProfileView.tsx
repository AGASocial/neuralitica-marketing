"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Button } from "primereact/button";
import { Message } from "primereact/message";

import {
  INTERVIEW_STEP_ORDER,
  getDescription,
  getListItems,
  isTextStep,
} from "@/components/interview/step-helpers";
import type { InterviewStepKey } from "@/lib/contracts/interview";
import type {
  BusinessProfileFields,
  BusinessProfileForClientResult,
} from "@/lib/contracts/profile";

type LivingProfileCopy = {
  title: string;
  updatedAt: string;
  emptySection: string;
  sections: Record<InterviewStepKey, string>;
  empty: {
    body: string;
    ctaInterview: string;
    ctaDashboard: string;
  };
  error: {
    body: string;
    ctaDashboard: string;
  };
};

type LivingProfileViewProps = {
  result: BusinessProfileForClientResult;
  locale: string;
  copy: LivingProfileCopy;
};

function formatUpdatedAt(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/**
 * Read-only Living profile / Ficha viva (US-2.1).
 * Free-text + list items as React text nodes only — no dangerouslySetInnerHTML.
 */
export function LivingProfileView({
  result,
  locale,
  copy,
}: LivingProfileViewProps) {
  if (result.exists === false && "loadFailed" in result && result.loadFailed) {
    return (
      <ProfileShell title={copy.title}>
        <Message
          severity="error"
          text={copy.error.body}
          style={{ width: "100%" }}
        />
        <Link href="/dashboard" style={{ textDecoration: "none" }}>
          <Button type="button" label={copy.error.ctaDashboard} outlined />
        </Link>
      </ProfileShell>
    );
  }

  if (result.exists === false) {
    return (
      <ProfileShell title={copy.title}>
        <Message
          severity="info"
          text={copy.empty.body}
          style={{ width: "100%" }}
        />
        <div
          style={{
            display: "flex",
            gap: "0.75rem",
            flexWrap: "wrap",
          }}
        >
          <Link href="/interview" style={{ textDecoration: "none" }}>
            <Button type="button" label={copy.empty.ctaInterview} />
          </Link>
          <Link href="/dashboard" style={{ textDecoration: "none" }}>
            <Button
              type="button"
              label={copy.empty.ctaDashboard}
              severity="secondary"
              outlined
            />
          </Link>
        </div>
      </ProfileShell>
    );
  }

  const updatedLabel =
    result.updatedAt != null
      ? copy.updatedAt.replace(
          "{date}",
          formatUpdatedAt(result.updatedAt, locale),
        )
      : null;

  return (
    <ProfileShell title={copy.title} subtitle={updatedLabel}>
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
            {copy.sections[step]}
          </h2>
          <SectionBody
            step={step}
            fields={result.fields}
            emptyLabel={copy.emptySection}
          />
        </section>
      ))}
    </ProfileShell>
  );
}

function ProfileShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string | null;
  children: ReactNode;
}) {
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
        <h1 style={{ margin: "0 0 0.5rem", fontSize: "2rem" }}>{title}</h1>
        {subtitle ? (
          <p style={{ margin: 0, color: "#6b7280", fontSize: "0.875rem" }}>
            {subtitle}
          </p>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function SectionBody({
  step,
  fields,
  emptyLabel,
}: {
  step: InterviewStepKey;
  fields: BusinessProfileFields;
  emptyLabel: string;
}) {
  if (isTextStep(step)) {
    const description = getDescription(fields, step);
    return (
      <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>
        {description || emptyLabel}
      </p>
    );
  }

  const items = getListItems(fields, step);
  if (items.length === 0) {
    return <p style={{ margin: 0 }}>{emptyLabel}</p>;
  }

  return (
    <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
      {items.map((item, index) => (
        <li key={`${index}-${item}`}>{item}</li>
      ))}
    </ul>
  );
}
