/**
 * Shared upload validation stack (SECURITY_BASELINE §3 / US-3.3).
 * Export for US-8.3 / US-9.2 — do not fork validation.
 *
 * Pipeline: consent → count → buffer + size → magic bytes → duration (generated_video) → key.
 */
import "server-only";

import { randomUUID } from "node:crypto";

import type { MediaUploadAssetType } from "@/lib/contracts/media-assets";
import type { MediaUploadErrorCode } from "@/lib/contracts/media-assets";
import { CLIENT_LOGO_STORAGE_KEY_REGEX, STORAGE_KEY_REGEX } from "@/lib/contracts/media-assets";
import {
  ALLOWED_DETECTED_MIMES,
  MIME_TO_EXTENSION,
  getMaxAvatarReferences,
  getMaxImageBytes,
  getMaxLogoBytes,
  getMaxVideoBytes,
  getMaxVideoDurationSec,
  isImageMime,
  isVideoMime,
} from "@/lib/media/media-config";
import { sanitizeOriginalFilename } from "@/lib/media/media-helpers";
import {
  probeVideoDurationSec,
  roundDurationSecDown,
} from "@/lib/media/probe-video-duration";
import { hasActiveAvatarConsent } from "@/lib/visual-preferences/has-active-avatar-consent";

export type { MediaUploadAssetType };

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

const GENERATED_VIDEO_MIMES = new Set(["video/mp4", "video/quicktime"]);

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

  if (typeof file.size === "number" && file.size > maxBytes) {
    return { ok: false, tooLarge: true };
  }

  const ab = await file.arrayBuffer();
  if (ab.byteLength > maxBytes) {
    return { ok: false, tooLarge: true };
  }
  return { ok: true, buffer: Buffer.from(ab) };
}

async function validateGeneratedVideoUpload(input: {
  file: File | Buffer;
  originalFilename: string;
  afterValidate?: AfterValidateHook;
}): Promise<ValidateMediaUploadResult> {
  const maxBytes = getMaxVideoBytes();
  const read = await readFileToBuffer(input.file, maxBytes);
  if (!read.ok) {
    return fail("FILE_TOO_LARGE");
  }

  const buffer = read.buffer;
  if (buffer.byteLength === 0) {
    return fail("INVALID_FILE_TYPE");
  }

  if (buffer.byteLength > HARD_READ_CAP_BYTES) {
    return fail("FILE_TOO_LARGE");
  }

  const { fileTypeFromBuffer } = await import("file-type");
  const detected = await fileTypeFromBuffer(buffer);
  if (!detected || !GENERATED_VIDEO_MIMES.has(detected.mime)) {
    return fail("INVALID_FILE_TYPE");
  }

  const detectedMime = detected.mime;
  if (buffer.byteLength > maxBytes) {
    return fail("FILE_TOO_LARGE");
  }

  const rawDurationSec = await probeVideoDurationSec(buffer);
  if (rawDurationSec === null) {
    return fail("VIDEO_TOO_LONG");
  }

  const durationSec = roundDurationSecDown(rawDurationSec);
  const maxDurationSec = getMaxVideoDurationSec();
  if (durationSec <= 0 || durationSec > maxDurationSec) {
    return fail("VIDEO_TOO_LONG");
  }

  const ext = MIME_TO_EXTENSION[detectedMime];
  if (!ext) {
    return fail("INVALID_FILE_TYPE");
  }

  const storageKey = `${randomUUID()}.${ext}`;
  if (!STORAGE_KEY_REGEX.test(storageKey)) {
    return fail("INTERNAL_ERROR");
  }
  if (
    storageKey.includes("..") ||
    storageKey.includes("/") ||
    storageKey.includes("\\")
  ) {
    return fail("INTERNAL_ERROR");
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
        durationSec,
      },
      buffer,
    },
  };
}

async function validateClientLogoUpload(input: {
  userId: string;
  file: File | Buffer;
  originalFilename: string;
  afterValidate?: AfterValidateHook;
}): Promise<ValidateMediaUploadResult> {
  const maxBytes = getMaxLogoBytes();
  const read = await readFileToBuffer(input.file, maxBytes);
  if (!read.ok) {
    return fail("FILE_TOO_LARGE");
  }

  const buffer = read.buffer;
  if (buffer.byteLength === 0) {
    return fail("INVALID_FILE_TYPE");
  }

  const { fileTypeFromBuffer } = await import("file-type");
  const detected = await fileTypeFromBuffer(buffer);
  const logoMimes = new Set(["image/jpeg", "image/png", "image/webp"]);
  if (!detected || !logoMimes.has(detected.mime)) {
    return fail("INVALID_FILE_TYPE");
  }

  const detectedMime = detected.mime;
  if (buffer.byteLength > maxBytes) {
    return fail("FILE_TOO_LARGE");
  }

  const ext = MIME_TO_EXTENSION[detectedMime];
  if (!ext) {
    return fail("INVALID_FILE_TYPE");
  }

  const storageKey = `neuramark/${input.userId}/logo-${randomUUID()}.${ext}`;
  if (!CLIENT_LOGO_STORAGE_KEY_REGEX.test(storageKey)) {
    return fail("INTERNAL_ERROR");
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

async function validateAvatarReferenceUpload(input: {
  userId: string;
  file: File | Buffer;
  originalFilename: string;
  existingAssetCount: number;
  afterValidate?: AfterValidateHook;
}): Promise<ValidateMediaUploadResult> {
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

  if (buffer.byteLength > HARD_READ_CAP_BYTES) {
    return fail(
      "FILE_TOO_LARGE",
      "preferences.references.errors.fileTooLarge",
    );
  }

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

/**
 * Shared SECURITY_BASELINE §3 pipeline.
 * Caller must run auth before invoke; validator assumes authenticated userId.
 */
export async function validateAndPrepareMediaUpload(input: {
  userId: string;
  assetType: MediaUploadAssetType;
  file: File | Buffer;
  originalFilename: string;
  existingAssetCount: number;
  afterValidate?: AfterValidateHook;
}): Promise<ValidateMediaUploadResult> {
  if (input.assetType === "generated_video") {
    return validateGeneratedVideoUpload({
      file: input.file,
      originalFilename: input.originalFilename,
      afterValidate: input.afterValidate,
    });
  }

  if (input.assetType === "client_logo") {
    return validateClientLogoUpload({
      userId: input.userId,
      file: input.file,
      originalFilename: input.originalFilename,
      afterValidate: input.afterValidate,
    });
  }

  return validateAvatarReferenceUpload(input);
}
