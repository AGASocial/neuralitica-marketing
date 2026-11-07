# Proposal

## Why

The operator master prompts settings page currently requires operators to manually enter client UUIDs to edit per-business prompts. This is error-prone and lacks discoverability—operators cannot browse available businesses or see which ones already have custom prompts without memorizing UUIDs. A human-readable business selector (matching patterns used on `/operator/cycle` and `/operator/strategy`) will improve usability and reduce errors.

## What Changes

- **Data loader**: Add client list loading to `/operator/settings/master-prompts/page.tsx` using the existing `loadOperatorClientsForStrategy()` helper.
- **UI component update**: Replace the raw UUID text input in `MasterPromptsSettingsView.tsx` with a shadcn/ui `Select` dropdown showing business display names (with email fallback) while storing client IDs internally.
- **Localization**: Add or update strings in `messages/{en,es}.json` for empty states, loading states, and any new labels (e.g., "No businesses available").
- **Fallback handling**: Handle edge cases: no businesses available, duplicate names (show email as secondary identifier), missing display names (fall back to email), and preserve existing behavior when switching clients (load that client's prompt).
- **No schema changes**: This is a UI-only improvement. No database migrations, no changes to prompt injection semantics, no new API contracts.

## Capabilities

### New Capabilities

<!-- No new capabilities; this is a UI refinement of existing functionality. -->

### Modified Capabilities

- `content-generation-prompts`: The operator master prompts settings UI SHALL present a human-readable business selector (dropdown or similar) instead of a raw UUID input, displaying business names with fallback to email when names are unavailable, and SHALL preserve the existing per-business prompt loading and saving behavior.

## Impact

- **Operator UI**: Updated `/operator/settings/master-prompts/page.tsx` to load clients, `MasterPromptsSettingsView.tsx` to replace text input with Select.
- **Loaders**: Reuses existing `loadOperatorClientsForStrategy()` from `lib/content-strategy/load-operator-clients-for-strategy.ts` (no changes to that file).
- **i18n**: Minor updates to `messages/{en,es}.json` for dropdown labels and empty states.
- **No breaking changes**: Existing master prompt save/load logic unchanged; only the client selection UX improves.
