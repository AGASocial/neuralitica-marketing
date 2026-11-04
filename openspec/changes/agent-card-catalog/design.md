# Design: agent-card-catalog (KAN-103)

## Context

See proposal.md — Why. Today chat (`ProposalActionCard`, status/preview/progress cards), Mis videos pending rows, and `/approvals` list each own Campaña markup. Agentic-first Option C (Hoy) + Option A onboarding (ADR-0011) needs one catalog so later feed and onboarding reuse the same types. A2UI stays deferred (ADR-0012); the catalog mirrors A2UI’s mental model (type + props + actions) without the dependency.

## Goals / Non-Goals

**Goals**
- Zod catalog + discriminated union for the listed card types.
- One presentational `<AgentCard>` (shadcn); callers own `onAction` → Server Actions.
- Migrate chat / Mis videos pending / approvals list with visual and behavioral parity.
- Tests: parse per type, render per type, action callback.

**Non-Goals**
- Hoy feed, tab bar, onboarding A, analytics, A2UI package, DB migrations, Instagram publish, paid calls, avatar generation.

## Decisions

1. **Catalog location `lib/agent-cards/`** — schemas + mappers (proposal → card, list DTO → card). UI in `components/agent-cards/AgentCard.tsx`. Keeps zod contracts server/client-safe without pulling React into lib tests.
2. **Presentational AgentCard** — no Server Action imports inside `AgentCard`. `ProposalActionCard` becomes a thin controller: map `KnownProposal` → catalog card, handle `onAction` with existing approve paths (including TTS picker state).
3. **Action model** — `actions: { id, role: "primary" | "secondary", label, href? }[]` with schema refine: at most two `role: "primary"`. Ids: `approve`, `change`, plus free-form for chips/options (`chip:<id>`, `option:<id>`).
4. **Media** — reel list thumbs use `MediaThumbnail`; chat/Mis videos full preview keeps `<video controls>` inside `reel_approval` when `previewMode: "player"` (parity with today).
5. **Clarifying question** — catalog type with `options[]`; interview progress remains mappable when options exist; otherwise progress/status types cover current interview/status tools.
6. **ADRs** — 0011 agentic-first (C daily + A onboarding); 0012 A2UI later (reasons + triggers from analisis §6).

## Risks / Trade-offs

- [Visual drift during migration] → Keep Campaña tokens (`border-edge`, `bg-panel`, butter Approve); wiring tests assert AgentCard usage.
- [ProposalActionCard complexity (TTS picker)] → Keep picker state in the controller; AgentCard accepts optional `children`/props slot for TTS select UI via `voice_cost.props.eligibleVideos`.
- [Over-broad catalog] → Only types listed in KAN-103; other proposals map to closest type (`generate_strategy` → `plan_approval`, consent → `own_avatar_activation` / clarifying, etc.).

## Migration Plan

1. Land schemas + AgentCard + tests.
2. Switch ProposalActionCard + chat status/progress/chips.
3. Switch ApprovalsListView + MyVideos pending.
4. No feature flag; rollback = revert PR (pure UI refactor).

## Open Questions

None for Phase 1.
