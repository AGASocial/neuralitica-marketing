"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";
import {
  resolveMediaThumbnailMode,
  videoThumbnailSrc,
  type MediaThumbnailKind,
} from "@/lib/media/media-thumbnail";

export type MediaThumbnailProps = {
  /** Authenticated app preview path, e.g. `/api/media/assets/{uuid}`. */
  src?: string | null;
  /** Optional cover/poster preview path (image). */
  posterSrc?: string | null;
  /**
   * `video` (default for reel output) → muted metadata video when no poster.
   * `image` → `<img>` with onError fallback.
   * `auto` → treat as video when no poster (assembled reels).
   */
  kind?: MediaThumbnailKind;
  className?: string;
  alt?: string;
};

function NeutralPlaceholder({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("bg-gradient-to-br from-panel to-deep", className)}
    />
  );
}

/**
 * Card/list thumbnail for authenticated media. Never leaves a broken `<img>`
 * for video assets — uses muted `<video preload="metadata">` + `#t=0.1`.
 */
export function MediaThumbnail({
  src,
  posterSrc,
  kind = "video",
  className,
  alt = "",
}: MediaThumbnailProps) {
  const [posterFailed, setPosterFailed] = useState(false);
  const [mediaFailed, setMediaFailed] = useState(false);

  const mode = resolveMediaThumbnailMode({
    src,
    posterSrc,
    kind,
    posterFailed,
    mediaFailed,
  });

  if (mode === "placeholder") {
    return <NeutralPlaceholder className={className} />;
  }

  if (mode === "poster" && posterSrc) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin media serve
      <img
        src={posterSrc}
        alt={alt}
        className={cn("object-cover", className)}
        onError={() => setPosterFailed(true)}
      />
    );
  }

  if (mode === "image" && src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin media serve
      <img
        src={src}
        alt={alt}
        className={cn("object-cover", className)}
        onError={() => setMediaFailed(true)}
      />
    );
  }

  if (mode === "video" && src) {
    return (
      <video
        muted
        playsInline
        preload="metadata"
        src={videoThumbnailSrc(src)}
        className={cn("object-cover", className)}
        onError={() => setMediaFailed(true)}
        aria-hidden={alt ? undefined : true}
        aria-label={alt || undefined}
      />
    );
  }

  return <NeutralPlaceholder className={className} />;
}
