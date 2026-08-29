"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Button } from "primereact/button";
import { Message } from "primereact/message";

import type { AvatarConsentCopy } from "@/components/preferences/AvatarConsentSection";
import type { AvatarReferencesCopy } from "@/components/preferences/AvatarReferencesSection";
import {
  PreferencesEditor,
  type PreferencesFormInitial,
} from "@/components/preferences/PreferencesEditor";
import type { AvatarConsentForClientResult } from "@/lib/contracts/avatar-consent";
import type { AvatarReferenceAssetsPageResult } from "@/lib/contracts/media-assets";
import type {
  FacelessStyle,
  VisualModality,
  VisualPreferencesForClientResult,
} from "@/lib/contracts/visual-preferences";

type ModeCopy = {
  label: string;
  description: string;
  example: string;
};

type PreferencesCopy = {
  title: string;
  subtitle: string;
  updatedAt: string;
  save: string;
  cancel: string;
  saving: string;
  toastSuccess: string;
  emptyHint: string;
  disclosureNote: string;
  disclosureLine: string;
  disclosurePreviewNote: string;
  ownAvatarDisabledConsent: string;
  ownAvatarAssetsNote: string;
  modes: Record<VisualModality, ModeCopy>;
  facelessStyle: {
    title: string;
    voice: string;
    onScreenText: string;
    broll: string;
    voiceOptions: Record<FacelessStyle["voice"], string>;
    onScreenTextOptions: Record<FacelessStyle["onScreenText"], string>;
    brollOptions: Record<FacelessStyle["broll"], string>;
  };
  errors: {
    validation: string;
    forbiddenFields: string;
    payloadTooLarge: string;
    ownAvatarConsentRequired: string;
    unauthenticated: string;
    forbidden: string;
    internal: string;
    facelessStyleRequired: string;
  };
  error: {
    body: string;
    ctaDashboard: string;
  };
};

type PreferencesViewProps = {
  result: VisualPreferencesForClientResult;
  consent: AvatarConsentForClientResult;
  references: AvatarReferenceAssetsPageResult;
  locale: string;
  copy: PreferencesCopy;
  consentCopy: AvatarConsentCopy;
  referencesCopy: AvatarReferencesCopy;
};

/**
 * Preferencias settings view (US-3.1 / US-3.3).
 * Load-failed → error + dashboard CTA. Missing/exists → editor with empty defaults.
 */
export function PreferencesView({
  result,
  consent,
  references,
  locale,
  copy,
  consentCopy,
  referencesCopy,
}: PreferencesViewProps) {
  if (result.exists === false && "loadFailed" in result && result.loadFailed) {
    return (
      <Shell title={copy.title}>
        <Message
          severity="error"
          text={copy.error.body}
          style={{ width: "100%" }}
        />
        <Link href="/dashboard" style={{ textDecoration: "none" }}>
          <Button type="button" label={copy.error.ctaDashboard} outlined />
        </Link>
      </Shell>
    );
  }

  const initial: PreferencesFormInitial =
    result.exists === true
      ? {
          allowedModes: result.allowedModes,
          facelessStyle: result.facelessStyle,
          updatedAt: result.updatedAt,
          rules: result.rules,
          ownAvatarConsentActive: result.ownAvatarConsentActive,
        }
      : {
          allowedModes: [],
          facelessStyle: null,
          updatedAt: null,
          rules: null,
          ownAvatarConsentActive: Boolean(result.ownAvatarConsentActive),
        };

  return (
    <PreferencesEditor
      initial={initial}
      consent={consent}
      references={references}
      locale={locale}
      title={copy.title}
      subtitle={copy.subtitle}
      consentCopy={consentCopy}
      referencesCopy={referencesCopy}
      copy={{
        updatedAt: copy.updatedAt,
        save: copy.save,
        cancel: copy.cancel,
        saving: copy.saving,
        toastSuccess: copy.toastSuccess,
        emptyHint: copy.emptyHint,
        disclosureNote: copy.disclosureNote,
        disclosureLine: copy.disclosureLine,
        disclosurePreviewNote: copy.disclosurePreviewNote,
        ownAvatarDisabledConsent: copy.ownAvatarDisabledConsent,
        ownAvatarAssetsNote: copy.ownAvatarAssetsNote,
        modes: copy.modes,
        facelessStyle: copy.facelessStyle,
        errors: copy.errors,
      }}
    />
  );
}

function Shell({
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
