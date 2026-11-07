# Design

## Context

The operator master prompts settings page (`/operator/settings/master-prompts`) currently uses a raw text input for `client_id` to select which business's per-business prompt to edit. Other operator pages (`/operator/cycle`, `/operator/strategy`) already use a human-readable business selector based on `loadOperatorClientsForStrategy()` which returns `OperatorClientOption[]` with `{ id, displayName, email }`. This change adopts the same pattern for consistency.

See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- Replace raw UUID input with a shadcn/ui `Select` dropdown showing business names
- Reuse existing `loadOperatorClientsForStrategy()` loader (no new data access code)
- Handle edge cases: no businesses, missing display names (fall back to email), duplicate names (show distinguishing info if needed)
- Preserve existing prompt save/load behavior (internal client ID unchanged)
- Maintain EN/ES i18n support

**Non-Goals:**
- New database queries or schema changes
- Changes to master prompt injection logic or business prompt persistence
- Improvements to `loadOperatorClientsForStrategy()` itself (e.g., adding more fields)
- Search/autocomplete for large business lists (current limit is ~50 active clients; dropdown is sufficient)

## Decisions

### Decision: Reuse `loadOperatorClientsForStrategy()`

**Rationale**: This loader already provides exactly the data we need (`id`, `displayName`, `email`) and is used on `/operator/cycle` and `/operator/strategy`. Reusing it ensures consistency across operator pages and avoids duplication.

**Alternatives considered**:
- Create a new specialized loader for prompts → Rejected: unnecessary duplication; the existing loader already sorts by `displayName` and filters to active clients.
- Fetch client data directly in the view component → Rejected: violates server/client boundary; data fetching belongs in the server component.

### Decision: Use shadcn/ui `Select` component

**Rationale**: The `/operator/cycle` page already uses this component for client selection. Consistency in UI patterns reduces operator cognitive load and matches the existing design system (Campaña / ADR-0008).

**Alternatives considered**:
- Combobox with search → Rejected: overkill for current scale (~50 clients); Select is simpler and matches existing patterns.
- Radio buttons or list → Rejected: takes too much vertical space; dropdown is more compact.

### Decision: Display name fallback strategy

When `display_name` is null or empty, fall back to `email`. This matches the existing `loadOperatorClientsForStrategy()` behavior (lines 42-46 in `lib/content-strategy/load-operator-clients-for-strategy.ts`).

**Rationale**: Keeps fallback logic in the loader where it belongs, not in the view component.

### Decision: No special handling for duplicate names

If two businesses have identical display names, both will appear in the dropdown with the same label. The internal `client_id` remains unique, so prompt save/load will work correctly. This is acceptable for V1 because:
1. Display names are typically unique (set by operators during setup)
2. If confusion arises, operators can update display names via SQL
3. Adding secondary labels (e.g., showing email in parentheses) adds complexity for a rare edge case

**Trade-off**: Operators may need to try both entries if names collide. If this becomes a problem, a follow-up change can add secondary labels.

### Decision: Empty state when no businesses exist

If `loadOperatorClientsForStrategy()` returns an empty array, the per-business section shows an informational message and disables the selector. The global prompt section remains fully functional.

**Rationale**: Operators still need access to the global prompt even if no businesses are active. Failing the entire page would be worse UX.

## Risks / Trade-offs

### Risk: Operator selects wrong business when names are identical
→ **Mitigation**: Document this limitation; accept it as low-probability for V1. If it becomes a problem, add email as secondary label in a follow-up.

### Risk: `loadOperatorClientsForStrategy()` changes its contract
→ **Mitigation**: The loader has a stable TypeScript type (`OperatorClientOption`) and is used by multiple pages. Breaking changes would be caught at build time.

### Risk: Large client lists (hundreds of businesses) make dropdown unwieldy
→ **Mitigation**: Current implementation filters to active clients only and is capped by Supabase query. If scale becomes an issue, a follow-up change can add search/autocomplete. V1 assumes <100 active clients.

## Migration Plan

No database migration needed. This is a UI-only change.

**Deployment**:
1. Merge PR with updated page and component
2. Deploy to staging, verify operator can select businesses by name
3. Deploy to production (zero downtime; page is operator-only)

**Rollback**: Revert the PR. No data corruption risk (prompt save/load logic unchanged).

## Open Questions

None. All design decisions are finalized.
