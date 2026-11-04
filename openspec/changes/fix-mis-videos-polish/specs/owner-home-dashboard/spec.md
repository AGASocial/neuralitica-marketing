## MODIFIED Requirements

### Requirement: Last-updated timestamp avoids hydration mismatch
The owner Home dashboard “Actualizado” / last-updated label SHALL NOT render a server/client timezone-dependent formatted time during hydration. The time string MUST be produced on the client after mount (or use `suppressHydrationWarning` on the time node) so React error #418 does not occur on `/dashboard`. Other timezone-sensitive date strings rendered from client components in the Home + AppShell tree (if any) MUST follow the same after-mount rule.

#### Scenario: Dashboard loads without text mismatch
- **WHEN** an owner opens `/dashboard` in production (server TZ UTC, browser e.g. America/Chicago)
- **THEN** the last-updated label does not cause a hydration text mismatch between server HTML and the first client render

#### Scenario: After-mount local time
- **WHEN** the dashboard has hydrated
- **THEN** the last-updated label shows the browser-local wall clock for `lastUpdatedAt`
