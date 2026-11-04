# agent-cards Specification

## Purpose

Shared Zod catalog and single `AgentCard` renderer for agentic UI surfaces (chat, Mis videos, approvals; later Hoy). Related: ADR-0011, ADR-0012, KAN-103.

## ADDED Requirements

### Requirement: Catalog schemas cover known card types
The system SHALL expose Zod schemas under `lib/agent-cards/` for each catalog card type: `reel_approval`, `cost_confirmation`, `plan_approval`, `script_approval`, `own_avatar_activation`, `voice_cost`, `status_summary`, `clarifying_question`, `next_step_chips`, and `progress`. Each card SHALL declare `type`, typed `props`, and `actions` (approve | change | secondary link ids) with at most two primary actions.

#### Scenario: Schema rejects unknown type
- **WHEN** a payload with an unknown `type` is parsed against the catalog union
- **THEN** parsing MUST fail

#### Scenario: Max two primary actions
- **WHEN** a card declares more than two primary actions
- **THEN** the schema MUST reject the payload

### Requirement: Single AgentCard renderer
The UI SHALL render catalog cards through one `<AgentCard card onAction>` Campaña/shadcn component. Reel approval cards that include a video or cover asset id/URL SHALL use the shared `MediaThumbnail` (or playable preview when full video controls are required). Spend cards (`cost_confirmation`, `voice_cost`) MUST surface the estimate before Approve.

#### Scenario: Action callback
- **WHEN** the owner activates a primary action on `AgentCard`
- **THEN** `onAction` is invoked with the action id and the card; the component MUST NOT call Server Actions itself

#### Scenario: Cost always visible
- **WHEN** a `cost_confirmation` or `voice_cost` card includes an estimated cost
- **THEN** the rendered card shows that amount in the card body before Approve

### Requirement: Surfaces share the catalog without behavior change
Orchestrator chat tool-part cards, Mis videos pending OK cards, and `/approvals` list cards SHALL map into the catalog and render via `AgentCard` while keeping the same Server Action boundaries (Approve → existing actions; no auto-spend; no Instagram publish from the card).

#### Scenario: Chat proposal still confirms before mutate
- **WHEN** chat shows a proposal catalog card
- **THEN** domain mutation runs only after the owner Approves (same Server Actions as before)

#### Scenario: Mis videos pending approve
- **WHEN** the owner Approves a pending Mis videos reel card
- **THEN** `decideApproval` runs with decision approved

#### Scenario: Approvals list review link
- **WHEN** the `/approvals` list renders a pending package card
- **THEN** the card uses `AgentCard` with media thumbnail when a video asset exists and a secondary/primary link to the package detail
