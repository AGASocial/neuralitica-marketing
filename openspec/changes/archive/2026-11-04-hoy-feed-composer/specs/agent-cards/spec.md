## ADDED Requirements

### Requirement: Hoy feed uses AgentCard
Pending-approval and other actionable Hoy feed items SHALL render through the shared `AgentCard` catalog (same types/actions as chat and Mis videos). Reel-approval cards on Hoy SHALL expose at most two primary actions (Approve and Change). Cost MUST remain explicit on cost-type cards; Hoy MUST NOT invent a parallel card markup.

#### Scenario: Pending reel on Hoy
- **WHEN** Hoy shows a pending video for OK
- **THEN** it renders a `reel_approval` (or mapped) `AgentCard` with Approve and Change

#### Scenario: No silent apply
- **WHEN** an AgentCard is shown on Hoy
- **THEN** domain mutations still require an explicit Approve action wired to existing Server Actions
