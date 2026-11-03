"use client";

import { useRef, useState } from "react";
import { Button } from "primereact/button";
import { Dropdown } from "primereact/dropdown";
import { InputText } from "primereact/inputtext";
import { Message } from "primereact/message";
import { Toast } from "primereact/toast";

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
  const toastRef = useRef<Toast>(null);
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
      toastRef.current?.show({
        severity: "success",
        summary: copy.toastSaveSuccess,
        life: 2500,
      });
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
      toastRef.current?.show({
        severity: "success",
        summary: copy.toastPrefillSuccess,
        life: 2500,
      });
    } catch {
      setBanner(copy.errors.internal);
    } finally {
      setPrefilling(false);
    }
  }

  if (loadFailed) {
    return <Message severity="error" text={copy.loadFailed} style={{ width: "100%" }} />;
  }

  const disabled = pending || preferencesPending || prefilling;

  return (
    <section
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
        padding: "1rem 0",
        borderTop: "1px solid var(--surface-border, #e5e7eb)",
      }}
    >
      <Toast ref={toastRef} />
      <div>
        <h2 style={{ margin: "0 0 0.35rem", fontSize: "1.25rem" }}>{copy.title}</h2>
        <p style={{ margin: 0, color: "var(--text-color-secondary, #6b7280)" }}>
          {copy.subtitle}
        </p>
      </div>

      {!existing ? (
        <Message severity="info" text={copy.emptyHint} style={{ width: "100%" }} />
      ) : null}

      {banner ? (
        <Message severity="error" text={banner} style={{ width: "100%" }} />
      ) : null}

      <div
        style={{
          display: "grid",
          gap: "0.75rem",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        }}
      >
        <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          <span>{copy.genderLabel}</span>
          <Dropdown
            value={gender}
            options={genderOptions}
            onChange={(e) => setGender(e.value as AvatarGender)}
            disabled={disabled}
            placeholder={copy.genderLabel}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          <span>{copy.languageLabel}</span>
          <Dropdown
            value={language}
            options={languageOptions}
            onChange={(e) => setLanguage(e.value as AvatarLanguage)}
            disabled={disabled}
            placeholder={copy.languageLabel}
          />
        </label>
      </div>

      <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
        <span>{copy.voiceIdLabel}</span>
        <InputText
          value={voiceId}
          onChange={(e) => setVoiceId(e.target.value)}
          disabled={disabled}
          placeholder="ElevenLabs voice_id"
        />
        <small style={{ color: "var(--text-color-secondary, #6b7280)" }}>
          {copy.voiceIdHint}
        </small>
      </label>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
        <Button
          type="button"
          label={pending ? copy.saving : copy.save}
          onClick={() => void onSave()}
          disabled={disabled || !gender || !language}
        />
        <Button
          type="button"
          outlined
          label={prefilling ? copy.prefilling : copy.prefillGender}
          onClick={() => void onPrefill()}
          disabled={disabled}
        />
      </div>
    </section>
  );
}
