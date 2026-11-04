## ADDED Requirements

### Requirement: Approvals list and disclosure strings localized
Owner-facing `/approvals` list copy for card summary, untitled fallback, disclosure chip, and disclosure tooltip SHALL come from `messages/{en,es}.json`. Spanish owners MUST see plain-language Spanish (e.g. “Revisa este video antes de publicarlo”, “Aviso de IA”), not English jargon chips.

#### Scenario: Spanish approvals list chrome
- **WHEN** locale is `es` on `/approvals`
- **THEN** card summary and disclosure chip/tooltip resolve from `messages/es.json`
