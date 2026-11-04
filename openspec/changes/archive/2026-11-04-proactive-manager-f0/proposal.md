# Proposal

## Why

KAN-108 / F0 of the proactive manager (`docs/design/agentic/agente-proactivo.md`): close the loop after reels reach “waiting for approval” with owner automation presets, reminders, and notifications — without turning on weekly-cycle live spend or Instagram publish.

## What Changes

- Per-business automation settings (presets: Piloto automático, Reviso todo DEFAULT, custom per content type) with weekly spend cap, max auto-approve cost, and reminder schedule (24h / 48h channel change / 72h fallback).
- Additive Supabase migration + RLS (deny-by-default; service-role Node).
- Evaluator at pending-approval: decide auto-approve (F0 dry-run/log only) vs notify.
- Hourly idempotent cron (`/api/cron/automation-reminders`) protected by `CRON_SECRET`.
- Notifications only when approval is needed: batched Resend email (feature-flagged) + Hoy feed items. No WhatsApp; skip web push in F0.
- Mi negocio settings UI + chat tool/AgentCard to enable Piloto automático with explicit confirmation (ES/EN).
- Resend module behind `OWNER_EMAIL_NOTIFICATIONS_ENABLED` (default off), allowlist, from-address env.
- Dry-run script against existing pending items.
- **HARD:** do not enable `WEEKLY_CYCLE_LIVE_*`; no paid generation; auto-approve never publishes to Instagram (F0 dry-run/log only).

## Capabilities

### New Capabilities

- `proactive-automation`: owner automation presets, evaluator, reminders cron, notifications, dry-run.

### Modified Capabilities

- `owner-home-dashboard`: Hoy surfaces automation notification feed items when present.
- `orchestrator-chat`: tool + AgentCard to propose enabling Piloto automático (confirm required).

## Impact

- `supabase/migrations/*`, `lib/automation/*`, `lib/notifications/email/*`, cron route, profile/negocio UI, Hoy loaders, AGENTS.md / ADR if warranted, tests.
- Out of scope: WEEKLY_CYCLE_LIVE, Instagram publish, WhatsApp, web push, WDK migration (F1+).
