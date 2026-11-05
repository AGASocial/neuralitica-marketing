# Spec Delta

## ADDED Requirements

### Requirement: Script generation injects master prompts
Reel script generation SHALL load and inject global and per-business master prompts into the system message after base instructions and before untrusted profile/slot/formato/tactica blocks.

#### Scenario: Script with master prompts
- **WHEN** `generateReelScriptForSlot` runs for a client with non-empty global and/or business master prompts
- **THEN** the system includes them in the LLM system message after base script instructions
- **AND** untrusted blocks follow the prompts

#### Scenario: Script with no master prompts
- **WHEN** `generateReelScriptForSlot` runs with null/empty master prompts
- **THEN** the system omits master prompt sections
- **AND** behavior remains identical to current implementation
