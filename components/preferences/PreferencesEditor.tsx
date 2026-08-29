"use client";

import { useRef, useState, type ReactNode } from "react";
import { Button } from "primereact/button";
import { Checkbox } from "primereact/checkbox";
import { Dropdown } from "primereact/dropdown";
import { Message } from "primereact/message";
import { Toast } from "primereact/toast";

import {
  FACELESS_STYLE_DEFAULT,
  type FacelessStyle,
  type UpsertVisualPreferencesErrorCode,
  type UpsertVisualPreferencesResult,
  type VisualModality,
  type VisualPreferencesRules,
} from "@/lib/contracts/visual-preferences";
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
};

/** Form-ready snapshot — maps from CONTRACT loader DTO (exists or missing). */
export type PreferencesFormInitial = {
  allowedModes: VisualModality[];
  facelessStyle: FacelessStyle | null;
  updatedAt: string | null;
  rules: VisualPreferencesRules | null;
  ownAvatarConsentActive: boolean;
};

type FormSnapshot = {
  allowedModes: VisualModality[];
  facelessStyle: FacelessStyle | null;
  updatedAt: string | null;
  rules: VisualPreferencesRules | null;
};

type PreferencesEditorProps = {
  initial: PreferencesFormInitial;
  locale: string;
  title: string;
  subtitle: string;
  copy: PreferencesEditorCopy;
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
  locale,
  title,
  subtitle,
  copy,
}: PreferencesEditorProps) {
  const toastRef = useRef<Toast>(null);
  const [server, setServer] = useState(() => snapshotFromInitial(initial));
  const [draftModes, setDraftModes] = useState(() =>
    cloneModes(initial.allowedModes),
  );
  const [draftStyle, setDraftStyle] = useState(() =>
    cloneStyle(initial.facelessStyle),
  );
  const [pending, setPending] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const consentActive = initial.ownAvatarConsentActive;
  const hasFaceless = draftModes.includes("faceless");
  const dirty =
    JSON.stringify(sortModes(draftModes)) !==
      JSON.stringify(sortModes(server.allowedModes)) ||
    JSON.stringify(draftStyle) !== JSON.stringify(server.facelessStyle);

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

    setPending(true);
    clearFeedback();

    try {
      const result: UpsertVisualPreferencesResult =
        await upsertVisualPreferences({
          allowedModes: modes,
          facelessStyle: style,
          genericAvatarId: null,
        });

      if (result.ok) {
        const next: FormSnapshot = {
          allowedModes: cloneModes(result.allowedModes),
          facelessStyle: cloneStyle(result.facelessStyle),
          updatedAt: result.updatedAt,
          rules: result.rules,
        };
        setServer(next);
        setDraftModes(cloneModes(result.allowedModes));
        setDraftStyle(cloneStyle(result.facelessStyle));
        toastRef.current?.show({
          severity: "success",
          summary: copy.toastSuccess,
          life: 5000,
        });
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
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <Button
            type="button"
            label={pending ? copy.saving : copy.save}
            onClick={() => void handleSave()}
            disabled={pending || !dirty}
            loading={pending}
          />
          <Button
            type="button"
            label={copy.cancel}
            severity="secondary"
            outlined
            onClick={cancelEdit}
            disabled={pending || !dirty}
          />
        </div>
      }
    >
      <Toast ref={toastRef} position="top-right" />

      {banner ? (
        <Message severity="error" text={banner} style={{ width: "100%" }} />
      ) : null}

      {server.allowedModes.length === 0 && !dirty ? (
        <Message severity="info" text={copy.emptyHint} style={{ width: "100%" }} />
      ) : null}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
        }}
      >
        {MODALITY_ORDER.map((mode) => {
          const modeCopy = copy.modes[mode];
          const checked = draftModes.includes(mode);
          const ownDisabled = mode === "own_avatar" && !consentActive;
          const inputId = `pref-mode-${mode}`;

          return (
            <section
              key={mode}
              style={{
                background: "#ffffff",
                border: "1px solid #e5e7eb",
                borderRadius: "8px",
                padding: "1rem 1.25rem",
                opacity: ownDisabled ? 0.85 : 1,
              }}
            >
              <div
                style={{
                  display: "flex",
                  gap: "0.75rem",
                  alignItems: "flex-start",
                }}
              >
                <Checkbox
                  inputId={inputId}
                  checked={checked && !ownDisabled}
                  disabled={pending || ownDisabled}
                  onChange={(e) => toggleMode(mode, Boolean(e.checked))}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <label
                    htmlFor={inputId}
                    style={{
                      display: "block",
                      fontWeight: 600,
                      fontSize: "1.05rem",
                      marginBottom: "0.35rem",
                      cursor: ownDisabled || pending ? "default" : "pointer",
                    }}
                  >
                    {modeCopy.label}
                  </label>
                  <p style={{ margin: "0 0 0.5rem", color: "#4b5563" }}>
                    {modeCopy.description}
                  </p>
                  <p
                    style={{
                      margin: 0,
                      color: "#6b7280",
                      fontSize: "0.875rem",
                    }}
                  >
                    {modeCopy.example}
                  </p>

                  {ownDisabled ? (
                    <Message
                      severity="warn"
                      text={copy.ownAvatarDisabledConsent}
                      style={{ width: "100%", marginTop: "0.75rem" }}
                    />
                  ) : null}

                  {mode === "own_avatar" && !ownDisabled ? (
                    <p
                      style={{
                        margin: "0.75rem 0 0",
                        color: "#6b7280",
                        fontSize: "0.875rem",
                      }}
                    >
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
        <section
          style={{
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
            padding: "1rem 1.25rem",
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
          }}
        >
          <h2 style={{ margin: 0, fontSize: "1.1rem" }}>
            {copy.facelessStyle.title}
          </h2>

          <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            <span style={{ fontWeight: 500 }}>{copy.facelessStyle.voice}</span>
            <Dropdown
              value={(draftStyle ?? FACELESS_STYLE_DEFAULT).voice}
              options={voiceOptions}
              onChange={(e) =>
                setStyleField("voice", e.value as FacelessStyle["voice"])
              }
              disabled={pending}
              style={{ width: "100%" }}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            <span style={{ fontWeight: 500 }}>
              {copy.facelessStyle.onScreenText}
            </span>
            <Dropdown
              value={(draftStyle ?? FACELESS_STYLE_DEFAULT).onScreenText}
              options={onScreenTextOptions}
              onChange={(e) =>
                setStyleField(
                  "onScreenText",
                  e.value as FacelessStyle["onScreenText"],
                )
              }
              disabled={pending}
              style={{ width: "100%" }}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            <span style={{ fontWeight: 500 }}>{copy.facelessStyle.broll}</span>
            <Dropdown
              value={(draftStyle ?? FACELESS_STYLE_DEFAULT).broll}
              options={brollOptions}
              onChange={(e) =>
                setStyleField("broll", e.value as FacelessStyle["broll"])
              }
              disabled={pending}
              style={{ width: "100%" }}
            />
          </label>
        </section>
      ) : null}

      {server.rules?.must_disclose_not_owner ||
      draftModes.includes("generic_avatar") ? (
        <Message
          severity="info"
          text={copy.disclosureNote}
          style={{ width: "100%" }}
        />
      ) : null}
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
    <div
      style={{
        maxWidth: 760,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: "1.25rem",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "1rem",
          flexWrap: "wrap",
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
        {actions}
      </div>
      {children}
    </div>
  );
}
