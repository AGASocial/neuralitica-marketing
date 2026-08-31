# US-15.1 — Weekly cycle cron endpoint and orchestration (Phase A + B)

**Status:** BUILD Phase A ready (2026-08-31) — SPEC-REVIEW ✅ · SECURITY ✅ · CONTRACT Phase A frozen; branch `feature/US-15.1-weekly-cron`; next **BUILD Phase A** → VALIDATION → QA → CLOSE Phase A.

**As a** System, **I want** a scheduled weekly cycle per active Client with complete onboarding, **so that** 3 Reels reach the approval queue without Operator clicks on the happy path.

**Canonical acceptance criteria:** [`plan/USER_STORIES.md`](../../USER_STORIES.md) → US-15.1 (Phase A + Phase B — do **not** check off in PREP).

**This folder:** [`plan/stories/US-15.1/`](./) — `README.md` · `TASKS.md` (gates: `SECURITY.md` · `CONTRACT.md` · `VALIDATION.md` · `QA.md` — create when story enters BUILD).

**Branch:** `feature/US-15.1-weekly-cron`

**PLAN alignment:** Fase 7 — Ciclo semanal automatizado · **ADR-0001** · SPEC S3.M14 · TASKS.md § Fase 7 Scheduler.

**Depends on:** [US-4.1](../US-4.1/) ✅ strategy agent · [US-4.2](../US-4.2/) ✅ Operator approve (dual-path gate for system) · [US-5.1](../US-5.1/) ✅ `generateReelScriptsForClient` + `invokedBy: "system"` seam · [US-6.1](../US-6.1/) ✅ captions seam · [US-7.1](../US-7.1/)–[US-7.2](../US-7.2/) ✅ budget/policy · [US-8.x](../US-8.5/) ✅ providers · [US-9.1](../US-9.1/)–[US-9.3](../US-9.3/) ✅ assembly/branding/TTS · [US-10.1](../US-10.1/) ✅ QA + branding auto-chain · [US-11.1](../US-11.1/) ✅ approval queue ensure · [US-14.5](../US-14.5/) ✅ auth · [US-16.1](../US-16.1/)–[US-16.2](../US-16.2/) ✅ playbook/trend · [US-2.3](../US-2.3/) ✅ profile for agents · [US-3.1](../US-3.1/) ✅ visual mode.

**Unblocks:** SC-1 / SC-3 / SC-4 (3 Reels/week to approval without human production) · ADR-0001 product promise · reduces Operator manual orchestration across `/operator/strategy` + `/operator/scripts`.

---

## Why Phase A / Phase B split

PLAN F7 is too large for one BUILD gate. **Phase A** lands the cron auth surface, eligibility, idempotency ledger, and **dry-run** step planner — verifiable without spend. **Phase B** wires the full pipeline through existing orchestrators (`invokedBy: "system"`) and adds Operator manual trigger. Instagram publish remains **out** (ADR-0002).

| Phase | Sprint goal | Ships |
|-------|-------------|-------|
| **A** | Trust boundary + observability | Cron Route Handler · `CRON_SECRET` · `neuramark_weekly_cycle_runs` · dry-run planner · eligibility |
| **B** | Happy-path automation | Live runner · dual-path strategy gate · provider/assembly/QA chain · manual Operator trigger · partial failure log |

---

## Scope in

| Area | Phase A | Phase B |
|------|---------|---------|
| **Route Handler** | `app/api/cron/weekly-cycle/route.ts` — Vercel Cron + secret auth | Same entry; `dryRun=false` executes live steps |
| **Orchestration** | `lib/orchestration/run-weekly-cycle-for-client.ts` — plan-only branch | Full step wiring to existing server-only helpers |
| **DB** | `neuramark_weekly_cycle_runs` + unique `(client_id, week_start)` | Extend `step_log` with per-step results / errors |
| **FE** | — | Minimal Operator "Run cycle" + last-run status (EN/ES) |
| **Implementers** | **integrations-engineer** (orchestration) + **nextjs-backend** (route, migration, CONTRACT) | + **nextjs-frontend** (Operator UI) · **content-agents-engineer** / **media-pipeline-engineer** consult on step order only — **no new agents** |

## Scope out

| Topic | Why out |
|-------|---------|
| **Instagram publish** | ADR-0002 / Fase 6 — never auto-publish |
| **New LLM agents or adapters** | Reuse US-4.1 / US-5.1 / US-6.1 / US-8.x / US-9.x / US-10.1 |
| **Onboarding IG connect gate** | TASKS § onboarding — separate; Phase A uses profile + visual mode only |
| **Operator pause/skip week** | Follow-up story after Phase B |
| **Cliente-facing cycle UI** | System + Operator surfaces only |
| **Stories IG / multicanal / ads** | SPEC fuera de alcance |

## Existing `invokedBy: "system"` seams (wire in Phase B)

| Orchestrator | Story | Notes |
|--------------|-------|-------|
| `generateContentStrategyForClient` | US-4.1 | Tested — skips `requireOperator` |
| `generateReelScriptsForClient` | US-5.1 | System path; **strategy approval gate** must be frozen in CONTRACT (draft auto-approve vs bypass) |
| `generateReelCaptionsForClient` | US-6.1 | System path documented |
| Provider jobs (primary, TTS, B-roll) | US-8.x | Call existing create orchestrators with trusted `clientId` |
| `createAssemblyJobForReelScript` | US-9.1 | Same helper as Operator path |
| Branding enqueue | US-9.2 | Auto-chain after assembly |
| `runQaForAssembledReelForClient` | US-10.1 | Auto-chain after branding (`invokedBy: "system"`) |
| Approval ensure | US-11.1 | Ensure-on-list pattern — no publish |

## PO decisions frozen (2026-08-31)

1. **Story ID:** `US-15.1` (new Phase 7 module — not US-14.6 auth pollution).
2. **Phase A BUILD first:** Cron + dry-run + ledger; **no LLM/provider spend** in Phase A acceptance.
3. **Week key:** ISO Monday `weekStart` string (same as strategy/scripts/calendar modules).
4. **Eligibility V1:** `neuramark_clients.active = true` AND `getBusinessProfileForAgents` returns `exists: true` AND `visualModeSummary !== null`.
5. **Idempotency:** One run row per `(client_id, week_start)`; live re-entry returns `ALREADY_RUNNING` / `ALREADY_COMPLETED` without duplicate jobs.
6. **Dry-run flag:** `WEEKLY_CYCLE_DRY_RUN=true` env and/or `?dryRun=1` on cron route (CONTRACT freezes precedence).
7. **Dual-path strategy gate (Phase B):** System path may auto-set strategy `approved` after valid draft OR accept draft in script orchestrator — **CONTRACT must pick one** (US-4.2 SPEC conflict resolution).
8. **Implementers Phase A:** integrations-engineer + nextjs-backend; FE deferred to Phase B.

---

## Gates (orchestrator)

- [x] SPEC-REVIEW.md (spec-guardian)
- [x] SECURITY.md (security-architect)
- [x] CONTRACT.md Phase A (spec-guardian freeze — 2026-08-31)
- [ ] BUILD Phase A (integrations-engineer + nextjs-backend)
- [ ] VALIDATION.md Phase A
- [ ] QA.md Phase A
- [ ] CLOSE Phase A (product-owner)
- [ ] BUILD Phase B → VALIDATION → QA → CLOSE Phase B

**Next gate:** BUILD Phase A (`integrations-engineer` + `nextjs-backend`).
