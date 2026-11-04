# Design

## Context

See proposal. Existing weekly cycle ends at `ensureApprovalPackageForSystemCycle` → pending approval. No owner email path today. Cost policies exist separately (`neuramark_cost_policies`); automation settings are owner-facing product prefs, not provider tiers.

## Goals / Non-Goals

**Goals:** settings table + evaluator + hourly reminders + flagged Resend + Hoy items + UI/tool + dry-run script.

**Non-Goals:** WDK, WhatsApp, web push, enabling WEEKLY_CYCLE_LIVE, real Instagram publish, executing real approvals in dry-run/tests.

## Decisions

1. **Tables:** `neuramark_automation_settings` (1:1 client), `neuramark_automation_events` (idempotent audit/reminders/notifications with unique idempotency_key), `neuramark_hoy_notifications` (owner feed rows). RLS deny-by-default.

2. **Hook point:** after successful `insertPendingApproval` in system ensure path (and soft-ensure paths that create pending) call `evaluatePendingApprovalAutomation({ clientId, approvalId })` fire-and-forget/log-safe.

3. **F0 auto-approve:** always dry-run (`decision: would_auto_approve` event). Live auto-approve gated by future `AUTOMATION_AUTO_APPROVE_LIVE` — default false; do not set in this change.

4. **Email:** `lib/notifications/email/send-owner-email.ts` wrapping `resend`. Flags: `OWNER_EMAIL_NOTIFICATIONS_ENABLED`, `RESEND_API_KEY`, `NOTIFICATIONS_FROM_EMAIL`, `NOTIFICATIONS_TEST_ALLOWLIST`.

5. **Cron:** `0 * * * *` → `/api/cron/automation-reminders` using `verifyCronSecret`.

6. **Chat:** `proposeEnableAutoPilot` tool → AgentCard `enable_auto_pilot` → Server Action upserts settings on Approve only.

## Risks

- [Email spam] → flags + allowlist + batching
- [Accidental approve] → dry-run only in F0; tests never call decideApproval for test account
- [Migration unsafe] → additive only; stop if not

## Migration Plan

Write migration file; apply to prod via `supabase db query --linked` (or documented equivalent) only if additive/safe. Ship app behind email flag off.
