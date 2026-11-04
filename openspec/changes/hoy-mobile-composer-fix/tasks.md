# Tasks

## 1. Mobile composer + feed clearance

- [x] 1.1 Make `SuggestedPromptChips` a single horizontal scroll row (`flex-nowrap`) and verify chip source tests assert `flex-nowrap` / no wrap stack
- [x] 1.2 Increase `AppShell` main mobile bottom padding for composer + tab bar (+ safe-area) and verify shell test/assert matches the clearance class

## 2. Card-anchored Change without visible UUID

- [x] 2.1 Add `formatChangePrefill` helper (ES/EN visible text + cardId metadata) with unit tests that assert UUID not in visible text
- [x] 2.2 Wire `openChangeForCard` + pending-send + panel/full-view `sendMessage` to pass metadata; inject card id for the model in `/api/chat` without rendering it in the transcript
- [x] 2.3 Pass locale from Hoy Change action into the prefill helper and verify panel strips/omits UUID in user bubble rendering

## 3. FAB verification + docs

- [x] 3.1 Confirm no floating FAB on desktop Hoy (header Conversación only); strengthen existing FAB-absence tests if needed
- [x] 3.2 Run lint, typecheck, and relevant unit/component tests; update AGENTS.md only if behavior notes need a one-line pointer (skip if unchanged)

## Workflow follow-up

- Validate with `openspec validate --all --strict` before merge
- Archive the change after merge
