/**
 * Pure helpers for card thumbnails over authenticated `/api/media/assets/{id}` paths.
 * Never point UI at raw private-bucket public URLs.
 */

export type MediaThumbnailKind = "video" | "image" | "auto";

export type MediaThumbnailRenderMode =
  | "poster"
  | "video"
  | "image"
  | "placeholder";

const APP_MEDIA_ASSET_PATH =
  /^\/api\/media\/assets\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\?[^#]*)?$/i;

export function isAppMediaAssetPreviewPath(src: string): boolean {
  const withoutHash = src.split("#")[0] ?? "";
  return APP_MEDIA_ASSET_PATH.test(withoutHash);
}

/** Ensure a video thumbnail can seek a near-start frame for poster-like paint. */
export function videoThumbnailSrc(src: string): string {
  const hashIndex = src.indexOf("#");
  if (hashIndex >= 0) {
    const hash = src.slice(hashIndex + 1);
    if (/^t=/i.test(hash) || /(^|&)t=/i.test(hash)) {
      return src;
    }
    return `${src.slice(0, hashIndex)}#t=0.1`;
  }
  return `${src}#t=0.1`;
}

export function resolveMediaThumbnailMode(input: {
  src?: string | null;
  posterSrc?: string | null;
  kind?: MediaThumbnailKind;
  posterFailed?: boolean;
  mediaFailed?: boolean;
}): MediaThumbnailRenderMode {
  const kind = input.kind ?? "auto";
  const src = input.src?.trim() || null;
  const posterSrc = input.posterSrc?.trim() || null;

  if (input.mediaFailed) {
    return "placeholder";
  }

  if (posterSrc && !input.posterFailed) {
    return "poster";
  }

  if (!src) {
    return "placeholder";
  }

  if (kind === "image") {
    return "image";
  }

  if (kind === "video") {
    return "video";
  }

  // auto: prefer video when a poster failed (still have src); otherwise image
  // only when callers mark kind=image. Unknown app media without poster → video.
  if (input.posterFailed && src) {
    return "video";
  }

  return "video";
}
