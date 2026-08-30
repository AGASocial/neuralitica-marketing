"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Button } from "primereact/button";
import { Message } from "primereact/message";

import { LivingProfileEditor } from "@/components/profile/LivingProfileEditor";
import {
  ProfileBrandingSection,
  type ProfileBrandingCopy,
} from "@/components/profile/ProfileBrandingSection";
import type { InterviewStepKey } from "@/lib/contracts/interview";
import type { BusinessProfileForClientResult } from "@/lib/contracts/profile";

type StepFieldCopy = {
  question: string;
  helper: string;
  placeholder: string;
};

type LivingProfileCopy = {
  title: string;
  updatedAt: string;
  emptySection: string;
  sections: Record<InterviewStepKey, string>;
  edit: string;
  save: string;
  cancel: string;
  saving: string;
  toastSuccess: string;
  addItem: string;
  removeItem: string;
  itemPlaceholder: string;
  chipsHintRequired: string;
  chipsHintOptional: string;
  steps: Record<InterviewStepKey, StepFieldCopy>;
  errors: {
    validation: string;
    forbiddenFields: string;
    payloadTooLarge: string;
    notFound: string;
    unauthenticated: string;
    forbidden: string;
    conflict: string;
    internal: string;
    required: string;
    tooSmallList: string;
    tooSmallText: string;
    tooBigItems: string;
    tooBigText: string;
    invalidType: string;
    unrecognizedKey: string;
  };
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
  brandingCopy: ProfileBrandingCopy;
};

/**
 * Living profile / Ficha viva (US-2.1 + US-2.2).
 * Missing → CTA /interview (no create via edit). Exists → edit chrome.
 * Free-text as React text nodes / controlled inputs only — no dangerouslySetInnerHTML.
 */
export function LivingProfileView({
  result,
  locale,
  copy,
  brandingCopy,
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
      <LivingProfileEditor
        initial={result}
        locale={locale}
        title={copy.title}
        copy={{
          updatedAt: copy.updatedAt,
          emptySection: copy.emptySection,
          sections: copy.sections,
          edit: copy.edit,
          save: copy.save,
          cancel: copy.cancel,
          saving: copy.saving,
          toastSuccess: copy.toastSuccess,
          addItem: copy.addItem,
          removeItem: copy.removeItem,
          itemPlaceholder: copy.itemPlaceholder,
          chipsHintRequired: copy.chipsHintRequired,
          chipsHintOptional: copy.chipsHintOptional,
          steps: copy.steps,
          errors: copy.errors,
        }}
      />
      <ProfileBrandingSection initial={result.branding} copy={brandingCopy} />
    </div>
  );
}

function ProfileShell({
  title,
  children,
}: {
  title: string;
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
      </div>
      {children}
    </div>
  );
}
