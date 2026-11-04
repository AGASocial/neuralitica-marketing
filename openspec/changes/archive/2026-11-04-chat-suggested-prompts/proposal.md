# Change: Orchestrator chat suggested prompt chips

## Why

Fresh orchestrator chat (empty transcript, greeting, or after “Nueva conversación”) leaves owners without a clear first move. Suggested prompt chips lower the blank-sheet friction, and a dedicated “What can you do for me?” path must answer in plain language with safe next-step chips — never direct spend.

## What Changes

- When the conversation has **no user messages**, show suggested prompt chips under the greeting; clicking a chip sends that text as a user message. Hide chips once any user message exists.
- First chip is always locale-aware “¿Qué puedes hacer por mí?” / “What can you do for me?”.
- Plus 3–5 state-dependent chips computed server-side from KAN-99 setup completion and campaign status (pending approvals, weekly plan, scripts). Never chips that start paid generation directly (spend still goes through cost cards).
- Mobile-friendly chip row (wrap, ≥44px tap targets, horizontal scroll when needed). EN/ES via `messages/` and locale cookie / page locale.
- Tighten system prompt + add a read-only tool that returns capability overview follow-up actions as clickable chips after the overview answer.
- Unit tests for chip selection; component source test for hide-on-user-messages.

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- `orchestrator-chat`: empty-state suggested chips, capability-overview answer + follow-up chip tool, no direct-spend chips.
- `i18n`: EN/ES chip labels and capability-overview copy under `orchestratorChat`.

## Impact

- `lib/orchestrator-chat/` (chip selection, optional load action, system prompt, create-tools, contracts)
- `components/orchestrator-chat/` (chips UI wired into panel)
- `components/layout/AppHeader.tsx` (pass computed chips / copy)
- `messages/{en,es}.json`
- Tests under `lib/orchestrator-chat/` and `components/orchestrator-chat/`
- Related: ADR-0009, KAN-99 setup completion, owner-home campaign status
- No migrations, paid provider calls, or secrets

## Out of Scope

- Instagram publish, AVOS, orchestrator quarantine loops, new DB tables, spend-triggering shortcuts
