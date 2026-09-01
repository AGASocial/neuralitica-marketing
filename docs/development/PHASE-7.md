# Integration Report — PLAN Fase 7 (Ciclo semanal automatizado)

**Date:** 2026-09-01 (re-run post `313ad23`)  
**Branch reviewed:** `main` (`313ad23` — US-15.1 task_c263b2c8 wired)  
**Checker:** integration-checker  
**Flow scope:** S4.2 Ciclo semanal auto → cola Aprobación · S4.5 Excepciones Operator · SC-1..SC-4 (integration level) · ADR-0001

> **Numbering note:** [`docs/development/integration-reports/PHASE-7.md`](./integration-reports/PHASE-7.md) is the **Sprint 7** rollup (Provider P1 + media + Fase 5 ops). **This report** is **PLAN.md Fase 7** — weekly cron orchestration (US-15.1).

---

## Verdict: CONNECTED

US-15.1 delivers a coherent cron → live orchestrator → outbox → trusted-step → **async resume** chain with strong unit coverage (**148/148** curated tests pass this gate). Cron live wiring, idempotency, kill-switch pause/resume (H1/H2), partial-failure reconciliation, the no-publish boundary, and the **cross-module handoff from async job completion back into the weekly cycle** are **connected**. Commit `313ad23` wires `maybeResumeWeeklyCycleFromJob` (→ `resumeWeeklyCycleFromJob`) from all three terminal status writers: video poll, assembly, and branding. Non-cycle jobs no-op via `JOB_LINK_NOT_FOUND`; existing revision auto-chains are preserved. **PLAN Fase 7 may close at code-integration level.** Staging SC-1 smoke for one allowlisted internal client remains recommended before MVP sign-off.

| Metric | Value |
|--------|-------|
| **Verdict** | CONNECTED |
| **Blocking gaps** | 0 |
| **Non-blocking / expected gaps** | 5 |
| **Phase may close** | Yes (code integration); staging SC-1 smoke recommended |
| **Recommended next** | Staging SC-1 smoke → update `SPRINT-STATE.md` → select Fase 8 P2 or IG gate story |

---

## Deliverable claimed vs observed

| Claimed deliverable (PLAN Fase 7 / TASKS § F7) | Observed |
|------------------------------------------------|----------|
| Vercel Cron + `CRON_SECRET` Route Handler | **Yes.** `vercel.json` Monday 06:00 UTC → `app/api/cron/weekly-cycle/route.ts`; Bearer auth first; `runWeeklyCycleCronBatch` |
| Encolar ciclo por Cliente `active` con onboarding completo | **Partial.** `listEligibleClientsForWeeklyCycle` gates profile + visual mode; **IG connect checklist not enforced** (explicit US-15.1 defer) |
| Orquestar Estrategia → guion → caption → cost → providers → assembly → QA → Aprobación | **Yes (code).** Sync global chain + outbox dispatch + async resume wired; staging SC-1 not yet run |
| Idempotencia por Cliente + semana | **Yes.** Unique `(client_id, week_start)` · CAS acquire · dry-run re-plan guard · step-run idempotency keys |
| Ciclo parcial: OK → Aprobación; fallidos → Operator | **Yes.** `reconcileWeeklyCycleRun` + Operator DTO for explicit failures; async resume advances or fails steps instead of stalling |
| Reintentos auto limitados; luego cola Operator | **Yes.** Outbox backoff (30s/120s, max 3) · `resumeWeeklyCycleRun` retries transient failed steps |
| UI Operator: disparo manual, inspección | **Yes.** `/operator/cycle` · trigger / preview / resume actions · EN/ES |
| UI Operator: pausar/skip semana | **Deferred** (US-15.1 out of scope; kill-switch env + pause CAS exist for mid-run safety) |
| SC-1..SC-4 verificables con Cliente interno | **SC-1 code path connected; staging smoke pending** · SC-2 met (code) · SC-3/SC-4 deferred to ops |

---

## Flow traces

### 1. S4.2 — Cron happy path (System, no Operator clicks)

