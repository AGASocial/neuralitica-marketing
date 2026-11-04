# Proposal

## Why

Owners need a plain answer to “¿Qué me falta?” — setup progress is scattered across profile, interview, preferences, Instagram, plan, and presenter. Jira **KAN-99**.

## What Changes

- Add server-side `computeSetupCompletion(client)` returning required steps (business profile, interview, visual preferences, Instagram connected, plan approved) plus optional presenter/avatar (excluded from %).
- Show progress ring/bar + checklist with “Hacerlo” links on Inicio; hide when 100% required complete.
- Expose read tool `getSetupStatus` so chat answers setup questions from the same computation.
- Unit tests for percent math and optional-step exclusion.
- Docs: ADR-0009 tool catalog + KAN-84 note.

## Capabilities

### New Capabilities

- `setup-completion`: Compute and surface owner onboarding/setup completion for Home UI and orchestrator chat.

### Modified Capabilities

- `owner-home-dashboard`: Inicio MAY show setup completion checklist when required percent &lt; 100.
- `orchestrator-chat`: Add read tool `getSetupStatus` for “what’s left?” questions.

## Impact

- `lib/dashboard/compute-setup-completion.ts` (+ tests), contracts
- Dashboard view/page wiring
- `lib/orchestrator-chat/create-tools.ts`, contracts, sanitize list, system prompt
- `messages/{en,es}.json`
- No migrations; Instagram connected stays incomplete until connect exists (honest false)
