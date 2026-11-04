# Tasks

## 1. Schema + contracts

- [x] 1.1 Add additive migration for automation settings, events, hoy notifications with RLS; verify SQL is CREATE IF NOT EXISTS / additive only
- [x] 1.2 Add zod contracts + load/upsert helpers with unit tests for defaults (`review_all`)

## 2. Evaluator, notifications, cron

- [x] 2.1 Implement evaluator (auto-pilot dry-run vs notify) and hook after pending approval insert; unit tests cover both paths
- [x] 2.2 Add Resend email module behind flags + allowlist; unit tests prove no send when flag off
- [x] 2.3 Add hourly cron route + reminder runner with idempotency keys; verify CRON_SECRET gating tests
- [x] 2.4 Dry-run script against existing pending approvals; document sample output

## 3. UI + chat + Hoy

- [x] 3.1 Mi negocio automation settings UI (ES/EN) with presets and caps
- [x] 3.2 Chat tool + AgentCard + confirm action for Piloto automático
- [x] 3.3 Surface Hoy notification items; tests for mapping/copy

## 4. Docs + guards

- [x] 4.1 Update AGENTS.md (+ ADR if warranted); assert no WEEKLY_CYCLE_LIVE / Instagram publish from F0 modules
- [x] 4.2 Lint, typecheck, unit tests; apply migration to prod safely and report method

## Workflow follow-up

- `openspec validate --strict`; archive after merge
