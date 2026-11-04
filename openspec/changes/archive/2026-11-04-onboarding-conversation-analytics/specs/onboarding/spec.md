## ADDED Requirements

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
