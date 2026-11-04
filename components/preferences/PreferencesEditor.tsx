"use client";

import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { SimpleSelect } from "@/components/ui/simple-select";
import { Spinner } from "@/components/ui/spinner";
import { StatusAlert } from "@/components/ui/status-alert";
import { cn } from "@/lib/utils";

import {
  AvatarConsentSection,
  type AvatarConsentCopy,
} from "@/components/preferences/AvatarConsentSection";
import {
  AvatarReferencesSection,
  type AvatarReferencesCopy,
} from "@/components/preferences/AvatarReferencesSection";
import {
  AvatarSetupSection,
  type AvatarSetupCopy,
} from "@/components/preferences/AvatarSetupSection";
import {
  VoicePickerSection,
  type VoicePickerCopy,
} from "@/components/preferences/VoicePickerSection";
import { GenericAvatarDisclosurePreview } from "@/components/preferences/GenericAvatarDisclosurePreview";
import type { AvatarForClientResult } from "@/lib/contracts/avatar";
import type { AvatarConsentForClientResult } from "@/lib/contracts/avatar-consent";
import type { AvatarReferenceAssetsPageResult } from "@/lib/contracts/media-assets";
import {
  FACELESS_STYLE_DEFAULT,
  type FacelessStyle,
  type TtsVoiceId,
  type TtsVoiceOptionDto,
  type UpsertVisualPreferencesErrorCode,
  type UpsertVisualPreferencesResult,
  type VisualModality,
  type VisualPreferencesRules,
} from "@/lib/contracts/visual-preferences";
import { computeVoicePickerVisible } from "@/lib/preferences/compute-voice-picker-visible";
import { upsertVisualPreferences } from "@/lib/visual-preferences/upsert-visual-preferences";

const MODALITY_ORDER: VisualModality[] = [
  "own_avatar",
  "generic_avatar",
  "faceless",
];

type ModeCopy = {
  label: string;
  description: string;
  example: string;
};

type PreferencesEditorCopy = {
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
};

/** Form-ready snapshot — maps from CONTRACT loader DTO (exists or missing). */
export type PreferencesFormInitial = {
  allowedModes: VisualModality[];
  facelessStyle: FacelessStyle | null;
  updatedAt: string | null;
  rules: VisualPreferencesRules | null;
  ownAvatarConsentActive: boolean;
  voiceId: TtsVoiceId | null;
  availableVoices: TtsVoiceOptionDto[];
  voicePickerVisible: boolean;
};

type FormSnapshot = {
  allowedModes: VisualModality[];
  facelessStyle: FacelessStyle | null;
  updatedAt: string | null;
  rules: VisualPreferencesRules | null;
  voiceId: TtsVoiceId | null;
};

type PreferencesEditorProps = {
  initial: PreferencesFormInitial;
  consent: AvatarConsentForClientResult;
  references: AvatarReferenceAssetsPageResult;
  avatar: AvatarForClientResult;
  locale: string;
  title: string;
  subtitle: string;
  copy: PreferencesEditorCopy;
  consentCopy: AvatarConsentCopy;
  referencesCopy: AvatarReferencesCopy;
  avatarSetupCopy: AvatarSetupCopy;
};

function cloneModes(modes: VisualModality[]): VisualModality[] {
  return [...modes];
}

function cloneStyle(style: FacelessStyle | null): FacelessStyle | null {
  return style == null ? null : { ...style };
}

function snapshotFromInitial(initial: PreferencesFormInitial): FormSnapshot {
  return {
    allowedModes: cloneModes(initial.allowedModes),
    facelessStyle: cloneStyle(initial.facelessStyle),
    updatedAt: initial.updatedAt,
    rules: initial.rules,
    voiceId: initial.voiceId,
  };
}

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

function sortModes(modes: VisualModality[]): VisualModality[] {
  return MODALITY_ORDER.filter((m) => modes.includes(m));
}

/**
 * Preferencias de producción visual editor (US-3.1).
 * Multi-select allowlist; no recording UX; no dangerouslySetInnerHTML.
 */
