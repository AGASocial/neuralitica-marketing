# Design: Chat suggested prompt chips

## Context

Orchestrator chat empty state is a static greeting (`copy.empty`) with no affordances. Setup completion (KAN-99 / `computeSetupCompletion`) and campaign signals (pending approvals, weekly strategy, reel scripts) already exist for dashboard and chat tools. See proposal.md — Why.

## Goals / Non-Goals

**Goals**
- Pure chip-selection function + server loader that composes fixed + state chips from setup + campaign status.
- Presentational chips in the chat panel; click → `sendMessage({ text })`.
- Read-only `suggestNextActions` (or equivalent) tool for capability-overview follow-ups, rendered as the same chip UI inside the transcript.
- System prompt rule for the fixed capability question → overview bullets + tool call.

**Non-Goals**
- New persistence tables; chips are ephemeral UI.
- Chips that call paid propose/confirm tools directly.
- Changing proposal-card Approve flows.

## Decisions

1. **Pure selection in `lib/orchestrator-chat/select-suggested-prompt-chips.ts`**
   - Inputs: `{ percentComplete, pendingApprovalsCount, hasApprovedPlan, scriptsMissing }`, locale labels map.
   - Output: ordered list of `{ id, text }` — always `whatCanYouDo` first, then up to 5 state chips in priority order: finishSetup → pendingApprovals → (makeWeeklyPlan XOR howIsCampaign) → writeScripts.
   - Rationale: unit-testable without Supabase; mirrors dashboard signals without inventing new domain rules.

2. **Server load in header / chat mount**
   - Reuse `loadSetupCompletion`, pending approvals list, latest strategy row + reel script list for the current week (same sources as owner-home / guided progress). Pass chip texts into `OrchestratorChatPanel` as props (or a thin server action that returns chips once on open). Prefer props from AppHeader’s server parent if cheap; otherwise a single non-mutating server action called once when the panel loads with an empty transcript.
   - Alternative considered: client fetch of a Route Handler — rejected to keep Supabase server-only.

3. **Visibility = no user messages**
   - `messages.some(m => m.role === "user")` gates hide. Assistant-only or empty → show. Matches “fresh / greeting / Nueva conversación”.

4. **Follow-up tool `suggestNextActions`**
   - Read-only; returns `{ ok, actions: [{ id, text }] }` using the same selection helper (without forcing the capability question again) or a fixed safe next-step set. Panel renders `tool-suggestNextActions` output as chips that call `sendMessage`.
   - System prompt: on capability question, answer ~5 bullets then call the tool; never name the tool to the owner.

5. **i18n**
   - Keys under `orchestratorChat.suggestedPrompts.*` in en/es; chip text is the localized string used both for display and as the sent message (so the model receives natural language).

## Risks / Trade-offs

- [Stale chips after Approve elsewhere] → Mitigation: chips only show on empty-user transcript; next “Nueva conversación” reloads. Acceptable for V1.
- [Model ignores overview instructions] → Mitigation: prompt tests + tool schema; overview bullets listed explicitly in system prompt.
- [Too many chips on dense state] → Mitigation: hard cap 1 + 5; XOR plan vs campaign chip.

## Migration Plan

Ship with app deploy only. No DB migration. Rollback = revert PR.

## Open Questions

None — spend-safe chip set and selection rules are fixed by the proposal scenarios.
