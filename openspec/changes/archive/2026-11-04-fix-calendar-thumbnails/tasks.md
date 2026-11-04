# Tasks

## 1. OpenSpec validate

- [x] 1.1 Run `npx -y @fission-ai/openspec@latest validate --all --strict` and fix any errors

## 2. Shared MediaThumbnail

- [x] 2.1 Add `components/media/MediaThumbnail.tsx` (client): authenticated `src`/`posterSrc`, video-without-poster → muted `playsInline` `preload="metadata"` `#t=0.1`, img `onError` → video or placeholder; verify unit tests cover video/img/fallback modes
- [x] 2.2 Wire into `OperatorCalendarView` SlotCard and `ReelCard`; audit Mis videos / dashboard recent / chat for broken `<img>` video thumbnails and fix if present; verify no calendar SlotCard uses raw `<img src={thumbnailPreviewUrl}>`

## 3. Operator locale

- [x] 3.1 Switch `/operator/calendar` (and other cheap Avanzado pages using `resolveLocale(user…)`) to `resolveRequestLocale`; extend locale source test; verify calendar page source matches `resolveRequestLocale` and `?locale=es` path is covered by test

## 4. Verification

- [x] 4.1 Run lint, typecheck, and targeted unit tests for MediaThumbnail + i18n; verify they pass

## Workflow follow-up

- Archive `fix-calendar-thumbnails` after merge (`openspec archive` / `/opsx-archive`)