| Step | Expected | Found | Owner |
|------|----------|-------|-------|
| 1. Cron tick | Vercel Cron → authenticated handler | `vercel.json` → `GET/POST /api/cron/weekly-cycle` → `verifyCronSecret` | integrations-engineer |
| 2. Week authority | ISO Monday server-side | `resolveWeekStartForCycle` / `normalizeToIsoMonday` | nextjs-backend |
| 3. Live vs dry-run | Kill switch off → Phase A plan only; on + allowlist → live batch | `runWeeklyCycleCronBatch` (`run-weekly-cycle-batch.ts:63-94`) | integrations-engineer |
| 4. Eligibility | Active + profile + visual mode | `listEligibleClientsForWeeklyCycle` | nextjs-backend |
| 5. Acquire run | Idempotent `(client_id, week_start)` ledger | `acquireWeeklyCycleRun` → `neuramark_weekly_cycle_runs` | integrations-engineer |
| 6. Global chain | Strategy → auto-approve CAS → scripts → captions | `runWeeklyCycleLive` L93-155 · `weekly-cycle-trusted-steps.ts` | integrations-engineer / content-agents-engineer |
| 7. Seed slots | 3 slots → first async/sync step each | `advanceWeeklyCycleSlot({ fromStep: null })` | integrations-engineer |
| 8. Async dispatch | primary_video / broll / assembly / branding enqueued | `dispatchWeeklyCycleOutbox` → trusted create* seams | integrations-engineer / media-pipeline-engineer |
| 9. **Job completion → resume** | Poll/webhook marks step terminal + advances successor | **`maybeResumeWeeklyCycleFromJob` called from all three status writers on terminal `completed`/`failed`** | integrations-engineer / media-pipeline-engineer |
| 10. Sync slot steps | tts → qa → approval inline | `advance-weekly-cycle-slot.ts` sync branch (reachable only after step 9) | integrations-engineer |
| 11. Approval queue | `pending_client` only; never publish | `ensureApprovalPackageForSystemCycle` | nextjs-backend |
| 12. Aggregate terminal | `completed` / `partial_failed` / `failed` | `reconcileWeeklyCycleRun` | integrations-engineer |

### 2. S4.5 — Operator exceptions

| Step | Expected | Found | Owner |
|------|----------|-------|-------|
| Manual trigger | Same orchestrator as cron, live allowlist | `triggerWeeklyCycleForClient` → `runWeeklyCycleLive` | integrations-engineer |
| Inspect run | Status, 3-slot table, error codes | `loadOperatorWeeklyCycleRuns` → `OperatorCycleView` | nextjs-frontend |
| Resume failed / paused | Retry transient failures; advance stalled mid-chain slots (H2) | `resumeWeeklyCycleRun` + `pauseWeeklyCycleRunCas` | integrations-engineer |
| Skip/pause week per client | Operator control | **Not implemented** (env kill-switch only) | product-owner (follow-up story) |

### 3. Handoffs table (cross-module boundaries)

| From → To | Contract / entrypoint | Schema alignment | Status |
|-----------|----------------------|------------------|--------|
| Cron → orchestrator | `runWeeklyCycleCronBatch({ weekStart })` | `WeeklyCycleCronResponse` in `weekly-cycle-live.ts` | OK |
| Strategy agent → cycle | `generateContentStrategyForClient({ invokedBy: "system" })` | System CAS auto-approve | OK |
| Scripts/captions agents | `generateReelScriptsForClient` / `generateReelCaptionsForClient` batch | Existing F3 contracts | OK |
| Outbox → video jobs | `dispatchWeeklyCyclePrimaryVideoStep` / `dispatchWeeklyCycleBrollStep` | `neuramark_video_jobs` + spend ledger | OK (dispatch) |
| **Video poll complete → cycle** | **`maybeResumeWeeklyCycleFromJob({ jobKind: "video", jobId })`** | **`apply-video-job-status-update.ts` L159-163** (after revision hook on completed) | **OK** |
| Outbox → assembly/branding | `createAssemblyJobForClientTrusted` / `createBrandingJobForAssembly` | `neuramark_assembled_reels` | OK (dispatch) |
| **Assembly complete → cycle** | **`maybeResumeWeeklyCycleFromJob({ jobKind: "assembly", jobId })`** | **`apply-assembly-job-update.ts` L151-155** (after `onAssemblyJobCompleted` on completed) | **OK** |
| **Branding complete → cycle** | **`maybeResumeWeeklyCycleFromJob({ jobKind: "branding", jobId })`** | **`apply-branding-job-update.ts` L180-184** (after `onBrandingCompleted` on completed) | **OK** |
| QA → approval (system path) | `runWeeklyCycleQaStep` → `ensureApprovalPackageForSystemCycle` | QA pass required; no Operator override | OK (when reached) |
| Approval → publish (F6) | Must not auto-publish | Structural scan: zero IG imports in orchestration | OK (SC-2) |
| Fase 5 metrics → strategy | Optional prompt injection on next cycle | `aggregateReelMetricsByTema` in generate path | OK (inherited) |

