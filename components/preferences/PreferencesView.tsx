"use client";

import type { ReactNode } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { StatusAlert } from "@/components/ui/status-alert";
import type { AvatarConsentCopy } from "@/components/preferences/AvatarConsentSection";
import type { AvatarReferencesCopy } from "@/components/preferences/AvatarReferencesSection";
import type { AvatarSetupCopy } from "@/components/preferences/AvatarSetupSection";
import type { VoicePickerCopy } from "@/components/preferences/VoicePickerSection";
import {
  PreferencesEditor,
  type PreferencesFormInitial,
} from "@/components/preferences/PreferencesEditor";
import type { AvatarForClientResult } from "@/lib/contracts/avatar";
import type { AvatarConsentForClientResult } from "@/lib/contracts/avatar-consent";
import type { AvatarReferenceAssetsPageResult } from "@/lib/contracts/media-assets";
import type {
  FacelessStyle,
  TtsVoiceId,
  TtsVoiceOptionDto,
  VisualModality,
  VisualPreferencesForClientResult,
} from "@/lib/contracts/visual-preferences";
import { TTS_VOICE_OPTIONS_FE } from "@/lib/contracts/tts-voiceover";

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
  voice: VoicePickerCopy;
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
  avatar: AvatarForClientResult;
  locale: string;
  copy: PreferencesCopy;
  consentCopy: AvatarConsentCopy;
  referencesCopy: AvatarReferencesCopy;
  avatarSetupCopy: AvatarSetupCopy;
};

/**
 * Preferencias settings view (US-3.1 / US-3.3).
 * Load-failed → error + dashboard CTA. Missing/exists → editor with empty defaults.
 */
export function PreferencesView({
  result,
  consent,
  references,
  avatar,
  locale,
  copy,
  consentCopy,
  referencesCopy,
  avatarSetupCopy,
}: PreferencesViewProps) {
  if (result.exists === false && "loadFailed" in result && result.loadFailed) {
    return (
      <Shell title={copy.title}>
        <StatusAlert severity="error" text={copy.error.body} className="w-full" />
        <div>
          <Button asChild variant="outline">
            <Link href="/dashboard">{copy.error.ctaDashboard}</Link>
          </Button>
        </div>
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
          voiceId: result.voiceId,
          availableVoices: result.availableVoices,
          voicePickerVisible: result.voicePickerVisible,
        }
      : {
          allowedModes: [],
          facelessStyle: null,
          updatedAt: null,
          rules: null,
          ownAvatarConsentActive: Boolean(result.ownAvatarConsentActive),
          voiceId: null,
          availableVoices:
            "availableVoices" in result
              ? result.availableVoices
              : TTS_VOICE_OPTIONS_FE,
          voicePickerVisible:
            "voicePickerVisible" in result ? result.voicePickerVisible : false,
        };

  return (
    <PreferencesEditor
      initial={initial}
      consent={consent}
      references={references}
      avatar={avatar}
      locale={locale}
      title={copy.title}
      subtitle={copy.subtitle}
      consentCopy={consentCopy}
      referencesCopy={referencesCopy}
      avatarSetupCopy={avatarSetupCopy}
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
        voice: copy.voice,
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
    <div className="mx-auto flex max-w-[760px] flex-col gap-5">
      <div>
        <h1 className="mb-2 font-display text-4xl text-fog">{title}</h1>
      </div>
      {children}
    </div>
  );
}
