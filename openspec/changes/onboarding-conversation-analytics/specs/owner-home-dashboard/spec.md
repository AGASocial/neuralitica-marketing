## ADDED Requirements

### Requirement: Dashboard onboarding redirect
`/dashboard` (Hoy) SHALL redirect eligible owners into `/conversation?mode=onboarding` when the Option A first-run gate applies. After setup is complete **or** the owner already has approved plan or approved reel content, `/dashboard` MUST render Hoy without redirect.

#### Scenario: Gate applies
- **WHEN** an eligible owner opens `/dashboard`
- **THEN** they are redirected to `/conversation?mode=onboarding`

#### Scenario: Gate does not apply
- **WHEN** the owner has an approved plan or approved reel or is an operator
- **THEN** `/dashboard` renders the Hoy feed
