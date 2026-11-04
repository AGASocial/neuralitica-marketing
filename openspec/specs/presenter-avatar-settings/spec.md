# presenter-avatar-settings Specification

## Purpose

Let the Cliente configure Preferencias de producción visual (own avatar, generic, faceless/B-roll), grant or revoke presenter consent, and manage presenter voice/gender and reference photos. Related: ADR-0007, ADR-0009; SPEC Avatar / Visual Mode Selector.

## Requirements

### Requirement: Preferences page
The system SHALL expose `/settings/preferences` for active Clientes to view and update allowed visual modes via server actions such as `upsertVisualPreferences`, localized with `resolveRequestLocale`.

#### Scenario: Update allowed modes
- **WHEN** the Cliente saves an allowlist including one or more of own_avatar, generic_avatar, faceless
- **THEN** `neuramark_visual_preferences` is upserted for that client_id from the server session

#### Scenario: Own avatar without consent
- **WHEN** the Cliente enables own_avatar without a valid consent record
- **THEN** the system MUST block own-avatar production paths until consent is granted

### Requirement: Presenter consent ledger
Presenter/avatar consent SHALL be recorded append-only (grant/revoke). Revocation MUST prevent further own-avatar queue work that requires likeness.

#### Scenario: Grant consent from chat card
- **WHEN** the owner Approves a `grant_presenter_consent` proposal
- **THEN** consent is persisted and subsequent enable-own-avatar proposals may proceed to Preferencias

#### Scenario: Revoke consent
- **WHEN** consent is revoked
- **THEN** own-avatar generation that requires likeness MUST be rejected on the server

### Requirement: Presenter voice settings
The system SHALL allow setting presenter gender and language (en/es) so TTS/voice matching can use `neuramark_avatars` metadata, via preferences UI and/or chat `set_presenter_voice` proposals that mutate only on Approve.

#### Scenario: Save presenter voice from chat
- **WHEN** the owner Approves a set_presenter_voice card with male/female and locale
- **THEN** the presenter voice preferences are stored server-side without starting video jobs

### Requirement: Reference uploads stay server-validated
Portrait/reference uploads for own avatar SHALL use the existing server-validated upload path; the browser MUST NOT talk to Supabase Storage directly.

#### Scenario: Attach photo in chat
- **WHEN** the owner attaches a photo in orchestrator chat
- **THEN** the server validates the file and stores it through the avatar-reference path
