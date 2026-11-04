# Proposal

## Why

Agentic-first redesign (KAN-102 epic; Phase 1 = **KAN-103**) needs one shared card catalog so Hoy feed, chat tool parts, Mis videos, and `/approvals` all render the same approve/change surfaces. Today each surface invents its own Campaña markup; without a Zod catalog we cannot reuse cards or prepare for a later A2UI adapter (`docs/design/agentic/analisis.md` §6).

## What Changes

- Add `lib/agent-cards/` Zod catalog (type, props, actions: approve | change | secondary links; **max 2** primary actions) covering cards currently shown in chat / Mis videos / approvals: reel approval (media preview), cost confirmation, plan approval, script approval, own-avatar activation, voice cost, status summary, clarifying question with options, next-step chips, progress.
- Add single shadcn `<AgentCard card={…} onAction>` that uses shared `MediaThumbnail` for reel thumbs.
- Migrate orchestrator chat tool-part rendering, Mis videos pending cards, and `/approvals` list cards onto `AgentCard` **without behavior changes** (same Server Actions on Approve; cost always explicit).
- Commit design artifacts under `docs/design/agentic/`.
- Add ADR-0011 (agentic-first UI: C Hoy + A onboarding) and ADR-0012 (A2UI: later — reasons + triggers from analisis §6); link from OpenSpec specs, `AGENTS.md`, and `openspec/config.yaml`.
- Unit + component tests: schema parse per type, render per type, `onAction` callback.
- Out of scope: Hoy feed rebuild (KAN-104), mobile tab bar (KAN-105), onboarding A (KAN-106), analytics (KAN-107), A2UI dependency, paid API calls, Instagram publish, avatar generation, migrations.

## Capabilities

### New Capabilities

- `agent-cards`: Shared agent card catalog schemas + single `AgentCard` renderer used across chat, Mis videos, and approvals.

### Modified Capabilities

- `orchestrator-chat`: Tool-part UI renders via `AgentCard` / catalog (proposal/confirm semantics unchanged).
- `approvals-and-cost-confirmation`: Mis videos pending + `/approvals` list cards use `AgentCard` (Approve still `decideApproval`; cost cards still explicit).

## Impact

- Code: `lib/agent-cards/*`, `components/agent-cards/AgentCard.tsx`, chat proposal/status/progress/chip rendering, `MyVideosHubView`, `ApprovalsListView`.
- Docs: `docs/adr/0011-*`, `docs/adr/0012-*`, `docs/design/agentic/*`, `AGENTS.md`, OpenSpec config ADR index.
- No DB migrations; no new paid providers; no Instagram publish paths.
