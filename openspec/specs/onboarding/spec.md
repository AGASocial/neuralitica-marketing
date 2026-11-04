# onboarding Specification

## Purpose

Capture the Cliente’s business via the Entrevista inicial and produce a Ficha viva so strategy and media agents have structured context. Covers the interview form UI and in-chat interview proposals. Related: ADR-0009 (in-chat interview), CONTEXT Entrevista / Ficha viva.

## Requirements

### Requirement: Interview draft persistence
The system SHALL persist Entrevista draft answers for the authenticated Cliente in `neuramark_interview_sessions` via the `persistInterviewDraft` Server Action, scoped by `getCurrentUser()` / `requireActive`, without accepting client-supplied `client_id`.

#### Scenario: Active client saves a step
- **WHEN** an active Cliente submits a valid draft step payload
- **THEN** the session answers merge server-side and status remains `draft` until submit

#### Scenario: Unauthenticated or inactive user
- **WHEN** the caller is unauthenticated or inactive
- **THEN** the action MUST return a 401/403 envelope and MUST NOT update the session

### Requirement: Interview submit creates Ficha viva
The system SHALL accept a completed interview via `submitInterview`, mark the session `completed` (read-only for the Cliente thereafter), and create or update `neuramark_business_profiles` idempotently for that Cliente.

#### Scenario: Complete interview submitted
- **WHEN** all required steps are present and the Cliente submits
- **THEN** the session becomes `completed` and the Ficha viva is upserted for agents

#### Scenario: Already completed
- **WHEN** the session is already `completed` and a non-operator retries submit
- **THEN** the system MUST reject further Cliente edits to the interview answers

### Requirement: Interview page and chat onboarding
The system SHALL expose `/interview` for the stepped form and SHALL allow orchestrator-chat proposal tools to stage `persistInterviewDraft` / `submitInterview` until the owner taps Approve (ADR-0009).

#### Scenario: Owner approves chat interview step
- **WHEN** a chat proposal card for an interview step is Approved
- **THEN** the existing Server Action runs and the transcript reflects the saved progress

#### Scenario: Owner opens interview page
- **WHEN** an active Cliente opens `/interview`
- **THEN** the UI loads the current draft or completed view using `resolveRequestLocale`

### Requirement: Option A first-run conversation gate
The system SHALL redirect an authenticated owner (role `client`, not operator) into Option A full-screen conversation only when setup percent is below 100 and the client has neither an approved weekly plan nor an approved reel. Operators MUST never be forced into this route.

#### Scenario: Incomplete setup and no approved content
- **WHEN** an active owner with incomplete setup and zero approved plans/reels visits `/dashboard` or completes login with default next
- **THEN** the system redirects to `/conversation?mode=onboarding`

#### Scenario: Approved plan keeps Hoy
- **WHEN** setup percent is below 100 but an approved plan exists for the week
- **THEN** the owner stays on Hoy and MUST NOT be redirected to onboarding

#### Scenario: Operator never redirected
- **WHEN** an operator visits `/dashboard`
- **THEN** the system MUST NOT redirect to onboarding conversation

### Requirement: Skip to Hoy always available
While in onboarding conversation mode, the UI SHALL always show a Skip to Today / Saltar a Hoy control that navigates to `/dashboard` without completing setup. Visiting `/dashboard` again afterward MAY re-enter onboarding only if the gate still applies.

#### Scenario: Owner skips
- **WHEN** the owner taps Skip to Today during onboarding mode
- **THEN** they navigate to Hoy (`/dashboard`)

### Requirement: Agent-driven onboarding path
In onboarding mode the assistant SHALL drive interview (existing interview proposal tools) → weekly plan presentation/approval cards → script and first-reel approval cards in the thread, with cost-confirmation cards remaining explicit. The system MUST NOT auto-spend, auto-approve, publish to Instagram, or start avatar generation from onboarding.

#### Scenario: Interview then plan cards
- **WHEN** an onboarding owner has not finished the interview
- **THEN** the agent uses interview status/save/submit proposal tools before plan cards

#### Scenario: Cost stays explicit
- **WHEN** paid video or voice would be needed during onboarding
- **THEN** a cost confirmation card is shown and nothing spends until Approve
