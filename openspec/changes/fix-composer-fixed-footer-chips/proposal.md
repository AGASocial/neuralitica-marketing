# Fix: fixed composer footer + chips without visible scrollbar

## Why
On "Hoy", the suggested-chip row (made horizontally scrollable in #52/#53) shows an ugly
horizontal scrollbar on desktop, and the composer footer is not fixed: on desktop it scrolls
with the page and sits at the bottom of the content.

## What changes
- `SuggestedPromptChips`: desktop (md+) wraps chips onto at most 2 lines (overflow clipped);
  mobile keeps a single swipeable row with the scrollbar hidden and a right-edge fade.
- `AppShell`: composer wrapper is `fixed inset-x-0 bottom-0` on all viewports (mobile keeps
  its tab-bar clearance padding); `<main>` gets more desktop bottom padding (`md:pb-48`) so feed
  content isn't hidden behind it. There is no desktop sidebar, so full-width is correct.

## Impact
UI only. No API/data changes.
