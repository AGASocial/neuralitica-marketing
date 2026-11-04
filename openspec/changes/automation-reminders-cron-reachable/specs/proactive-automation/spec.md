## ADDED Requirements

### Requirement: Reminder cron reachable without session
The auth middleware SHALL NOT redirect `/api/cron/automation-reminders` to login; the route MUST authenticate with `Authorization: Bearer $CRON_SECRET`. Other `/api/cron/*` paths SHALL remain non-public.

#### Scenario: Vercel Cron call
- **WHEN** Vercel Cron calls the reminders path with the cron secret and no cookie
- **THEN** the handler runs and returns 200 JSON

#### Scenario: Missing secret
- **WHEN** the path is called without a valid bearer token
- **THEN** the handler returns 401 (or 503 when unset in production) and does nothing
