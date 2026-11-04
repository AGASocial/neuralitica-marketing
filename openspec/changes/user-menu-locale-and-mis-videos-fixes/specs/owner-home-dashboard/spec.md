## ADDED Requirements

### Requirement: Last-updated timestamp avoids hydration mismatch
The owner Home dashboard “Actualizado” / last-updated label SHALL NOT render a server/client timezone-dependent formatted time during hydration. The time string MUST be produced on the client after mount (or use `suppressHydrationWarning` on the time node) so React error #418 does not occur on `/dashboard`.

#### Scenario: Dashboard loads without text mismatch
- **WHEN** an owner opens `/dashboard` in production
- **THEN** the last-updated label does not cause a hydration text mismatch between server HTML and the first client render
