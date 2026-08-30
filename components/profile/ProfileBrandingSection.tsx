"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { Button } from "primereact/button";
import { ConfirmDialog, confirmDialog } from "primereact/confirmdialog";
import { InputSwitch } from "primereact/inputswitch";
import { Message } from "primereact/message";
import { ProgressBar } from "primereact/progressbar";
import { Toast } from "primereact/toast";

import type { AssemblyConfig } from "@/lib/contracts/branding-job";
import { CLIENT_LOGO_HINT_MAX_MIB } from "@/lib/contracts/branding-job";
import type { BusinessProfileBranding } from "@/lib/contracts/profile";
import type { MediaUploadErrorCode } from "@/lib/contracts/media-assets";
import { removeClientLogo } from "@/lib/profile/actions/remove-client-logo";
import { updateAssemblyConfigDefaults } from "@/lib/profile/actions/update-assembly-config-defaults";
import { uploadClientLogo } from "@/lib/profile/actions/upload-client-logo";

export type ProfileBrandingCopy = {
  title: string;
  subtitle: string;
  logoLabel: string;
  hints: string;
  emptyLogo: string;
  upload: string;
  uploading: string;
  remove: string;
  removing: string;
  previewAlt: string;
  toggleSubtitles: string;
  toggleLogo: string;
  toastUploadSuccess: string;
  toastRemoveSuccess: string;
  toastDefaultsSuccess: string;
  confirmRemove: {
    header: string;
    message: string;
    accept: string;
    reject: string;
  };
  errors: {
    validation: string;
    forbiddenFields: string;
    missingFile: string;
    invalidFileType: string;
    fileTooLarge: string;
    unauthenticated: string;
    forbidden: string;
    internal: string;
  };
};

type ProfileBrandingSectionProps = {
  initial: BusinessProfileBranding;
  copy: ProfileBrandingCopy;
};

function uploadMessageForCode(
  code: MediaUploadErrorCode,
  copy: ProfileBrandingCopy,
): string {
  switch (code) {
    case "VALIDATION_ERROR":
      return copy.errors.validation;
    case "FORBIDDEN_FIELDS":
      return copy.errors.forbiddenFields;
    case "MISSING_FILE":
      return copy.errors.missingFile;
    case "INVALID_FILE_TYPE":
      return copy.errors.invalidFileType;
    case "FILE_TOO_LARGE":
      return copy.errors.fileTooLarge;
    case "UNAUTHENTICATED":
      return copy.errors.unauthenticated;
    case "FORBIDDEN":
      return copy.errors.forbidden;
    default:
      return copy.errors.internal;
  }
}

/**
 * Ficha viva Brand / Marca section (US-9.2).
 * Immediate mutations — outside edit/save chrome. No coverFrameSec in Cliente UI.
 */
