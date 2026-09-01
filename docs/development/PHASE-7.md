# Integration Report — PLAN Fase 7 (Ciclo semanal automatizado)

**Date:** 2026-09-01  
**Branch reviewed:** `main` (US-15.1 Phase A+B CLOSED, Sprint 9)  
**Checker:** integration-checker  
**Flow scope:** S4.2 Ciclo semanal auto → cola Aprobación · S4.5 Excepciones Operator · SC-1..SC-4 (integration level) · ADR-0001

> **Numbering note:** [`docs/development/integration-reports/PHASE-7.md`](./integration-reports/PHASE-7.md) is the **Sprint 7** rollup (Provider P1 + media + Fase 5 ops). **This report** is **PLAN.md Fase 7** — weekly cron orchestration (US-15.1).

---

## Verdict: GAPS

US-15.1 delivers a coherent cron → live orchestrator → outbox → trusted-step chain with strong unit coverage (143/143 curated tests pass this gate). Cron live wiring, idempotency, kill-switch pause/resume (H1/H2), partial-failure reconciliation, and the no-publish boundary are **connected within `lib/orchestration/**`**. However, the **cross-module handoff from async job completion back into the weekly cycle is missing**: `resumeWeeklyCycleFromJob` is built and tested but has **zero production call sites** outside `lib/orchestration/`. Without wiring in video poll / assembly / branding completion hooks, async steps stall in `pending_provider`/`pending_worker` and **SC-1 / S4.2 happy path cannot complete to the approval queue without manual intervention**. Phase 7 **cannot close as CONNECTED** until `task_c263b2c8` is resolved.

| Metric | Value |
|--------|-------|
| **Verdict** | GAPS |
| **Blocking gaps** | 1 |
| **Non-blocking / expected gaps** | 5 |
| **Phase may close** | No (until webhook/resume wiring) |
| **Recommended next** | Wire `resumeWeeklyCycleFromJob` → re-run integration → staging SC-1 smoke |

---

## Deliverable claimed vs observed

| Claimed deliverable (PLAN Fase 7 / TASKS § F7) | Observed |
|------------------------------------------------|----------|
| Vercel Cron + `CRON_SECRET` Route Handler | **Yes.** `vercel.json` Monday 06:00 UTC → `app/api/cron/weekly-cycle/route.ts`; Bearer auth first; `runWeeklyCycleCronBatch` |
| Encolar ciclo por Cliente `active` con onboarding completo | **Partial.** `listEligibleClientsForWeeklyCycle` gates profile + visual mode; **IG connect checklist not enforced** (explicit US-15.1 defer) |
| Orquestar Estrategia → guion → caption → cost → providers → assembly → QA → Aprobación | **Partial.** Sync global chain + outbox dispatch wired; **async completion → resume not wired** |
| Idempotencia por Cliente + semana | **Yes.** Unique `(client_id, week_start)` · CAS acquire · dry-run re-plan guard · step-run idempotency keys |
| Ciclo parcial: OK → Aprobación; fallidos → Operator | **Partial.** `reconcileWeeklyCycleRun` + Operator DTO for explicit failures; **stalled `pending_*` from missing resume invisible to Operator** |
| Reintentos auto limitados; luego cola Operator | **Yes.** Outbox backoff (30s/120s, max 3) · `resumeWeeklyCycleRun` retries transient failed steps |
| UI Operator: disparo manual, inspección | **Yes.** `/operator/cycle` · trigger / preview / resume actions · EN/ES |
| UI Operator: pausar/skip semana | **Deferred** (US-15.1 out of scope; kill-switch env + pause CAS exist for mid-run safety) |
| SC-1..SC-4 verificables con Cliente interno | **Not met at integration level** — blocked by async resume gap (SC-1); SC-3/SC-4 need live smoke post-fix |

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
| 9. **Job completion → resume** | Poll/webhook marks step terminal + advances successor | **`resumeWeeklyCycleFromJob` not called from any completion hook** | **media-pipeline-engineer / integrations-engineer** |
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
| **Video poll complete → cycle** | **`resumeWeeklyCycleFromJob({ jobKind: "video", jobId })`** | **`apply-video-job-status-update.ts` only calls `onVideoJobCompletedRevision`** | **GAP** |
| Outbox → assembly/branding | `createAssemblyJobForClientTrusted` / `createBrandingJobForAssembly` | `neuramark_assembled_reels` | OK (dispatch) |
| **Assembly complete → cycle** | **`resumeWeeklyCycleFromJob({ jobKind: "assembly", jobId })`** | **`on-assembly-job-completed.ts` → branding auto-chain only** | **GAP** |
| **Branding complete → cycle** | **`resumeWeeklyCycleFromJob({ jobKind: "branding", jobId })`** | **`on-branding-completed.ts` → QA auto-chain only** | **GAP** |
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
| **Async job completes but cycle not resumed** | System advances to next step automatically | **Not handled — run stays `running` with stale `pending_*` rows** |
| Publish without approval | Impossible on system path | Structural no-publish scan PASS |

S4.1 IG onboarding gate and S4.4 IG publish remain **adjacent** — IG not required for cycle eligibility today (documented defer).

---

## Success criteria (MVP checkpoint)

| SC | Integration assessment | Status |
|----|------------------------|--------|
| **SC-1** — 3 Reels/week in approval queue without human recording | Cron + sync chain + dispatch work; **async completion handoff missing** → pipeline cannot reliably reach approval | **Not met** |
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

