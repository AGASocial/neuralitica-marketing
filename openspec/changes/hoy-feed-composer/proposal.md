# Proposal

## Why

Daily owner UX is still a KPI dashboard (KAN-98) with chat behind a sheet/FAB (help-widget pattern). Agentic-first redesign (KAN-102; ADR-0011; mockup `opcion-c-hibrido-hoy.html`) requires Option C “Hoy”: agent feed + always-visible compositor, mobile bottom tab bar, and conversation one tap away — Phase 2 = **KAN-104 + KAN-105** together.

## What Changes

- Rename owner Home label **Inicio/Home → Hoy/Today**; route stays `/dashboard` (or redirect).
- Rebuild `/dashboard` as Hoy feed with four blocks: Needs your OK, What I did, Next, Results — pending approvals as `AgentCard` (Approve/Change), timeline from jobs/approvals/plan events (agent first-person), next week slots + one next action, Results empty without IG insights. Cap ~5 proactive cards; nothing mutates without approval. Compact setup card when setup &lt; 100%.
- Remove floating chat FAB(s). Large always-visible layout compositor on all owner pages (hero/prominent on Hoy): Cmd/Ctrl+J focuses it; Enter send / Shift+Enter newline (IME-safe); mic via Web Speech API when available (hide otherwise; no paid STT); suggested chips (¿Qué puedes hacer por mí? first, state-dependent from KAN chip selection). Send opens conversation panel (desktop right column / mobile bottom sheet); “Cambiar…” opens chat anchored to that card (prefilled context).
- “Conversación” opens full-screen conversation (`/conversation`) — Option A layout (thread + canvas of cards) one tap away.
- Mobile: bottom tab bar Hoy · Campaña · Videos · Negocio (safe-area); compositor pinned above it; Advanced moves into user menu (operators); simplify top nav on mobile.
- EN/ES via `messages/` + locale cookie. Tests: feed ≤5, keyboard shortcut, tab bar, hide chips on messages. Update ADRs/AGENTS as needed.
- Out of scope: KAN-106 onboarding A, KAN-107 analytics, paid API calls, Instagram publish, avatar generation, secrets, non-additive migrations.

## Capabilities

### New Capabilities

- (none — extend existing shell / home / chat)

### Modified Capabilities

- `ui-shell-nav`: Hoy label, remove FAB, layout compositor, mobile bottom tab bar, Advanced in user menu on mobile, Conversación entry.
- `owner-home-dashboard`: replace KPI-first home with Hoy feed blocks (Needs OK / What I did / Next / Results) while keeping setup compact + Results empty rules.
- `orchestrator-chat`: Cmd/Ctrl+J focuses layout composer; send/Change opens panel; card-anchored context; `/conversation` full-screen view; chips on layout composer.
- `agent-cards`: Hoy feed surfaces use shared `AgentCard` (Approve/Change for pending reels).

## Impact

- Code: `AppHeader`/`AppShell`, new layout composer + mobile tab bar, `OrchestratorChatContext` (focus/anchor), dashboard → Hoy feed loaders, `/conversation` route, i18n, tests.
- Docs: ADR-0011 consequences (compositor replaces FAB), `AGENTS.md` shell notes, OpenSpec main specs via archive after merge.
- No paid providers; no Instagram Graph publish; migrations only if additive/safe (prefer none).
