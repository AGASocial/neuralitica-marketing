"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SimpleSelect } from "@/components/ui/simple-select";
import { Spinner } from "@/components/ui/spinner";
import { StatusAlert } from "@/components/ui/status-alert";

import type {
  AvatarForClientResult,
  AvatarGender,
  AvatarLanguage,
  UpsertAvatarErrorCode,
} from "@/lib/contracts/avatar";
import { prefillAvatarGenderFromPhoto } from "@/lib/avatars/prefill-avatar-gender-from-photo";
import { upsertAvatar } from "@/lib/avatars/upsert-avatar";

export type AvatarSetupCopy = {
  title: string;
  subtitle: string;
  genderLabel: string;
  languageLabel: string;
  voiceIdLabel: string;
  voiceIdPlaceholder: string;
  voiceIdHint: string;
  genderMale: string;
  genderFemale: string;
  languageEn: string;
  languageEs: string;
  save: string;
  saving: string;
  prefillGender: string;
  prefilling: string;
  toastSaveSuccess: string;
  toastPrefillSuccess: string;
  emptyHint: string;
  loadFailed: string;
  errors: {
    validation: string;
    forbiddenFields: string;
    unauthenticated: string;
    forbidden: string;
    internal: string;
    notFound: string;
    providerUnavailable: string;
  };
};

type AvatarSetupSectionProps = {
  initial: AvatarForClientResult;
  copy: AvatarSetupCopy;
  preferencesPending?: boolean;
};

function errorMessage(
  code: UpsertAvatarErrorCode | string,
  copy: AvatarSetupCopy,
): string {
  switch (code) {
    case "VALIDATION_ERROR":
      return copy.errors.validation;
    case "FORBIDDEN_FIELDS":
      return copy.errors.forbiddenFields;
    case "UNAUTHENTICATED":
      return copy.errors.unauthenticated;
    case "FORBIDDEN":
      return copy.errors.forbidden;
    case "NOT_FOUND":
      return copy.errors.notFound;
    case "PROVIDER_UNAVAILABLE":
      return copy.errors.providerUnavailable;
    default:
      return copy.errors.internal;
  }
}

/**
 * Capture presenter gender + language (+ optional ElevenLabs clone) for script/TTS coherence.
 */
export function AvatarSetupSection({
  initial,
  copy,
  preferencesPending = false,
}: AvatarSetupSectionProps) {
  const existing = initial.exists === true ? initial.avatar : null;
  const loadFailed =
    initial.exists === false && "loadFailed" in initial && initial.loadFailed;

  const [gender, setGender] = useState<AvatarGender | null>(
    existing?.gender ?? null,
  );
  const [language, setLanguage] = useState<AvatarLanguage | null>(
    existing?.language ?? null,
  );
  const [voiceId, setVoiceId] = useState(existing?.elevenLabsVoiceId ?? "");
  const [pending, setPending] = useState(false);
  const [prefilling, setPrefilling] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const genderOptions = [
    { label: copy.genderMale, value: "male" as const },
    { label: copy.genderFemale, value: "female" as const },
  ];
  const languageOptions = [
    { label: copy.languageEn, value: "en" as const },
    { label: copy.languageEs, value: "es" as const },
  ];

  async function onSave() {
    if (!gender || !language) {
      setBanner(copy.errors.validation);
      return;
    }
    setPending(true);
    setBanner(null);
    try {
      const trimmed = voiceId.trim();
      const result = await upsertAvatar({
        gender,
        language,
        elevenLabsVoiceId: trimmed.length > 0 ? trimmed : null,
      });
      if (!result.ok) {
        setBanner(errorMessage(result.code, copy));
        return;
      }
      setGender(result.avatar.gender);
      setLanguage(result.avatar.language);
      setVoiceId(result.avatar.elevenLabsVoiceId ?? "");
      toast.success(copy.toastSaveSuccess, { duration: 2500 });
    } catch {
      setBanner(copy.errors.internal);
    } finally {
      setPending(false);
    }
  }

  async function onPrefill() {
    setPrefilling(true);
    setBanner(null);
    try {
      const result = await prefillAvatarGenderFromPhoto();
      if (!result.ok) {
        setBanner(errorMessage(result.code, copy));
        return;
      }
      setGender(result.gender);
      toast.success(copy.toastPrefillSuccess, { duration: 2500 });
    } catch {
      setBanner(copy.errors.internal);
    } finally {
      setPrefilling(false);
    }
  }

  if (loadFailed) {
    return <StatusAlert severity="error" text={copy.loadFailed} className="w-full" />;
  }

  const disabled = pending || preferencesPending || prefilling;

  return (
    <section className="flex flex-col gap-3 border-t border-edge py-4">
      <div>
        <h2 className="mb-1.5 font-display text-xl text-fog">{copy.title}</h2>
        <p className="text-dim">{copy.subtitle}</p>
      </div>

      {!existing ? (
        <StatusAlert severity="info" text={copy.emptyHint} className="w-full" />
      ) : null}

      {banner ? (
        <StatusAlert severity="error" text={banner} className="w-full" />
      ) : null}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="avatar-setup-gender" className="text-fog">
            {copy.genderLabel}
          </Label>
          <SimpleSelect
            id="avatar-setup-gender"
            value={gender}
            options={genderOptions}
            onChange={(value) => setGender(value)}
            disabled={disabled}
            placeholder={copy.genderLabel}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="avatar-setup-language" className="text-fog">
            {copy.languageLabel}
          </Label>
          <SimpleSelect
            id="avatar-setup-language"
            value={language}
            options={languageOptions}
            onChange={(value) => setLanguage(value)}
            disabled={disabled}
            placeholder={copy.languageLabel}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="avatar-setup-voice-id" className="text-fog">
          {copy.voiceIdLabel}
        </Label>
        <Input
          id="avatar-setup-voice-id"
          value={voiceId}
          onChange={(e) => setVoiceId(e.target.value)}
          disabled={disabled}
          placeholder={copy.voiceIdPlaceholder}
        />
        <small className="text-dim">{copy.voiceIdHint}</small>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={() => void onSave()}
          disabled={disabled || !gender || !language}
        >
          {pending ? <Spinner className="size-4 text-current" /> : null}
          {pending ? copy.saving : copy.save}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => void onPrefill()}
          disabled={disabled}
        >
          {prefilling ? <Spinner className="size-4 text-current" /> : null}
          {prefilling ? copy.prefilling : copy.prefillGender}
        </Button>
      </div>
    </section>
  );
}
