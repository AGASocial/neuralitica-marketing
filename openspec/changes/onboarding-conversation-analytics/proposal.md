# Proposal

## Why

Daily Hoy (KAN-104/105) is live, but first-run owners still land on an empty feed. Agentic redesign (KAN-102; ADR-0011; Option A mockup) requires conversational onboarding before Hoy, plus UX analytics (KAN-107) to measure blank-page vs activation.

## What Changes

- **KAN-106 Option A onboarding:** Owners with incomplete setup (KAN-99) **and** no approved plan **and** no approved reel are redirected after login and when visiting `/dashboard` to full-screen conversation (`/conversation?mode=onboarding`). Operators and accounts that already have an approved plan or approved reel stay on Hoy (test account at ~80% setup with approved plan must remain on Hoy).
- Onboarding UI: thread center + canvas (cards) on desktop; full-screen chat + horizontal card carousel on mobile; setup progress indicator; always-visible “Saltar a Hoy” / “Skip to Today”; agent drives interview → plan → scripts/first reels via existing proposal tools (cost cards stay explicit; nothing auto-spends).
- Tighten onboarding system prompt when `mode=onboarding`; unlock owner-safe access to plan/script/video **proposal** tools needed for that guided path (Approve still required).
- **KAN-107 analytics:** Add `@vercel/analytics` + `track()` when available; persist events to additive `neuramark_ux_events` (RLS on; insert via server action / service role). Events: `hoy_visit`, `hoy_action`, `chat_first_message`, `approval`, `onboarding_step`. Document query recipes + ADR note.
- EN/ES via `messages/` + `neuramark_locale`. Tests, lint, typecheck. No Instagram publish, no avatar generation, no secrets, no paid calls in this change.

## Capabilities

### New Capabilities

- `ux-analytics`: Persist and (when available) dual-write owner UX events for Hoy, chat, approvals, and onboarding steps.

### Modified Capabilities

- `onboarding`: Option A first-run gate + conversation mode (progress, skip to Hoy, agent-driven path).
- `orchestrator-chat`: Onboarding mode layout (actionable cards, mobile carousel), onboarding system prompt, owner access to guided proposal tools.
- `owner-home-dashboard`: `/dashboard` redirects eligible owners into onboarding conversation.
- `setup-completion`: Pure helper for “should enter Option A onboarding” combining setup + approved content.
- `i18n`: Onboarding/skip/progress/analytics-related copy EN+ES.

## Impact

- Code: dashboard + login landing gate, `/conversation` onboarding props, `ConversationFullView` upgrade, system prompt, create-tools owner gates, analytics server action + client hooks, migration `neuramark_ux_events`, `@vercel/analytics`, docs/ADR-0011, AGENTS.md.
- Out of scope: Instagram Graph publish, avatar generation, paid provider calls in CI, non-additive schema changes, A2UI.
