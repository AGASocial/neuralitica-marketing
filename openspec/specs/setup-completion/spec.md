# setup-completion Specification

## Purpose
Compute and surface owner setup completion (required steps + optional presenter) for Inicio checklist and orchestrator chat answers to “what’s left?” (KAN-99).

## Requirements

### Requirement: Compute setup completion
The system SHALL compute setup completion for the current client with required steps business profile, interview, visual preferences, Instagram connected, and plan approved, plus an optional presenter/avatar step that MUST NOT count toward percent complete. Percent complete SHALL be based only on required steps. When Instagram connect is not implemented in-product, that step MUST remain incomplete (not faked).

#### Scenario: All required done, presenter missing
- **WHEN** all five required steps are done and presenter is not
- **THEN** percentComplete is 100 and the presenter step is listed as optional incomplete

#### Scenario: Instagram not connected
- **WHEN** no Instagram connection exists in the product
- **THEN** the Instagram step is incomplete and percentComplete is below 100 if any other required step is also incomplete or solely due to Instagram

### Requirement: Home checklist UI
Owner Home SHALL show a setup progress indicator and checklist with “Do it” / “Hacerlo” actions linking to the existing page or opening chat for each incomplete step. The setup section MUST hide when required percentComplete is 100.

#### Scenario: Incomplete setup on Home
- **WHEN** percentComplete is less than 100
- **THEN** Home shows the progress UI and incomplete steps with actions

#### Scenario: Complete setup hidden
- **WHEN** percentComplete is 100
- **THEN** Home does not show the setup checklist section

### Requirement: Chat getSetupStatus tool
Orchestrator chat SHALL expose a read-only `getSetupStatus` tool that returns the same setup completion shape so questions like “¿Qué me falta?” can be answered from it. The tool MUST NOT mutate, spend, publish, or start avatar generation.

#### Scenario: Owner asks what’s missing
- **WHEN** the model needs setup status for the owner
- **THEN** it can call `getSetupStatus` and receive step statuses and percentComplete
