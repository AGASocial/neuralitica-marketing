# QA Final Re-review — US-15.1 Phase B (post-H2 fix, commit `72c22a9`)

**Story:** US-15.1 — Weekly cycle cron endpoint and orchestration (live pipeline)
**Scope:** Third and final QA pass on Phase B. Confirms H1 (`60de5f6`) and H2 (`72c22a9`) are genuinely closed from a bugs/security/robustness standpoint (not just mechanical correctness), probes edge cases the mechanical trace could miss (exception propagation inside the new resume continuation loop; kill-switch flip mid-advance), and re-spot-checks the original clean-area findings (budget/consent gates, Operator IDOR, no-publish boundary, FE/DTO leakage) for regression across both fix cycles.
**Branch:** `feature/US-15.1-weekly-cron`
**Fix commit reviewed:** `72c22a9` (on top of `60de5f6`)
**Validation reviewed:** `7ec40a0` (POST-H2-FIX VALIDATE — PASS)
**Date:** 2026-08-31
**Reviewer:** qa-engineer

### Final verdict: APPROVE

**Current severity counts:** Critical **0** · High **0** · Medium **0** · Low **1 (new, non-blocking hardening recommendation)**
**Prior findings:** H1 **CLOSED** · H2 **CLOSED** · M1 **CLOSED** · M2 **CLOSED**

**This is CLOSE-ready.** No new blocking finding. Recommend product-owner proceed to CLOSE and merge to `main`.

---

## H1 and H2 — genuinely closed, independently re-verified

I read `git show 72c22a9` in full and re-derived the fix's correctness myself rather than accepting the validator's trace at face value, then specifically probed two edge cases the validator's happy-path trace does not cover: exception propagation inside the new continuation loop, and a kill-switch flip mid-advance.

### H1 (`running → paused`, closed at `60de5f6`): still closed, no regression from `72c22a9`

`72c22a9` touches only `lib/orchestration/resume-weekly-cycle-run.ts` (+ its test). `resume-weekly-cycle-from-job.ts` and `pause-weekly-cycle-run-cas.ts` — the files that actually implement the `running → paused` CAS and the real-outcome-preservation logic — are untouched by this commit (confirmed: `git diff --stat 60de5f6..72c22a9` shows those two files absent from the diff). H1's two original failure modes (permanent stranding of an unresumable `failed` run; double-spend re-dispatch of an already-completed step) remain closed by construction.

### H2 (a slot paused mid-chain never advances on resume, closed at `72c22a9`): confirmed closed

Traced `resume-weekly-cycle-run.ts:82-105,191-208` directly:

- `stalledCompletedSlots` is built from each slot's *latest* `stepRuns` row, filtered to `status === "completed" && step !== "approval"`. `retryableFailed` filters the same array to `status === "failed"` rows. A single row cannot be both, and — the stronger argument the prior VALIDATE also made — a slot cannot simultaneously carry an *actionable* failed row for step A and a completed row for a later step B, because B could only exist once A succeeded. I independently re-derived this by reading `advanceWeeklyCycleSlot`'s recursive `runSyncStep`/dispatch structure (`advance-weekly-cycle-slot.ts:32-166`): the chain only ever moves forward one step at a time, and only after the current step's row is marked `completed`. The two loops cannot double-advance the same slot.
- `fromStep: stalledSlot.step` is fed straight into `nextStepAfter`, which scans `SLOT_STEP_ORDER` starting at `indexOf(step) + 1` (`advance-weekly-cycle-slot.ts:53`) — strictly the next applicable step, honoring the faceless/no-broll skip rules. This reuses the exact calling convention already exercised by `resume-weekly-cycle-from-job.ts`'s normal-completion continuation and by the pre-existing `retryableFailed` loop's own continuation call three lines below the new one — no new contract was invented.
- Ran `lib/orchestration/resume-weekly-cycle-run.test.ts` directly: **14/14 pass**, including the three H2 tests, and read them — they assert the actual `advanceWeeklyCycleSlot` call shape (`{ runId, clientId, slotIndex, script, fromStep }`), not just "no double-spend." This is a genuine improvement over the test QA flagged in the prior round as checking the wrong thing.
- Ran the full curated 22+1-file Phase B suite directly: **203/203 pass**, 37 suites — matches the commit message and the validator's independent run.

### Edge case 1 — what if `advanceWeeklyCycleSlot` itself throws inside the new loop?

This was the sharpest question to probe, since neither prior QA pass nor the validator's trace considered it. Traced the failure surface directly:

`advanceWeeklyCycleSlot` can throw synchronously via `resolveLinkageForStep` (`advance-weekly-cycle-slot.ts:70-88`) — `WEEKLY_CYCLE_ASSEMBLY_LINKAGE_MISSING` or `WEEKLY_CYCLE_BRANDING_LINKAGE_MISSING` if the predecessor step's row lacks a `jobId`. Neither of the two `resumeWeeklyCycleRun` loops (the pre-existing `retryableFailed` loop or the new `stalledCompletedSlots` loop) wraps its `advanceWeeklyCycleSlot` call in `try/catch`, and neither does the Server Action wrapper (`lib/orchestration/actions/resume-weekly-cycle-run.ts`) around the whole `resumeWeeklyCycleRunCore` call. If this threw:

- The `paused → running` CAS write has already committed to the DB before either loop runs, so the run would be left at `status: "running"` — not `paused`, not `partial_failed`.
- The throw aborts the function before `reconcileWeeklyCycleRun` executes, so nothing resolves the run back to an actionable, visible state.
- A subsequent resume attempt would be refused (`RUN_NOT_RESUMABLE` requires `paused`/`partial_failed`), and per the validator's own note (confirmed by my own read of `run-weekly-cycle-live.ts:66-69`), no cron tick sweeps an already-`running` run. The run would be stuck indefinitely, and — worse than the original H2 bug — invisible: `running` reads as normal in-progress in the Operator UI, unlike `partial_failed`/`failed`, which at least prompted a second look.