export function PreferencesEditor({
  initial,
  consent,
  references,
  avatar,
  locale,
  title,
  subtitle,
  copy,
  consentCopy,
  referencesCopy,
  avatarSetupCopy,
}: PreferencesEditorProps) {
  const [server, setServer] = useState(() => snapshotFromInitial(initial));
  const [draftModes, setDraftModes] = useState(() =>
    cloneModes(initial.allowedModes),
  );
  const [draftStyle, setDraftStyle] = useState(() =>
    cloneStyle(initial.facelessStyle),
  );
  const [draftVoiceId, setDraftVoiceId] = useState<TtsVoiceId | null>(
    () => initial.voiceId,
  );
  const [pending, setPending] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const consentActive = consent.active;
  const allowlistHasOwnAvatar = server.allowedModes.includes("own_avatar");
  const hasFaceless = draftModes.includes("faceless");
  const showGenericDisclosure =
    server.rules?.must_disclose_not_owner === true ||
    draftModes.includes("generic_avatar");
  const genericInDraft = draftModes.includes("generic_avatar");
  const disclosureSeverity: "warn" | "info" = genericInDraft ? "warn" : "info";
  const draftVoicePickerVisible = computeVoicePickerVisible(
    draftModes,
    draftModes.includes("faceless")
      ? (draftStyle ?? FACELESS_STYLE_DEFAULT)
      : null,
  );
  const dirty =
    JSON.stringify(sortModes(draftModes)) !==
      JSON.stringify(sortModes(server.allowedModes)) ||
    JSON.stringify(draftStyle) !== JSON.stringify(server.facelessStyle) ||
    draftVoiceId !== server.voiceId;

  const updatedLabel =
    server.updatedAt != null
      ? copy.updatedAt.replace(
          "{date}",
          formatUpdatedAt(server.updatedAt, locale),
        )
      : null;

  function clearFeedback() {
    setBanner(null);
  }

  function cancelEdit() {
    setDraftModes(cloneModes(server.allowedModes));
    setDraftStyle(cloneStyle(server.facelessStyle));
    setDraftVoiceId(server.voiceId);
    clearFeedback();
  }

  function toggleMode(mode: VisualModality, checked: boolean) {
    if (mode === "own_avatar" && !consentActive) {
      return;
    }
    clearFeedback();

    setDraftModes((prev) => {
      const next = checked
        ? sortModes([...prev.filter((m) => m !== mode), mode])
        : prev.filter((m) => m !== mode);

      if (mode === "faceless") {
        if (checked) {
          setDraftStyle((style) => style ?? { ...FACELESS_STYLE_DEFAULT });
        } else {
          setDraftStyle(null);
        }
      }
      return next;
    });
  }

  function setStyleField<K extends keyof FacelessStyle>(
    key: K,
    value: FacelessStyle[K],
  ) {
    clearFeedback();
    setDraftStyle((prev) => ({
      ...(prev ?? FACELESS_STYLE_DEFAULT),
      [key]: value,
    }));
  }

  function messageForCode(
    code: UpsertVisualPreferencesErrorCode,
    messageKey?: string,
  ): string {
    if (
      code === "OWN_AVATAR_CONSENT_REQUIRED" ||
      messageKey === "preferences.errors.ownAvatarConsentRequired"
    ) {
      return copy.errors.ownAvatarConsentRequired;
    }
    switch (code) {
      case "VALIDATION_ERROR":
        return copy.errors.validation;
      case "FORBIDDEN_FIELDS":
        return copy.errors.forbiddenFields;
      case "PAYLOAD_TOO_LARGE":
        return copy.errors.payloadTooLarge;
      case "UNAUTHENTICATED":
        return copy.errors.unauthenticated;
      case "FORBIDDEN":
        return copy.errors.forbidden;
      default:
        return copy.errors.internal;
    }
  }

  async function handleSave() {
    if (pending) {
      return;
    }

    const modes = sortModes(draftModes);
    const style = modes.includes("faceless")
      ? (draftStyle ?? { ...FACELESS_STYLE_DEFAULT })
      : null;

    if (modes.includes("faceless") && style == null) {
      setBanner(copy.errors.facelessStyleRequired);
      return;
    }

    const voicePickerVisible = computeVoicePickerVisible(modes, style);
    const upsertPayload: Parameters<typeof upsertVisualPreferences>[0] = {
      allowedModes: modes,
      facelessStyle: style,
      genericAvatarId: null,
    };
    if (voicePickerVisible && draftVoiceId != null) {
      upsertPayload.voiceId = draftVoiceId;
    }

    setPending(true);
    clearFeedback();

    try {
      const result: UpsertVisualPreferencesResult =
        await upsertVisualPreferences(upsertPayload);

      if (result.ok) {
        const next: FormSnapshot = {
          allowedModes: cloneModes(result.allowedModes),
          facelessStyle: cloneStyle(result.facelessStyle),
          updatedAt: result.updatedAt,
          rules: result.rules,
          voiceId: result.voiceId,
        };
        setServer(next);
        setDraftModes(cloneModes(result.allowedModes));
        setDraftStyle(cloneStyle(result.facelessStyle));
        setDraftVoiceId(result.voiceId);
        toast.success(copy.toastSuccess, { duration: 5000 });
        return;
      }

      setBanner(messageForCode(result.error.code, result.error.messageKey));
    } catch {
      setBanner(copy.errors.internal);
    } finally {
      setPending(false);
    }
  }

  const voiceOptions = (
    Object.keys(copy.facelessStyle.voiceOptions) as FacelessStyle["voice"][]
  ).map((value) => ({
    label: copy.facelessStyle.voiceOptions[value],
    value,
  }));
  const onScreenTextOptions = (
    Object.keys(
      copy.facelessStyle.onScreenTextOptions,
    ) as FacelessStyle["onScreenText"][]
  ).map((value) => ({
    label: copy.facelessStyle.onScreenTextOptions[value],
    value,
  }));
  const brollOptions = (
    Object.keys(copy.facelessStyle.brollOptions) as FacelessStyle["broll"][]
  ).map((value) => ({
    label: copy.facelessStyle.brollOptions[value],
    value,
  }));

  return (
    <PreferencesShell
      title={title}
      subtitle={updatedLabel ?? subtitle}
      actions={
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={pending || !dirty}
          >
            {pending ? <Spinner className="size-4 text-current" /> : null}
            {pending ? copy.saving : copy.save}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={cancelEdit}
            disabled={pending || !dirty}
          >
            {copy.cancel}
          </Button>
        </div>
      }
    >
      {banner ? (
        <StatusAlert severity="error" text={banner} className="w-full" />
      ) : null}

      {server.allowedModes.length === 0 && !dirty ? (
        <StatusAlert severity="info" text={copy.emptyHint} className="w-full" />
      ) : null}

      <AvatarConsentSection
        consent={consent}
        locale={locale}
        copy={consentCopy}
        allowlistHasOwnAvatar={allowlistHasOwnAvatar}
        preferencesPending={pending}
      />

      <AvatarReferencesSection
        initial={references}
        locale={locale}
        copy={referencesCopy}
        preferencesPending={pending}
      />

      <AvatarSetupSection
        initial={avatar}
        copy={avatarSetupCopy}
        preferencesPending={pending}
      />

      <div className="flex flex-col gap-4">
        {MODALITY_ORDER.map((mode) => {
          const modeCopy = copy.modes[mode];
          const checked = draftModes.includes(mode);
          const ownDisabled = mode === "own_avatar" && !consentActive;
          const inputId = `pref-mode-${mode}`;

          return (
            <section
              key={mode}
              className={cn(
                "rounded-xl border border-edge bg-panel px-5 py-4",
                ownDisabled && "opacity-85",
              )}
            >
              <div className="flex items-start gap-3">
                <Checkbox
                  id={inputId}
                  checked={checked && !ownDisabled}
                  disabled={pending || ownDisabled}
                  onCheckedChange={(value) => toggleMode(mode, value === true)}
                  className="mt-1"
                />
                <div className="min-w-0 flex-1">
                  <Label
                    htmlFor={inputId}
                    className={cn(
                      "mb-1.5 block text-[1.05rem] font-semibold text-fog",
                      ownDisabled || pending ? "cursor-default" : "cursor-pointer",
                    )}
                  >
                    {modeCopy.label}
                  </Label>
                  <p className="mb-2 text-dim">{modeCopy.description}</p>
                  <p className="text-sm text-dim">{modeCopy.example}</p>

                  {ownDisabled ? (
                    <StatusAlert
                      severity="warn"
                      text={copy.ownAvatarDisabledConsent}
                      className="mt-3 w-full"
                    />
                  ) : null}

                  {mode === "own_avatar" && !ownDisabled ? (
                    <p className="mt-3 text-sm text-dim">
                      {copy.ownAvatarAssetsNote}
                    </p>
                  ) : null}
                </div>
              </div>
            </section>
          );
        })}
      </div>

      {hasFaceless ? (
        <section className="flex flex-col gap-4 rounded-xl border border-edge bg-panel px-5 py-4">
          <h2 className="font-display text-xl text-fog">
            {copy.facelessStyle.title}
          </h2>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pref-faceless-voice" className="font-medium text-fog">
              {copy.facelessStyle.voice}
            </Label>
            <SimpleSelect
              id="pref-faceless-voice"
              value={(draftStyle ?? FACELESS_STYLE_DEFAULT).voice}
              options={voiceOptions}
              onChange={(value) => setStyleField("voice", value)}
              disabled={pending}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pref-faceless-text" className="font-medium text-fog">
              {copy.facelessStyle.onScreenText}
            </Label>
            <SimpleSelect
              id="pref-faceless-text"
              value={(draftStyle ?? FACELESS_STYLE_DEFAULT).onScreenText}
              options={onScreenTextOptions}
              onChange={(value) => setStyleField("onScreenText", value)}
              disabled={pending}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pref-faceless-broll" className="font-medium text-fog">
              {copy.facelessStyle.broll}
            </Label>
            <SimpleSelect
              id="pref-faceless-broll"
              value={(draftStyle ?? FACELESS_STYLE_DEFAULT).broll}
              options={brollOptions}
              onChange={(value) => setStyleField("broll", value)}
              disabled={pending}
            />
          </div>
        </section>
      ) : null}

      <VoicePickerSection
        availableVoices={initial.availableVoices}
        selectedVoiceId={draftVoiceId}
        visible={draftVoicePickerVisible}
        pending={pending}
        copy={copy.voice}
        onSelect={(voiceId) => {
          clearFeedback();
          setDraftVoiceId(voiceId);
        }}
      />

      {showGenericDisclosure ? (
        <StatusAlert
          severity={disclosureSeverity}
          text={copy.disclosureNote}
          className="w-full"
        />
      ) : null}

      <GenericAvatarDisclosurePreview
        visible={showGenericDisclosure}
        variant="preferences"
        line={copy.disclosureLine}
        previewNote={copy.disclosurePreviewNote}
      />
    </PreferencesShell>
  );
}

function PreferencesShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string | null;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-2 font-display text-4xl text-fog">{title}</h1>
          {subtitle ? <p className="text-sm text-dim">{subtitle}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}
