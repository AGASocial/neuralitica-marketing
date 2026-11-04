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