export function ProfileBrandingSection({
  initial,
  copy,
}: ProfileBrandingSectionProps) {
  const toastRef = useRef<Toast>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [logoAssetId, setLogoAssetId] = useState<string | null>(
    initial.logoAssetId,
  );
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(
    initial.logoPreviewUrl,
  );
  const [assemblyConfig, setAssemblyConfig] = useState<AssemblyConfig>(
    initial.assemblyConfig,
  );
  const [pendingUpload, setPendingUpload] = useState(false);
  const [pendingRemove, setPendingRemove] = useState(false);
  const [pendingToggle, setPendingToggle] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const busy = pendingUpload || pendingRemove || pendingToggle;
  const hintsText = copy.hints.replace(
    "{maxMiB}",
    String(CLIENT_LOGO_HINT_MAX_MIB),
  );

  function clearFeedback() {
    setBanner(null);
  }

  async function persistDefaults(next: AssemblyConfig) {
    setPendingToggle(true);
    clearFeedback();

    try {
      const result = await updateAssemblyConfigDefaults(next);

      if (result.ok) {
        setAssemblyConfig(result.assemblyConfig);
        toastRef.current?.show({
          severity: "success",
          summary: copy.toastDefaultsSuccess,
          life: 4000,
        });
        return;
      }

      setBanner(copy.errors.internal);
    } catch {
      setBanner(copy.errors.internal);
    } finally {
      setPendingToggle(false);
    }
  }

  function handleSubtitlesChange(enabled: boolean) {
    if (busy) {
      return;
    }
    const next = { ...assemblyConfig, subtitlesEnabled: enabled };
    setAssemblyConfig(next);
    void persistDefaults(next);
  }

  function handleLogoToggleChange(enabled: boolean) {
    if (busy) {
      return;
    }
    const next = { ...assemblyConfig, logoEnabled: enabled };
    setAssemblyConfig(next);
    void persistDefaults(next);
  }

  function openFilePicker() {
    if (busy) {
      return;
    }
    clearFeedback();
    fileInputRef.current?.click();
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || pendingUpload) {
      return;
    }

    setPendingUpload(true);
    clearFeedback();

    const formData = new FormData();
    formData.set("file", file);

    try {
      const result = await uploadClientLogo(formData);

      if (result.ok) {
        setLogoAssetId(result.logoAssetId);
        setLogoPreviewUrl(result.logoPreviewUrl);
        toastRef.current?.show({
          severity: "success",
          summary: copy.toastUploadSuccess,
          life: 4000,
        });
        return;
      }

      setBanner(uploadMessageForCode(result.error.code, copy));
    } catch {
      setBanner(copy.errors.internal);
    } finally {
      setPendingUpload(false);
    }
  }

  function requestRemove() {
    if (busy || !logoAssetId) {
      return;
    }

    confirmDialog({
      header: copy.confirmRemove.header,
      message: copy.confirmRemove.message,
      acceptLabel: copy.confirmRemove.accept,
      rejectLabel: copy.confirmRemove.reject,
      acceptClassName: "p-button-danger",
      accept: () => void handleRemove(),
    });
  }

  async function handleRemove() {
    if (pendingRemove || !logoAssetId) {
      return;
    }

    setPendingRemove(true);
    clearFeedback();

    try {
      const result = await removeClientLogo();

      if (result.ok) {
        setLogoAssetId(null);
        setLogoPreviewUrl(null);
        toastRef.current?.show({
          severity: "success",
          summary: copy.toastRemoveSuccess,
          life: 4000,
        });
        return;
      }

      setBanner(copy.errors.internal);
    } catch {
      setBanner(copy.errors.internal);
    } finally {
      setPendingRemove(false);
    }
  }

  return (
    <section
      style={{
        background: "#ffffff",
        border: "1px solid #e5e7eb",
        borderRadius: "8px",
        padding: "1rem 1.25rem",
      }}
      aria-label={copy.title}
    >
      <Toast ref={toastRef} position="top-right" />
      <ConfirmDialog />

      <h2 style={{ margin: "0 0 0.35rem", fontSize: "1.1rem" }}>{copy.title}</h2>
      <p style={{ margin: "0 0 1rem", fontSize: "0.875rem", color: "#6b7280" }}>
        {copy.subtitle}
      </p>

      {banner ? (
        <Message severity="error" text={banner} style={{ width: "100%", marginBottom: "1rem" }} />
      ) : null}

      <div style={{ marginBottom: "1.25rem" }}>
        <p style={{ margin: "0 0 0.5rem", fontWeight: 600, fontSize: "0.9rem" }}>
          {copy.logoLabel}
        </p>
        <p style={{ margin: "0 0 0.75rem", fontSize: "0.8125rem", color: "#6b7280" }}>
          {hintsText}
        </p>

        {logoPreviewUrl ? (
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "1rem",
              flexWrap: "wrap",
              marginBottom: "0.75rem",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- authenticated media serve URL */}
            <img
              src={logoPreviewUrl}
              alt={copy.previewAlt}
              style={{
                maxWidth: "120px",
                maxHeight: "120px",
                objectFit: "contain",
                border: "1px solid #e5e7eb",
                borderRadius: "6px",
                padding: "0.35rem",
                background: "#f9fafb",
              }}
            />
            <Button
              type="button"
              label={pendingRemove ? copy.removing : copy.remove}
              icon="pi pi-trash"
              severity="danger"
              outlined
              size="small"
              disabled={busy}
              loading={pendingRemove}
              onClick={requestRemove}
            />
          </div>
        ) : (
          <p style={{ margin: "0 0 0.75rem", fontSize: "0.875rem", color: "#6b7280" }}>
            {copy.emptyLogo}
          </p>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ display: "none" }}
          onChange={(event) => void handleFileChange(event)}
        />

        {pendingUpload ? (
          <ProgressBar mode="indeterminate" style={{ height: "4px", marginBottom: "0.5rem" }} />
        ) : null}

        <Button
          type="button"
          label={pendingUpload ? copy.uploading : copy.upload}
          icon="pi pi-upload"
          size="small"
          disabled={busy}
          loading={pendingUpload}
          onClick={openFilePicker}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
          }}
        >
          <label htmlFor="branding-subtitles-toggle" style={{ fontSize: "0.9rem" }}>
            {copy.toggleSubtitles}
          </label>
          <InputSwitch
            inputId="branding-subtitles-toggle"
            checked={assemblyConfig.subtitlesEnabled}
            disabled={busy}
            onChange={(event) => handleSubtitlesChange(event.value)}
          />
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
          }}
        >
          <label htmlFor="branding-logo-toggle" style={{ fontSize: "0.9rem" }}>
            {copy.toggleLogo}
          </label>
          <InputSwitch
            inputId="branding-logo-toggle"
            checked={assemblyConfig.logoEnabled}
            disabled={busy}
            onChange={(event) => handleLogoToggleChange(event.value)}
          />
        </div>
      </div>
    </section>
  );
}
