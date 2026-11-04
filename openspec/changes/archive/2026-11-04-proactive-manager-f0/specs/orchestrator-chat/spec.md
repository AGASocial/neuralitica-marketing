## ADDED Requirements

### Requirement: Propose Piloto automático card
Orchestrator chat SHALL provide a tool that proposes enabling Piloto automático via an AgentCard requiring explicit Approve. Approve MUST upsert automation settings to preset `auto_pilot` only after confirmation. The tool MUST NOT spend, publish, or start video jobs.

#### Scenario: Owner requests auto pilot
- **WHEN** the owner asks to put the business on Piloto automático
- **THEN** a confirmation card is shown and no settings write occurs until Approve
