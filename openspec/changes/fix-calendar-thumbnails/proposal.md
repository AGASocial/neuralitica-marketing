# Proposal

## Why

Operator calendar cards (and other surfaces that reuse the same pattern) render `thumbnailPreviewUrl` with `<img>`, but the URL is the authenticated `/api/media/assets/{id}` path for a private assembled MP4. Browsers cannot display video in an image tag, so cards show a broken thumbnail even when the asset streams correctly.

## What Changes

- Add a shared client `MediaThumbnail` that loads media only via app-authenticated preview paths (or an optional poster path), never raw public bucket URLs.
- When the asset is video and no poster exists, render a muted `<video playsInline preload="metadata">` with `#t=0.1` as the still; otherwise show a neutral placeholder. Image/poster paths use `<img>` with `onError` fallback so broken images never stick.
- Wire the component into calendar slot cards, strategy/campaña `ReelCard` thumbnails, and any other thumbnail-style renderers that currently misuse `<img>` for video assets; keep full chat / Mis videos players on authenticated preview URLs.
- Cheap i18n: Operator calendar (and other Avanzado operator pages when trivial) honor `?locale=es` via `resolveRequestLocale` + `messages/`.

## Capabilities

### New Capabilities

- `media-thumbnails`: Shared rules for rendering media previews as card thumbnails without broken `<img>` for video assets.

### Modified Capabilities

- `i18n`: Operator Advanced pages (at least calendar) resolve locale with `resolveRequestLocale` so `?locale=` overrides preferred locale.

## Impact

- `components/media/MediaThumbnail.tsx` (+ tests), `components/calendar/OperatorCalendarView.tsx`, `components/campana/ReelCard.tsx`, optional chat/Mis videos thumbnail touch-ups, `app/(app)/operator/**/page.tsx` locale resolution, `messages` only if missing keys, OpenSpec archive after merge.
- No migrations, no paid provider calls, no Instagram Graph, no avatar/HeyGen, no secrets.
