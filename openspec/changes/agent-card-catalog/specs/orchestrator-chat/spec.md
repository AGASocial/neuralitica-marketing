## ADDED Requirements

### Requirement: Tool parts render through agent card catalog
Orchestrator chat tool-part UI for proposals, status summaries, progress, next-step chips, and clarifying questions SHALL map outputs into the `agent-cards` catalog and render via `AgentCard`. Proposal Approve MUST still invoke the same Server Actions as before; chat MUST NOT auto-spend or publish to Instagram. Related: ADR-0011, ADR-0012, `agent-cards` capability.

#### Scenario: Proposal card via AgentCard
- **WHEN** an action tool returns a proposal (e.g. approve video, cost confirm, TTS, plan, own-avatar)
- **THEN** the chat UI renders it through `AgentCard` and mutates only after Approve

#### Scenario: Next-step chips via catalog
- **WHEN** `suggestNextActions` returns actions
- **THEN** the UI renders a `next_step_chips` catalog card and selecting a chip still sends that text as a user message
