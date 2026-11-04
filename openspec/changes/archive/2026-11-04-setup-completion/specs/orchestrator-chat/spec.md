# Spec Delta

## ADDED Requirements

### Requirement: getSetupStatus read tool
Orchestrator chat SHALL provide a read-only `getSetupStatus` tool that returns the owner’s setup completion (required and optional steps, percentComplete) for answering “what’s left / ¿qué me falta?”. The tool MUST NOT mutate state, spend, publish to Instagram, or start avatar generation.

#### Scenario: Tool returns completion
- **WHEN** `getSetupStatus` is invoked for an authenticated owner
- **THEN** the tool returns ok with steps and percentComplete aligned with `computeSetupCompletion`
