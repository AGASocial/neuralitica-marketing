# Tasks

## 1. OpenSpec + docs

- [x] 1.1 Validate change with `npx -y @fission-ai/openspec@latest validate --all --strict`
- [x] 1.2 Update ADR-0011 consequences (compositor replaces FAB; KAN-104/105); sync AGENTS.md shell notes if needed

## 2. Chat context + layout compositor

- [x] 2.1 Extend `OrchestratorChatContext`: focus composer (Cmd/Ctrl+J), pending draft / card anchor, open panel on send
- [x] 2.2 Build `OwnerComposer` (Enter/Shift+Enter/IME, mic Web Speech, chips, send opens panel); remove `OrchestratorChatFab`
- [x] 2.3 Wire composer into `AppShell`/`AppHeader` on all owner pages; Conversación → `/conversation` or panel

## 3. Mobile tab bar + nav

- [x] 3.1 Add safe-area `OwnerMobileTabBar` (Hoy · Campaña · Videos · Negocio); hide mobile top nav strip; pin composer above tabs
- [x] 3.2 Move Advanced into user menu for operators on mobile; rename home labels to Hoy/Today (EN/ES)

## 4. Hoy feed

- [x] 4.1 Server loaders + zod DTO: pending AgentCards, timeline, next slots + next action, results empty, setup compact; `selectHoyProactiveCards` ≤5
- [x] 4.2 Rebuild dashboard UI as Hoy feed; Approve → `decideApproval`; Change → anchored chat; keep setup card if &lt;100%

## 5. Full-screen conversation

- [x] 5.1 Add `/conversation` page (thread + cards canvas) reusing orchestrator chat session

## 6. i18n + tests + quality

- [x] 6.1 Add/update `messages/{en,es}.json` for Hoy, tabs, composer, conversation, timeline
- [x] 6.2 Tests: feed selection ≤5, Cmd/Ctrl+J focus, tab bar render, chips hide on user messages
- [x] 6.3 Lint + typecheck; fix failures
