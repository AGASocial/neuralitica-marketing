# Design

## Context

See proposal.md — Why. Current shell: `AppHeader` + sheet chat + mobile FAB; Home is KAN-98 KPI dashboard. KAN-103 `AgentCard` is live. Mockup: `docs/design/agentic/opcion-c-hibrido-hoy.html`. ADR-0011 accepted.

## Goals / Non-Goals

**Goals**
- Hoy feed loader + UI on `/dashboard` using AgentCard for Needs OK.
- Layout compositor in owner shell; remove FAB; Cmd/Ctrl+J focuses composer.
- Mobile bottom tab bar; Advanced in user menu on mobile.
- `/conversation` full-screen chat.
- Pure feed selection (≤5) + unit/component tests; EN/ES.

**Non-Goals**
- Onboarding Option A (KAN-106), analytics (KAN-107), new event table, paid STT, IG publish/insights wiring, migrations unless additive/required (prefer compose existing tables).

## Decisions

1. **Timeline without new table** — Aggregate from pending/approved approvals, video/assembly jobs, strategy approval timestamps. First-person copy via i18n templates. Cap timeline length (~8) separately from proactive card budget.
2. **Proactive budget** — `selectHoyProactiveCards` pure function: prioritize Needs OK (pending approvals mapped to AgentCard), then optional next-step card; hard max 5. Excess → link to `/approvals`.
3. **Composer architecture** — Extend `OrchestratorChatContext` with `composerFocusRequest`, `pendingDraft` / `anchorContext`, `focusComposer()`. Layout `OwnerComposer` registers a ref. Panel/session accepts draft on open. Reuse `shouldSendOnEnterKey` + chip selection from #48.
4. **Mic** — Client-only Web Speech API; feature-detect; no server STT.
5. **Conversation route** — `app/(app)/conversation/page.tsx` reuses panel session UI in full-width layout (thread + card canvas column on `md+`).
6. **Nav** — Desktop: header links + Conversación. Mobile: hide secondary top nav strip; `OwnerMobileTabBar`; operators get Advanced items in `UserMenu`.
7. **Approve on Hoy** — Same as Mis videos: `decideApproval` on Approve; Change → `setOpen(true)` + anchor draft.

## Risks / Trade-offs

- [Shared chat state across layout composer + panel] → Keep one provider; draft queue on send.
- [Feed feels empty for new owners] → Compact setup card + chips + next action.
- [Web Speech inconsistent] → Hide mic when unsupported.

## Migration Plan

Ship behind normal Vercel deploy. No DB migration expected. Rollback = revert PR (FAB/nav restore).

## Open Questions

None blocking — mockup + ADR-0011 resolve A vs C placement.
