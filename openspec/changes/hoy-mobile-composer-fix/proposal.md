# Proposal

## Why

Prod verification on iPhone 13 (KAN-104 / KAN-105) found the pinned Hoy layout composer stacking five suggestion chips vertically, covering most of the feed and intercepting taps on “Cambiar…” / Approve. Change also surfaces raw approval card UUIDs in the visible user message. Ship a small polish fix before proactive-manager F0.

## What Changes

- Mobile layout composer suggestion chips render as a single horizontally scrollable row (no vertical wrap stack); desktop behavior unchanged in spirit (may also stay one row).
- Hoy / owner shell main content gains enough bottom padding for composer + mobile tab bar so every feed card remains reachable.
- “Cambiar…” / Change opens chat with visible text `Cambiar: <title>` / `Change: <title>` only; card id stays in hidden message metadata/context for the agent (not shown to the owner).
- Confirm no legacy floating “Abrir chat” FAB on desktop Hoy (header Conversación control remains).

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- `ui-shell-nav`: mobile composer chips layout + feed clearance above composer/tab bar; no FAB.
- `orchestrator-chat`: card-anchored Change visible text vs hidden card id metadata (EN/ES).

## Impact

- `components/orchestrator-chat/SuggestedPromptChips.tsx`, `OrchestratorChatContext.tsx`, `OrchestratorChatPanel.tsx`, `ConversationFullView.tsx`
- `components/layout/AppShell.tsx` (main bottom padding)
- `components/dashboard/HoyFeedView.tsx` (locale for Change prefill)
- Unit/component tests; messages only if new copy keys needed
- Out of scope: paid APIs, Instagram, migrations, avatar generation, Task B proactive manager
