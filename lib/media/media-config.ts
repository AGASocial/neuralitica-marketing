import "server-only";

import path from "node:path";

/** Default max avatar_reference rows per client (CONTRACT). */
export const DEFAULT_MAX_AVATAR_REFERENCES = 10;

/** Default image size cap — 10 MiB. */
export const DEFAULT_MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** Default video size cap — 50 MiB. */
export const DEFAULT_MAX_VIDEO_BYTES = 50 * 1024 * 1024;

/** Optional video duration cap (seconds). Probe deferred to US-8 ingest in V1. */
export const DEFAULT_MAX_VIDEO_DURATION_SEC = 30;

const IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const VIDEO_MIMES = new Set(["video/mp4", "video/quicktime"]);

export function isImageMime(mime: string): boolean {
  return IMAGE_MIMES.has(mime);
}

export function isVideoMime(mime: string): boolean {
  return VIDEO_MIMES.has(mime);
}

export function getMaxAvatarReferences(): number {
  const raw = process.env.NEURAMARK_MEDIA_MAX_AVATAR_REFERENCES;
  if (!raw) return DEFAULT_MAX_AVATAR_REFERENCES;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_AVATAR_REFERENCES;
}

export function getMaxImageBytes(): number {
  const raw = process.env.NEURAMARK_MEDIA_MAX_IMAGE_BYTES;
  if (!raw) return DEFAULT_MAX_IMAGE_BYTES;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_IMAGE_BYTES;
}

export function getMaxVideoBytes(): number {
  const raw = process.env.NEURAMARK_MEDIA_MAX_VIDEO_BYTES;
  if (!raw) return DEFAULT_MAX_VIDEO_BYTES;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_VIDEO_BYTES;
}

export function getMaxVideoDurationSec(): number {
  const raw = process.env.NEURAMARK_MEDIA_MAX_VIDEO_DURATION_SEC;
  if (!raw) return DEFAULT_MAX_VIDEO_DURATION_SEC;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_VIDEO_DURATION_SEC;
}

/** Default client logo cap — 2 MiB (US-9.2). */
export const DEFAULT_MAX_LOGO_BYTES = 2 * 1024 * 1024;

export function getMaxLogoBytes(): number {
  const raw = process.env.NEURAMARK_MEDIA_MAX_LOGO_BYTES;
  if (!raw) return DEFAULT_MAX_LOGO_BYTES;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_LOGO_BYTES;
}

/**
 * Resolve LocalDiskStorage root. Must not be under public/ (asserted at storage init).
 */
export function resolveMediaRoot(): string {
  const configured = process.env.NEURAMARK_MEDIA_ROOT?.trim() || "var/media";
  if (path.isAbsolute(configured)) {
    return path.normalize(configured);
  }
  return path.resolve(process.cwd(), configured);
}

/** MIME → storage_key extension map (CONTRACT). */
export const MIME_TO_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
};

export const ALLOWED_DETECTED_MIMES = new Set(Object.keys(MIME_TO_EXTENSION));
