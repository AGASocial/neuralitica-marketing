## ADDED Requirements

### Requirement: Onboarding conversation layout
When `/conversation` is opened with `mode=onboarding`, the full-screen conversation SHALL show: a setup progress indicator of required setup steps, actionable proposal/AgentCards in the thread (Approve/Change via existing Server Actions), a desktop right canvas of those cards, and on mobile a horizontal card carousel. Cards MUST NOT be read-only-only in onboarding mode.

#### Scenario: Desktop onboarding
- **WHEN** an owner opens `/conversation?mode=onboarding` on a desktop viewport
- **THEN** the UI shows thread + right canvas with actionable cards and a setup progress indicator

#### Scenario: Mobile onboarding carousel
- **WHEN** an owner opens onboarding conversation on a mobile viewport
- **THEN** cards appear in a horizontal carousel and chat remains full-width

### Requirement: Onboarding system prompt
When chat requests include onboarding mode, the system prompt SHALL emphasize the guided first-run order (interview → plan → write-ups → first videos with explicit cost cards) in plain language and MUST restate no auto-spend / no Instagram publish / no avatar generation.

#### Scenario: Onboarding mode prompt
- **WHEN** `/api/chat` runs for an owner in onboarding mode
- **THEN** the model receives the tightened onboarding guidance in addition to base rules

### Requirement: Owner guided proposal tools
Cliente owners SHALL be allowed to receive proposal cards for weekly plan generation/approval, script generation, video prepare, and paid-generation cost confirmation (Approve still required). These tools MUST remain non-mutating until Approve and MUST NOT publish to Instagram.

#### Scenario: Owner plan proposal
- **WHEN** a non-operator owner needs a weekly plan during onboarding or guided chat
- **THEN** `proposeGenerateStrategy` / `proposeApproveStrategy` may return proposal cards (no silent mutation)

## MODIFIED Requirements

### Requirement: Full-screen conversation route
The system SHALL provide a full-screen conversation view at `/conversation` (Option A layout: transcript thread plus a canvas/list of agent cards) reachable in one tap from the shell Conversación control. The view MUST reuse the same orchestrator chat transport and persistence as the panel. Outside onboarding mode the canvas MAY remain a preview of tool cards; in onboarding mode cards in thread and canvas MUST support Approve/Change.

#### Scenario: Open conversation route
- **WHEN** an authenticated owner navigates to `/conversation`
- **THEN** the full-screen conversation UI loads the latest conversation for that client

#### Scenario: Onboarding mode query
- **WHEN** the owner opens `/conversation?mode=onboarding`
- **THEN** onboarding layout behaviors (progress, skip, actionable cards) apply
