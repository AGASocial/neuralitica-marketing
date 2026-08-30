/** Caption teaser helpers for approval list cards (US-11.1) — safe for FE + BE. */

export const APPROVAL_CAPTION_PREVIEW_MAX = 120 as const;

export function truncateCaptionPreview(
  body: string,
  max = APPROVAL_CAPTION_PREVIEW_MAX,
): string {
  const trimmed = body.trim();
  if (trimmed.length <= max) {
    return trimmed;
  }
  return `${trimmed.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function mediaPreviewUrl(assetId: string): string {
  return `/api/media/assets/${assetId}`;
}

export const GENERIC_AVATAR_DISCLOSURE_MESSAGE_KEY =
  "legal.genericAvatarDisclosure" as const;
