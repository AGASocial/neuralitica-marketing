"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type ChangeEvent } from "react";
import { Button } from "primereact/button";
import { ConfirmDialog, confirmDialog } from "primereact/confirmdialog";
import { Message } from "primereact/message";
import { ProgressBar } from "primereact/progressbar";
import { Toast } from "primereact/toast";

import type {
  AvatarReferenceAssetItem,
  AvatarReferenceAssetsPageResult,
  DeleteAvatarReferenceAssetErrorCode,
  MediaDetectedMime,
  MediaUploadErrorCode,
} from "@/lib/contracts/media-assets";
import {
  AVATAR_REFERENCE_HINT_MAX_IMAGE_MIB,
  AVATAR_REFERENCE_HINT_MAX_VIDEO_MIB,
  AVATAR_REFERENCE_MAX_ASSETS,
} from "@/lib/contracts/media-assets";
import { deleteAvatarReferenceAsset } from "@/lib/media/delete-avatar-reference-asset";
import { uploadAvatarReferenceAsset } from "@/lib/media/upload-avatar-reference-asset";

export type AvatarReferencesCopy = {
  title: string;
  subtitle: string;
  hints: string;
  empty: string;
  consentRequired: string;
  limitReached: string;
  upload: string;
  uploading: string;
  delete: string;
  deleting: string;
  previewAlt: string;
  typeImage: string;
  typeVideo: string;
  sizeLabel: string;
  dateLabel: string;
  filenameLabel: string;
  countLabel: string;
  toastUploadSuccess: string;
  toastDeleteSuccess: string;
  loadFailed: string;
  confirmDelete: {
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
    videoTooLong: string;
    assetLimitReached: string;
    ownAvatarConsentRequired: string;
    notFound: string;
    referencedByJob: string;
    unauthenticated: string;
    forbidden: string;
    internal: string;
  };
};

type AvatarReferencesSectionProps = {
  initial: AvatarReferenceAssetsPageResult;
  locale: string;
  copy: AvatarReferencesCopy;
  preferencesPending?: boolean;
};

function formatTimestamp(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatBytes(sizeBytes: number, locale: string): string {
  const kib = 1024;
  const mib = kib * 1024;
  if (sizeBytes >= mib) {
    return `${new Intl.NumberFormat(locale, {
      maximumFractionDigits: 1,
    }).format(sizeBytes / mib)} MiB`;
  }
  return `${new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
  }).format(Math.max(1, Math.round(sizeBytes / kib)))} KiB`;
}

function isVideoMime(mime: MediaDetectedMime): boolean {
  return mime === "video/mp4" || mime === "video/quicktime";
}

function uploadMessageForCode(
  code: MediaUploadErrorCode,
  copy: AvatarReferencesCopy,
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
    case "VIDEO_TOO_LONG":
      return copy.errors.videoTooLong;
    case "ASSET_LIMIT_REACHED":
      return copy.errors.assetLimitReached;
    case "OWN_AVATAR_CONSENT_REQUIRED":
      return copy.errors.ownAvatarConsentRequired;
    case "UNAUTHENTICATED":
      return copy.errors.unauthenticated;
    case "FORBIDDEN":
      return copy.errors.forbidden;
    default:
      return copy.errors.internal;
  }
}

function deleteMessageForCode(
  code: DeleteAvatarReferenceAssetErrorCode,
  copy: AvatarReferencesCopy,
): string {
  switch (code) {
    case "VALIDATION_ERROR":
      return copy.errors.validation;
    case "FORBIDDEN_FIELDS":
      return copy.errors.forbiddenFields;
    case "NOT_FOUND":
      return copy.errors.notFound;
    case "ASSET_REFERENCED_BY_JOB":
      return copy.errors.referencedByJob;
    case "UNAUTHENTICATED":
      return copy.errors.unauthenticated;
    case "FORBIDDEN":
      return copy.errors.forbidden;
    default:
      return copy.errors.internal;
  }
}

