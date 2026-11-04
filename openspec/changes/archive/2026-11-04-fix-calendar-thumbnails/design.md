# Design

## Context

See proposal.md — Why. Calendar derives `thumbnailPreviewUrl` via `mediaPreviewUrl(outputMediaAssetId)` → `/api/media/assets/{id}` (already authenticated). `OperatorCalendarView` SlotCard and `ReelCard` render that URL with `<img>`. Assembled reel output is `video/mp4` in private bucket `neuramark-media`. Chat / Mis videos already use `<video src={…/api/media/assets/…}>` for full previews.

## Goals / Non-Goals

**Goals**
- Shared client thumbnail component used by calendar + ReelCard (and reusable elsewhere).
- Video-without-poster → muted metadata video + `#t=0.1`; never stuck broken `<img>`.
- Operator calendar (and cheap other operator pages) honor `resolveRequestLocale`.

**Non-Goals**
- Generating cover/poster stills server-side; migrations; public signed Supabase URLs; Instagram; avatar; paid calls.

## Decisions

1. **Shared `MediaThumbnail` client component** — Props: `src`, optional `posterSrc`, `kind` (`video` | `image` | `auto`), `className`, `alt`. Callers that know assembled output is video pass `kind="video"`.
   - Alternative: sniff Content-Type client-side → extra round-trip; rejected.
2. **Keep `/api/media/assets/{id}` as the only media URL** — Already session-gated; no new signed-URL surface required for this bug.
3. **Poster preferred when present** — If `posterSrc` set, try `<img>` first with `onError` → fall back to video frame or placeholder.
4. **Operator i18n** — Swap `resolveLocale(user?.preferredLocale)` for `await resolveRequestLocale(user?.preferredLocale)` on calendar + other Avanzado pages that already use `getTranslations` (same pattern as owner pages). Extend `dashboard-locale.test.ts`-style source check for calendar.

## Risks / Trade-offs

- [Mobile Safari frame paint] → `#t=0.1` + `preload="metadata"` + `muted` + `playsInline` is the common pattern; placeholder if `onError`.
- [Video bytes on thumbnail grids] → metadata preload only; acceptable for operator calendar density.

## Migration Plan

Deploy with app; no DB. Rollback = revert PR.

## Open Questions

None.
