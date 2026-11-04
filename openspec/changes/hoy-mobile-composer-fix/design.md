# Design

## Context

See proposal.md — Why. Sticky `OwnerComposer` + `OwnerMobileTabBar` already exist (KAN-104/105). `SuggestedPromptChips` uses `flex-wrap`, which stacks chips on narrow widths. `openChangeForCard` hardcodes `Cambiar: … (card:<uuid>)` into the visible send text. FAB component was removed; verify no regression.

## Goals / Non-Goals

**Goals:** Fix mobile chip stack + feed clearance; hide card UUID from Change transcript; keep card id for the agent; confirm no FAB.

**Non-Goals:** Redesign compositor; proactive manager; new migrations; paid paths.

## Decisions

1. **Chips: `flex-nowrap` + horizontal overflow** on `SuggestedPromptChips` (shared by layout composer and panel). Prefer one scroll row over collapsing-on-blur for predictability when the session has no user messages yet.

2. **Feed padding:** Increase `AppShell` `<main>` mobile bottom padding to cover tab bar (~3.5rem + safe-area) + single-row composer (chips + input). Keep `md:pb-28` for desktop.

3. **Change prefill:** Extend pending-send to `{ text, metadata?: { cardId } }`. Visible `text` is locale-aware `Cambiar|Change: <title>`. Pass `metadata.cardId` into `sendMessage`; chat route injects a short system-adjacent note / model-message suffix from metadata when converting to model messages so the agent sees the id without UI rendering it. Persist visible text only in parts (metadata optional if schema allows; agent id needed mainly for the live turn).

4. **FAB:** No new FAB; assert `OrchestratorChatFab` absent; `OpenChatButton` remains in-feed CTA only (not floating).

## Risks / Trade-offs

- [Padding too small after font/zoom] → Use calc with safe-area; verify on iPhone-width Playwright/manual.
- [Metadata dropped by transport] → Fallback: append `[card:id]` only in server-side model conversion from a parallel pending field carried in request body if metadata is stripped.

## Migration Plan

Ship via normal Vercel deploy; no DB migration. Rollback = revert PR.
