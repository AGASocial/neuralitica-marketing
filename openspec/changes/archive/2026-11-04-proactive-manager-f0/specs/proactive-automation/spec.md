## Purpose

Owner-configurable proactive automation around pending approvals: presets, spend caps, auto-approve evaluation (F0 dry-run), reminders, and batched notifications without Instagram publish or weekly-cycle live spend.

## ADDED Requirements

### Requirement: Per-business automation settings
The system SHALL persist per-client automation settings with presets `auto_pilot` (Piloto automático), `review_all` (Reviso todo, DEFAULT), and `custom` (per-content-type rules). Settings SHALL include optional weekly spend cap cents, optional max cost cents per item for auto-approve eligibility, and reminder flags for 24h, 48h (channel change), and 72h (fallback). Missing rows MUST behave as `review_all`.

#### Scenario: Default when unset
- **WHEN** a client has no automation settings row
- **THEN** evaluation treats the preset as `review_all` (always notify / never auto-approve)

#### Scenario: Auto pilot preset
- **WHEN** the owner confirms Piloto automático
- **THEN** settings persist preset `auto_pilot` with the configured caps

### Requirement: Evaluator at pending approval
When a reel enters pending client approval, the system SHALL run the automation evaluator: if rules allow auto-approve, F0 MUST only dry-run/log the decision (no Instagram publish; no real approval write unless a future live flag is explicitly on — F0 keeps dry-run). Otherwise the system SHALL enqueue owner notification (Hoy feed item and, when email notifications are enabled, a batched Resend email).

#### Scenario: Review-all notifies
- **WHEN** preset is `review_all` and a new pending approval appears
- **THEN** a Hoy notification item is created and no auto-approve is applied

#### Scenario: Auto-pilot dry-run
- **WHEN** preset is `auto_pilot` and the item cost is within max auto-approve and weekly cap
- **THEN** F0 records a dry-run auto-approve decision and does not publish to Instagram

### Requirement: Hourly reminder cron
The system SHALL expose an hourly Vercel cron at `/api/cron/automation-reminders` protected by `CRON_SECRET` like existing crons. The job MUST be idempotent and send 24h / 48h / 72h reminders according to settings without duplicating the same reminder kind for the same approval.

#### Scenario: Unauthorized cron
- **WHEN** the cron is called without a valid `CRON_SECRET` Bearer token
- **THEN** the handler returns 401 or 503 and performs no writes

#### Scenario: Idempotent 24h reminder
- **WHEN** a pending approval is older than 24h and a 24h reminder was already recorded
- **THEN** the cron does not send a duplicate 24h reminder

### Requirement: Email notifications behind flags
Owner approval emails SHALL use Resend via a server-only module. Sending MUST be gated by `OWNER_EMAIL_NOTIFICATIONS_ENABLED` (default off). Recipients MUST be filtered by `NOTIFICATIONS_TEST_ALLOWLIST` when set. From-address comes from `NOTIFICATIONS_FROM_EMAIL` / configured sender. Emails MUST only go to allowlisted addresses during test (gaveho@gmail.com).

#### Scenario: Flag off
- **WHEN** `OWNER_EMAIL_NOTIFICATIONS_ENABLED` is not true
- **THEN** no Resend API call is made; Hoy feed notification may still be created

### Requirement: Settings UI and confirm card
Mi negocio SHALL expose automation settings (presets, caps, reminders) in EN/ES. Orchestrator chat SHALL offer a tool that returns an AgentCard to enable Piloto automático requiring explicit Approve confirmation before mutation.

#### Scenario: Confirm required
- **WHEN** the owner asks to enable Piloto automático in chat
- **THEN** a confirmation card appears and settings do not change until Approve

### Requirement: No live weekly cycle or Instagram from F0 automation
F0 automation MUST NOT enable or modify `WEEKLY_CYCLE_LIVE_*` behavior, MUST NOT start paid generation, and MUST NOT publish to Instagram.

#### Scenario: Structural guard
- **WHEN** F0 automation code paths run
- **THEN** they do not call Instagram publish APIs and do not flip weekly-cycle live env usage
