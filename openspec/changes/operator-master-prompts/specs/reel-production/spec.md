# Spec Delta

## ADDED Requirements

### Requirement: B-roll prompts inject master prompts
B-roll prompt builders (`buildWanBrollPrompt`, `buildLtxBrollPrompt`) SHALL inject global and per-business master prompts after the base faceless cinematic style instruction and before the scene beat description.

#### Scenario: B-roll with master prompts
- **WHEN** `createBrollVideoJobs` builds a prompt for a client with non-empty global and/or business master prompts
- **THEN** the system includes them in the final prompt string after the base cinematic style
- **AND** the scene beat description follows the prompts

#### Scenario: B-roll with no master prompts
- **WHEN** `createBrollVideoJobs` builds a prompt with null/empty master prompts
- **THEN** the system omits master prompt injection
- **AND** behavior remains identical to current implementation
