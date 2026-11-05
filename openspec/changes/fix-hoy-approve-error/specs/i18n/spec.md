## ADDED Requirements

### Requirement: Approve failure fallback copy
`messages/es.json` and `messages/en.json` SHALL include `approvals.errors.approveFailed`. Spanish copy MUST be "No se pudo aprobar. Inténtalo de nuevo en un momento." English copy MUST be the equivalent failure sentence. Hoy, Mis videos, and approval detail MUST use this string when a decide error code is unknown or the action throws.

#### Scenario: Spanish fallback
- **WHEN** locale is `es` and approve fails with an unknown code
- **THEN** the UI shows "No se pudo aprobar. Inténtalo de nuevo en un momento."

#### Scenario: English fallback
- **WHEN** locale is `en` and approve fails with an unknown code
- **THEN** the UI shows the English `approvals.errors.approveFailed` sentence
