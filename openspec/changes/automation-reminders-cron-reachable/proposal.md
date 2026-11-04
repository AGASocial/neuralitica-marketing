# Change: Make the automation reminders cron reachable in production

## Why
Production verification found `/api/cron/automation-reminders` redirected (302) to `/login` by the auth middleware, so Vercel Cron (no session cookie) never reached the handler, and `CRON_SECRET` was not configured. Reminder emails/Hoy items therefore never fired.

## What Changes
- Middleware public allowlist includes exactly `/api/cron/automation-reminders`; the route keeps enforcing `Authorization: Bearer $CRON_SECRET`.
- `CRON_SECRET` is configured in Vercel (sensitive). Other crons (`video-jobs`, `weekly-cycle`) intentionally stay behind middleware — no paid work is unlocked.

## Capabilities
### Modified Capabilities
- `proactive-automation`: hourly reminder cron is reachable by Vercel Cron.