/**
 * Referencias de avatar propio (US-3.3).
 * Preferencias embed below Consentimiento — file picker only; no camera/mic.
 */
export function AvatarReferencesSection({
  initial,
  locale,
  copy,
  preferencesPending = false,
}: AvatarReferencesSectionProps) {
  const router = useRouter();
  const toastRef = useRef<Toast>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadFailed = "loadFailed" in initial && initial.loadFailed;
  const [assets, setAssets] = useState<AvatarReferenceAssetItem[]>(
    () => initial.assets,
  );
  const [consentActive, setConsentActive] = useState(
    () => initial.ownAvatarConsentActive,
  );
  const [pendingUpload, setPendingUpload] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(
    () => (loadFailed ? copy.loadFailed : null),
  );

  const maxAssets = initial.maxAssets || AVATAR_REFERENCE_MAX_ASSETS;
  const atCap = assets.length >= maxAssets;
  const canUpload =
    !loadFailed && consentActive && !atCap && !preferencesPending;
  const busy = pendingUpload || pendingDeleteId != null || preferencesPending;

  const hintsText = copy.hints
    .replace("{imageMax}", String(AVATAR_REFERENCE_HINT_MAX_IMAGE_MIB))
    .replace("{videoMax}", String(AVATAR_REFERENCE_HINT_MAX_VIDEO_MIB))
    .replace("{maxAssets}", String(maxAssets));

  const countText = copy.countLabel
    .replace("{count}", String(assets.length))
    .replace("{max}", String(maxAssets));

  function clearFeedback() {
    setBanner(null);
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file || busy || !canUpload) {
      return;
    }

    setPendingUpload(true);
    clearFeedback();

    try {
      const formData = new FormData();
      formData.set("file", file);

      const result = await uploadAvatarReferenceAsset(formData);

      if (result.ok) {
        setAssets((prev) => {
          if (prev.some((a) => a.id === result.asset.id)) {
            return prev;
          }
          return [...prev, result.asset];
        });
        setConsentActive(true);
        toastRef.current?.show({
          severity: "success",
          summary: copy.toastUploadSuccess,
          life: 5000,
        });
        router.refresh();
        return;
      }

      setBanner(uploadMessageForCode(result.error.code, copy));
    } catch {
      setBanner(copy.errors.internal);
    } finally {
      setPendingUpload(false);
    }
  }

  async function performDelete(assetId: string) {
    if (busy) {
      return;
    }

    setPendingDeleteId(assetId);
    clearFeedback();

    try {
      const result = await deleteAvatarReferenceAsset({ assetId });

      if (result.ok) {
        setAssets((prev) => prev.filter((a) => a.id !== result.deletedAssetId));
        toastRef.current?.show({
          severity: "success",
          summary: copy.toastDeleteSuccess,
          life: 5000,
        });
        router.refresh();
        return;
      }

      setBanner(deleteMessageForCode(result.error.code, copy));
    } catch {
      setBanner(copy.errors.internal);
    } finally {
      setPendingDeleteId(null);
    }
  }

  function requestDelete(asset: AvatarReferenceAssetItem) {
    if (busy) {
      return;
    }

    confirmDialog({
      header: copy.confirmDelete.header,
      message: copy.confirmDelete.message.replace(
        "{filename}",
        asset.metadata.originalFilename,
      ),
      acceptLabel: copy.confirmDelete.accept,
      rejectLabel: copy.confirmDelete.reject,
      acceptClassName: "p-button-danger",
      accept: () => void performDelete(asset.id),
    });
  }

  return (
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
      <ConfirmDialog />
      <Toast ref={toastRef} position="top-right" />

      <div>
        <h2 style={{ margin: "0 0 0.35rem", fontSize: "1.1rem" }}>
          {copy.title}
        </h2>
        <p
          style={{
            margin: 0,
            color: "#6b7280",
            fontSize: "0.875rem",
          }}
        >
          {copy.subtitle}
        </p>
      </div>

      <p
        style={{
          margin: 0,
          color: "#4b5563",
          fontSize: "0.875rem",
          lineHeight: 1.5,
        }}
      >
        {hintsText}
      </p>

      <p
        style={{
          margin: 0,
          color: "#6b7280",
          fontSize: "0.8125rem",
        }}
      >
        {countText}
      </p>

      {banner ? (
        <Message severity="error" text={banner} style={{ width: "100%" }} />
      ) : null}

      {!consentActive && !loadFailed ? (
        <Message
          severity="warn"
          text={copy.consentRequired}
          style={{ width: "100%" }}
        />
      ) : null}

      {consentActive && atCap ? (
        <Message
          severity="info"
          text={copy.limitReached}
          style={{ width: "100%" }}
        />
      ) : null}

      {pendingUpload ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <span style={{ fontSize: "0.875rem", color: "#4b5563" }}>
            {copy.uploading}
          </span>
          <ProgressBar mode="indeterminate" style={{ height: "6px" }} />
        </div>
      ) : null}

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,.jpg,.jpeg,.png,.webp,.mp4,.mov"
          style={{ display: "none" }}
          onChange={(e) => void handleFileChange(e)}
          disabled={!canUpload || busy}
        />
        <Button
          type="button"
          label={pendingUpload ? copy.uploading : copy.upload}
          icon="pi pi-upload"
          onClick={() => fileInputRef.current?.click()}
          disabled={!canUpload || busy}
          loading={pendingUpload}
        />
      </div>

      {assets.length === 0 && !loadFailed ? (
        <Message severity="info" text={copy.empty} style={{ width: "100%" }} />
      ) : null}

      {assets.length > 0 ? (
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
          }}
        >
          {assets.map((asset) => {
            const video = isVideoMime(asset.metadata.detectedMime);
            const deleting = pendingDeleteId === asset.id;

            return (
              <li
                key={asset.id}
                style={{
                  display: "flex",
                  gap: "0.75rem",
                  alignItems: "flex-start",
                  border: "1px solid #e5e7eb",
                  borderRadius: "6px",
                  padding: "0.75rem",
                }}
              >
                <div
                  style={{
                    width: 96,
                    height: 96,
                    flexShrink: 0,
                    background: "#f3f4f6",
                    borderRadius: "4px",
                    overflow: "hidden",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {video ? (
                    <video
                      src={asset.previewUrl}
                      muted
                      playsInline
                      preload="metadata"
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                      aria-label={copy.previewAlt.replace(
                        "{filename}",
                        asset.metadata.originalFilename,
                      )}
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin serve; not a static/public asset
                    <img
                      src={asset.previewUrl}
                      alt={copy.previewAlt.replace(
                        "{filename}",
                        asset.metadata.originalFilename,
                      )}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  )}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      margin: "0 0 0.35rem",
                      fontWeight: 600,
                      wordBreak: "break-word",
                    }}
                  >
                    {copy.filenameLabel.replace(
                      "{filename}",
                      asset.metadata.originalFilename,
                    )}
                  </p>
                  <p
                    style={{
                      margin: "0 0 0.25rem",
                      color: "#4b5563",
                      fontSize: "0.875rem",
                    }}
                  >
                    {video ? copy.typeVideo : copy.typeImage}
                    {" · "}
                    {copy.sizeLabel.replace(
                      "{size}",
                      formatBytes(asset.metadata.sizeBytes, locale),
                    )}
                  </p>
                  <p
                    style={{
                      margin: 0,
                      color: "#6b7280",
                      fontSize: "0.8125rem",
                    }}
                  >
                    {copy.dateLabel.replace(
                      "{date}",
                      formatTimestamp(asset.createdAt, locale),
                    )}
                  </p>
                </div>

                <Button
                  type="button"
                  icon="pi pi-trash"
                  severity="danger"
                  outlined
                  aria-label={copy.delete}
                  onClick={() => requestDelete(asset)}
                  disabled={busy}
                  loading={deleting}
                />
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
