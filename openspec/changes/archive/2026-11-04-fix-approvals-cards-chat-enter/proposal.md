# Change: Approvals cards polish + chat Enter-to-send

## Why

Owner “Aprobaciones pendientes” cards show empty title/body (“—”) and an English “Disclosure” badge after soft-insert packages from #45, even though list enrichment already joins assembly → script → strategy for a reel title. Orchestrator chat also lacks Enter-to-send with IME-safe handling.

## What Changes

- Approvals list cards show reel title (joined at read time), muted `MediaThumbnail` via authenticated media route, plain-language approval summary, and localized AI-disclosure chip with tooltip — not caption-preview-as-title or English “Disclosure”.
- Received date uses package `createdAt`, rendered with `ClientLocalDateTime` (local TZ, no hydration mismatch).
- Approval detail (“Revisar”) shows the same reel title (and keeps video preview).
- Orchestrator chat: Enter sends, Shift+Enter newline; ignore IME composing / keyCode 229; block empty/while streaming; textarea autosize; send button stays visible on mobile. Unit tests for the key handler.

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- `approvals-and-cost-confirmation`: pending approvals list/detail card presentation (title, thumbnail, summary, disclosure copy, received date).
- `orchestrator-chat`: composer Enter-to-send / Shift+Enter newline / IME + streaming guards.
- `i18n`: EN/ES strings for approvals card summary, disclosure chip/tooltip, untitled fallback, detail reel title.

## Impact

- `components/approvals/*`, `app/(app)/approvals/*`, `lib/approvals/compose-approval-package.ts` (optional package title field), `messages/{en,es}.json`
- `components/orchestrator-chat/OrchestratorChatPanel.tsx` + pure key-handler helper + tests
- Reuses `MediaThumbnail` (#44) and `ClientLocalDateTime` (#46)
- No migrations, paid calls, or secrets

## Out of Scope

- Instagram publish, QA gate changes, new DB columns for title/summary, AVOS, orchestrator quarantine work
