# Design

## Context

See proposal.md — Why. Phase 2 landed Hoy + mobile tab bar + `/conversation` (canvas read-only). Setup completion (KAN-99) maxes at 80% without Instagram, so the onboarding gate **must** combine incomplete setup with “no approved plan AND no approved reel” — otherwise the production test account (≈80% + approved plan) would loop into onboarding.

## Goals / Non-Goals

**Goals**

- Pure `shouldEnterOptionAOnboarding(...)` + server loaders for gate.
- Redirect from `/dashboard` and default post-login landing when gate applies.
- Upgrade `/conversation?mode=onboarding` to Option A: progress, skip, actionable cards, mobile carousel.
- Onboarding system-prompt addendum; unlock owner access to guided plan/script/video **proposal** tools (mutations still Approve-gated).
- Additive `neuramark_ux_events` + recordUxEvent Server Action; optional `@vercel/analytics` dual-write; docs.

**Non-Goals**

- Permanent skip cookie / cohort A-home (Phase 2 A/B later).
- Instagram publish, avatar generation, paid calls in CI.
- PostHog or other paid analytics SaaS.
- Making `/conversation` outside onboarding fully parity with the sheet (only onboarding requires actionable cards in this change; optionally reuse ProposalActionCard there too for consistency).

## Decisions

1. **Gate = incomplete setup ∧ ¬approvedPlan ∧ ¬approvedReel ∧ role=client**  
   Rationale: matches KAN-106 acceptance and protects 80%-with-plan accounts. Alternative (setup alone) rejected.

2. **Route = `/conversation?mode=onboarding`** (not a separate `/welcome` app)  
   Reuses persistence, tools, compositor. Optional thin `/welcome` redirect → same URL if needed for bookmarks — prefer query mode only in V1.

3. **Login next**  
   When `sanitizeLoginNext` yields `/dashboard` (default), after successful active login resolve gate server-side if cheap; otherwise rely on `/dashboard` redirect (primary). Prefer dashboard redirect as single source of truth to avoid duplicating loaders in `logIn`.

4. **Owner proposal tools unlocked**  
   Remove `isOperator` checks from `proposeGenerateStrategy`, `proposeApproveStrategy`, `proposeGenerateScripts`, `proposeGenerateVideos`, `proposeConfirmPaidGeneration` so Cliente onboarding can present cards. Keep Advanced read tools (e.g. `getScriptsStatus`) operator-gated. Cost/approve boundaries unchanged.

5. **ConversationFullView**  
   In onboarding mode: render `ProposalActionCard` for propose-* tool parts (same list as panel); canvas shows same cards with actions; mobile: carousel strip above/within thread; header includes progress from `loadSetupCompletion` + Skip link to `/dashboard`.

6. **Analytics**  
   - Migration: `neuramark_ux_events` (uuid PK, client_id FK, user_id uuid, event text, props jsonb, created_at); RLS enable, zero policies; indexes on (client_id, created_at), (event, created_at).  
   - `recordUxEvent({ event, props })` Server Action: `getCurrentUser` + service role insert.  
   - Install `@vercel/analytics`; mount `<Analytics />` in root layout; client helper `trackUxEvent` calls `track()` then server action.  
   - Device for `approval`: UA + `matchMedia('(pointer: coarse)')` on client, passed in props.  
   - `first_approval_within_24h`: compute server-side from earliest content-ready signal vs now when recording approval (use first pending approval `created_at` or assembly ready time if available; if unknown, omit flag or set false).

7. **Docs**  
   `docs/development/UX-ANALYTICS.md` with SQL recipes; ADR-0011 consequences updated for KAN-106/107.

## Risks / Trade-offs

- [Risk] Unlocking owner plan/video proposals increases spend surface → Mitigation: still proposal-only; cost cards required; no auto-Approve.
- [Risk] Skip then re-redirect feels sticky → Mitigation: documented V1; skip lands on Hoy until next `/dashboard` visit; acceptable per spec.
- [Risk] Dual Analytics + DB drift → Mitigation: always persist DB; Vercel track best-effort.
- [Risk] Migration apply fails → Mitigation: additive only; stop and report if not safe.

## Migration Plan

1. Ship SQL under `supabase/migrations/`.
2. `supabase db push` (linked prod) only if purely additive CREATE TABLE/INDEX/RLS.
3. Rollback: stop writing events; table can remain (no drop in prod from agents).

## Open Questions

None blocking — permanent skip flag deferred.