---

## SPEC §4 error paths — Fase 7 scope

| Error path | Expected behavior | Found |
|------------|-------------------|-------|
| Cron auth failure | 401; no batch | Route + `verify-cron-secret` tests |
| Ineligible client | Skipped with reason; no ledger side effects for skipped | `list-eligible-clients-for-weekly-cycle` |
| Idempotent re-run same week | No duplicate run; dry-run refresh only when `dry_run` | Acquire + persist CAS tests |
| Step failure mid-slot | Slot marked failed; other slots continue | `advance-weekly-cycle-slot` + reconcile |
| Partial run | `partial_failed`; Operator inspect + resume | `reconcile-weekly-cycle-run` + FE table |
| Budget/consent block | Step failure with allowlisted `errorCode` | `mapDownstreamErrorCode` + trusted-step gates |
| QA blocking legal | Never reaches approval | `ensureApprovalPackageForSystemCycle` requires `passed` |
| Kill switch mid-run | Pause CAS; preserve completed paid work (H1); resume advances chain (H2) | `resume-weekly-cycle-from-job` + `resume-weekly-cycle-run` tests |
| **Async job completes but cycle not resumed** | System advances to next step automatically | **Handled via `maybeResumeWeeklyCycleFromJob` in status writers; no-ops for non-cycle jobs** |
| Publish without approval | Impossible on system path | Structural no-publish scan PASS |

S4.1 IG onboarding gate and S4.4 IG publish remain **adjacent** — IG not required for cycle eligibility today (documented defer).

---

## Success criteria (MVP checkpoint)

| SC | Integration assessment | Status |
|----|------------------------|--------|
| **SC-1** — 3 Reels/week in approval queue without human recording | Cron + sync chain + dispatch + async resume wired at code level; **staging E2E not yet run** | **Code met; ops smoke pending** |
| **SC-2** — No publish without Cliente approval | Terminal step inserts `pending_client` only; no IG in orchestration | **Met (code)** |
| **SC-3** — First batch ≤ 7 days post-interview | Depends on full E2E + cron schedule; not provable without resume wiring + staging | **Deferred** |
| **SC-4** — Cliente review ≤ 30 min | Product/ops metric; blocked on SC-1 delivery | **Deferred** |

---

## VALIDATION / QA sample (US-15.1)

| Phase | VALIDATION | QA | Integration-relevant notes |
|-------|------------|-----|----------------------------|
| Phase A | PASS WITH NOTES (5/5 AC; 30/30) | APPROVE WITH CONDITIONS | Cron auth, eligibility, dry-run, idempotency |
| Phase B (initial) | FAIL → PASS after cron wiring + 191 tests | — | Blocker 1 (cron never live) closed in `36dc5da` |
| Phase B POST-QA H1 | PASS WITH NOTES | High → closed `60de5f6` | Kill-switch pause CAS |
| Phase B POST-H2 | PASS | High → closed `72c22a9` | Resume advances stalled mid-chain slots |
| Phase B final | PASS (`7ec40a0`) | APPROVE `b54e198` | 0 Critical/High/Medium open at story CLOSE |

**Explicit defer at CLOSE:** `task_c263b2c8` — job-completion hooks → `resumeWeeklyCycleFromJob`. **Closed in `313ad23`.**

---

## Automated check summary (this gate)

Curated PLAN F7 / US-15.1 orchestration suite (26 files, includes wiring + `maybe-resume`):

```bash
npx tsx --test \
  app/api/cron/weekly-cycle/route.test.ts \
  lib/contracts/weekly-cycle.test.ts \
  lib/content-strategy/approve-strategy-for-system-cycle-cas.test.ts \
  lib/orchestration/acquire-weekly-cycle-run.test.ts \
  lib/orchestration/actions/trigger-weekly-cycle-for-client.test.ts \
  lib/orchestration/dispatch-weekly-cycle-outbox.test.ts \
  lib/orchestration/ensure-approval-package-for-system-cycle.test.ts \
  lib/orchestration/list-eligible-clients-for-weekly-cycle.test.ts \
  lib/orchestration/persist-weekly-cycle-run-plan.test.ts \
  lib/orchestration/reconcile-weekly-cycle-run.test.ts \
  lib/orchestration/resume-weekly-cycle-from-job.test.ts \
  lib/orchestration/resume-weekly-cycle-run.test.ts \
  lib/orchestration/run-weekly-cycle-batch.test.ts \
  lib/orchestration/run-weekly-cycle-for-client.test.ts \
  lib/orchestration/run-weekly-cycle-live.test.ts \
  lib/orchestration/start-weekly-cycle-live-cas.test.ts \
  lib/orchestration/verify-cron-secret.test.ts \
  lib/orchestration/weekly-cycle-idempotency-key.test.ts \
  lib/orchestration/weekly-cycle-live-env.test.ts \
  lib/orchestration/weekly-cycle-live.structural.test.ts \
  lib/orchestration/weekly-cycle-outbox.test.ts \
  lib/orchestration/weekly-cycle-step-runs.test.ts \
  lib/orchestration/weekly-cycle.test.ts \
  lib/orchestration/maybe-resume-weekly-cycle-from-job.test.ts \
  lib/assembly/apply-assembly-job-update.test.ts \
  lib/branding/apply-branding-job-update.test.ts
```