**However, I traced whether this is actually reachable and found it is not, under the current write-path invariants**, which is why this does not rise to a blocking finding: `resolveLinkageForStep` throws only when a predecessor async step's row is `completed` with `job_id` null. I read `markStepRunPending` (`weekly-cycle-step-runs.ts:194-215`, sets `job_id` when the provider/worker job is created, before the row can ever reach `pending_provider`/`pending_worker`) and `markStepRunTerminal` (`:217-235`, its `UPDATE` payload is `status`/`error_code`/`finished_at` only — it never touches `job_id`). So by the time any async step (`primary_video`/`broll`/`assembly`/`branding`) reaches `status: "completed"` through any code path that exists in this repo today, `job_id` was already set and is never cleared. This includes the exact scenario H2 targets — `resumeWeeklyCycleFromJob`'s `PAUSED_LIVE_DISABLED` branch calls `markStepRunTerminal` on a row whose `job_id` was set at dispatch time, long before the pause. The throw path is real code (a defensive check for a state the write paths don't currently produce), not a reachable production bug — it would only fire if a future code change or manual DB edit introduced a completed async row with no linkage.

**This is not a new defect introduced by `72c22a9`.** The identical unguarded-exception pattern already existed in the pre-existing `retryableFailed` loop's own `advanceWeeklyCycleSlot` call (`resume-weekly-cycle-run.ts:176-182`, untouched by this fix) and in `resume-weekly-cycle-from-job.ts`'s normal-completion branch — this fix extends an already-accepted architectural pattern to a second call site, it does not introduce the pattern. I am recording it as a **Low, non-blocking hardening recommendation** (see below), not a finding that reopens or blocks this pass.

### Edge case 2 — kill switch flips off again immediately after resume, mid-advance

Traced `isWeeklyCycleLiveAllowedForClient` (`weekly-cycle-live-env.ts:72-74`) and its call sites. This is not a live DB-backed toggle — it reads only `process.env.WEEKLY_CYCLE_LIVE_ENABLED`/`WEEKLY_CYCLE_LIVE_CLIENT_IDS`, server env vars that cannot change mid-process without a redeploy (which would kill in-flight requests, not silently flip a value mid-execution). Independent of that, the gate is re-checked at every spend-producing boundary, not just once at the top of `resumeWeeklyCycleRun`: inside `advanceWeeklyCycleSlot` itself before creating any new step_run (`advance-weekly-cycle-slot.ts:104-106`), and again inside `dispatchWeeklyCycleOutbox` per-row before actual dispatch (`dispatch-weekly-cycle-outbox.ts:173`). So even in a hypothetical live-toggle architecture, a flip between the new loop's iterations would cause remaining slots to no-op safely rather than spend. **No finding here** — this is solid defense-in-depth, confirmed by direct reading, not just inferred.

---

## Re-scan of the rest of the Phase B surface for regressions across both fix cycles

Per this pass's mandate, I re-checked whether `60de5f6` (H1) and `72c22a9` (H2) together still uphold the original clean-area findings from the first QA pass, by diffing the fix window rather than re-deriving from scratch:

```
git diff --stat 4da9761..72c22a9 -- lib/orchestration/actions/ lib/orchestration/load-operator-weekly-cycle-runs.ts \
  components/cycle/ lib/orchestration/ensure-approval-package-for-system-cycle.ts lib/orchestration/weekly-cycle-trusted-steps.ts
```
→ **empty diff.** None of these files were touched by either fix commit. This confirms, without needing to re-derive:

- **Budget/consent gates** (`weekly-cycle-trusted-steps.ts` delegating to the existing trusted creators with their own `assertReelBudgetAllowsEstimatedSpend`/`assertActiveAvatarConsentForJobs` checks) — unchanged, still PASS.
- **Operator IDOR** (`requireOperator` first-await, `.strict()` schemas, non-enumerating `NOT_FOUND` on all three Server Actions) — unchanged, still PASS.
- **No-publish boundary** (`ensureApprovalPackageForSystemCycle` only ever inserting `pending_client`) — unchanged, still PASS.
- **FE/DTO leakage** (`load-operator-weekly-cycle-runs.ts` selecting only the minimal columns, `OperatorCycleView.tsx` never importing Supabase) — unchanged, still PASS. The H2 fix's own commit message correctly notes the Operator-visibility gap flagged in the prior round is now moot in practice — since a stalled slot is actively advanced on resume instead of left dangling, the DTO's `processing` branch (`deriveSlotDto`'s third case) is now an accurate read of the slot's state again, not a false read of an orphaned one. No DTO change was needed, and none was made.

The full diff across both fix commits touches exactly 9 files, all under `lib/orchestration/` plus their tests (`pause-weekly-cycle-run-cas.ts` new; `resume-weekly-cycle-from-job.ts`, `resume-weekly-cycle-run.ts`, `weekly-cycle-outbox.ts`, `weekly-cycle-step-runs.ts` modified). This matches what both prior QA passes already scoped their re-reviews to; no new surface area needed re-derivation.

---

## New finding — Low, non-blocking

### L2 — resume's two continuation loops leave the run at `running` (not `paused`/`partial_failed`) if `advanceWeeklyCycleSlot` throws mid-loop

**Files:** `lib/orchestration/resume-weekly-cycle-run.ts:151-189,196-208`; `lib/orchestration/advance-weekly-cycle-slot.ts:70-88`; `lib/orchestration/actions/resume-weekly-cycle-run.ts`

**What:** Neither of `resumeWeeklyCycleRun`'s two loops (the pre-existing `retryableFailed` retry loop, or the new `stalledCompletedSlots` continuation loop) wraps its `advanceWeeklyCycleSlot` call in `try/catch`, nor does the Server Action wrapper around the whole function. If `advanceWeeklyCycleSlot` throws (via `resolveLinkageForStep`'s `WEEKLY_CYCLE_ASSEMBLY_LINKAGE_MISSING`/`WEEKLY_CYCLE_BRANDING_LINKAGE_MISSING`), the run — already CAS'd to `running` — is left stuck there indefinitely: `reconcileWeeklyCycleRun` never runs, a later resume attempt is refused (`RUN_NOT_RESUMABLE`), and no cron sweep touches an already-`running` run.

**Why it's Low, not blocking:** traced end to end and confirmed this throw path is not reachable through any current write path — every code path that can mark an async step `completed` (`markStepRunTerminal`) is only ever reached after `markStepRunPending` has already set that row's `job_id`, and `markStepRunTerminal`'s own `UPDATE` payload never touches `job_id`. So the specific data state (`completed` async row, null `job_id`) `resolveLinkageForStep` guards against cannot currently arise. This is also not new to `72c22a9` — the identical unguarded-exception pattern already existed in the pre-existing `retryableFailed` loop before this fix and in `resume-weekly-cycle-from-job.ts`'s normal-completion branch; H2 extends an already-accepted pattern rather than introducing it.

**Recommended fix direction (follow-up hardening, non-blocking):** wrap each loop's `advanceWeeklyCycleSlot` call in `try/catch`, and on catch, mark that slot's would-be-next step_run `failed` with a `DEPENDENCY_FAILED`/`INTERNAL_ERROR` code (visible, retryable-by-Operator-escalation) instead of letting the exception propagate — then ensure `reconcileWeeklyCycleRun` still runs via `try/finally` so the run always resolves out of `running` into an actionable, Operator-visible state even on an unexpected internal error. Not required before CLOSE; recommended as a future hardening pass alongside the `created_at, id` tiebreaker VALIDATION.md already recommended as non-blocking.

**Fix owner:** `integrations-engineer` (optional follow-up, not a CLOSE condition).

---

## Checks run (this final pass)

| Command | Result |
|---|---|
| `git show 72c22a9` (full diff + commit message) | Read in full; confirms scope is exactly the two-loop continuation fix plus 3 regression tests. |
| `npx tsx --test lib/orchestration/resume-weekly-cycle-run.test.ts` | **14/14 pass**, run directly by this reviewer. |
| `npx tsx --test` over the curated 22+1-file Phase B suite (full list in `VALIDATION.md`) | **203/203 pass**, 37 suites, run directly by this reviewer. |
| `git diff --stat 60de5f6..72c22a9` (scope check for H1 regression) | Confirms `resume-weekly-cycle-from-job.ts`/`pause-weekly-cycle-run-cas.ts` untouched by `72c22a9`. |
| `git diff --stat 4da9761..72c22a9 -- lib/orchestration/actions/ lib/orchestration/load-operator-weekly-cycle-runs.ts components/cycle/ lib/orchestration/ensure-approval-package-for-system-cycle.ts lib/orchestration/weekly-cycle-trusted-steps.ts` | Empty diff — confirms budget/consent gates, Operator IDOR, no-publish boundary, and FE/DTO surfaces are untouched by both fix cycles. |
| Direct read of `weekly-cycle-step-runs.ts` (`markStepRunPending`, `markStepRunTerminal`) | Confirms `job_id` is set at dispatch time and never cleared by terminal marking — basis for L2's "not currently reachable" conclusion. |
| Direct read of `weekly-cycle-live-env.ts`, `advance-weekly-cycle-slot.ts:104-106`, `dispatch-weekly-cycle-outbox.ts:173` | Confirms the kill-switch gate is env-var-backed (not live-DB-backed) and re-checked at every spend boundary — basis for clearing the "kill switch flips mid-advance" edge case. |

## What Was Not Covered

- Live Supabase/PostgREST execution against a real database (unchanged scope limit from every prior pass in this story).
- Deployed Vercel Cron invocation and genuine concurrent-webhook races.
- The pre-documented, PO-accepted webhook→`resumeWeeklyCycleFromJob` wiring gap (`task_c263b2c8`) — intentionally not re-flagged, consistent with every prior pass.
- Full-repo test suite re-run (already independently executed and cross-checked against a disposable pre-fix worktree by `requirements-validator` at `7ec40a0`; this pass ran the resume-specific and curated-22+1 suites directly instead, since no source file was modified during this review).
- Full `npx tsc --noEmit` re-run (already independently diffed to zero-new-errors by `7ec40a0`; not re-run here for the same reason).

## Gate summary

`Phase B · US-15.1 · QA final re-review · qa-engineer · APPROVE`

H1 and H2 are both genuinely closed — independently re-verified from a bugs/security/robustness standpoint, not just mechanical correctness. Two edge cases specific to this pass's mandate were probed and cleared: an unguarded exception inside the new continuation loop is real code but not reachable through any current write path (recorded as L2, a non-blocking hardening recommendation), and a kill-switch flip mid-advance is safely handled by defense-in-depth re-checks at every spend boundary plus the env-var (not live-DB) nature of the gate. The original clean-area findings (budget/consent gates, Operator IDOR, no-publish boundary, FE/DTO leakage) are confirmed untouched by both fix cycles via direct diff, not re-derived from scratch. No Critical, High, or Medium finding remains open.

**CLOSE recommendation: proceed.** This qa-engineer's read: Phase B has no remaining QA-level blocker. Product-owner may CLOSE Phase B and check its acceptance criteria in `USER_STORIES.md` §US-15.1. L2 above is offered as an optional future hardening item, not a condition of CLOSE.

---

# QA Re-review — US-15.1 Phase B (post-H1/M1/M2 fix, commit `60de5f6`)

**Story:** US-15.1 — Weekly cycle cron endpoint and orchestration (live pipeline)
**Scope:** Re-review of `60de5f6` ("Phase B QA-FIX H1 kill-switch pause + M1/M2 CAS/outbox hygiene") against this document's original H1/M1/M2, plus independent assessment of a new finding surfaced by `requirements-validator`'s focused post-fix VALIDATE (`plan/stories/US-15.1/VALIDATION.md`, commit `a249f3a`) that was outside the original QA scope, plus a re-review of the rest of the Phase B surface for regressions.
**Branch:** `feature/US-15.1-weekly-cron`
**Fix commit reviewed:** `60de5f6`
**Validation reviewed:** `a249f3a`
**Date:** 2026-08-31
**Reviewer:** qa-engineer

### Final verdict: APPROVE WITH CONDITIONS

**Current severity counts:** Critical **0** · High **1 (new)** · Medium **0** · Low **1 (pre-existing, non-blocking)**
**Prior findings:** H1 **CLOSED (with a new gap in the same recovery path — see H2 below)** · M1 **CLOSED** · M2 **CLOSED**

---

## H1/M1/M2 fix verification (independent re-trace, not trusted from VALIDATION.md)

### H1 — `running → paused` transition: confirmed CLOSED for its original two failure modes

Traced `lib/orchestration/resume-weekly-cycle-from-job.ts:110-127` and `lib/orchestration/pause-weekly-cycle-run-cas.ts` directly.

- The kill-switch-off branch (`resume-weekly-cycle-from-job.ts:110`) fires only when `!isWeeklyCycleLiveAllowedForClient(...)` **and** `status === "completed"`. It calls `markStepRunTerminal({ status: "completed" })` — the genuine outcome, never a synthetic `"failed"` — then `pauseWeeklyCycleRunCas(stepRun.runId)`, then `reconcileWeeklyCycleRun`. A job that failed for its own reason while the kill switch happens to be off falls through unchanged to the pre-existing normal-failure branch (`:130-137`). This is exactly the fix direction this report gave.
- `pause-weekly-cycle-run-cas.ts:28-34` is a genuine single-statement CAS (`UPDATE ... WHERE id=? AND status='running'`, `.select("id").maybeSingle()`), distinguishing `ALREADY_PAUSED` from `NOT_RUNNING` rather than reporting blind success.
- `reconcile-weekly-cycle-run.ts:62,89` — confirmed unmodified and correct: it only auto-resolves from `currentStatus === "running"`, and by the time reconcile runs after the pause CAS, the DB-loaded `currentStatus` is already `"paused"`, so reconcile only rebuilds `step_log` and never overwrites `"paused"` back to something else.
- `resume-weekly-cycle-run.ts:56-58` accepts `status === "paused" || "partial_failed"` — a paused run is genuinely resumable; the original "permanently stranded, unresumable `failed` run" failure mode is gone.
- The new `RETRYABLE_WEEKLY_CYCLE_ERROR_CODES` filter (`resume-weekly-cycle-run.ts:68-74`) requires both `status === "failed"` and a transient error code. Since the H1-paused step is recorded `"completed"`, it is excluded from `retryableFailed` by status alone, so `resumeWeeklyCycleRun`'s retry loop (`:125-163`) never calls `createOrGetReadyStepRun`/`dispatchWeeklyCycleOutbox` for it. **Traced and confirmed: no double-spend on resume for the already-completed step itself.**

Both of this report's original H1 failure modes — permanent stranding, and double-spend of the *already-completed* step — are genuinely closed. I independently re-derived this rather than accepting VALIDATION.md's trace at face value.

### New finding — High (H2) — a slot paused mid-chain never advances after resume; the run permanently dead-ends with no signal to Operator

**Files:** `lib/orchestration/resume-weekly-cycle-run.ts:60-163`; `lib/orchestration/advance-weekly-cycle-slot.ts:32-166`; `lib/orchestration/resume-weekly-cycle-from-job.ts:110-127`; `lib/orchestration/reconcile-weekly-cycle-run.ts:78-95`; `lib/orchestration/load-operator-weekly-cycle-runs.ts:22-50`; `lib/orchestration/run-weekly-cycle-live.ts:66-69`; `plan/stories/US-15.1/SECURITY.md:281` ("the server loads the run and advances only the next eligible step(s)")

**What, independently traced end to end (not just accepting the validator's framing):**

1. Kill switch flips off mid-run while slot 0 is between async steps — e.g. `primary_video` finishes on the provider side. `resumeWeeklyCycleFromJob` records `primary_video` as `"completed"` (correct, per H1's fix) and pauses the run. Critically, this branch (`resume-weekly-cycle-from-job.ts:118-127`) **never calls `advanceWeeklyCycleSlot`** — unlike the normal-completion branch three lines below it (`:145-172`), which does. So slot 0's `tts` step (its next step) is never seeded; no `ready`/`pending_*` row for slot 0 exists beyond `primary_video`.
2. Kill switch flips back on. Operator clicks Resume. `resumeWeeklyCycleRun` (`:60-163`) loads all step_runs and filters to `retryableFailed`: rows with `status === "failed"`. Slot 0's latest row has `status === "completed"`, so it is **not** in `retryableFailed` — confirmed this is the *only* filter the function applies; there is no separate pass that inspects a `completed`-but-pre-`approval` step and calls `advanceWeeklyCycleSlot` for it. The CAS still flips the run `paused → running` (this succeeds — it doesn't require any failed rows), but the resume loop does nothing for slot 0.
3. `reconcileWeeklyCycleRun(run.id)` runs immediately after (`resume-weekly-cycle-run.ts:165`). `currentStatus` is now `"running"`. `completedSlots` requires an `approval`-step `completed` row per slot — slot 0 has none. `anyPendingOrRunnable` checks for `ready|dispatch_pending|pending_provider|pending_worker` anywhere — slot 0 has none of those either (its chain never advanced past `primary_video`). So if the other two slots already reached approval (or also have nothing pending), `nextStatus` immediately resolves to `"partial_failed"` (or `"failed"` if zero slots reached approval) — **in the same call that just resumed the run.**
4. The run is now `"partial_failed"` again, permanently. A second resume attempt: `retryableFailed.length === 0` (still no failed rows — slot 0 is `"completed"`, not `"failed"`) and `run.status === "partial_failed"` triggers the explicit early return `RUN_NOT_RESUMABLE` (`:77-79`). **There is no third path.** I checked every production call site of `advanceWeeklyCycleSlot` (`grep -rn "advanceWeeklyCycleSlot(" lib/orchestration/*.ts`): its own internal sync-step recursion, the normal-completion branch of `resume-weekly-cycle-from-job.ts` (not this pause branch), the retry loop inside `resumeWeeklyCycleRun` (only for `status === "failed"` rows), and the initial seed in `run-weekly-cycle-live.ts`. None fires for this state. `runWeeklyCycleLive`'s own re-acquire path returns `ALREADY_RUNNING` immediately for any `"running"`/`"paused"` run (`run-weekly-cycle-live.ts:66-69`) and does nothing else — a subsequent cron tick is not a sweep and will not touch it either.
5. **Operator visibility is the sharpest part of this.** `deriveSlotDto` (`load-operator-weekly-cycle-runs.ts:22-50`) has three branches: `approval` completed → `ready_for_approval`; `anyFailed` with nothing pending → `failed`; otherwise → `status: "processing", currentStep: latest.step`. Slot 0 falls into the third branch — it renders in the Operator UI as `processing / primary_video`, **identical to a slot that is genuinely still in flight.** There is no error code, no distinct status, nothing that would tell an Operator this slot is permanently stuck versus five minutes from finishing. The only externally visible symptom is the run row sitting at `partial_failed` (or `failed`) with no resumable path — itself easy to misread as "some other slot failed, but this one's fine, it's still processing."

**This is confirmed by the fix's own regression test**, `resume-weekly-cycle-run.test.ts` ("QA H1: a paused run with an already-completed step resumes without re-dispatching or rebuilding that step (no double-spend)") — I read it directly. It sets up exactly this scenario (slot 0, `primary_video`, `status: "completed"`) and asserts `createRetryRow.length === 0` and `dispatchOutboxCalls === 0`. Those assertions are correct for *not double-spending*, but the test never asserts `advanceWeeklyCycleSlot` was called for slot 0 — because it wasn't, and the implementation has no code path that would do so. The test is the bug written down as a passing assertion.

**Why this is High, not Medium (disagreeing with VALIDATION.md's severity read) — concrete production impact:**

The scenario VALIDATION.md's finding describes is not a rare edge case: it is the *exact* scenario the kill switch exists for — an Operator (or an incident responder) flips `WEEKLY_CYCLE_LIVE_ENABLED` off mid-run for any reason (suspected bug, cost spike, provider incident, a scheduled maintenance window) while a run is mid-chain on at least one slot, then flips it back on expecting the story's own recovery guarantee to apply. Concretely, for a real client:

- That client's Reel for the affected slot **never gets produced** — not delayed, not degraded, *never*, with the current code. The run terminates at `partial_failed`/`failed` with no automated path forward.
- The Operator UI actively **hides** the problem: the stuck slot reads as `processing`, the same as healthy in-flight work. Nothing prompts an Operator to look twice, let alone escalate.
- Recovery requires an engineer to intervene directly in the database or ship a code fix — there is no Operator Server Action, button, or supported flow that reaches `advanceWeeklyCycleSlot` for this state today.
- This directly reads as a violation of the binding text this report already cited SECURITY.md for at H1: "Rollback is forward-safe... Re-enabling resumes only through the same idempotent resume API" (`SECURITY.md:265`) and "the server loads the run and advances only the next eligible step(s)" (`SECURITY.md:281`) — resume is supposed to advance the next eligible step, and for this exact state it provably does not.

This is not a security or tenant-isolation defect, and it does not reopen H1's double-spend risk (that remains genuinely closed). But it breaks a core flow this story exists to deliver — the story's premise is "3 Reels reach the approval queue... on the happy path," and the kill switch is the story's own named safety mechanism for interrupting that path safely. A safety mechanism that silently and permanently drops a client's paid-for Reel, with no operator-visible signal, is a High-severity functional defect by this report's own severity scale ("bug that breaks a core flow"), not a Low/Medium operational nicety. I am overriding VALIDATION.md's "Medium" read here: the validator scoped its judgment to "not a security/tenant-isolation/double-spend defect," which is true but is not the full severity test — the practical business impact (a silently-never-delivered client asset with an actively misleading status display) is squarely High under this report's own scale.

**Fix direction:** In `resumeWeeklyCycleRun`, after the `paused → running` CAS succeeds, in addition to the existing `retryableFailed` loop, load each slot's latest step_run and — for any slot whose latest row is `status: "completed"` but is not the `approval` step — resolve its script and call `advanceWeeklyCycleSlot({ ..., fromStep: <that step> })`, mirroring the normal-completion continuation already implemented in `resume-weekly-cycle-from-job.ts:145-172`. Add a regression test asserting the successor step (e.g. `tts`) is actually created/dispatched for a resumed run with a completed-but-pre-approval step — not just that the completed step itself isn't rebuilt. Separately, consider giving `deriveSlotDto` a way to distinguish "genuinely in flight" from "orphaned after a pause/resume with no successor row" (even a coarse heuristic — no successor row exists for a `completed` non-approval step on a non-`running` run) so Operator has *some* visible signal before this ships to production reliance.

**Fix owner:** `integrations-engineer` (resume continuation logic), with a follow-up FE note for `nextjs-frontend` on the Operator-visibility gap once the underlying continuation exists.

### Minor, non-blocking (re-confirming VALIDATION.md's note, not a new finding)

`resume-weekly-cycle-from-job.ts:123` discards `pauseWeeklyCycleRunCas`'s return value on its `ERROR`/`NOT_RUNNING` outcomes. Confirmed by direct read: the step outcome is still safely persisted either way (no double-spend risk from this alone), but a DB-level failure or a narrow status race during the pause CAS could leave the aggregate run status silently disagreeing with the reported `PAUSED_LIVE_DISABLED` outcome. Worth a follow-up log/metric; not blocking.

---

## M1 — CAS guard on `markStepRunTerminal`/`markStepRunPending`/`scheduleStepRunRetry`: confirmed CLOSED

Read `lib/orchestration/weekly-cycle-step-runs.ts:194-251` directly. All three functions now chain `.select("id").maybeSingle()` after the guarded `.update()` and return `!error && data !== null` — matching `claimOutboxRow`/`claimStepRunAsDispatchPending`/`startWeeklyCycleLiveCas`/`approveStrategyForSystemCycleCas`'s pattern exactly. This is the correct fix for the original defect (a zero-row guarded `UPDATE` does not itself raise a Postgres/PostgREST error, so the old `!error` return was always `true` regardless of whether the guard blocked the write). The new `weekly-cycle-step-runs.test.ts` exercises this against a real conditional-update fake table, not a caller-supplied mock. Closed.

## M2 — `listClaimableOutboxRows` staleness field: confirmed CLOSED

Read the diff directly (`lib/orchestration/weekly-cycle-outbox.ts`): `claimedAt` was added to `WeeklyCycleOutboxRow`/`mapRow`, and the `claimed`-row branch now checks `row.claimedAt !== null && row.claimedAt <= staleCutoff`, matching `claimOutboxRow`'s own atomic `claimed_at.lte.staleCutoff` gate. Closed.

---

## Re-review of the rest of the Phase B surface for regressions from `60de5f6`

Scope: every file this fix touched (`pause-weekly-cycle-run-cas.ts` new; `resume-weekly-cycle-from-job.ts`, `resume-weekly-cycle-run.ts`, `weekly-cycle-outbox.ts`, `weekly-cycle-step-runs.ts` modified) plus every caller of the newly-strict `markStepRunTerminal`/`markStepRunPending`/`scheduleStepRunRetry` return values, since M1's fix means these functions can now genuinely return `false` in production for the first time.

- **`advance-weekly-cycle-slot.ts` callers of `markStepRunTerminal`** (`:160,165`): return values are not checked (fire-and-forget). Since this function only calls `markStepRunTerminal` on a row it just created/read as non-terminal via `createOrGetReadyStepRun`, a `false` return here would only occur on a genuine concurrent double-completion race — not introduced or worsened by this fix, and outside H1/M1/M2's scope. No regression.
- **`dispatch-weekly-cycle-outbox.ts`** callers of `markStepRunPending`/`scheduleStepRunRetry`/`markStepRunTerminal`: spot-checked: this module already branches on the boolean return (it predates this fix and was written expecting a real CAS signal) — M1's fix makes its existing "already terminal, skip" branches *newly reachable* rather than newly broken. This is a strict improvement, not a regression, and is exercised by the existing `dispatch-weekly-cycle-outbox.test.ts` suite (still green).
- **`resume-weekly-cycle-run.ts`'s own use of `markStepRunTerminal`** (`:149,158`, inside the sync-step retry branch): unchanged by this fix; still fire-and-forget on a row this same function just created via `createOrGetReadyStepRun`. No new risk.
- **No other regression found.** `reconcile-weekly-cycle-run.ts` was confirmed unmodified and still correct for the `paused` state (see H1 re-verification above). The CAS/outbox/idempotency-key/retry-backoff/kill-switch/no-publish/auth surfaces this report originally reviewed in detail were not touched by `60de5f6` outside the five files listed above, and I re-confirmed no import, dependency, or route-level change accompanied this commit (`git show --stat 60de5f6` — five `lib/orchestration/*.ts` files plus their new/changed tests only).

---

## Checks run (this re-review)

| Command | Result |
|---|---|
| `git show 60de5f6 -- lib/orchestration/weekly-cycle-outbox.ts` and direct reads of all five touched production files | Confirms M1/M2 fixes and H1's `resume-weekly-cycle-from-job.ts`/`pause-weekly-cycle-run-cas.ts` implementation as described above. |
| `grep -rn "advanceWeeklyCycleSlot(" lib/orchestration/*.ts lib/orchestration/actions/*.ts` | Confirms the four call sites named above and no fifth site covering the H2 gap. |
| Direct read of `resume-weekly-cycle-run.test.ts`'s "QA H1" test | Confirms the test asserts non-double-spend only, never chain continuation — the H2 gap is exactly what this test does not check. |
| Direct read of `load-operator-weekly-cycle-runs.ts:22-50` (`deriveSlotDto`) | Confirms the stuck slot renders as `processing`, indistinguishable from healthy in-flight work — basis for the Operator-visibility part of H2. |
| Direct read of `run-weekly-cycle-live.ts:66-69` | Confirms no cron-tick sweep exists for an already-`running`/`paused` run. |

No test suite was re-run in this pass beyond direct code reading, since `requirements-validator`'s `a249f3a` VALIDATE already independently executed the full 22+1-file suite (201/201) for this exact commit and this report's own H1/M1/M2 re-verification above depended on reading the implementation, not re-running tests that do not cover the new finding.

---

## Gate summary

`Phase B · US-15.1 · QA re-review · qa-engineer · APPROVE WITH CONDITIONS`

H1's original two failure modes (permanent stranding of an unresumable `failed` run; double-spend re-dispatch of an already-completed step) are genuinely closed, independently re-verified. M1 and M2 are genuinely closed. This re-review found one new **High** finding (H2, above) in the same recovery path H1 just fixed: a slot paused mid-chain never advances past its paused step after Operator resume, permanently orphaning that slot's Reel with no automated recovery and no distinguishing signal in the Operator UI. This is not a security, tenant-isolation, or spend-safety defect, and it does not reopen anything this report or VALIDATION.md previously tested — but it means the kill switch, as shipped, is still not a *complete* safe mid-run stop-and-resume control for a run that has any slot mid-chain when the switch flips off.

**CLOSE recommendation:** Fix H2 (advance a `completed`-but-pre-`approval` slot on resume, per the fix direction above) before relying on the kill switch as a safe production stop control for a run with in-progress async slot work — the same threshold this report applied to the original H1. If product-owner/security-architect judge the residual risk acceptable to defer (e.g., because the kill switch is not expected to be toggled mid-run before a follow-up ships), that acceptance should be recorded explicitly here or in a CONTRACT/SECURITY amendment, consistent with how this document has handled every other accepted residual gap (the webhook-wiring deferral, Phase A's `INVALID_JSON` note). Absent that explicit acceptance, this qa-engineer's default reading is the same as for H1: fix before production reliance on kill-switch pause/resume.

---

# QA Report — US-15.1 Phase B

**Story:** US-15.1 — Weekly cycle cron endpoint and orchestration (live pipeline)
**Scope:** Phase B only — live weekly runner, strategy auto-approval, per-slot step-run/outbox dispatch, kill switch/rollout, Operator manual trigger/preview/resume, minimal Operator UI.
**Branch:** `feature/US-15.1-weekly-cron`
**Commits reviewed:** `83c5049` (BE/DB migration + contracts), `f5204ac` (FE operator UI), `464081b` (integrations orchestration), `c5867d6` (docs), `36dc5da` (VALIDATE-FIX: cron live wiring + 131 tests + retry/backoff bugfix + audit fixes)
**Date:** 2026-08-31
**Reviewer:** qa-engineer
**Sources:** `plan/USER_STORIES.md` §US-15.1 Phase B AC/`[SEC]`; `plan/stories/US-15.1/{SECURITY,CONTRACT,VALIDATION}.md`; implementation and executed tests

### Verdict: APPROVE WITH CONDITIONS

**Severity counts:** Critical **0** · High **1** · Medium **2** · Low **1**

Phase B's headline mechanisms are sound: the strategy auto-approval CAS never bypasses draft validation or overwrites an Operator-approved row, live spend genuinely delegates to the existing trusted job creators (which retain their own budget/consent gates — no `operatorClientId` impersonation), the Operator manual actions are correctly gated by first-await `requireOperator` with non-enumerating errors, no raw `step_log`/secrets/payloads reach the FE DTO, and a repo-wide scan confirms zero reachable Instagram/publish call on the weekly-cycle path. However, this review found one High finding — the frozen `running → paused` aggregate transition is never actually implemented, which can (a) permanently strand a run with real completed provider spend and no resume path, and (b) cause genuine double-spend on Operator resume for a slot whose provider job had already completed successfully before the kill switch flipped off — plus two Medium findings in the CAS/outbox layer. None of these are exploitable by an external/unauthenticated actor and none bypass authentication, tenant scoping, or the no-publish boundary; they are operational-integrity defects in the kill-switch/resume recovery path itself. Given the High finding's financial-integrity impact and its direct relevance to a binding SECURITY.md requirement, this is **APPROVE WITH CONDITIONS**, not a clean APPROVE — the High finding should be fixed (or explicitly accepted by product-owner/security-architect as a documented residual risk) before relying on the kill switch as a safe mid-run stop control in production.

---

## Findings

### High

#### H1 — `running → paused` aggregate transition is never implemented; kill-switch-mid-run can strand spent work or cause double-spend on resume

**Files:** `lib/orchestration/resume-weekly-cycle-from-job.ts:109-113`; `lib/orchestration/reconcile-weekly-cycle-run.ts:88-95`; `lib/orchestration/resume-weekly-cycle-run.ts:56-63,109-146`; `lib/orchestration/advance-weekly-cycle-slot.ts:104-106`; `plan/stories/US-15.1/CONTRACT.md:834` (state table: `running → paused`); `plan/stories/US-15.1/SECURITY.md:264` ("transition the run to `paused`... Re-enabling resumes only through the same idempotent resume API")

**What:** CONTRACT.md's frozen aggregate state machine requires `running → paused` when "kill switch disabled, client inactive, or callback terminal bookkeeping cannot advance." A repo-wide grep for `"paused"` under `lib/orchestration/` shows the status is only ever **read** (`.eq("status", "paused")`, `status === "paused"`) — no line anywhere writes `status: "paused"` to `neuramark_weekly_cycle_runs`. `resumeWeeklyCycleFromJob` (the callback continuation) instead marks the **step_run** as `"failed"` with `errorCode: "LIVE_DISABLED"` when the kill switch is off — even when the underlying provider job actually **completed successfully** (`loadOwnedJobTerminalStatus` returned `"completed"`; the real status is discarded and replaced with `"failed"` unconditionally at line 115). `reconcileWeeklyCycleRun` then resolves the aggregate purely from step-run statuses, and since it never assigns `"paused"` (only `"completed"`, `"partial_failed"`, or `"failed"` from `"running"`), a run interrupted before any slot reaches approval resolves to the **terminal** `"failed"` state. `resumeWeeklyCycleRun` only accepts `run.status === "paused" || "partial_failed"` — a `"failed"` run is permanently unresumable.

This is directly confirmed by the test suite itself: `resume-weekly-cycle-from-job.test.ts:180-195` ("kill switch disabled mid-flight pauses the step as LIVE_DISABLED instead of advancing it") asserts `markTerminal[0] = { status: "failed", errorCode: "LIVE_DISABLED" }` for a job whose mocked status is `"completed"` — i.e., the test codifies discarding a successful outcome, and no test anywhere asserts the run row's `status` column is ever set to `"paused"`.

**Why it matters — two concrete failure modes:**
1. **Permanent stranding of paid work.** If the kill switch is disabled while a run is `running` and no slot has yet reached approval, the run resolves to `"failed"` (terminal) rather than `"paused"`. Re-enabling the kill switch afterward gives the Operator no way to resume it — `resumeWeeklyCycleRun` refuses `"failed"` runs outright — directly contradicting SECURITY.md's frozen guarantee that "Re-enabling resumes only through `resumeWeeklyCycleRun`... Rollback is forward-safe."
2. **Real double-spend on Operator resume.** For a run that *does* resolve to `"partial_failed"` (≥1 slot already approved), the LIVE_DISABLED-failed step is indistinguishable from a genuine transient failure to `resumeWeeklyCycleRun`'s retry filter (`resume-weekly-cycle-run.ts:57-58`: `status === "failed" && attempt < MAX_WEEKLY_CYCLE_ATTEMPTS`, no `errorCode` check). For an async step (`primary_video`/`broll`/`assembly`/`branding`), resume calls `createOrGetReadyStepRun` for a **new attempt** and dispatches it through the outbox (`resume-weekly-cycle-run.ts:144-146`), which invokes the same trusted job creator again (`dispatch-weekly-cycle-outbox.ts:184` → `invokeTrustedCreator`) — genuinely re-submitting a provider job (real spend) for a step whose *original* job may have already completed and been paid for, because that original success was discarded at the LIVE_DISABLED callback instead of being preserved.

**Fix direction:** Add an explicit `running → paused` write path: when a callback's terminal bookkeeping cannot advance due to `LIVE_DISABLED` (or client-inactive), (a) persist the **actual** job outcome on the step_run (`completed` if the provider really completed, not a synthetic `failed`), and (b) transition the aggregate run row to `status: "paused"` via a dedicated CAS (mirroring `startWeeklyCycleLiveCas`'s pattern) rather than relying on `reconcileWeeklyCycleRun`'s implicit resolution, which has no `paused` branch. `resumeWeeklyCycleRun`'s retry filter should also exclude non-retryable error codes (anything outside `RETRYABLE_WEEKLY_CYCLE_ERROR_CODES`) so a `LIVE_DISABLED`-flagged step, once correctly recorded as `completed`, is never re-dispatched. Add tests: kill switch disabled mid-flight for a step whose underlying job actually succeeded → step recorded `completed`, run recorded `paused`, not `failed`/`partial_failed`; Operator resume after re-enabling the switch does not re-invoke the trusted creator for that already-succeeded step.

**Fix owner:** `integrations-engineer` (dispatcher/callback + resume logic), with `security-architect` sign-off given this touches the binding kill-switch recovery guarantee in SECURITY.md.

### Medium

#### M1 — `markStepRunTerminal` / `markStepRunPending` / `scheduleStepRunRetry` never verify their CAS guard actually matched a row

**Files:** `lib/orchestration/weekly-cycle-step-runs.ts:215-245`

**What:** Unlike every other CAS helper in this story (`claimOutboxRow`, `claimStepRunAsDispatchPending`, `startWeeklyCycleLiveCas`, `approveStrategyForSystemCycleCas` — all of which chain `.select(...).maybeSingle()` after the guarded `.update()` and branch on whether `data` came back), these three functions call `.update(...).eq(...).not("status", "in", "(completed,failed,skipped)")` **without** `.select()` and return `!error`. Supabase/PostgREST does not raise an error for a zero-row `UPDATE` by default, so `error` is `null` regardless of whether the `.not(...)` guard excluded the row. In practice **these functions always return `true`** as long as there is no genuine network/DB failure — they cannot distinguish "I transitioned the row" from "the row was already in a terminal state and my guard correctly blocked the write."

Every caller that treats the boolean as a real CAS result (`resume-weekly-cycle-from-job.ts:121` — `if (!marked) { /* Already terminal — idempotent duplicate callback */ }`) is checking a signal that the underlying function cannot actually produce. This exact function is never covered by its own unit test — there is no `weekly-cycle-step-runs.test.ts`; every consumer test (`dispatch-weekly-cycle-outbox.test.ts`, `resume-weekly-cycle-from-job.test.ts`, etc.) replaces `markStepRunTerminal` with a hand-written mock (e.g. `async (p) => { calls.push(p); return true; }`) via `Module._load` interception, so the "idempotent duplicate callback" test at `resume-weekly-cycle-from-job.test.ts:165-178` passes only because the mock is told to return `false` — it never exercises the real implementation's inability to do so.

**Why it matters:** The intended "already terminal → don't re-advance" branch this function's callers rely on is unreachable in production. In the current call graph the practical blast radius is contained by other, correctly-implemented guards (the outbox's atomic `claimOutboxRow`, and the `(run_id, slot_index, step, attempt)` unique constraint on `neuramark_weekly_cycle_step_runs` absorbing a duplicate `createOrGetReadyStepRun` insert) — so this was not found to cause an actual double-dispatch in the paths traced. But it is a genuine, silent CAS defect in code whose entire purpose is idempotency/concurrency safety, it is exercised by zero real-database-shaped tests, and a future caller that trusts this return value without the same downstream defense-in-depth would not be protected.

**Fix direction:** Add `.select("id").maybeSingle()` to all three functions and return based on whether `data` came back, matching the pattern already used by `claimOutboxRow`/`claimStepRunAsDispatchPending`/`startWeeklyCycleLiveCas`. Add a direct unit test for `weekly-cycle-step-runs.ts` (currently has none) asserting the guard actually blocks a second terminal-mark of an already-terminal row.

**Fix owner:** `integrations-engineer`.

#### M2 — `listClaimableOutboxRows` checks staleness against the wrong timestamp field

**File:** `lib/orchestration/weekly-cycle-outbox.ts:92-118`

**What:** `listClaimableOutboxRows` decides whether a `claimed` row is stale-and-reclaimable using `row.availableAt <= staleCutoff` (line 115), but `available_at` is set at row creation/retry-scheduling time and is **not** updated when a row transitions to `claimed` (`claimOutboxRow`, lines 121-140, only sets `claim_token`/`claimed_at`, never touches `available_at`). The actual atomic claim in `claimOutboxRow`'s `WHERE` clause correctly uses `claimed_at.lte.${staleCutoff}` (line 134). So the candidate list returned by `listClaimableOutboxRows` can include rows that were claimed moments ago (not stale at all) whenever that row's `available_at` happens to be more than 5 minutes old — which is routine for any row that sat `pending` for a while before a worker picked it up (e.g. due to cron cadence or backlog).

**Why it matters:** This does not cause an actual double-dispatch — `claimOutboxRow`'s own atomic `UPDATE ... WHERE status.eq.pending,and(status.eq.claimed,claimed_at.lte.staleCutoff)` is the real, correctly-implemented gate, and a non-stale `claimed` row included by mistake in the candidate list simply fails to actually claim (0 rows affected, `claimOutboxRow` returns `null`, caller does `continue`). The impact is limited to wasted candidate-list slots (an in-flight, legitimately-claimed row can crowd out a `limit`-bounded batch of genuinely claimable rows) — a minor efficiency/correctness-adjacent bug, not a spend or security issue.

**Fix direction:** Filter on `claimedAt` (need to add it to `WeeklyCycleOutboxRow`/`mapRow`, which currently doesn't select it) instead of `availableAt` for the `claimed` branch, matching `claimOutboxRow`'s own staleness definition.

**Fix owner:** `integrations-engineer`.

### Low

#### L1 — System-cycle callback discards a successful job's real outcome even outside the kill-switch scenario is asserted by the code path, not just the LIVE_DISABLED branch

**File:** `lib/orchestration/resume-weekly-cycle-from-job.ts:115`

**What:** `const terminal = status === "completed" ? "completed" : "failed";` — this line itself is correct (it does preserve `"completed"` in the normal path); this Low is scoped narrowly to record that the LIVE_DISABLED branch three lines above (covered by H1) is the *only* place a genuine `"completed"` outcome gets overwritten. No separate action needed beyond H1's fix — recorded here only so the H1 fix is verified against this exact line rather than a broader rewrite.

No new Critical, IDOR, secret-leak, budget/consent-bypass, or Instagram-publish findings were found.

---

## Security and correctness review — Phase B

| Area | Result | Evidence |
|------|--------|----------|
| Strategy auto-approval — no draft bypass | **PASS** | `auto-approve-weekly-cycle-strategy.ts` reloads the exact persisted row, validates `contentStrategyBriefSchema`, verifies id/client/week ownership and `STRATEGY_STALE` on a version mismatch; `approve-strategy-for-system-cycle-cas.ts:34-49` performs one conditional `UPDATE ... WHERE id/client_id/week_start/version/status='draft'` with `.select().maybeSingle()` — genuine CAS; a concurrent already-approved-by-this-run replay is the only accepted zero-row outcome, everything else is `STRATEGY_APPROVAL_CONFLICT`. `generateReelScriptsForClient` only ever receives the returned `strategyId` (`weekly-cycle-trusted-steps.ts:130-136`). |
| Live kill switch — start-of-run | **PASS** | `run-weekly-cycle-live.ts:44-47` checks `isWeeklyCycleLiveAllowedForClient` before any acquire; `weekly-cycle-live-env.ts` reads only `process.env.*`, no request/query/UI authority; allowlist fails **fully closed** (empty set) on any single invalid UUID entry (`getWeeklyCycleLiveClientAllowlist:37-41`). |
| Live kill switch — mid-run | **FAIL — H1** | See Findings. Blocks new spend correctly but does not implement the frozen `paused` recovery transition, risking stranded spend and double-spend on resume. |
| Budget/consent/policy gates on live spend | **PASS** | Every provider-spend step (`weekly-cycle-trusted-steps.ts`) delegates to the existing trusted creators (`createTalkingHeadVideoJob`, `createBrollVideoJobs`, `createAssemblyJobForClientTrusted`, `synthesizeVoiceoverForClientTrusted`), passing `operatorClientId: params.clientId` — i.e. never impersonating a different tenant — and those creators retain their own `assertReelBudgetAllowsEstimatedSpend` / `assertActiveAvatarConsentForJobs` checks (verified present in `create-talking-head-video-job.ts`, `create-broll-video-jobs.ts`). `mapDownstreamErrorCode` surfaces `BUDGET_EXCEEDED`/`CONSENT_REQUIRED`/`CONSENT_REVOKED`/`POLICY_REJECTED` as explicit step failures — never a silent skip. |
| IDOR — manual trigger/preview/resume | **PASS** | All three Server Actions call `requireOperator("handler")` as the first await before any parsing/DB read; `triggerWeeklyCycleForClient`/`previewWeeklyCycleForClient` use `.strict()` Zod input and return an identical non-enumerating `NOT_FOUND` for nonexistent/inactive/non-allowlisted `clientId`; `resumeWeeklyCycleRun` accepts only `{ runId }` (no step/slot/attempt override). Operator broad access to any active client is the documented V1 scope, not an IDOR. |
| Async callback trust boundary | **PASS (mechanism); accepted gap unchanged** | `resumeWeeklyCycleFromJob` ignores caller-supplied tenant/status/cost, re-derives job ownership from `loadOwnedJobTerminalStatus` scoped by the step run's own persisted `clientId`, and only advances the direct successor. The actual webhook wiring (`on-assembly-job-completed.ts`/`on-branding-completed.ts` calling this function) remains the pre-documented, PO-accepted deferred gap (`task_c263b2c8`) — not re-flagged here. |
| No-publish boundary (ADR-0002) | **PASS** | Repo-wide grep for `instagram\|graph-api\|graph\.facebook\|publish-now\|createContainer\|publishReel` under `lib/orchestration/`, `lib/content-strategy/`, `lib/assembly/`, `lib/qa/`, `lib/approvals/`, `lib/reel-scripts/`, `lib/reel-captions/`, `lib/tts/`, `lib/video-jobs/` returns zero hits outside the pre-existing, unrelated `buildEffectiveInstagramCaption` caption-formatting helper in `compose-approval-package.ts` (text composition only, not a publish call). `ensureApprovalPackageForSystemCycle` → `insertPendingApproval` only ever writes `status: "pending_client"`. Confirmed independently of, and consistent with, the executed structural scan test (`weekly-cycle-live.structural.test.ts`). |
| FE/DTO leakage | **PASS** | `load-operator-weekly-cycle-runs.ts` selects only `id, client_id, week_start, mode, status, started_at, finished_at, display_name` plus derived per-slot status/step/errorCode from the step-run table — never `step_log`. `OperatorCycleView.tsx` maps error codes through a static copy dictionary; no raw payload, prompt, secret, or Supabase import in the Client Component. |
| Retry ceiling / backoff | **PASS** | `MAX_WEEKLY_CYCLE_ATTEMPTS = 3`, `WEEKLY_CYCLE_DISPATCH_BACKOFF_SEC = { 2: 30, 3: 120 }` (`weekly-cycle-live-types.ts:65-66`) match CONTRACT exactly; the previously-fixed off-by-one (verified independently by VALIDATION) still holds under this review's own hand-trace of `dispatch-weekly-cycle-outbox.ts:138-141,215-216`. |
| Outbox atomic claim (double-dispatch) | **PASS** | `claimOutboxRow` performs a single guarded `UPDATE ... WHERE id=? AND available_at<=now AND (status=pending OR (status=claimed AND claimed_at<=staleCutoff))` with `.select().maybeSingle()` — a genuine single-statement CAS; Postgres row-level locking on the underlying `UPDATE` prevents two concurrent claims of the same row. |
| CAS/outbox layer — secondary helpers | **FAIL — M1, M2** | See Findings. Contained by the primary CAS above; not exploitable for double-spend in the traced call graph, but real defects. |
| Idempotency key format | **PASS** | `wc:{runId}:{slotIndex\|global}:{step}:{attempt}` matches `weeklyCycleOutboxPayloadSchema`'s regex exactly (`weekly-cycle-idempotency-key.ts`). |
| `neuramark_` prefix / RLS | **PASS (re-confirmed by reading, not re-applied live)** | Migration DDL for both new Phase B tables carries `neuramark_` prefixes throughout, `ENABLE ROW LEVEL SECURITY` with zero `CREATE POLICY` statements. |
| Backdoors / dependencies / secrets | **PASS** | No new dependency, no hardcoded credential beyond the sanctioned `getCurrentUser()` local user, no debug bypass flag, no eval/dynamic code execution, no unexpected outbound network call found in this review's reading of the 21 new orchestration modules + 3 Server Actions + FE. |

---

## Checks Run

| Command | Result |
|---------|--------|
| `npx tsx --test app/api/cron/weekly-cycle/route.test.ts lib/content-strategy/approve-strategy-for-system-cycle-cas.test.ts lib/content-strategy/content-strategy.test.ts lib/orchestration/acquire-weekly-cycle-run.test.ts lib/orchestration/actions/trigger-weekly-cycle-for-client.test.ts lib/orchestration/dispatch-weekly-cycle-outbox.test.ts lib/orchestration/ensure-approval-package-for-system-cycle.test.ts lib/orchestration/list-eligible-clients-for-weekly-cycle.test.ts lib/orchestration/persist-weekly-cycle-run-plan.test.ts lib/orchestration/reconcile-weekly-cycle-run.test.ts lib/orchestration/resume-weekly-cycle-from-job.test.ts lib/orchestration/resume-weekly-cycle-run.test.ts lib/orchestration/run-weekly-cycle-batch.test.ts lib/orchestration/run-weekly-cycle-for-client.test.ts lib/orchestration/run-weekly-cycle-live.test.ts lib/orchestration/start-weekly-cycle-live-cas.test.ts lib/orchestration/verify-cron-secret.test.ts lib/orchestration/weekly-cycle-idempotency-key.test.ts lib/orchestration/weekly-cycle-live-env.test.ts lib/orchestration/weekly-cycle-live.structural.test.ts lib/orchestration/weekly-cycle-outbox.test.ts lib/orchestration/weekly-cycle.test.ts` | **191 pass / 0 fail**, 36 suites, re-run independently by this reviewer (not trusted from VALIDATION.md alone). |
| `npx eslint` over all Phase B production TS/TSX files (route, page/loading, `OperatorCycleView`/`OperatorCycleLoading`, all `lib/orchestration/*.ts` + `actions/*.ts` non-test files, `approve-strategy-for-system-cycle-cas.ts`, `approve-strategy-row.ts`) | **0 errors** in production sources. The 82 errors reported when test files are included are 100% `@typescript-eslint/no-require-imports` inside `*.test.ts` files, from the intentional `Module._load` mocking pattern already used and accepted in Phase A. |
| Repo-wide grep for `paused` writes under `lib/orchestration/` | Confirms **zero** write sites for `status: "paused"` — basis for H1. |
| Repo-wide grep for Instagram/publish surfaces under the weekly-cycle-reachable module set | **Zero hits** outside an unrelated pre-existing caption-formatting helper — basis for the no-publish PASS row. |
| Direct read of `claimOutboxRow`, `claimStepRunAsDispatchPending`, `startWeeklyCycleLiveCas`, `approveStrategyForSystemCycleCas` vs. `markStepRunTerminal`/`markStepRunPending`/`scheduleStepRunRetry` | Confirmed the `.select().maybeSingle()` pattern present in the former four and absent in the latter three — basis for M1. |

---

## What Was Not Covered

- Live Supabase/PostgREST execution against a real database — all reasoning (including H1/M1/M2) is from static code reading plus the existing dependency-injected/mocked test suite, consistent with Phase A's and the prior Phase B validators' documented scope limit.
- Deployed Vercel Cron invocation, real provider/worker callback delivery, and genuine concurrent-webhook races (the M1 race window is reasoned about, not reproduced under load).
- The pre-documented, PO-accepted webhook→`resumeWeeklyCycleFromJob` wiring gap (`task_c263b2c8`) — intentionally not re-flagged per this task's instructions.
- Full `npx tsc --noEmit` re-run (VALIDATION.md already independently re-verified zero new errors against baseline `d2f6d9e`; not re-run here since no source file was modified during this review).
- Load/soak testing of the outbox dispatcher's `limit`/staleness behavior under real concurrency (M2's impact is reasoned from code, not measured).

---

## Gate summary

`Phase B · US-15.1 · QA · qa-engineer · APPROVE WITH CONDITIONS`

**CLOSE:** Recommend fixing **H1** before relying on the kill switch as a safe production stop control — it is the mechanism SECURITY.md explicitly names as the rollback/recovery safety net, and its absence risks real financial double-spend, not just a UX gap. **M1/M2** are non-blocking hardening items (defense-in-depth already contains their practical impact) but should be scheduled promptly given they sit in the concurrency-critical CAS/outbox layer this story exists to get right. If product-owner/security-architect determine H1's risk is acceptable to defer (e.g. because the kill switch is not expected to be toggled mid-run in the near term), that decision should be recorded explicitly here or in a CONTRACT amendment, the same way the webhook-wiring gap was — it does not currently carry that documented acceptance.

---

# QA Re-review — US-15.1 Phase A

**Story:** US-15.1 — Weekly cycle cron endpoint and orchestration
**Scope:** Phase A fix re-review
**Branch:** `feature/US-15.1-weekly-cron`
**Fix commits reviewed:** `4b5449d`, `23d048c`
**Revalidation reviewed:** `3e3e4ea`
**Date:** 2026-08-31
**Reviewer:** qa-engineer

### Final verdict: APPROVE WITH CONDITIONS

**Current severity counts:** Critical **0** · High **0** · Medium **0** · Low **1** documentation condition
**Prior findings:** H1 **CLOSED** · M1 **CLOSED** · L1 **CLOSED**
**CLOSE:** **Allowed.** The remaining condition is non-blocking and belongs in the mandatory Phase B CONTRACT delta.

The fixes preserve Phase A's no-spend boundary and close the ledger-corruption blocker with two independent controls: acquisition refuses non-`dry_run` states, and persistence performs an affected-row-verified conditional update. Profile lookup rejection is isolated per client, and malformed non-empty JSON is rejected before week resolution or batch execution for both GET and POST.

---

## Fix verification

| Prior finding | Status | Evidence |
|---------------|--------|----------|
| **H1 — dry-run re-plan overwrites live/terminal ledger state** | **CLOSED** | Existing `planned`, `running`, `completed`, and `failed` rows return `replan: "BLOCKED"` (`lib/orchestration/acquire-weekly-cycle-run.ts:38-49`), and the runner exits before plan/persist (`run-weekly-cycle-for-client.ts:30-33`). Persistence independently applies `WHERE id = ? AND status = 'dry_run'`, selects the affected row, and returns `NOT_REPLANNABLE` on zero matches (`persist-weekly-cycle-run-plan.ts:16-25`). It no longer writes `status` or `mode`. Tests cover all four non-dry states at acquire and runner boundaries plus an acquire/persist interleaving where another worker changes the state. |
| **M1 — rejected profile lookup aborts the batch** | **CLOSED** | Each profile lookup is wrapped independently; rejection records `PROFILE_LOAD_FAILED` and continues (`list-eligible-clients-for-weekly-cycle.ts:42-51`). The regression visits a rejecting client and then a later eligible client, asserting both the skip classification and continued eligibility (`list-eligible-clients-for-weekly-cycle.test.ts:30-64`). |
| **L1 — malformed JSON treated as empty** | **CLOSED** | A non-empty parse failure returns `400 { "error": "INVALID_JSON" }` with `Cache-Control: no-store` before forbidden-key scan, week resolution, or batch (`app/api/cron/weekly-cycle/route.ts:29-40`). GET and POST are both exercised with zero batch calls (`route.test.ts:37-51`). |

### Interleaving and data-integrity assessment

- The unique `(client_id, week_start)` constraint remains the insert race arbiter.
- A non-dry row observed during acquire cannot reach planner or persistence.
- If a `dry_run` row changes after acquire, the conditional persist affects zero rows and the runner returns `RUN_NOT_REPLANNABLE`.
- The guarded update changes only `step_log` and `finished_at`; it cannot rewrite `status`, `mode`, or `started_at`.
- `maybeSingle()` plus the unique run `id` makes zero affected rows explicit; database errors still become controlled `INTERNAL_ERROR` at the runner boundary.

---

## Current findings

### Low — Additive safety outcomes are not recorded in the original frozen contract

**Files:** `app/api/cron/weekly-cycle/route.ts:35`; `lib/orchestration/acquire-weekly-cycle-run.ts:7-23`; `lib/orchestration/run-weekly-cycle-for-client.ts:8-10`; `plan/stories/US-15.1/CONTRACT.md`

**What:** The fixes add `INVALID_JSON`, internal `replan: ALLOWED | BLOCKED`, and internal `RUN_NOT_REPLANNABLE` semantics beyond the original frozen type sketches.

**Why it matters:** These outcomes are safe and do not alter the successful public cron response, but Phase B implementers need the same state-transition vocabulary to avoid weakening the repaired idempotency boundary.

**Condition / owner:** `nextjs-backend` and `integrations-engineer` must carry these outcomes into the mandatory Phase B CONTRACT/SECURITY delta before live wiring. This does **not** block Phase A CLOSE.

No new correctness, trust-boundary, secret-handling, Supabase, concurrency, no-spend, dependency, backdoor, or scope findings were found.

---

## Checks Run — Re-review

| Command | Result |
|---------|--------|
| `npx tsx --test lib/contracts/weekly-cycle.test.ts lib/orchestration/weekly-cycle.test.ts lib/orchestration/verify-cron-secret.test.ts app/api/cron/weekly-cycle/route.test.ts lib/orchestration/list-eligible-clients-for-weekly-cycle.test.ts lib/orchestration/acquire-weekly-cycle-run.test.ts lib/orchestration/persist-weekly-cycle-run-plan.test.ts lib/orchestration/run-weekly-cycle-for-client.test.ts` | **30 pass / 0 fail** across all **8** focused files. |
| Scoped `npx eslint` over the 11 US-15.1 production TypeScript files | **PASS / exit 0**. |
| Fix-range regression/backdoor scan (`8c8e902..3e3e4ea`) | **PASS** — no dependency addition, outbound request, eval/dynamic execution, public secret, alternate auth/session path, client Supabase import, or Phase B spend import. |

### What remains untested

- Live Supabase/PostgREST execution of the conditional update and migration/RLS behavior.
- Deployed Vercel Cron authorization injection.
- Phase B live orchestration, manual Operator trigger, and UI, which remain out of scope and require their own frozen delta and gates.

---

## Gate summary

`Phase A · US-15.1 · QA re-review · qa-engineer · APPROVE WITH CONDITIONS · CLOSE allowed`

The original BLOCK report is retained below as audit history.

---

# Initial QA Report — US-15.1 Phase A (historical)

**Story:** US-15.1 — Weekly cycle cron endpoint and orchestration  
**Scope:** Phase A only  
**Branch:** `feature/US-15.1-weekly-cron`  
**Commits reviewed:** range `b89271e..d213875`; application implementation primarily `54bfdbc`, `8828f73`, `2658713`  
**Date:** 2026-08-31  
**Reviewer:** qa-engineer  
**Sources:** `plan/USER_STORIES.md` § US-15.1 Phase A; `plan/stories/US-15.1/{SECURITY,CONTRACT,TASKS,VALIDATION}.md`; implementation and focused tests

### Verdict: BLOCK

**Severity counts:** Critical **0** · High **1** · Medium **1** · Low **1**

Phase A correctly establishes Bearer-only cron authentication, server-side eligibility, a unique weekly ledger, and a structural no-spend dry-run path. However, the current re-plan path can overwrite a non-dry-run ledger row, including `running`, `completed`, or `failed`, and erase its `step_log`. This violates the frozen existing-`dry_run` re-plan condition and is a data-integrity blocker before Phase A CLOSE / Phase B wiring.

---

## Findings

### High

#### H1 — Dry-run re-plan overwrites live/terminal ledger state and audit history

**Files:** `lib/orchestration/acquire-weekly-cycle-run.ts:28-35`; `lib/orchestration/run-weekly-cycle-for-client.ts:30-33`; `lib/orchestration/persist-weekly-cycle-run-plan.ts:6-9`; `plan/stories/US-15.1/CONTRACT.md:121,351-379,487`

**What:** `acquireWeeklyCycleRun()` deliberately returns an existing row with any schema-valid status (`planned`, `running`, `completed`, `failed`, or `dry_run`). `runWeeklyCycleForClient()` ignores `acquired.status`, and `persistWeeklyCycleRunPlan()` unconditionally updates the row by `id`, replacing `step_log`, setting `status = "dry_run"`, and changing `finished_at`. The update also leaves the original `mode` untouched, so an existing Operator row may become a cron dry-run plan while still claiming `mode = "operator"`.

**Why it matters:** A retry or concurrent cron request can destroy live progress, terminal outcome, partial-failure detail, and audit evidence for the same `(client_id, week_start)`. The frozen contract permits refresh only on an existing **`dry_run`** row. The shared ledger is explicitly the Phase B idempotency boundary, so accepting any existing status without a guarded transition makes the future no-duplicate-spend control unsafe and creates an immediate corruption path for any pre-existing/manual row.

**Fix direction:** Make the re-plan transition conditional on the acquired row still being `dry_run`; perform a guarded update such as `WHERE id = $runId AND status = 'dry_run'` and require exactly one updated row. For any non-`dry_run` existing status, return an explicit already-existing/non-replannable result without changing status, mode, timestamps, or `step_log`. Add tests for `running`, `completed`, `failed`, and an interleaving where status changes between acquire and persist.

**Fix owner:** `nextjs-backend` (ledger state transition and Supabase update), with `integrations-engineer` confirming runner result semantics.

### Medium

#### M1 — One rejected profile lookup aborts the entire batch instead of producing `PROFILE_LOAD_FAILED`

**Files:** `lib/orchestration/list-eligible-clients-for-weekly-cycle.ts:36-50`; `lib/orchestration/run-weekly-cycle-batch.ts:13-24`; `plan/stories/US-15.1/CONTRACT.md:299-333`

**What:** The eligibility loop awaits `dependencies.getProfile(row.id)` without a per-client `try/catch`. Although the current profile helper often converts known failures into `{ exists: false, loadFailed: true }`, an unexpected rejection (client construction, runtime error, or future helper regression) escapes `listEligibleClientsForWeeklyCycle()`. `runWeeklyCycleBatch()` does not catch enumeration errors, so all remaining eligible clients are abandoned and the route rejects rather than returning the frozen aggregate response.

**Why it matters:** A fault isolated to one tenant can prevent the weekly plan for every later tenant. The contract exposes `PROFILE_LOAD_FAILED` precisely to classify a per-client profile failure, and the Phase A batch promises sequential partial progress.

**Fix direction:** Catch profile lookup rejection per client, append `{ clientId, skipReason: "PROFILE_LOAD_FAILED" }`, and continue. Add a test with one rejecting profile lookup followed by an eligible client, asserting the latter is still processed.

**Fix owner:** `integrations-engineer` (eligibility/batch resilience).

### Low

#### L1 — Authenticated malformed JSON is silently treated as an empty body

**File:** `app/api/cron/weekly-cycle/route.ts:29-35`

**What:** Any non-empty body that fails `JSON.parse` is replaced with `null`, then accepted as though the request had no body. A caller with the cron secret can send truncated or malformed JSON and still trigger the full batch.

**Why it matters:** This hides caller/configuration mistakes and makes input-boundary behavior ambiguous. It is not an authority bypass because Bearer authentication runs first and Phase A is no-spend.

**Fix direction:** Return a minimal `400 INVALID_JSON` response for non-empty malformed JSON, or explicitly freeze the current behavior in CONTRACT if intentional. Add GET and POST malformed-body tests.

**Fix owner:** `nextjs-backend`.

---

## Security and correctness review

| Area | Result | Evidence |
|------|--------|----------|
| Cron trust boundary | **PASS** | Auth is the first operation (`route.ts:26-27`); no cookie/session/operator bypass; invalid auth never reaches parsing or batch in tests. |
| Secret handling | **PASS** | `CRON_SECRET` is server-env only; SHA-256 fixed-size digests + `timingSafeEqual` (`verify-cron-secret.ts:9-27`); no secret/header logging, response echo, query, cookie, or alternate-header path found. |
| Production fail-closed | **PASS** | Missing/blank secret returns 503 in production and 401 otherwise; runtime test covers production unset. |
| Request authority | **PASS with L1** | Frozen top-level authority keys are rejected for both GET and POST; week and clients remain server-authoritative. Malformed JSON is accepted as empty. |
| Eligibility | **PASS with M1** | Query filters `active = true`; missing profile / visual mode are skipped without ledger rows. Unexpected profile rejection aborts the batch. |
| ISO week authority | **PASS** | Shared `normalizeToIsoMonday` and `trendWeekStartSchema`; request cannot provide `weekStart`. |
| Idempotency / concurrency | **BLOCK — H1** | Unique `(client_id, week_start)` and insert-on-conflict acquisition are correct; post-acquire state transition is not guarded and can overwrite non-dry-run rows. |
| No-spend guarantee | **PASS** | Route hard-codes `dryRun: true`; runner rejects false before dependencies; production runner imports no LLM/provider/FFmpeg/spend seam. |
| Supabase / RLS | **PASS** | Prefixed table/index/constraints; FK; array CHECK; RLS enabled with zero policies; service-role access stays server-only. Migration was reviewed statically, not applied live. |
| Error minimalism | **PASS with M1/L1** | Per-client runner errors collapse to `INTERNAL_ERROR`; no sensitive details returned. Batch-level/profile-rejection behavior is not resilient. |
| Backdoors / dependencies | **PASS** | No package/lockfile change, hidden route, eval/dynamic execution, unexpected network call, hardcoded credential, `NEXT_PUBLIC_*` secret, or client Supabase import in scope. |
| Scope | **PASS** | No Phase B live pipeline, manual action/UI, Instagram publish, provider adapter, or production-table mutation beyond the new ledger. |

---

## Checks Run

| Command | Result |
|---------|--------|
| `npx tsx --test lib/contracts/weekly-cycle.test.ts lib/orchestration/weekly-cycle.test.ts lib/orchestration/verify-cron-secret.test.ts app/api/cron/weekly-cycle/route.test.ts lib/orchestration/list-eligible-clients-for-weekly-cycle.test.ts lib/orchestration/acquire-weekly-cycle-run.test.ts lib/orchestration/run-weekly-cycle-for-client.test.ts` | **17 pass / 0 fail** across all **7** required files. The suite does not cover H1's non-`dry_run` states or M1's rejected lookup. |
| `npm run lint` | **FAIL (pre-existing repository-wide debt)** — errors are in unrelated prior files (for example `app/(app)/operator/playbook/page.tsx`, assembly/approval/provider tests). No US-15.1 source diagnostic appeared. |
| `npx eslint` on the 11 US-15.1 production TS files | **PASS / exit 0**. |
| Diff/backdoor scan over `b89271e..d213875` | **PASS** — no dependency additions, outbound calls, eval, public secrets, or alternate authority path found. |

---

## What Was Not Covered

- Live Supabase migration application, RLS probe with anon/authenticated roles, or PostgREST concurrency behavior against a real database.
- Deployed Vercel Cron invocation and platform injection of `Authorization`.
- Full repository build/type-check; `VALIDATION.md` already records broad pre-existing type failures outside US-15.1, while focused runtime tests and scoped lint were run here.
- Phase B live spend orchestration, Operator manual trigger, UI, and partial-failure live `step_log` shape; those require the mandated Phase B CONTRACT/SECURITY delta.

---

## Required Fix Loop

1. `nextjs-backend` closes **H1** with a status-guarded, affected-row-verified dry-run persist and regression tests for every non-`dry_run` status plus acquire/persist interleaving.
2. `integrations-engineer` closes **M1** with per-client profile rejection isolation and continuation coverage.
3. `nextjs-backend` may close **L1** in the same cycle or explicitly document it as accepted behavior; L1 alone would not block.
4. Re-run all seven focused files and scoped lint, then return to QA re-review before Phase A CLOSE.

**Gate:** QA **BLOCK** · **CLOSE not allowed** until H1 is fixed and re-audited.
