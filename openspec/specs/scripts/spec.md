# scripts Specification

## Purpose

Generate and manage Reel script packages (hook, body, CTA, on-screen text, voiceover) from an approved weekly strategy for Operator review and downstream media jobs. Related: ADR-0001, ADR-0007 (duration policy feeds script clamps), ADR-0009.

## Requirements

### Requirement: Operator scripts workspace
The system SHALL expose `/operator/scripts` for Operators to generate and inspect reel scripts via `generateReelScripts` and related server helpers, scoped to authenticated Operator role checks.

#### Scenario: Generate scripts for a week
- **WHEN** an Operator requests script generation for a client with an eligible strategy
- **THEN** the system creates script packages for the week’s slots and lists them in the scripts UI

#### Scenario: Cliente cannot generate scripts from Operator route
- **WHEN** a Cliente without operator role calls script generation actions
- **THEN** the server MUST return forbidden and MUST NOT create scripts

### Requirement: Scripts respect duration policy
Script generation SHALL clamp avatar and faceless durations using `neuramark_reel_duration_policies` (ADR-0007), falling back to logged hardcoded defaults only if policy load fails.

#### Scenario: Avatar slot duration
- **WHEN** a slot modality is own or generic avatar
- **THEN** the generated package MUST stay within the avatar total and segment bounds from policy

#### Scenario: Faceless slot duration
- **WHEN** a slot modality is faceless
- **THEN** the generated package MUST stay within the faceless total duration bounds from policy

### Requirement: Chat script tools are proposal-first
Tools such as `proposeGenerateScripts`, `getScriptPreview`, and `proposeRegenerateScript` SHALL present plain-language cards; regenerations and bulk generation MUST NOT mutate until Approve (ADR-0009).

#### Scenario: Operator approves script generation card
- **WHEN** an Operator Approves “Write this week’s videos?” (scripts)
- **THEN** `generateReelScripts` runs and script status becomes available to video proposal tools