**Result:** **148 pass / 0 fail** (~1.6s aggregated).

**Wiring tests (structural + behavior):**

| File | Test | Result |
|------|------|--------|
| `apply-video-job-status-update.test.ts` | `maybeResumeWeeklyCycleFromJob` on terminal completed/failed | PASS |
| `apply-assembly-job-update.test.ts` | same | PASS |
| `apply-branding-job-update.test.ts` | same | PASS |
| `maybe-resume-weekly-cycle-from-job.test.ts` | swallows `JOB_LINK_NOT_FOUND`; logs other failures | PASS |

**Production call-site audit:** `maybeResumeWeeklyCycleFromJob` imported in all three status writers on terminal `completed`/`failed`. Wrapper delegates to `resumeWeeklyCycleFromJob` and no-ops non-cycle jobs.

---

## Gaps (blocks next phase)

**None.** Previous blocker `task_c263b2c8` closed in `313ad23`.

## Non-blocking gaps / expected partial MVP

| # | Gap | Severity | Owner | Notes |
|---|-----|----------|-------|-------|
| 2 | IG connect not in cron eligibility | Low | nextjs-backend | TASKS § F7 onboarding explicitly deferred in US-15.1 |
| 3 | Operator pause/skip week per client | Low | product-owner | Follow-up story; env kill-switch + mid-run pause CAS exist |
| 4 | No live staging E2E (cron → 3 approval packages) | Medium | QA | Recommend before MVP SC-1 sign-off |
| 5 | SC-3/SC-4 not operationally measured | Low | product-owner / QA | Need internal Cliente smoke post-fix |
| 6 | Revision pipeline faceless B-roll gap (inherited) | Medium | media-pipeline-engineer | PHASE-8 #1 — orthogonal to cron but affects revision exception path |

---

## Recommended fixes (by agent)

| Agent | Action |
|-------|--------|
| **QA** | Staging smoke: enable `WEEKLY_CYCLE_LIVE_ENABLED` + allowlist internal client → cron or manual trigger → wait for poll/worker → confirm 3× `pending_client` approval rows (SC-1). |
| **product-owner** | Update `phase_status` to connected; select Fase 8 P2 or onboarding IG gate story. |
| **master-orchestrator** | Stop Fase 7 loop; dispatch optional follow-ups (IG gate, Operator pause/skip, faceless revision B-roll). |

---

## Recommended next orchestrator step

1. **CLOSE Fase 7 integration** — `task_c263b2c8` resolved; code handoffs CONNECTED.
2. **Optional QA:** Staging SC-1 smoke for one allowlisted internal client before MVP sign-off.
3. **Optional parallel backlog:** IG onboarding eligibility gate (TASKS § F7) · Operator pause/skip week · inherited faceless revision B-roll (PHASE-8).
4. **Fase 8 P2** may proceed; MVP SC sign-off waits on staging smoke.

---

## Sign-off

| Question | Answer |
|----------|--------|
| Can PLAN Fase 7 close as CONNECTED? | **Yes** — async resume handoff wired (`313ad23`) |
| Blocking gap count | **0** |
| Cron → live orchestrator → outbox dispatch connected? | **Yes** |
| Async job complete → cycle advance connected? | **Yes** |
| SC-2 no-publish boundary intact? | **Yes** |
| SC-1 verifiable without staging smoke? | **Code yes; ops smoke recommended** |
| Blocks Fase 8 planning? | **No** |
| Can orchestrator loop stop? | **Yes** — Fase 7 integration gate passed |

**PLAN Fase 7: CLOSED — CONNECTED**
