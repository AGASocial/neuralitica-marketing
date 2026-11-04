"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import { TrashIcon, UploadIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { IndeterminateProgress } from "@/components/ui/indeterminate-progress";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { StatusAlert } from "@/components/ui/status-alert";
import { Switch } from "@/components/ui/switch";

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
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);

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
        toast.success(copy.toastDefaultsSuccess, { duration: 4000 });
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
        toast.success(copy.toastUploadSuccess, { duration: 4000 });
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

    setConfirmRemoveOpen(true);
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
        toast.success(copy.toastRemoveSuccess, { duration: 4000 });
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
      className="rounded-xl border border-edge bg-panel px-5 py-4"
      aria-label={copy.title}
    >
      <ConfirmDialog
        open={confirmRemoveOpen}
        onOpenChange={setConfirmRemoveOpen}
        header={copy.confirmRemove.header}
        message={copy.confirmRemove.message}
        acceptLabel={copy.confirmRemove.accept}
        rejectLabel={copy.confirmRemove.reject}
        destructive
        onAccept={() => void handleRemove()}
      />

      <h2 className="mb-1.5 font-display text-xl text-fog">{copy.title}</h2>
      <p className="mb-4 text-sm text-dim">{copy.subtitle}</p>

      {banner ? (
        <StatusAlert severity="error" text={banner} className="mb-4 w-full" />
      ) : null}

      <div className="mb-5">
        <p className="mb-2 text-[0.9rem] font-semibold text-fog">{copy.logoLabel}</p>
        <p className="mb-3 text-[0.8125rem] text-dim">{hintsText}</p>

        {logoPreviewUrl ? (
          <div className="mb-3 flex flex-wrap items-start gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- authenticated media serve URL */}
            <img
              src={logoPreviewUrl}
              alt={copy.previewAlt}
              className="max-h-[120px] max-w-[120px] rounded-md border border-edge bg-deep p-1.5 object-contain"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-rose/60 text-rose hover:bg-rose/10 hover:text-rose"
              disabled={busy}
              onClick={requestRemove}
            >
              {pendingRemove ? <Spinner className="size-4 text-current" /> : <TrashIcon />}
              {pendingRemove ? copy.removing : copy.remove}
            </Button>
          </div>
        ) : (
          <p className="mb-3 text-sm text-dim">{copy.emptyLogo}</p>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(event) => void handleFileChange(event)}
        />

        {pendingUpload ? (
          <IndeterminateProgress label={copy.uploading} className="mb-2 h-1" />
        ) : null}

        <Button type="button" size="sm" disabled={busy} onClick={openFilePicker}>
          {pendingUpload ? <Spinner className="size-4 text-current" /> : <UploadIcon />}
          {pendingUpload ? copy.uploading : copy.upload}
        </Button>
      </div>

      <div className="flex flex-col gap-3.5">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="branding-subtitles-toggle" className="text-[0.9rem] text-fog">
            {copy.toggleSubtitles}
          </Label>
          <Switch
            id="branding-subtitles-toggle"
            checked={assemblyConfig.subtitlesEnabled}
            disabled={busy}
            onCheckedChange={handleSubtitlesChange}
          />
        </div>
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="branding-logo-toggle" className="text-[0.9rem] text-fog">
            {copy.toggleLogo}
          </Label>
          <Switch
            id="branding-logo-toggle"
            checked={assemblyConfig.logoEnabled}
            disabled={busy}
            onCheckedChange={handleLogoToggleChange}
          />
        </div>
      </div>
    </section>
  );
}
