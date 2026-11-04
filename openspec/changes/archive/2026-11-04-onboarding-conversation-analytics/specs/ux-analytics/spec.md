# ux-analytics Specification

## Purpose

Capture owner UX activation and engagement events for Hoy, chat, approvals, and onboarding without paid third-party analytics requirements, dual-writing to Vercel Analytics when available and always persisting to Postgres for queryable metrics.

## ADDED Requirements

### Requirement: Persist UX events server-side
The system SHALL persist UX events in `neuramark_ux_events` with columns `client_id`, `user_id`, `event`, `props` (jsonb), and `created_at`. RLS MUST be enabled (deny-by-default for anon/authenticated). Inserts MUST go through a Next.js Server Action (or equivalent server helper) using the service-role Supabase client scoped to `getCurrentUser()` — the browser MUST NOT receive the service-role key or write directly to the table.

#### Scenario: Authenticated insert
- **WHEN** an active user triggers a tracked event
- **THEN** a row is inserted for their client_id/user_id with event name and props

#### Scenario: Unauthenticated reject
- **WHEN** an unauthenticated caller attempts to record an event
- **THEN** the action returns an auth error and MUST NOT insert

### Requirement: Dual-write to Vercel Analytics when present
When `@vercel/analytics` is installed, the client SHALL also call `track(event, props)` for the same event names when feasible. Persistence to `neuramark_ux_events` MUST remain required whether or not Vercel Analytics is present.

#### Scenario: Vercel Analytics available
- **WHEN** Analytics is wired in the app shell
- **THEN** eligible client events may call `track()` in addition to the server persist

### Requirement: Core event catalog
The system SHALL support at least these events: `hoy_visit` (props include `acted=false` on load), `hoy_action` (any approve/change/send from Hoy), `chat_first_message` (`source` chip|typed and optional chip id), `approval` (`device` mobile|desktop, `ms_since_content_ready`, `first_approval_within_24h` boolean), and `onboarding_step` (step id / progress).

#### Scenario: Hoy visit then action
- **WHEN** the owner opens Hoy
- **THEN** `hoy_visit` is recorded with `acted=false`, and a later approve/change/send records `hoy_action`

#### Scenario: First chat message from chip
- **WHEN** the owner’s first message in a session comes from a suggested chip
- **THEN** `chat_first_message` is recorded with `source=chip` and the chip id

### Requirement: Metrics documentation
The repository SHALL document how to query these events (SQL examples) under `docs/` and note the analytics approach in ADR-0011 (or a short ADR addendum).

#### Scenario: Docs present
- **WHEN** the change ships
- **THEN** docs include event names and example queries against `neuramark_ux_events`
