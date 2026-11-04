## ADDED Requirements

### Requirement: Last-updated uses client timezone
The Home “Actualizado …” label SHALL format `lastUpdatedAt` in the browser’s local timezone (not the server/UTC default alone).

#### Scenario: Browser not UTC
- **WHEN** the dashboard renders for a client whose browser timezone differs from UTC
- **THEN** the displayed time matches the browser-local wall clock for that ISO timestamp

### Requirement: Next-action section title appears once
The “Qué hacer ahora” / next-action section title SHALL be exposed once for both visibility and accessibility (no duplicate visible + `sr-only` announcement of the same string).

#### Scenario: Single next-action label
- **WHEN** the Home next-action card is rendered
- **THEN** the section title string is not duplicated as both a visible eyebrow and a separate `sr-only` heading with the same text
