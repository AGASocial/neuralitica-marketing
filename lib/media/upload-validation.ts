import "server-only";

/**
 * Shared upload validation stack (SECURITY_BASELINE §3 / US-3.3).
 * Export for US-8.3 / US-9.2 — do not fork validation.
 *
 * Pipeline: consent → count → buffer + size → magic bytes → key → metadata.
 * Video duration probe deferred to US-8 ingest (optional V1 per CONTRACT).
 */

import { randomUUID } from "node:crypto";

import type { MediaUploadErrorCode } from "@/lib/contracts/media-assets";
import { STORAGE_KEY_REGEX } from "@/lib/contracts/media-assets";
import {
  ALLOWED_DETECTED_MIMES,
  MIME_TO_EXTENSION,
  getMaxAvatarReferences,
  getMaxImageBytes,
  getMaxVideoBytes,
  isImageMime,
  isVideoMime,
} from "@/lib/media/media-config";
import { sanitizeOriginalFilename } from "@/lib/media/media-helpers";
import { hasActiveAvatarConsent } from "@/lib/visual-preferences/has-active-avatar-consent";

export type MediaUploadAssetType = "avatar_reference";

export type ValidatedMediaUpload = {
  detectedMime: string;
  sizeBytes: number;
  storageKey: string;
  metadata: {
    originalFilename: string;
    detectedMime: string;
    sizeBytes: number;
    width?: number;
    height?: number;
    durationSec?: number;
  };
  buffer: Buffer;
};

export type ValidateMediaUploadResult =
  | { ok: true; prepared: ValidatedMediaUpload }
  | { ok: false; error: { code: MediaUploadErrorCode; messageKey?: string } };

const HARD_READ_CAP_BYTES = Math.max(
  getMaxVideoBytes(),
  getMaxImageBytes(),
) + 1;

/**
 * Optional extension point for future AV (ClamAV etc.). No-op in V1.
 */
export type AfterValidateHook = (buffer: Buffer) => Promise<void>;

function fail(
  code: MediaUploadErrorCode,
  messageKey?: string,
): ValidateMediaUploadResult {
  return { ok: false, error: { code, messageKey } };
}

async function readFileToBuffer(
  file: File | Buffer,
  maxBytes: number,
): Promise<{ ok: true; buffer: Buffer } | { ok: false; tooLarge: true }> {
  if (Buffer.isBuffer(file)) {
    if (file.byteLength > maxBytes) {
      return { ok: false, tooLarge: true };
    }
    return { ok: true, buffer: file };
  }

  // Stream-ish: abort if declared size over hard cap; still re-check after read.
  if (typeof file.size === "number" && file.size > maxBytes) {
    return { ok: false, tooLarge: true };
  }

  const ab = await file.arrayBuffer();
  if (ab.byteLength > maxBytes) {
    return { ok: false, tooLarge: true };
  }
  return { ok: true, buffer: Buffer.from(ab) };
}

/**
 * Shared SECURITY_BASELINE §3 pipeline.
 * Caller must run requireActive before invoke; validator assumes authenticated userId.
 */
export async function validateAndPrepareMediaUpload(input: {
  userId: string;
  assetType: MediaUploadAssetType;
  file: File | Buffer;
  originalFilename: string;
  existingAssetCount: number;
  afterValidate?: AfterValidateHook;
}): Promise<ValidateMediaUploadResult> {
  if (input.assetType !== "avatar_reference") {
    return fail("VALIDATION_ERROR", "preferences.references.errors.validation");
  }

  const consentActive = await hasActiveAvatarConsent(input.userId);
  if (!consentActive) {
    return fail(
      "OWN_AVATAR_CONSENT_REQUIRED",
      "preferences.errors.ownAvatarConsentRequired",
    );
  }

  const maxAssets = getMaxAvatarReferences();
  if (input.existingAssetCount >= maxAssets) {
    return fail(
      "ASSET_LIMIT_REACHED",
      "preferences.references.errors.assetLimitReached",
    );
  }

  // Read up to video max first; refine by class after magic-byte detect.
  const hardCap = Math.max(getMaxVideoBytes(), getMaxImageBytes());
  const read = await readFileToBuffer(input.file, hardCap);
  if (!read.ok) {
    return fail(
      "FILE_TOO_LARGE",
      "preferences.references.errors.fileTooLarge",
    );
  }

  const buffer = read.buffer;
  if (buffer.byteLength === 0) {
    return fail(
      "INVALID_FILE_TYPE",
      "preferences.references.errors.invalidFileType",
    );
  }

  // Guard against accidental oversize when env is weird
  if (buffer.byteLength > HARD_READ_CAP_BYTES) {
    return fail(
      "FILE_TOO_LARGE",
      "preferences.references.errors.fileTooLarge",
    );
  }

  // Dynamic import: file-type is ESM-only (no CJS main export).
  const { fileTypeFromBuffer } = await import("file-type");
  const detected = await fileTypeFromBuffer(buffer);
  if (!detected || !ALLOWED_DETECTED_MIMES.has(detected.mime)) {
    return fail(
      "INVALID_FILE_TYPE",
      "preferences.references.errors.invalidFileType",
    );
  }

  const detectedMime = detected.mime;
  const classMax = isImageMime(detectedMime)
    ? getMaxImageBytes()
    : isVideoMime(detectedMime)
      ? getMaxVideoBytes()
      : 0;

  if (classMax <= 0 || buffer.byteLength > classMax) {
    return fail(
      "FILE_TOO_LARGE",
      "preferences.references.errors.fileTooLarge",
    );
  }

  // Video duration probe: deferred to US-8 ingest (CONTRACT optional V1).

  const ext = MIME_TO_EXTENSION[detectedMime];
  if (!ext) {
    return fail(
      "INVALID_FILE_TYPE",
      "preferences.references.errors.invalidFileType",
    );
  }

  const storageKey = `${randomUUID()}.${ext}`;
  if (!STORAGE_KEY_REGEX.test(storageKey)) {
    return fail("INTERNAL_ERROR", "preferences.references.errors.internal");
  }
  if (
    storageKey.includes("..") ||
    storageKey.includes("/") ||
    storageKey.includes("\\")
  ) {
    return fail("INTERNAL_ERROR", "preferences.references.errors.internal");
  }

  if (input.afterValidate) {
    await input.afterValidate(buffer);
  }

  return {
    ok: true,
    prepared: {
      detectedMime,
      sizeBytes: buffer.byteLength,
      storageKey,
      metadata: {
        originalFilename: sanitizeOriginalFilename(input.originalFilename),
        detectedMime,
        sizeBytes: buffer.byteLength,
      },
      buffer,
    },
  };
}
