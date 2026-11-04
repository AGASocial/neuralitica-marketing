# Proposal

## Why

Inicio (`/dashboard`) is still a menu-card grid of shortcuts. Owners (non-technical) need a single glance at **what to do now**, this week’s status, campaign progress, and simple results — the “plumber principle” from ADR-0009 / KAN-84. Jira **KAN-98**.

## What Changes

- Replace the primary Inicio layout with an owner home dashboard: Next action, This week counts, Campaign progress, Results (or Instagram empty state), Recent videos strip.
- Keep a compact **Atajos** section for the previous menu-card links (interview, profile, preferences, approvals, ready-to-publish).
- Add server-side zod-validated loaders that aggregate existing approvals / strategy / calendar / guided-progress data. **No** mutating or spending buttons on Home.
- Results show Instagram insights **only** if read-only insights already exist in DB/integration; otherwise a friendly empty state (repo check: insights unavailable → empty state only; no new Graph publish or insights API calls).
- Document Home behavior in ADR-0009 (or note) and KAN-84 / AGENTS as needed.

## Capabilities

### New Capabilities

- `owner-home-dashboard`: Owner Inicio aggregates next action, week status counts, campaign progress, results empty/insights, recent videos, and Atajos — read-only, plain language, EN/ES.

### Modified Capabilities

- `ui-shell-nav`: Home (`/dashboard`) remains the owner entry, but its page content is the owner home dashboard (not only a shortcut grid).

## Impact

- `app/(app)/dashboard/page.tsx`, `components/dashboard/*`
- New `lib/contracts/owner-home-dashboard.ts` + `lib/dashboard/*` loaders
- `messages/{en,es}.json` dashboard copy
- Docs: ADR-0009, `docs/development/KAN-84-suggested-stories.md`, possibly AGENTS.md
- Tests for loaders and locale keys
- Out of scope: setup completion UI/tool (KAN-99), onboarding wizard ADR (KAN-100), migrations, Instagram publish, spend, avatar generation
