# Design

## Context

See proposal.md — Why. Inicio today builds a fixed `DashboardCard[]` in
`app/(app)/dashboard/page.tsx`. Closest status aggregates already live in
orchestrator tools (`listCampaignStatus`, `getGuidedProgress`). Instagram Graph
insights / follower / reach columns are **not** in the DB; `neuramark_reel_metrics`
is Operator-manual views/likes only. Calendar slots (`neuramark_content_calendar_slots`)
expose `publish_status` ready|published for week-scoped counts.

## Goals / Non-Goals

**Goals:**

- One owner-readable Home composition: next action, week counts, progress, results, recent videos, Atajos.
- Server loaders with zod contracts; reuse existing approvals/strategy/calendar helpers where practical.
- EN/ES via `messages/`; mobile-first Campaña UI; traffic-light status + last updated.
- Open chat from next-action when the step is chat-oriented; otherwise deep-link.

**Non-Goals:**

- Setup completion checklist / `getSetupStatus` (KAN-99).
- New Instagram Graph calls (publish or insights).
- Spend / mutate / avatar generation from Home.
- Migrations.

## Decisions

1. **Capability `owner-home-dashboard`** owns Home page behavior; `ui-shell-nav` only notes that Home content is this dashboard.
2. **Next action** derived from the same priority order as `getGuidedProgress` (interview → plan → scripts → videos → approve → ready). CTA: open chat (`useOrchestratorChat().setOpen(true)`) for chat-friendly steps (plan/scripts/videos), or `href` to `/interview`, `/approvals`, `/ready-to-publish`.
3. **This week counts** (client-scoped, current ISO Monday):
   - `waitingForOk` ← pending approvals count
   - `published` ← calendar slots with `publish_status = published` for week
   - `scheduled` ← calendar slots with `publish_status = ready` for week (planned, not yet published)
   - `inProduction` ← max(0, strategy slot count − (pending + ready + published approximations)) or scripts/jobs still generating: prefer `scriptsPendingCount` + count of pending approvals that are still assembling if available; simplest: scripts pending count when plan approved, else 0 when no plan
4. **Campaign progress**: current week strategy `brief.slots.length` as Y; X = published + approved-ready for that week (cap at Y). Label “X of Y videos”. If no plan: 0 of 0 / empty friendly copy.
5. **Results**: always empty-state until a future insights capability exists (`insightsAvailable: false` in DTO). Copy: ES “Conecta Instagram para ver resultados” / EN equivalent. Do **not** surface Operator `neuramark_reel_metrics` as Instagram insights.
6. **Recent videos**: up to ~6 approved ready items with thumbnail/title + link to `/ready-to-publish` (or package).
7. **Atajos**: compact list of previous cards (no big card grid as primary).
8. **Contracts**: `lib/contracts/owner-home-dashboard.ts` + `loadOwnerHomeDashboard({ user })` returns zod-parsed DTO including `lastUpdatedAt` ISO string.

## Risks / Trade-offs

- [Calendar is Operator-oriented] → Client-scoped select by `client_id` + `week_start` only; no Operator aggregate reuse that leaks other clients.
- [Counts imperfect without production job rollup] → Prefer honest zeros + labels over inventing charts; document mapping in ADR-0009 note.
- [Chat open needs client component] → Next-action button is a small client island; data stays server-loaded.

## Migration Plan

None (no schema). Deploy with Vercel as usual; rollback = revert PR.

## Open Questions

None material for KAN-98; Instagram connect remains deferred (empty results + KAN-99 step).
