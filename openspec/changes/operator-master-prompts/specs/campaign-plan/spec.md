# Spec Delta

## ADDED Requirements

### Requirement: Strategy generation injects master prompts
Weekly strategy generation SHALL load and inject global and per-business master prompts into the system message after base instructions and before untrusted playbook/profile/trend blocks.

#### Scenario: Strategy with global prompt only
- **WHEN** `generateWeeklyContentStrategy` runs for a client with a non-empty global master prompt and no business prompt
- **THEN** the system includes the global prompt in the LLM system message after base instructions
- **AND** untrusted blocks follow the global prompt

#### Scenario: Strategy with global + business prompts
- **WHEN** `generateWeeklyContentStrategy` runs for a client with non-empty global and business master prompts
- **THEN** the system includes global prompt first, then business prompt, in the LLM system message
- **AND** untrusted blocks follow the business prompt

#### Scenario: Strategy with no master prompts
- **WHEN** `generateWeeklyContentStrategy` runs with null/empty global and business master prompts
- **THEN** the system omits master prompt sections
- **AND** untrusted blocks follow base instructions directly as before
