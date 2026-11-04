# ADR-0013: Proactive automation F0 (KAN-108)

## Status

Accepted (2026-11-04)

## Context

Owners need the agent to notify and remind when reels wait for approval, with optional Autopilot rules. Full Workflow SDK migration is F1+ (`docs/design/agentic/agente-proactivo.md`).

## Decision

Ship F0 on the existing cron + Supabase stack:

- Per-client `neuramark_automation_settings` (presets: `review_all` default, `auto_pilot`, `custom`)
- Evaluator on new pending approvals: dry-run auto-approve log **or** Hoy notification (+ flagged Resend email)
- Hourly `/api/cron/automation-reminders` with idempotent events
- Chat `proposeEnableAutoPilot` confirmation card
- **Do not** enable `WEEKLY_CYCLE_LIVE_*`, spend, or Instagram publish from F0 automation

## Consequences

- Product loop closes without WDK yet
- Live auto-approve remains behind a future explicit flag (`AUTOMATION_AUTO_APPROVE_LIVE`); F0 never writes approvals autonomously
