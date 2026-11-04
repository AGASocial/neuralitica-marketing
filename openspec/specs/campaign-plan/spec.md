# campaign-plan Specification

## Purpose

Produce and review the weekly Estrategia semanal (campaign plan / content strategy) that assigns Reel slots, themes, and modalities within the Cliente allowlist. Related: ADR-0001 (weekly cycle), ADR-0009 (chat proposals).

## Requirements

### Requirement: Operator strategy workspace
The system SHALL provide an Operator Advanced route `/operator/strategy` to generate, inspect, and approve weekly content strategies for clients using server-side actions such as `generateContentStrategy` and `approveContentStrategy`.

#### Scenario: Operator generates strategy
- **WHEN** an Operator triggers strategy generation for an eligible client week
- **THEN** the system persists a weekly plan (slots/themes) server-side and surfaces it in the strategy UI

#### Scenario: Non-operator blocked
- **WHEN** a non-operator Cliente attempts Operator strategy mutations
- **THEN** the server MUST reject the action with a forbidden result

### Requirement: Chat strategy proposals do not mutate until Approve
Orchestrator tools that propose strategy generation or approval SHALL return proposal cards only; mutation MUST occur only after the owner/operator Approves via the mapped Server Action (ADR-0009).

#### Scenario: Propose generate strategy
- **WHEN** `proposeGenerateStrategy` succeeds
- **THEN** the UI shows an Approve / Change card and MUST NOT have written a new strategy yet

#### Scenario: Approve strategy proposal
- **WHEN** the user Approves a strategy proposal card
- **THEN** the corresponding Server Action runs and the plan becomes visible to downstream script generation

### Requirement: Weekly cycle enqueue strategy
Per ADR-0001, the System MUST support a scheduled weekly cycle that produces strategy toward the approval queue, and Operators MUST be able to trigger the cycle manually via `/operator/cycle`.

#### Scenario: Manual cycle trigger
- **WHEN** an Operator starts the weekly cycle from the cycle screen
- **THEN** the system enqueues the configured pipeline steps without publishing to Instagram
