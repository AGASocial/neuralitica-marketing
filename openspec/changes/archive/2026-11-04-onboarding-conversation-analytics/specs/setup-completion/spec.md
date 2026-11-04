## ADDED Requirements

### Requirement: Should enter Option A onboarding
The system SHALL expose a pure decision helper that returns true only when: the user role is `client` (not operator), setup `percentComplete` is below 100, `hasApprovedPlan` is false for the current week, and `hasApprovedReel` is false. Instagram remaining incomplete alone MUST NOT force onboarding when an approved plan or reel exists.

#### Scenario: Eighty percent with approved plan
- **WHEN** percentComplete is 80 (e.g. Instagram incomplete) and hasApprovedPlan is true
- **THEN** shouldEnterOnboarding is false

#### Scenario: Incomplete and empty approvals
- **WHEN** percentComplete is below 100, hasApprovedPlan is false, and hasApprovedReel is false for a client role
- **THEN** shouldEnterOnboarding is true

#### Scenario: Operator
- **WHEN** role is operator
- **THEN** shouldEnterOnboarding is false
