# Design: Approvals cards + chat Enter

## Context

`toApprovalListItemDto` already calls `resolveApprovalListCardMeta` (tema → hook → caption) and returns `title` / `videoAssetId` / `createdAt`. `ApprovalsListView` ignores `title` and renders `captionPreview` with an em dash fallback — soft-inserted packages often have empty captions, so cards show “—”. Disclosure chip copy is still English “Disclosure”.

## Approach

### Approvals list

- Card primary title: `item.title` (trim), else `captionPreview`, else i18n `untitled`.
- Body: i18n plain-language summary (e.g. “Revisa este video antes de publicarlo”), not caption text.
- Inline muted thumbnail: `MediaThumbnail` with `src={mediaPreviewUrl(videoAssetId)}` when present.
- Disclosure: replace chip with i18n “Aviso de IA” / “AI notice” and native `title` tooltip explaining AI disclosure.
- Date: `ClientLocalDateTime` on `item.createdAt` with `createdAt` template (“Recibido {date}”).

### Approvals detail

- When composing a package, attach `reelTitle` from the same `resolveApprovalListCardMeta` join (no migration).
- Detail header shows reel title under/alongside the page chrome; keep existing authenticated video preview.

### Chat composer

- Extract pure `shouldSendOnEnterKey(event, { busy, hasText })` for tests.
- Enter → send (preventDefault) when not composing, not keyCode 229, not Shift, has trimmed text, not busy.
- Shift+Enter → newline (default).
- Autosize textarea on input (height from scrollHeight, with a sensible max).
- Keep visible send button on all viewports (no mobile hide).

## Decisions

- No DB migration: title/summary derived at read time only.
- Native `title` attribute for disclosure tooltip (no new Tooltip primitive).
- Enter sends on mobile too; send button remains.

## Risks

- Soft packages without assembly/script still untitled → i18n fallback “Video”.
- Detail soft packages missing caption still fail `composeApprovalPackage` (pre-existing); list enrichment covers card display.
