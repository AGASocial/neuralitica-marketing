# ADR-0011 — Agentic-first UI: Option C “Hoy” + Option A onboarding

## Status

Accepted — **KAN-102** (epic); Phase 1 foundation **KAN-103**. Analysis:
`docs/design/agentic/analisis.md`; mockups `opcion-c-hibrido-hoy.html`,
`opcion-a-agente-home.html`.

## Context

Owner UX is a non-technical local-service provider (“plumber principle”,
ADR-0009). Chat today lives in a sheet/FAB — a help-widget pattern. Industry
evidence (Shopify Pulse, HubSpot Breeze, Intercom Fin, Maia LatAm, ACM / arXiv
studies summarized in analisis §4) shows:

- **Daily use:** proactive cards / feed + chat at a tap beats an empty chat home.
- **Onboarding / first create:** conversational full-screen (Option A) works;
  blank chat for recurring use causes blank-page syndrome.

## Decision

1. **Daily home = Option C “Hoy”** — agent feed (Needs OK / What I did / Next /
   Results) with a hero compositor always visible (⌘J, mic, contextual chips).
   “Cambiar…” opens conversation anchored to the card (panel desktop / sheet
   mobile). Mockup: `docs/design/agentic/opcion-c-hibrido-hoy.html`.
2. **Onboarding / first-run = Option A** — full-screen agent conversation
   (plan → first approvals in-thread) before showing an empty Hoy feed.
   Mockup: `docs/design/agentic/opcion-a-agente-home.html`.
3. **Shared card catalog first (KAN-103)** — one Zod catalog + `<AgentCard>`
   for chat, Mis videos, approvals (later Hoy). Max two primary actions;
   cost always explicit; Approve still uses existing Server Actions.
4. **Phased delivery** — KAN-103 cards → KAN-104 Hoy → KAN-105 mobile tab bar
   → KAN-106 onboarding A → KAN-107 analytics. A2UI deferred (ADR-0012).

## Consequences

- Home IA evolves from KPI dashboard (KAN-98) toward Hoy feed; existing
  routes remain reachable (`/dashboard` stays Hoy).
- **KAN-104/105 (landed):** Inicio → Hoy/Today; layout compositor replaces
  FAB; Cmd/Ctrl+J focuses composer; mobile bottom tab bar; `/conversation`
  full-screen Option A layout one tap away; Advanced in user menu on mobile.
- ADR-0009 chat sheet remains as the conversation panel opened from the
  compositor; ADR-0010 hybrid onboarding spine remains until KAN-106
  specializes first-run to Option A.