**Explicit defer at CLOSE:** `task_c263b2c8` — job-completion hooks → `resumeWeeklyCycleFromJob` (PO-accepted; **must close at Fase 7 integration** per `plan/stories/US-15.1/TASKS.md:94`).

---

## Automated check summary (this gate)

Curated PLAN F7 / US-15.1 orchestration suite (23 files, run in batches on Windows):

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
  lib/orchestration/weekly-cycle.test.ts
```

**Result:** **143 pass / 0 fail** (~4.2s per batch; full suite aggregated).

**Production call-site audit:** `grep resumeWeeklyCycleFromJob` → definition + tests + comments only; **no imports in** `apply-video-job-status-update.ts`, `on-assembly-job-completed.ts`, `on-branding-completed.ts`, or `apply-branding-job-update.ts`.

---

## Gaps (blocks next phase)

| # | Gap | Severity | Owner | Why it blocks |
|---|-----|----------|-------|---------------|
| **1** | **Job completion hooks do not call `resumeWeeklyCycleFromJob`** | **High / blocking** | **media-pipeline-engineer** (+ integrations-engineer for jobKind mapping) | After first async step dispatches, provider/worker completion never marks step_run terminal or calls `advanceWeeklyCycleSlot`. Run stalls; SC-1 and ADR-0001 auto-avance fail. Documented at US-15.1 CLOSE as `task_c263b2c8`; TASKS requires wiring before CONNECTED. |

**Required wiring (minimal):**

| Completion hook | Suggested call |
|-----------------|----------------|
| `lib/video-jobs/apply-video-job-status-update.ts` (terminal `completed`/`failed`) | `resumeWeeklyCycleFromJob({ jobKind: "video", jobId })` |
| `lib/assembly/apply-assembly-job-update.ts` or `on-assembly-job-completed.ts` | `resumeWeeklyCycleFromJob({ jobKind: "assembly", jobId: assemblyJobId })` |
| `lib/branding/apply-branding-job-update.ts` or `on-branding-completed.ts` | `resumeWeeklyCycleFromJob({ jobKind: "branding", jobId: assembledReelId })` |

Preserve existing revision auto-chains (`onVideoJobCompletedRevision`, branding→QA) — weekly-cycle resume is additive and no-ops when `JOB_LINK_NOT_FOUND`.

---

## Non-blocking gaps / expected partial MVP

| # | Gap | Severity | Owner | Notes |
|---|-----|----------|-------|-------|
| 2 | IG connect not in cron eligibility | Low | nextjs-backend | TASKS § F7 onboarding explicitly deferred in US-15.1 |
| 3 | Operator pause/skip week per client | Low | product-owner | Follow-up story; env kill-switch + mid-run pause CAS exist |
| 4 | No live staging E2E (cron → 3 approval packages) | Medium | QA | Recommend after gap #1 fix |
| 5 | SC-3/SC-4 not operationally measured | Low | product-owner / QA | Need internal Cliente smoke post-fix |
| 6 | Revision pipeline faceless B-roll gap (inherited) | Medium | media-pipeline-engineer | PHASE-8 #1 — orthogonal to cron but affects revision exception path |

---

## Recommended fixes (by agent)

| Agent | Action |
|-------|--------|
| **media-pipeline-engineer** | Wire `resumeWeeklyCycleFromJob` from video poll completion, assembly completion, and branding completion hooks (one-line calls; ignore `JOB_LINK_NOT_FOUND` for non-cycle jobs). |
| **integrations-engineer** | Verify jobKind/jobId mapping matches `weekly-cycle-step-runs` linkage; add integration test asserting poll completion advances a mocked live run. |
| **QA** | Staging smoke: enable `WEEKLY_CYCLE_LIVE_ENABLED` + allowlist internal client → cron or manual trigger → wait for poll/worker → confirm 3× `pending_client` approval rows. |
| **product-owner** | Keep `phase_status: needs_phase_integration` until gap #1 closes; then SELECT Fase 8 P2 or onboarding IG gate story. |
| **master-orchestrator** | Dispatch wiring story (or fast-follow on `main`) → re-run integration-checker → update `SPRINT-STATE.md` phase_status. |

---

## Recommended next orchestrator step

1. **BUILD (blocking):** Wire `task_c263b2c8` — media-pipeline-engineer owns completion hooks; integrations-engineer reviews jobKind linkage and adds cross-module test if needed.
2. **Re-run Fase 7 phase integration** — expect **CONNECTED** if staging smoke confirms SC-1 for one allowlisted internal client.
3. **Optional parallel backlog:** IG onboarding eligibility gate (TASKS § F7) · Operator pause/skip week · inherited faceless revision B-roll (PHASE-8).
4. **Do not start Fase 8 P2** as MVP-complete until step 2 passes.

---

## Sign-off

| Question | Answer |
|----------|--------|
| Can PLAN Fase 7 close as CONNECTED? | **No** — async resume handoff missing |
| Blocking gap count | **1** |
| Cron → live orchestrator → outbox dispatch connected? | **Yes** |
| Async job complete → cycle advance connected? | **No** |
| SC-2 no-publish boundary intact? | **Yes** |
| SC-1 verifiable without fix? | **No** |
| Blocks Fase 8 planning? | **No** (can plan); **blocks MVP SC sign-off** |

**PLAN Fase 7: OPEN — GAPS (1 blocker)**
