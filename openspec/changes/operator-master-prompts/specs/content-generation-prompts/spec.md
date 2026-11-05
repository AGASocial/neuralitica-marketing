# Spec Delta

## Purpose

Operator-editable master prompts steer content generation (strategy, scripts, B-roll) with creative direction while preserving safety, schema, and format constraints.

## ADDED Requirements

### Requirement: Global master prompt persistence
The system SHALL persist one global master prompt as TEXT in `neuramark_operator_prompts.global_master_prompt`, accessible only via service-role (no RLS policies).

#### Scenario: Global prompt storage
- **WHEN** operator saves a global master prompt via `updateGlobalMasterPrompt`
- **THEN** the system stores it in `neuramark_operator_prompts` (upsert singleton row)
- **AND** subsequent content generation loads it

#### Scenario: Empty global prompt
- **WHEN** operator sets global master prompt to empty string or whitespace-only
- **THEN** the system stores NULL
- **AND** content generation skips global prompt injection

### Requirement: Per-business master prompt persistence
The system SHALL persist per-business master prompts as TEXT in `neuramark_business_prompts.business_master_prompt`, scoped by `client_id`, accessible only via service-role.

#### Scenario: Business prompt storage
- **WHEN** operator saves a per-business master prompt for client X via `updateBusinessMasterPrompt`
- **THEN** the system upserts `neuramark_business_prompts` row for that `client_id`
- **AND** subsequent content generation for client X loads both global and business prompts

#### Scenario: Empty business prompt
- **WHEN** operator sets business master prompt to empty string or whitespace-only
- **THEN** the system stores NULL
- **AND** content generation uses only the global prompt (if non-empty) for that business

### Requirement: Master prompt max length
The system SHALL enforce a maximum length of 4,000 characters for global and per-business master prompts via CHECK constraints and server action validation.

#### Scenario: Length validation
- **WHEN** operator submits a master prompt exceeding 4,000 characters
- **THEN** the server action returns a validation error
- **AND** no database write occurs

### Requirement: Operator-only prompt access
The system SHALL restrict master prompt read and write access to authenticated users with operator role; business clients MUST NOT see or edit master prompts.

#### Scenario: Operator edits global prompt
- **WHEN** authenticated operator loads `/operator/settings/master-prompts`
- **THEN** the system displays current global and per-business prompts with editable textareas

#### Scenario: Client cannot access prompts
- **WHEN** a non-operator user attempts to access `/operator/settings/master-prompts`
- **THEN** the system returns 403 Forbidden

### Requirement: Prompt injection order in strategy generation
Weekly strategy generation SHALL inject master prompts after base system instructions and before untrusted playbook/profile/trend blocks.

#### Scenario: Strategy generation with global prompt only
- **WHEN** strategy generation runs with non-empty global prompt and no business prompt
- **THEN** the system includes global prompt in the system message after base instructions
- **AND** untrusted blocks follow the global prompt section

#### Scenario: Strategy generation with global + business prompts
- **WHEN** strategy generation runs with both non-empty global and business prompts
- **THEN** the system includes global prompt first, then business prompt, both in the system message
- **AND** untrusted blocks follow the business prompt section

#### Scenario: Strategy generation with no prompts
- **WHEN** strategy generation runs with null/empty global and business prompts
- **THEN** the system omits master prompt sections entirely
- **AND** untrusted blocks follow base instructions directly

### Requirement: Prompt injection order in reel script generation
Reel script generation SHALL inject master prompts after base system instructions and before untrusted profile/slot/formato/tactica blocks.

#### Scenario: Script generation with master prompts
- **WHEN** script generation runs with non-empty global and/or business prompts
- **THEN** the system includes them in the system message after base instructions
- **AND** untrusted blocks follow the prompts

### Requirement: Prompt injection in B-roll generation
B-roll prompt builders (`buildWanBrollPrompt`, `buildLtxBrollPrompt`) SHALL inject master prompts after the base faceless cinematic style instruction and before the scene beat.

#### Scenario: B-roll generation with master prompts
- **WHEN** B-roll video job creation builds a prompt with non-empty global and/or business prompts
- **THEN** the system includes them in the final prompt string
- **AND** the scene beat description follows the prompts

### Requirement: Default global prompt
The system SHALL seed a default global master prompt in the initial migration focused on Instagram Reels hooks, retention, and faceless/avatar short-form best practices.

#### Scenario: Fresh installation default
- **WHEN** the migration runs on a database with no existing `neuramark_operator_prompts` row
- **THEN** the system inserts a default global prompt emphasizing retention, hooks, and pacing for 9:16 Reels

#### Scenario: Existing installation migration
- **WHEN** the migration runs on a database with an existing global prompt
- **THEN** the system preserves the existing prompt (no overwrite)
