## Validation Report — US-15.1 Phase A

### Verdict: PASS WITH NOTES

Phase A satisfies all five acceptance criteria and the binding Phase A conditions in `SPEC-REVIEW.md`, `SECURITY.md`, and the frozen `CONTRACT.md` after the post-QA fixes. Commits `4b5449d` and `23d048c` close QA H1, M1, and L1 without enabling spend, weakening cron authority, or expanding Phase A product scope.

**Implementation commits reviewed:** `54bfdbc`, `8828f73`, `2658713`, `4b5449d`, `23d048c`

**Validation history:** initial **FAIL** at `29ebe97` → post-BUILD-fix **PASS WITH NOTES** at `d213875` → post-QA-fix **PASS WITH NOTES** (current report).

**Scope:** Phase A only. Phase B live orchestration, Operator manual trigger, partial-failure live log, and UI remain deferred.

### Acceptance Criteria

| Criterion | Status | Evidence |
|---|---|---|
| Vercel Cron invokes `GET/POST /api/cron/weekly-cycle` with Bearer `CRON_SECRET`; invalid/missing → 401; no browser/Cliente exposure | **PASS** | `vercel.json:1-5` freezes the correct path and Monday 06:00 UTC schedule. The route exports GET/POST aliases, Node runtime, `force-dynamic`, and `no-store` (`app/api/cron/weekly-cycle/route.ts:6-8,22-44`). Auth remains the first action (`:26-27`). Fixed-length SHA-256 digests plus `timingSafeEqual` remain at `lib/orchestration/verify-cron-secret.ts:9-27`; tests cover valid, missing, wrong, production-unset, and zero batch calls after auth failure. No browser or manual Phase A entry exists. |
| Enumerates active clients; profile + visual-mode gate; ineligible clients skipped with reason | **PASS** | Server-only query filters `active = true` (`lib/orchestration/list-eligible-clients-for-weekly-cycle.ts:25-34`), then handles inactive defense, rejected/failed/missing profiles, and absent visual mode per client (`:36-59`). `4b5449d` isolates thrown profile lookup failures as `PROFILE_LOAD_FAILED` and continues later clients (`:42-51`), proven by `list-eligible-clients-for-weekly-cycle.test.ts:30-64`. Skipped clients are mapped before the sequential eligible loop and receive no ledger row (`run-weekly-cycle-batch.ts:13-24`). |
| Canonical ISO Monday `weekStart`; same client/week idempotent; dry-run may re-plan | **PASS** | Server authority remains `normalizeToIsoMonday` + schema (`resolve-week-start-for-cycle.ts:1-6`); request fields cannot supply week authority. The migration uniquely constrains `(client_id, week_start)` (`supabase/migrations/20260831110000_neuramark_weekly_cycle_runs.sql:3-20`). Acquire returns one created row or the existing row (`acquire-weekly-cycle-run.ts:25-49`). Re-plan is allowed only while status is `dry_run`; all other statuses are blocked (`:45-49`). Persist performs a compare-and-update guarded by both `id` and `status = dry_run`, preserving live/terminal history across interleavings (`persist-weekly-cycle-run-plan.ts:10-25`). Tests cover first/repeat, eight concurrent acquires, all four non-dry statuses, successful guarded persist, and acquire/persist interleaving. |
| `dryRun: true` executes eligibility + ordered 10-step plan only; no spend side effects; structured plan | **PASS** | Route still hard-codes true (`route.ts:39`); the frozen ordered plan remains in `lib/contracts/weekly-cycle.ts:10-21` and `plan-weekly-cycle-steps.ts:13-22`. Runner imports only acquire/persist/planner, rejects false before dependencies, blocks non-replannable rows before planning, and handles an interleaving without overwriting state (`run-weekly-cycle-for-client.ts:1-5,24-42`). Tests assert ten spend spies stay at zero, false calls no dependency, non-dry rows are neither planned nor persisted, and the structural no-spend import grep remains green. |
| [SEC] Cron is sole System-cycle HTTP entry; server-only orchestration; forbidden fields rejected; no untrusted client authority | **PASS** | All non-pure orchestration modules remain `server-only`; the pure resolver is the frozen exception. Both HTTP aliases parse the body only after auth and reject malformed JSON or frozen authority fields before resolving week/batch (`route.ts:26-39`). Tests prove malformed and forbidden GET/POST bodies return 400 with zero batch calls (`route.test.ts:37-51,69-80`). Target clients still come only from server enumeration; no other weekly-cycle route/action exists. |

### Post-QA Findings

| Finding | Status | Evidence and compatibility |
|---|---|---|
| **H1 — non-dry-run ledger overwrite** | **CLOSED** | Acquire marks `planned`, `running`, `completed`, and `failed` as `replan: BLOCKED` (`acquire-weekly-cycle-run.ts:45-49`); runner exits before plan/persist (`run-weekly-cycle-for-client.ts:30-33`); persist independently uses `WHERE id = ? AND status = 'dry_run'` and affected-row verification (`persist-weekly-cycle-run-plan.ts:16-25`). Tests cover every status and the race between acquire and persist (`acquire-weekly-cycle-run.test.ts:64-89`; `persist-weekly-cycle-run-plan.test.ts:14-64`; `run-weekly-cycle-for-client.test.ts:49-109`). This implements the frozen rule that only an existing `dry_run` row may refresh. |
| **M1 — profile rejection aborts batch** | **CLOSED** | Per-client `try/catch` converts rejection to `PROFILE_LOAD_FAILED` and continues (`list-eligible-clients-for-weekly-cycle.ts:42-51`). Regression proves a later eligible client is still visited and selected (`list-eligible-clients-for-weekly-cycle.test.ts:30-64`). This strengthens the frozen skip-reason and sequential partial-progress semantics. |
| **L1 — malformed JSON accepted** | **CLOSED WITH NOTE** | Authenticated non-empty malformed JSON now returns minimal `400 { error: "INVALID_JSON" }` with `no-store`, before week resolution or batch (`route.ts:29-39`); both aliases are tested (`route.test.ts:37-51`). The frozen contract did not define malformed-body behavior. This additive error is compatible with its auth-first, forbidden-authority, minimal-response intent and cannot trigger execution, but should be recorded in the next CONTRACT maintenance edit. |

### Binding SECURITY / CONTRACT Conditions

| Area | Status | Evidence |
|---|---|---|
| Auth first; Bearer only; timing-safe; production fail-closed; no session bypass | **PASS** | `route.ts:26-27`; `verify-cron-secret.ts:9-27`; auth and route tests. |
| Secret hygiene, response minimalism, logging redaction, no-store | **PASS** | No secret/header logging or echo; frozen minimal result variants remain; errors are minimal; `route.ts:8,35,38,40`. |
| Structural no-spend and production plan-only precedence | **PASS** | `route.ts:39`; `run-weekly-cycle-for-client.ts:1-5,28`; zero-call and source-import tests green. |
| Server eligibility and per-client failure isolation | **PASS** | `list-eligible-clients-for-weekly-cycle.ts:25-60`; normal and rejected-profile tests green. |
| Unique/concurrent acquire; only dry-run re-plan; live/terminal audit preservation | **PASS** | Migration unique key; `acquire-weekly-cycle-run.ts:30-49`; `persist-weekly-cycle-run-plan.ts:16-25`; acquire, persist, and runner race/status tests green. |
| Server-authoritative week and clients; forbidden GET/POST fields | **PASS** | Resolver remains server-owned; `route.ts:29-39`; forbidden-field tests green. |
| RLS enabled with zero policies; `neuramark_` schema | **PASS** | `supabase/migrations/20260831110000_neuramark_weekly_cycle_runs.sql:3-35`. |
| No Phase B/manual/browser/out-of-scope implementation | **PASS** | No Operator/Cliente UI, manual action, IG publish, live spend import, new provider/agent, FFmpeg path, or existing production-table change was found. |

### Convention Compliance

- Phase A remains backend-only; EN/ES and PrimeReact requirements do not apply yet.
- Supabase and secrets remain server-side, with Vercel Cron as the concrete consumer.
- Database work remains migration-based and prefixed `neuramark_`.
- No Client Component, browser Supabase SDK/token, or current-user/session shortcut was introduced.

### Test Results

```text
npx tsx --test \
  lib/contracts/weekly-cycle.test.ts \
  lib/orchestration/weekly-cycle.test.ts \
  lib/orchestration/verify-cron-secret.test.ts \
  app/api/cron/weekly-cycle/route.test.ts \
  lib/orchestration/list-eligible-clients-for-weekly-cycle.test.ts \
  lib/orchestration/acquire-weekly-cycle-run.test.ts \
  lib/orchestration/persist-weekly-cycle-run-plan.test.ts \
  lib/orchestration/run-weekly-cycle-for-client.test.ts
```

Result: **30 passed, 0 failed** across **8 suites**.

### Gaps

None blocking Phase A QA re-review or CLOSE.

### Notes

1. `INVALID_JSON` and the internal additive `replan` / `RUN_NOT_REPLANNABLE` safety semantics are not written into the original frozen type sketches. They preserve the frozen outcomes and close a data-integrity hole rather than changing the successful cron response. Record them when CONTRACT is next maintained or in the mandatory Phase B delta.
2. Supabase behavior is exercised through dependency-injected in-memory doubles, not a live migration/RLS/PostgREST environment. The unique constraint and conditional update are present; deployed DB concurrency remains an integration concern.
3. Repository-wide type/lint debt remains outside this story's focused signal. The eight US-15.1 suites are green.

### Scope Creep

None found in the reviewed commits. The new internal guards and malformed-input error are directly tied to QA findings.

### Recommended Next Actions

Return to **Phase A QA re-review**. If QA approves, product-owner may CLOSE Phase A and check the five Phase A acceptance criteria. Phase B still requires its CONTRACT delta, SECURITY review, and FE signoff before BUILD.

---

## Validation Report — US-15.1 Phase B

### Verdict: FAIL

Phase B's individual mechanisms — the strategy CAS auto-approval, the per-slot step-run/outbox ledger, the aggregate state machine, the Operator manual trigger/preview/resume actions, and the minimal Operator UI — are each well built and, where checked in detail, match the frozen `CONTRACT.md` shapes closely (Zod contracts, migration DDL, idempotency-key format, retry ceiling/backoff constants, EN/ES error-code coverage all verified byte-for-byte or field-for-field against the freeze). However, this validation found **one genuine cross-agent integration break that is not the documented/deferred webhook gap**, plus a binding CONTRACT requirement that was never executed. Both block CLOSE.

**Implementation commits reviewed:** `83c5049` (BE/DB), `f5204ac` (FE), `464081b` (integrations), `c5867d6` (docs)

**Scope:** Phase B only — live pipeline, strategy auto-approval, Operator manual trigger/preview/resume, minimal Operator UI, partial-failure tracking.

### Acceptance Criteria

| # | Criterion (verbatim, `USER_STORIES.md` §US-15.1) | Status | Evidence |
|---|---|---|---|
| 1 | Happy path auto-advances: `generateContentStrategyForClient({ invokedBy: "system" })` → auto-approve gate → `generateReelScriptsForClient` → `generateReelCaptionsForClient` → provider jobs → assembly → branding → QA → ensure approval queue for all 3 slots | **FAIL** | The step chain itself is correctly wired end-to-end (`lib/orchestration/run-weekly-cycle-live.ts:93-177` for the global strategy→scripts→captions chain; `lib/orchestration/advance-weekly-cycle-slot.ts:32-166` for the per-slot primary_video→tts→broll→assembly→branding→qa→approval chain; `lib/orchestration/weekly-cycle-trusted-steps.ts:85-346` for the concrete calls into the existing `invokedBy: "system"` orchestrators). **But this chain is only reachable from the Operator manual trigger** (`lib/orchestration/actions/trigger-weekly-cycle-for-client.ts:66-71` calls `runWeeklyCycleLive`). The Vercel Cron Route Handler (`app/api/cron/weekly-cycle/route.ts`) was **not modified by any Phase B commit** (`git log` on that file shows only Phase A commits `8828f73`/`2658713`/`23d048c`) and still hard-codes `runBatch({ ..., dryRun: true })` unconditionally (`route.ts:39`), delegating to `lib/orchestration/run-weekly-cycle-batch.ts`, which still only knows how to call the Phase A dry-run-only `runWeeklyCycleForClient`. Integrations-engineer built a `runWeeklyCycleLiveBatch` function explicitly documented as *"Convenience batch wrapper for the cron Route Handler's live branch"* (`run-weekly-cycle-live.ts:180-219`) and a `selectWeeklyCycleLiveClientIds` helper explicitly documented as *"Cron selection helper"* (`weekly-cycle-live-env.ts:76-91`) — **neither has any call site anywhere in the codebase** (verified by repo-wide grep), including no test file (`run-weekly-cycle-live.ts` has zero corresponding `.test.ts`). `CONTRACT.md` §"HTTP and Phase A additive compatibility" explicitly specifies cron-conditional-on-`WEEKLY_CYCLE_LIVE_ENABLED` behavior (`"When WEEKLY_CYCLE_LIVE_ENABLED !== 'true', cron executes the Phase A dry-run response unchanged. When enabled, only allowlisted clients up to the cap enter the live batch..."`), and `TASKS.md:80` lists **"Vercel Cron live mode"** as a required Phase B BE consumer. As shipped, the scheduled cron **never** advances a client past dry-run planning regardless of `WEEKLY_CYCLE_LIVE_ENABLED`/`WEEKLY_CYCLE_LIVE_CLIENT_IDS` state — the only way any client reaches the live pipeline is a human Operator clicking "Run cycle" in `/operator/cycle`. This directly contradicts the story statement's core value: *"so that 3 Reels reach the approval queue without Operator clicks on the happy path."* |
| 2 | Partial failure: successful slots continue to approval queue; failed slots recorded on run row with step + error code; Operator can inspect run status (FE minimal table or log-only acceptable for CLOSE) | **PASS WITH NOTES** | Mechanism is present and structurally sound: `advance-weekly-cycle-slot.ts:159-166` marks a failed step `failed` with `errorCode` and does not advance that slot further, while `reconcile-weekly-cycle-run.ts` (not fully traced line-by-line here) projects `step_log` and resolves the aggregate to `partial_failed`/`failed`/`completed` per `CONTRACT.md`'s state table. `load-operator-weekly-cycle-runs.ts:21-53` derives per-slot `status`/`currentStep`/`errorCode` DTOs that `components/cycle/OperatorCycleView.tsx` renders as a 3-slot Tag table. **Note:** because AC-1's cron gap means no run currently reaches a live `running`/`partial_failed` state in production, this path is unexercised outside unit-level reasoning — and there are no unit/integration tests at all covering it (see Gaps). |
| 3 | Operator manual trigger Server Action (`requireOperator`) runs same orchestrator for one client+week with live mode; shares idempotency ledger with cron | **PASS** | `trigger-weekly-cycle-for-client.ts:41` calls `requireOperator("handler")` as the first await; input is parsed through the frozen `triggerWeeklyCycleInputSchema` (`.strict()`, bounded `weekStart` window) before any DB read; `loadActiveAllowlistedClientId` (`:23-35`) returns a non-enumerating `NOT_FOUND` for nonexistent/inactive/non-allowlisted targets; `runWeeklyCycleLive` (`run-weekly-cycle-live.ts:57-64`) calls the same `acquireWeeklyCycleRun` used by the Phase A cron path, so the `(client_id, week_start)` unique ledger is genuinely shared. (`mode: "live"` in the AC text is informal — `CONTRACT.md` reconciles `WeeklyCycleRunMode` to the literal `"cron" \| "operator"`, and liveness is gated orthogonally by `WEEKLY_CYCLE_LIVE_ENABLED`; this is a documented, non-blocking wording reconciliation, not a deviation.) |
| 4 | [SEC] System path never publishes to Instagram; never bypasses Cliente approval gate; inactive clients never enqueued; budget blocks surface as run step failures, not silent skip | **PASS** | Repo-wide grep for `instagram`/`graph-api`/`publish-now`/`createContainer`/`publishReel` under `lib/orchestration/` returns zero hits. The terminal step is `ensureApprovalPackageForSystemCycle` (`ensure-approval-package-for-system-cycle.ts:36-95`), which only ever inserts a `pending_client` approval row after QA-pass + branding-completed checks — no publish call exists on any Phase B code path. `run-weekly-cycle-live.ts:50-53` rechecks `active` before acquire; `advance-weekly-cycle-slot.ts:104-106` rechecks `isWeeklyCycleLiveAllowedForClient` before every slot advance. Downstream failures (budget/consent/policy/provider) are caught and mapped through `mapDownstreamErrorCode` (`weekly-cycle-trusted-steps.ts:46-75`) onto the frozen `weeklyCycleErrorCodeSchema` allowlist and persisted on the step row with `errorCode` — never silently dropped. |

### Cross-Agent Integration Seams Checked

| Seam | Result |
|---|---|
| FE (`OperatorCycleView.tsx`) action calls vs. Server Action signatures | **Aligned.** Imports and call shapes for `triggerWeeklyCycleForClient`, `previewWeeklyCycleForClient`, `resumeWeeklyCycleRun` match the exported types from `lib/orchestration/actions/*`. |
| Server Action results vs. `lib/contracts/weekly-cycle-live.ts` | **Aligned.** `TriggerWeeklyCycleResult`, `operatorWeeklyCycleRunDtoSchema` used verbatim; no ad-hoc shapes. |
| Orchestration DB reads/writes vs. `20260831120000_neuramark_weekly_cycle_live.sql` | **Aligned.** Status enums, step/status/error-code CHECK lists, idempotency-key uniqueness, and outbox payload shape all match between the migration and `lib/contracts/weekly-cycle-live.ts` / `weekly-cycle-live-types.ts`. |
| `npx tsc --noEmit -p tsconfig.json` | **Zero new errors.** Ran on this branch (315 `error TS` lines) and diffed against a clean worktree checked out at `136e91e` (the commit immediately before the three Phase B BUILD commits, also 315 errors). The two error sets are identical modulo non-deterministic TS union-member ordering in the messages (same files, same line/column, same error codes) — confirmed with a line-by-line diff. All 315 pre-exist Phase B, concentrated in `.test.ts` files plus a few pre-existing non-test files (e.g. `lib/tts/synthesize-voiceover-for-client-trusted.ts`, `lib/video-jobs/create-broll-video-jobs.ts`) that Phase B calls into but did not introduce. |
| **Cron Route Handler → live orchestrator** | **BROKEN — see AC-1.** This is the one substantive, unresolved integration break found. It is distinct from, and in addition to, the pre-documented deferred webhook→`resumeWeeklyCycleFromJob` gap. |
| `approve-strategy-row.ts` (existing Operator approval path, US-4.2) vs. `CONTRACT.md`'s "existing Operator approval writes `approved_by_actor = 'operator'`" | **Minor deviation.** `lib/content-strategy/approve-strategy-row.ts` was not touched by any Phase B commit and still only sets `approved_by`/`approved_at`/`status`; it never sets the new `approved_by_actor` column. Every Operator-approved strategy row will show `approved_by_actor = NULL` rather than `'operator'`. Functionally harmless (column is nullable, no code branches on it for the Operator path), but it weakens the audit-trail distinction `CONTRACT.md` asked for. |
| `invokedBy` literal for TTS/assembly steps vs. `CONTRACT.md`'s exact wiring table | **Minor deviation.** `CONTRACT.md` §"Exact live step wiring and gates" freezes `synthesizeVoiceoverForClientTrusted({ ..., invokedBy: "system" })` and `createAssemblyJobForClientTrusted({ ..., invokedBy: "system" })`. The actual pre-existing functions (`lib/tts/synthesize-voiceover-for-client-trusted.ts:28`, `lib/assembly/create-assembly-job-for-reel-script.ts:98`) only type `invokedBy: "operator" \| "revision"` — there is no `"system"` literal to pass. `weekly-cycle-trusted-steps.ts:253,299` passes `invokedBy: "operator"` instead, the closest existing option. This does not appear to create a security bypass (these functions' budget/consent/policy gates do not branch on `invokedBy`), but it does mislabel System-cycle jobs as Operator-invoked in any audit trail keyed on that field — a literal freeze was not honored because the downstream seam it names doesn't actually exist yet. |

### Binding CONTRACT/SECURITY Conditions — Phase B

| Condition | Status | Evidence |
|---|---|---|
| Validated System strategy auto-approval, exact CAS, no draft-bypass | **PASS** | `auto-approve-weekly-cycle-strategy.ts:24-71` reloads the exact persisted row, verifies `id`/`clientId`/`weekStart`/schema validity, then delegates to `approve-strategy-for-system-cycle-cas.ts:34-49`, a single conditional `UPDATE ... WHERE id = ? AND client_id = ? AND week_start = ? AND version = ? AND status = 'draft'`; a zero-row result is resolved against `approved_by_actor = 'system' AND approved_by_run_id = runId` for idempotent replay, else `STRATEGY_APPROVAL_CONFLICT` (`:60-97`). `generateReelScriptsForClient` only ever receives the returned `strategyId` (`weekly-cycle-trusted-steps.ts:130-136`). |
| Live kill switch + allowlist + cap, server-only, no request/UI authority | **PASS** | `weekly-cycle-live-env.ts` reads only `process.env.*`; `isWeeklyCycleLiveAllowedForClient` is checked at the root of `runWeeklyCycleLive` (`:45-47`) and again before every slot advance (`advance-weekly-cycle-slot.ts:104-106`) and every callback resume (`resume-weekly-cycle-from-job.ts:109-113`). Default max clients = 3, bounded 1–25, matches CONTRACT. |
| Manual trigger: `requireOperator` first-await, exact schema, non-enumerating errors, shared ledger | **PASS** | See AC-3 evidence above. |
| Aggregate state machine transitions (`dry_run→running→…`) as CAS | **PASS (spot-checked)** | `acquire-weekly-cycle-run.ts` carries the additive `replan: "ALLOWED"\|"BLOCKED"` outcome exactly as Phase A froze it and Phase B's delta requires it stay; `start-weekly-cycle-live-cas.ts` performs the one-way `dry_run→running` transition (read, not exhaustively traced against every listed transition in `CONTRACT.md`'s table). |
| Idempotency key format `wc:{runId}:{slot\|global}:{step}:{attempt}` | **PASS** | `weekly-cycle-idempotency-key.ts:9-17` matches the `weeklyCycleOutboxPayloadSchema` regex in `lib/contracts/weekly-cycle-live.ts:91` exactly. |
| Retry ceiling 3 attempts, 30s/120s backoff | **PASS** | `weekly-cycle-live-types.ts:65-66`: `MAX_WEEKLY_CYCLE_ATTEMPTS = 3`, `WEEKLY_CYCLE_DISPATCH_BACKOFF_SEC = { 2: 30, 3: 120 }`. |
| No Instagram publish surface anywhere in Phase B code | **PASS** | See AC-4. |
| `neuramark_` prefix, RLS enabled + zero policies on new tables | **PASS** | `20260831120000_neuramark_weekly_cycle_live.sql` — `neuramark_weekly_cycle_step_runs` and `neuramark_weekly_cycle_outbox` both `ENABLE ROW LEVEL SECURITY` with no `CREATE POLICY` statements; all new columns/constraints/indexes/triggers `neuramark_`-prefixed. |
| **"Phase B tests required before CLOSE"** (`CONTRACT.md`, 8 listed categories: strategy CAS races, aggregate transitions, outbox crash recovery, spend-gate freshness, retry/backoff, kill-switch/rollout, manual-trigger auth, structural no-publish scan) | **FAIL** | **Zero test files exist** for any of the 21 new `lib/orchestration/**` modules, the 3 new Server Actions, the new `approve-strategy-for-system-cycle-cas.ts`, or any FE component (`find … -name "*.test.ts"` under `lib/orchestration/` returns only the 6 pre-existing Phase A suites; `lib/orchestration/actions/*.test.ts` and `components/cycle/*.test.*` return nothing). This is a binding CONTRACT requirement, not an optional nice-to-have, and none of the 8 listed categories has any coverage. |

### Convention Compliance

- EN/ES copy: **complete.** `messages/en.json`/`messages/es.json` `operator.cycle.*` cover `page`, `loading`, and all 24 `errors` keys (19 `weeklyCycleErrorCodeSchema` codes + 5 action-specific codes), 1:1 key parity verified.
- Server Components by default: `/operator/cycle/page.tsx` is a server component; interactivity is isolated to `OperatorCycleView.tsx` (`"use client"`).
- PrimeReact: `Dropdown`, `Calendar`, `Button`, `DataTable`, `Tag`, `Message` used per FE signoff note in `CONTRACT.md`.
- Loading/empty/error/pending states: `loading.tsx` skeleton, `emptyClients`/`emptyRuns` messages, `loadFailed` branch, `anyPending`-gated duplicate-control disabling all present in `OperatorCycleView.tsx`.
- `getCurrentUser()` / `requireOperator()`: used correctly; no session/role shortcuts found.
- No `@supabase/supabase-js` or Supabase tokens found in any Client Component touched by this story.

### Gaps (what blocks PASS)

1. **BLOCKER — Cron never reaches live execution.** `app/api/cron/weekly-cycle/route.ts` and `lib/orchestration/run-weekly-cycle-batch.ts` were not updated in Phase B and have no path to `runWeeklyCycleLive`/`runWeeklyCycleLiveBatch`. The scheduled "System" trigger that is this story's entire premise never advances a client past dry-run planning, regardless of `WEEKLY_CYCLE_LIVE_ENABLED` state. Only a human Operator clicking "Run cycle" produces a live run today. This is a genuine cross-agent integration break — distinct from the pre-documented, PO-accepted webhook→`resumeWeeklyCycleFromJob` gap — and directly unmet: AC-1 ("happy path auto-advances... without Operator clicks").
2. **BLOCKER — Zero Phase B test coverage.** `CONTRACT.md` binding text: *"Phase B tests required before CLOSE"* lists 8 categories; none exist. No unit test exercises the strategy CAS race, the aggregate state machine, outbox crash/recovery, the eight-gate spend check, retry/backoff, the kill switch, the manual-trigger action, or a structural no-publish scan. All reasoning above is from static code reading, not executed tests.
3. **Minor — `approve-strategy-row.ts` (Operator path) never sets `approved_by_actor = 'operator'`,** leaving every Operator approval's new audit column `NULL` instead of the value `CONTRACT.md` specifies. Not a correctness or security issue; weakens the audit trail's actor distinction.
4. **Minor — TTS/assembly trusted-step calls pass `invokedBy: "operator"` instead of `CONTRACT.md`'s literal `"system"`,** because the pre-existing downstream functions never gained a `"system"` variant. No evidence of a security bypass, but it is a literal contract deviation and an audit-trail mislabel.

### Scope Creep

None found. All new files map to a name explicitly listed in `CONTRACT.md` or `TASKS.md`'s Phase B checklists, with the two exceptions above being *narrower* than what was frozen (missing wiring / missing "system" literal), not broader.

### Recommended Next Actions

1. **integrations-engineer** (or whoever owns `app/api/cron/weekly-cycle/route.ts`): wire the cron Route Handler's live branch — call `selectWeeklyCycleLiveClientIds` off the eligible-client list and `runWeeklyCycleLiveBatch` when `isWeeklyCycleLiveEnabled()` is true, additively alongside the existing Phase A dry-run response, per `CONTRACT.md` §"HTTP and Phase A additive compatibility". This is the single highest-priority fix — without it, Phase B does not deliver the story's stated automation value.
2. **integrations-engineer**: write the 8 categories of tests `CONTRACT.md` names as required before CLOSE, at minimum: strategy CAS race, `dry_run→running` one-way conversion, outbox crash-before/after dispatch, the eight-gate spend-check order, retry ceiling/backoff, kill-switch/allowlist/cap behavior, and a structural grep-based no-publish-import scan (mirroring the Phase A structural spend-guard test pattern).
3. **nextjs-backend**: patch `approve-strategy-row.ts` to set `approved_by_actor: "operator"` on the existing Operator approval write (low effort, low risk — additive column, no behavior change).
4. **integrations-engineer**: either add a `"system"` literal to `synthesizeVoiceoverForClientTrusted`/`createAssemblyJobForClientTrusted`'s `invokedBy` union (preferred, matches CONTRACT literally) or get a CONTRACT amendment accepting `"operator"` as the System-cycle actor label for these two seams, with a short rationale recorded.
5. Return to **security-architect** and **product-owner** for a decision on whether item 1 must land before Phase B CLOSE (this validator's reading: yes — it is the core mechanism the story exists to deliver) or whether Phase B should CLOSE with cron-live-wiring explicitly re-scoped as a documented follow-up, the way the webhook-resume gap already was. Given TASKS.md never flagged the cron-wiring gap as an accepted deferral (unlike the webhook gap, which has an explicit task id `task_c263b2c8` and PO-lean quote), this validator does **not** believe it qualifies for the same treatment without an explicit new PO decision.

---

## Validation Report — US-15.1 Phase B (RE-VALIDATE)

### Verdict: PASS WITH NOTES

Commit `36dc5da` ("US-15.1: Phase B VALIDATE-FIX — cron live wiring + Phase B test suite + audit fixes") closes both blockers and both minor deviations from the prior **FAIL**. This is an independent re-verification — every claim below was checked against the actual diff and, where testable, executed directly by this validator rather than trusted from the commit message.

**Commit reviewed:** `36dc5da` (on top of `83c5049`/`f5204ac`/`464081b`/`c5867d6`, previously reviewed and FAILed at `d2f6d9e`).

### Blocker 1 — Cron live wiring: CLOSED

`app/api/cron/weekly-cycle/route.ts:3,12,16,39` now imports and calls `runWeeklyCycleCronBatch` (not the Phase A-only `runWeeklyCycleBatch`) with only `{ weekStart }` — the `dryRun: true` literal is gone from the route entirely.

Traced `runWeeklyCycleCronBatch` (`lib/orchestration/run-weekly-cycle-batch.ts:63-95`) end to end:
- `!isLiveEnabled()` → delegates unchanged to `runDryRunBatch` (Phase A path, byte-identical response shape `{ dryRun: true, ... }`). `isWeeklyCycleLiveEnabled()` reads only `process.env.WEEKLY_CYCLE_LIVE_ENABLED === "true"` (`weekly-cycle-live-env.ts:16-18`) — no request/query/UI authority, matching CONTRACT's "Neither request/query/cookie/UI data... enables live."
- Live enabled but `selectWeeklyCycleLiveClientIds(eligibleIds)` returns `[]` (nothing allowlisted, or an invalid `WEEKLY_CYCLE_LIVE_CLIENT_IDS` entry — `getWeeklyCycleLiveClientAllowlist` fails the *whole* allowlist closed to `new Set()` on any single bad UUID, `weekly-cycle-live-env.ts:36-45`) → also falls back to the Phase A dry-run batch. Fail-closed confirmed.
- Live enabled with a non-empty selection: every eligible client **not** in the live set still gets routed through `runDryRunForClient({ ..., mode: "cron", dryRun: true })` (Phase A behavior, unchanged, in original deterministic order), and only the allowlisted, capped subset is handed to `runWeeklyCycleLiveBatch` (`run-weekly-cycle-live.ts:180-219`), which — for the first time — has an actual caller. `runWeeklyCycleLiveBatch` calls `runWeeklyCycleLive` per client, which performs the full CAS chain (`acquireWeeklyCycleRun` → `startWeeklyCycleLiveCas` → strategy → scripts → captions → per-slot `advanceWeeklyCycleSlot` → `reconcileWeeklyCycleRun`), i.e. the exact chain the prior FAIL confirmed was correctly built but unreachable.
- `selectWeeklyCycleLiveClientIds` (`weekly-cycle-live-env.ts:77-91`) selects the first `getWeeklyCycleLiveMaxClients()` (bounded 1–25, default 3) allowlisted IDs from the eligible list in order — matches CONTRACT's "cron selects the first allowlisted eligible clients in existing deterministic order."
- The composed live response (`run-weekly-cycle-batch.ts:87-94`) matches `weeklyCycleLiveCronHttpResponseSchema` (`CONTRACT.md:1015-1022`) field-for-field: `dryRun: false`, `eligibleCount` (all eligible this tick), `processedCount`/`failedCount`/`clients` scoped to the live batch only.
- `runWeeklyCycleLiveBatch`'s per-client error mapping (`run-weekly-cycle-live.ts:207`) collapses the non-frozen `CLIENT_INACTIVE` outcome to `INTERNAL_ERROR` before it reaches the response, keeping `errorCode` inside the frozen 4-value enum (`LIVE_DISABLED | RUN_NOT_REPLANNABLE | RUN_NOT_RESUMABLE | INTERNAL_ERROR`) — correct, deliberate.

This is a genuine, testable fix, not a cosmetic rename: `route.ts` now has a real path from a Vercel Cron tick to `runWeeklyCycleLive`, gated exactly by the three frozen rollout env vars, with the majority (non-allowlisted) path staying byte-identical to Phase A.

**Note (non-blocking):** for eligible clients excluded from a live tick, the response's `processedCount`/`failedCount`/`clients` report only the live subset — the dry-run refresh those other clients silently receive isn't reflected in the cron HTTP response. This is required by the frozen `.strict()` `weeklyCycleLiveCronHttpResponseSchema` (no room for an extra count field) and is a reasonable reading of "rollout-excluded with no live acquisition or ledger mutation" (no *live* mutation — the pre-existing, idempotent, non-spending Phase A dry-run refresh is unaffected). Worth recording explicitly in CONTRACT's next maintenance pass, as Phase A Note 1 already did for a similar additive-behavior gap.

### Blocker 2 — Phase B test coverage: CLOSED

Ran the full test suite myself (not just trusted the commit message) — all 22 Phase B + pre-existing suites under `lib/orchestration/`, `lib/content-strategy/`, and `app/api/cron/weekly-cycle/`:

```text
npx tsx --test app/api/cron/weekly-cycle/route.test.ts \
  lib/content-strategy/approve-strategy-for-system-cycle-cas.test.ts lib/content-strategy/content-strategy.test.ts \
  lib/orchestration/acquire-weekly-cycle-run.test.ts lib/orchestration/actions/trigger-weekly-cycle-for-client.test.ts \
  lib/orchestration/dispatch-weekly-cycle-outbox.test.ts lib/orchestration/ensure-approval-package-for-system-cycle.test.ts \
  lib/orchestration/list-eligible-clients-for-weekly-cycle.test.ts lib/orchestration/persist-weekly-cycle-run-plan.test.ts \
  lib/orchestration/reconcile-weekly-cycle-run.test.ts lib/orchestration/resume-weekly-cycle-from-job.test.ts \
  lib/orchestration/resume-weekly-cycle-run.test.ts lib/orchestration/run-weekly-cycle-batch.test.ts \
  lib/orchestration/run-weekly-cycle-for-client.test.ts lib/orchestration/run-weekly-cycle-live.test.ts \
  lib/orchestration/start-weekly-cycle-live-cas.test.ts lib/orchestration/verify-cron-secret.test.ts \
  lib/orchestration/weekly-cycle-idempotency-key.test.ts lib/orchestration/weekly-cycle-live-env.test.ts \
  lib/orchestration/weekly-cycle-live.structural.test.ts lib/orchestration/weekly-cycle-outbox.test.ts \
  lib/orchestration/weekly-cycle.test.ts
```

Result: **191 passed, 0 failed**, 36 suites (nested `describe` blocks), 0 skipped/todo. All 8 CONTRACT-required categories are covered with meaningful, non-stub assertions — spot-checked directly:

| Category | Suite | Sample assertions (not just "does not throw") |
|---|---|---|
| Strategy CAS races | `approve-strategy-for-system-cycle-cas.test.ts` | "rejects a second concurrent winner (different run) as `STRATEGY_APPROVAL_CONFLICT`"; "rejects a row already approved by the Operator path as a conflict, never overwriting it" |
| Aggregate transitions | `start-weekly-cycle-live-cas.test.ts`, `reconcile-weekly-cycle-run.test.ts`, `resume-weekly-cycle-run.test.ts` | "never transitions back: a second call after STARTED reports ALREADY_STARTED"; "resolves running → partial_failed when 1-2 slots approved and nothing else is pending/runnable"; "rejects partial_failed with zero retryable failed steps as RUN_NOT_RESUMABLE" |
| Outbox crash recovery | `weekly-cycle-outbox.test.ts` | "a claimed-but-not-yet-dispatched row is NOT claimable again while fresh (crash window still open)"; "a stale claimed row (crash after claim, before dispatch) is reclaimable with a new token" |
| Spend-gate freshness | `run-weekly-cycle-live.test.ts` | "gate 1 (kill switch + rollout): LIVE_DISABLED short-circuits before acquire is ever called"; "gate 3 (active re-check): CLIENT_INACTIVE short-circuits before acquire is ever called" |
| Retry/backoff | `dispatch-weekly-cycle-outbox.test.ts` | Reads the actual scheduled `availableAt` timestamp and asserts the delta is `29–31s` for the first retry and `119–121s` for the second (see off-by-one verification below) — real time-math assertions, not label checks |
| Kill-switch/allowlist/cap | `weekly-cycle-live-env.test.ts`, `dispatch-weekly-cycle-outbox.test.ts` | "fails the ENTIRE allowlist closed (empty set) when any single entry is invalid"; "bounds `WEEKLY_CYCLE_LIVE_MAX_CLIENTS` to 1..25, default 3"; "kill switch disabled mid-flight fails the claim as LIVE_DISABLED... (no new spend)" |
| Manual-trigger auth | `trigger-weekly-cycle-for-client.test.ts` | "calls `requireOperator` as the first await, before any input parsing or DB read"; "returns the same non-enumerating NOT_FOUND for nonexistent, inactive, and not-allowlisted clients" |
| Structural no-publish scan | `weekly-cycle-live.structural.test.ts` | Greps every Phase B orchestration/action file for `instagram`/`graph-api`/`publish-now`/`createContainer`/etc.; separately asserts the terminal step only ever writes a `pending_client` approval row |
| Cron live wiring (new behavior this fix introduces) | `run-weekly-cycle-batch.test.ts` | "routes allowlisted clients to the live batch and leaves the rest on the Phase A dry-run plan, in deterministic order"; "processes both the dry-run and live passes sequentially, never in parallel" |

This is genuine executed coverage, not coverage-shaped stubs — assertions check concrete outcomes (conflict codes, timestamps, call ordering, which functions were/weren't invoked) rather than "resolves without throwing."

### Off-by-one retry/backoff fix: independently verified against CONTRACT

`CONTRACT.md:964-966` freezes: max 3 total attempts; 30s backoff before attempt 2; 120s backoff before attempt 3.

`dispatch_attempt` in the outbox row is 0-indexed (0 = the first, non-retried dispatch already made). Traced `backoffSeconds`/`canRetry` in `dispatch-weekly-cycle-outbox.ts:135-142,206-219` by hand against this indexing:

| `row.dispatchAttempt` (attempts already made) | `nextDispatchAttempt` | Meaning | Fixed backoff | Fixed `canRetry` |
|---|---|---|---|---|
| 0 (1st attempt made) | 1 | about to run 2nd attempt | `nextAttempt <= 1` → `BACKOFF_SEC[2]` = **30s** ✓ | `1 < 3` → true ✓ |
| 1 (2nd attempt made) | 2 | about to run 3rd attempt | falls through → `BACKOFF_SEC[3]` = **120s** ✓ | `2 < 3` → true ✓ |
| 2 (3rd attempt made) | 3 | would be a 4th attempt | n/a, never reached | `3 < 3` → **false**, correctly blocked ✓ |

This matches CONTRACT exactly and closes the described bug (old code returned 120s on the first retry and 30s on the second — inverted — and allowed `nextDispatchAttempt <= 3`, i.e. a 4th physical dispatch past the 3-attempt ceiling). Independently confirmed via the executed test assertions above (`29–31s` / `119–121s` deltas measured against real `Date.now()` deltas, and "exhausts the retry ceiling... still marks terminal failed, never a 4th attempt").

### Minor deviations: both fixed

- `lib/content-strategy/approve-strategy-row.ts:29` now sets `approved_by_actor: "operator"` on the existing Operator approval `UPDATE`, alongside the pre-existing `approved_by`/`approved_at`/`status` fields. Verified against the migration: `supabase/migrations/20260831120000_neuramark_weekly_cycle_live.sql:11-12` constrains `approved_by_actor CHECK (approved_by_actor IN ('operator', 'system'))` — `'operator'` is a valid value, so this write will not violate the check constraint.
- `lib/tts/synthesize-voiceover-for-client-trusted.ts:28` and `lib/assembly/create-assembly-job-for-reel-script.ts:98` both widened `invokedBy` to `"operator" | "revision" | "system"`, and `lib/orchestration/weekly-cycle-trusted-steps.ts:253,299` now pass `invokedBy: "system"` for the TTS and assembly System-cycle calls, matching `CONTRACT.md`'s exact wiring table literally instead of mislabeling them as Operator-invoked.

### `npx tsc --noEmit -p tsconfig.json`: zero new errors, independently confirmed

Ran it myself on this branch: **315 `error TS` lines**. Then checked out the pre-fix commit (`d2f6d9e`, the state this validator originally FAILed) into a disposable worktree, symlinked `node_modules`, and ran the identical command: also **315 `error TS` lines**. Normalized both outputs to `path(line,col): TSxxxx` and diffed them — **zero differences**, all 315 entries identical between the two commits. Every error is in a pre-existing, unrelated `.test.ts` file (`lib/media/media-assets.test.ts`, `lib/video-jobs/video-jobs.test.ts`, `lib/agents/content/*.test.ts`, `lib/qa/*.test.ts`, `lib/assembly/*.test.ts`, `lib/providers/video/*.test.ts`, `lib/visual-preferences/visual-preferences.test.ts`, etc.) — none in any Phase B file. This independently confirms the commit message's claim; it was not merely trusted.

### Updated Acceptance Criteria (Phase B)

| # | Criterion | Prior status | Current status | Evidence |
|---|---|---|---|---|
| 1 | Happy path auto-advances via cron without Operator clicks | **FAIL** | **PASS** | See "Blocker 1" above — `route.ts` → `runWeeklyCycleCronBatch` → `runWeeklyCycleLiveBatch` → `runWeeklyCycleLive` is now a real, gated, tested chain. |
| 2 | Partial failure: successful slots continue; failed slots recorded; Operator can inspect | PASS WITH NOTES (unexercised, no tests) | **PASS** | Now exercised by `reconcile-weekly-cycle-run.test.ts` (`running → partial_failed`/`failed`/`completed` resolution) and `resume-weekly-cycle-run.test.ts`, in addition to the previously-reviewed FE table. |
| 3 | Operator manual trigger shares idempotency ledger with cron | PASS | **PASS** | Unaffected by this fix; now additionally covered by `trigger-weekly-cycle-for-client.test.ts`'s auth/validation/non-enumeration tests. |
| 4 | [SEC] No IG publish; no approval-gate bypass; inactive never enqueued; budget blocks surface as step failures | PASS | **PASS** | Unaffected by this fix; now additionally covered by the structural no-publish scan and `run-weekly-cycle-live.test.ts`'s gate-freshness tests. |
| — | Binding CONTRACT: "Phase B tests required before CLOSE" (8 categories) | **FAIL** | **PASS** | See "Blocker 2" above — all 8 categories covered, 191/191 tests executed and passing by this validator directly. |

### Gaps (what blocks PASS)

None found. Both original blockers and both minor deviations are genuinely closed, independently re-verified rather than trusted from the commit message.

### Notes

1. The live cron HTTP response's `processedCount`/`failedCount`/`clients` are scoped to the live-selected subset only (not the full eligible list) — see the non-blocking note under Blocker 1. Recommend recording this explicitly in CONTRACT's next maintenance pass, the same way Phase A's `INVALID_JSON` additive behavior was recorded.
2. As in Phase A, Supabase behavior is exercised through dependency-injected in-memory doubles, not a live migration/RLS/PostgREST environment. The migration DDL, CHECK constraints, and idempotency-key uniqueness were separately verified by direct reading (`20260831120000_neuramark_weekly_cycle_live.sql`); deployed DB concurrency remains an integration/QA concern, consistent with Phase A's Note 2.
3. `npx tsc --noEmit` was run and diffed against `d2f6d9e` (the exact commit this validator originally FAILed at), not against an older ancestor — this is the correct, tightest possible baseline for "did this fix introduce new type errors."

### Scope Creep

None found. All changes in `36dc5da` map directly to the four items this validator's prior FAIL asked for (cron wiring, Phase B tests, `approved_by_actor` stamp, `invokedBy: "system"` literal) plus the off-by-one fix discovered incidentally while writing the retry/backoff tests — itself squarely inside "write retry/backoff tests" scope, not an unrelated addition.

### Recommended Next Actions

1. **QA**: Phase B is unblocked for QA re-review. This validator's read: no remaining VALIDATE-level blocker.
2. **product-owner**: on QA APPROVE, may CLOSE Phase B and check the four Phase B acceptance criteria boxes in `USER_STORIES.md` §US-15.1.
3. Optional, non-blocking: record the live-cron-response counting scope (Note 1 above) in `CONTRACT.md`'s next maintenance edit for future readers.

---

## Validation Report — US-15.1 Phase B POST-QA-FIX (commit `60de5f6`)

### Verdict: PASS WITH NOTES

**Scope:** focused re-check of `60de5f6` ("US-15.1: Phase B QA-FIX H1 kill-switch pause + M1/M2 CAS/outbox hygiene") against `plan/stories/US-15.1/QA.md`'s High (H1) and Medium (M1, M2) findings, plus a sanity pass for regressions against Phase B's CONTRACT/SECURITY not specifically called out by QA. This is not a full re-derivation — the full Phase B VALIDATE already ran at `4148bab`.

### H1 — `running → paused` transition: **CLOSED**, with one residual gap (new finding below)

Traced `lib/orchestration/resume-weekly-cycle-from-job.ts:110-128` and the new `lib/orchestration/pause-weekly-cycle-run-cas.ts`:

- The kill-switch-off branch now only fires `if (!isWeeklyCycleLiveAllowedForClient(...) && status === "completed")` (`resume-weekly-cycle-from-job.ts:110`). It calls `markStepRunTerminal({ stepRunId, status: "completed" })` — no synthetic `"failed"`/`LIVE_DISABLED` — then `pauseWeeklyCycleRunCas(stepRun.runId)`, then `reconcileWeeklyCycleRun`. A job that genuinely failed while the kill switch is off (`status !== "completed"`) falls through to the pre-existing normal-failure path (`:130-137`), exactly matching QA's fix direction ("orthogonal to the kill-switch check").
- `pause-weekly-cycle-run-cas.ts:24-33` performs a single guarded `UPDATE ... SET status='paused' WHERE id=? AND status='running'` with `.select("id").maybeSingle()` — a genuine CAS mirroring `startWeeklyCycleLiveCas`, not a blind write. A non-`running` current status is distinguished (`ALREADY_PAUSED` vs `NOT_RUNNING`) rather than silently reported as success.
- `reconcile-weekly-cycle-run.ts` needed no change, confirmed by direct reading: `currentStatus` is loaded fresh from the DB (line 60), so after the CAS write it is already `"paused"`; the `if (currentStatus === "running")` block (line 89) never fires, so `nextStatus` stays `"paused"` and only `step_log` is rebuilt — the commit's claim that reconcile "already treats `paused` as a step_log-projection-only state" holds.
- `resume-weekly-cycle-run.ts:56-58` still gates on `run.status === "paused" || "partial_failed"`, so a paused run is genuinely resumable (the "stranded paid work" failure mode QA described — a `failed`-only terminal state with no resume path — no longer occurs).
- The new `RETRYABLE_WEEKLY_CYCLE_ERROR_CODES` filter (`resume-weekly-cycle-run.ts:68-75`) requires `row.status === "failed"` **and** `row.errorCode` to be in `{DISPATCH_TRANSIENT, PROVIDER_TRANSIENT, WORKER_TRANSIENT}` (`weekly-cycle-live-types.ts:32-33`, pre-existing constant, previously unused — confirmed by `git log -p` that this file itself is untouched by `60de5f6`). Since the H1-paused step is now recorded `"completed"` (not `"failed"`), it is excluded from `retryableFailed` by status alone; the errorCode filter is defense-in-depth against unrelated non-transient failures (`BUDGET_EXCEEDED`, `CONSENT_REQUIRED`, a stale `LIVE_DISABLED`-tagged row from before this fix, etc.) and does not block any legitimate transient retry — confirmed against the CONTRACT-frozen error taxonomy and the existing `mapDownstreamErrorCode` call sites. **No legitimate retry is blocked by this filter.**
- This closes the second QA-described failure mode: `resume-weekly-cycle-run.ts`'s retry loop only ever iterates `retryableFailed` (`status === "failed"`), so the now-`"completed"` step is never re-submitted to `createOrGetReadyStepRun`/`dispatchWeeklyCycleOutbox` — **no double-spend on resume.**

**New finding (not in QA's H1/M1/M2 scope, found during this sanity pass) — Medium: a slot paused mid-chain via the new H1 path never resumes progress after Operator resume.**

`resumeWeeklyCycleRun` (`lib/orchestration/resume-weekly-cycle-run.ts:60-163`) only acts on `retryableFailed` rows (`status === "failed"`, filtered by attempt/errorCode). It never inspects a step_run left in the new post-H1-fix state — `status: "completed"` on a non-terminal step (e.g. `primary_video`) whose slot has not yet reached `approval` — and never calls `advanceWeeklyCycleSlot` to create/dispatch that slot's next step (`tts`/`broll`/etc.). Confirmed by tracing every call site of `advanceWeeklyCycleSlot` in production code (`grep -rn "advanceWeeklyCycleSlot(" lib/orchestration/*.ts`): the only ones are its own internal sync-step recursion, `resume-weekly-cycle-from-job.ts:163` (skipped precisely in the pause branch — confirmed by the commit's own test asserting `calls.advanced.length === 0` when pausing), `resume-weekly-cycle-run.ts:150` (only inside the `SYNC_STEPS` branch of the *failed-step* retry loop), and `run-weekly-cycle-live.ts:163` (initial run seeding only). `runWeeklyCycleLive`'s `ALREADY_RUNNING`/re-acquire path (`run-weekly-cycle-live.ts:66-69`) also does nothing for an already-`paused`/`running` run — cron ticks do not sweep for stalled slots either.

Practical effect: the slot's already-paid-for asset is preserved in the DB (so H1's no-double-spend guarantee holds) but that slot's pipeline is permanently orphaned — it never reaches `assembly`/`branding`/`qa`/`approval`, so the run eventually resolves to `partial_failed` (if other slots completed) or `failed` again, with this slot never actually delivering the client-facing reel it was paid to produce. This is directly codified by the fix's own new test, `resume-weekly-cycle-run.test.ts:237-258` ("a paused run with an already-completed step resumes without re-dispatching or rebuilding that step") — the assertions (`createRetryRow.length === 0`, `dispatchOutboxCalls === 0`) are correct for *not double-spending*, but the test never checks that the slot's chain actually continues, because it doesn't. This appears to conflict with the frozen requirement in `SECURITY.md:281` — "Resume is state-driven, not caller-directed: the server loads the run and advances only the next eligible step(s)" — for this specific new pause reason: the next eligible step for the paused slot is never advanced on resume.

**Severity assessment:** Medium, not High/blocking for this pass — it is not a security, tenant-isolation, or double-spend defect (the two concrete failure modes QA's H1 named are both genuinely closed), and it does not regress anything QA explicitly tested. But it does mean the kill-switch pause/resume cycle, once a slot has paused mid-chain, does not currently deliver a complete recovery for that slot — only for the aggregate run status and for slots that failed outright. Recommend `integrations-engineer` add: after the CAS transitions to `running` in `resume-weekly-cycle-run.ts`, also load each slot's latest step_run and, for any slot whose latest row is `status: "completed"` but not the `approval` step, call `advanceWeeklyCycleSlot` with `fromStep` set to that step (mirroring the normal-completion path in `resume-weekly-cycle-from-job.ts:145-172`) — with a regression test asserting the successor step is dispatched, not just that the failed-step path is unaffected.

**Minor, non-blocking:** `resume-weekly-cycle-from-job.ts:123` discards `pauseWeeklyCycleRunCas`'s return value. On its `ERROR` or `NOT_RUNNING` outcome (a genuine DB failure, or a race where the run left `running` between the step-terminal write and the pause CAS), the function still calls `reconcileWeeklyCycleRun` and returns `PAUSED_LIVE_DISABLED` regardless of whether the run row was actually paused. The step outcome itself is safely persisted either way (no double-spend risk), but the aggregate status could momentarily disagree with the reported outcome. Worth a follow-up log/metric on the discarded non-`PAUSED` outcomes; not blocking given it requires a DB-level failure or a narrow race window.

### M1 — CAS guard on `markStepRunTerminal`/`markStepRunPending`/`scheduleStepRunRetry`: **CLOSED**

`lib/orchestration/weekly-cycle-step-runs.ts:199-249` — all three functions now chain `.select("id").maybeSingle()` after the guarded `.update()` and return `!error && data !== null`, matching the pattern in `claimOutboxRow`/`claimStepRunAsDispatchPending`/`startWeeklyCycleLiveCas`/`approveStrategyForSystemCycleCas`. Confirmed the return is based on an actual row match, not merely the absence of a Postgres error (which is the exact defect QA described — a zero-row guarded `UPDATE` does not itself raise a Supabase/PostgREST error).

The new `lib/orchestration/weekly-cycle-step-runs.test.ts` (previously no direct unit test existed for this file) uses a genuine in-memory fake table that evaluates the chained `.eq()/.in()/.not()` conditions and only returns a matched row when the guard actually passes — not a caller-supplied mock that is told what to return. Ran it directly: `markStepRunTerminal succeeds on a non-terminal row`, `markStepRunTerminal returns false — not true — when the row is already terminal ... and does not overwrite it`, plus equivalent pairs for `markStepRunPending`/`scheduleStepRunRetry`, all pass against the real implementation. This closes the exact gap QA identified: "these functions always return `true`" is no longer true, and the "already terminal → don't re-advance" branch callers depend on (e.g. `resume-weekly-cycle-from-job.ts:119-122`) is now reachable.

### M2 — `listClaimableOutboxRows` staleness field: **CLOSED**

`lib/orchestration/weekly-cycle-outbox.ts:92-130` — `WeeklyCycleOutboxRow` and `mapRow` now carry `claimedAt` (mapped from `claimed_at`), and the `claimed`-row staleness branch is `row.claimToken !== null && row.claimedAt !== null && row.claimedAt <= staleCutoff`, replacing the old `row.availableAt <= staleCutoff` check. This now matches `claimOutboxRow`'s own atomic `WHERE ... claimed_at.lte.staleCutoff` gate (unchanged, already correct). The new test `weekly-cycle-outbox.test.ts` — "QA M2: a row that sat pending for a long time (stale `available_at`) but was JUST claimed (fresh `claimed_at`) is NOT listed as claimable" — was run directly and passes, exercising exactly the scenario QA described (a row pending for a while before being claimed no longer wrongly appears reclaimable moments after claim).

### Independent verification run by this validator (not trusted from the commit message)

- **Tests:** ran the full 22-file QA-cited suite (plus the new `weekly-cycle-step-runs.test.ts`) myself: `npx tsx --test app/api/cron/weekly-cycle/route.test.ts lib/content-strategy/approve-strategy-for-system-cycle-cas.test.ts lib/content-strategy/content-strategy.test.ts lib/orchestration/acquire-weekly-cycle-run.test.ts lib/orchestration/actions/trigger-weekly-cycle-for-client.test.ts lib/orchestration/dispatch-weekly-cycle-outbox.test.ts lib/orchestration/ensure-approval-package-for-system-cycle.test.ts lib/orchestration/list-eligible-clients-for-weekly-cycle.test.ts lib/orchestration/persist-weekly-cycle-run-plan.test.ts lib/orchestration/reconcile-weekly-cycle-run.test.ts lib/orchestration/resume-weekly-cycle-from-job.test.ts lib/orchestration/resume-weekly-cycle-run.test.ts lib/orchestration/run-weekly-cycle-batch.test.ts lib/orchestration/run-weekly-cycle-for-client.test.ts lib/orchestration/run-weekly-cycle-live.test.ts lib/orchestration/start-weekly-cycle-live-cas.test.ts lib/orchestration/verify-cron-secret.test.ts lib/orchestration/weekly-cycle-idempotency-key.test.ts lib/orchestration/weekly-cycle-live-env.test.ts lib/orchestration/weekly-cycle-live.structural.test.ts lib/orchestration/weekly-cycle-outbox.test.ts lib/orchestration/weekly-cycle.test.ts lib/orchestration/weekly-cycle-step-runs.test.ts` → **201 pass / 0 fail**, 37 suites, 0 skipped — confirms the commit message's `201/201` claim by direct execution, not by trusting the text.
- **`npx tsc --noEmit -p tsconfig.json`:** ran on this branch (`60de5f6`): **315 `error TS` lines**. Independently checked out the pre-fix commit `cb218ec` into a disposable `git worktree`, symlinked `node_modules`, and ran the identical command: also **315 `error TS` lines**. Normalized both outputs to `path(line,col): TSxxxx` and diffed — the only differences are TypeScript's non-deterministic ordering of structural-type property lists inside a handful of pre-existing error messages (same file/line/code, cosmetic text reordering only); the error set is otherwise byte-identical. **Zero new errors**, confirming the commit message's claim by an independent worktree diff rather than trusting it. Worktree removed after the check.
- **`npx eslint`** on the 5 touched production files (`pause-weekly-cycle-run-cas.ts`, `resume-weekly-cycle-from-job.ts`, `resume-weekly-cycle-run.ts`, `weekly-cycle-outbox.ts`, `weekly-cycle-step-runs.ts`): **0 errors/warnings.**

### Gaps (what blocks PASS)

None block PASS. The one Medium-severity new finding above (paused slots not resumed to their next step) is a genuine, testable gap that should be closed before treating kill-switch pause/resume as a *complete* production recovery path for a slot that paused mid-chain — but it does not reopen QA's H1 double-spend/stranding failure modes (those are closed), is not a security or tenant-isolation defect, and does not regress anything QA or the prior VALIDATE explicitly tested. Recording it as a note/condition, consistent with how this document has previously handled non-blocking residual gaps (see Phase A Note 1, Phase B Note 1).

### Scope Creep

None found. All changes in `60de5f6` map directly to QA's H1/M1/M2 fix directions plus their required regression tests.

### Recommended Next Actions

1. **integrations-engineer**: close the new finding above — advance a slot whose latest step_run is `completed` but pre-`approval` on `resumeWeeklyCycleRun`, with a regression test asserting the successor step is actually dispatched after a kill-switch pause/resume cycle. Recommend doing this before the kill switch is relied upon in production for a run that might pause mid-slot-chain.
2. **qa-engineer**: re-review `60de5f6` against H1/M1/M2; this validator's read is all three are genuinely closed. The new Medium finding above is offered for QA's own severity judgment — it was found during this VALIDATE pass, not originally raised by QA.
3. **product-owner**: may treat H1/M1/M2 as closed for CLOSE purposes; the new finding is a recommended follow-up, not a re-opened blocker, unless QA/security-architect judge otherwise.

---

## Validation Report — US-15.1 Phase B POST-H2-FIX VALIDATE (commit `72c22a9`)

### Verdict: PASS

**Scope:** focused re-check of `72c22a9` ("US-15.1: Phase B QA-FIX H2 — resume advances paused mid-chain slot") against the High finding QA's re-review (`QA.md`, commit `4da9761`) raised against this validator's own prior finding above — that a slot paused mid-chain by H1's kill-switch pause path never advanced past its pause point on resume, permanently orphaning that slot's Reel. This is the second fix cycle on the pause/resume feature (H1 in `60de5f6`, H2 in `72c22a9`).

### H2 — resume never advances a paused mid-chain slot: **CLOSED**

Read `git show 72c22a9` in full, then traced the fix independently rather than trusting the commit message.

**1. The new continuation loop (`resume-weekly-cycle-run.ts:82-105`, `:191-208`) is disjoint from the existing `retryableFailed` loop; no double-advance risk.**

- `stalledCompletedSlots` is built from the same `stepRuns` snapshot as `retryableFailed`, but filtered to `status === "completed" && step !== "approval"` on each slot's *latest* row (`:99-105`). `retryableFailed` filters to `status === "failed"` rows (`:69-76`) drawn from the same array without a latest-only restriction. A single row's `status` column cannot be both `"completed"` and `"failed"`, so the two filters never select the same row.
- The harder question — whether the two loops could still both fire `advanceWeeklyCycleSlot` for the *same slot* via two different rows in one resume() call — does not arise here, by construction of the pipeline: a slot's step chain only ever advances to step N+1 once step N's row is marked `"completed"` (via `advanceWeeklyCycleSlot`/`runSyncStep`). So a slot cannot simultaneously have (a) an *actionable* (non-stale) failed row for some step A that has not yet been successfully retried, and (b) a `"completed"` latest row for a later step B — B's row could only exist if A had already succeeded. The one case where a stale lower-attempt `"failed"` row for an already-succeeded step lingers in the table (e.g. attempt 1 failed, attempt 2 was later retried and completed) is independently guarded by `retryableFailed`'s own existing logic: `createOrGetReadyStepRun({ attempt: failedStep.attempt + 1, ... })` collides (23505) with the real, already-`"completed"` row at that same attempt number, `loadStepRunByKey` reloads it, and the `if (!retryRow || retryRow.status !== "ready") continue;` guard (`:164`) skips it before `advanceWeeklyCycleSlot` is ever called from that branch. Verified this guard is unconditional and pre-existing (not touched by `72c22a9`) — traced `weekly-cycle-step-runs.ts:63-103`'s `createOrGetReadyStepRun` conflict-reload path directly.
- Net effect: in every reachable state, at most one of the two loops can produce an `advanceWeeklyCycleSlot` call for a given slot in a single `resumeWeeklyCycleRun` invocation. The commit's disjointness claim holds, and holds for a stronger reason than "the statuses differ" alone — the two loops' *effects* are exclusive, not just their *row-selection sets*.

**2. `advanceWeeklyCycleSlot`'s `fromStep` contract genuinely supports what the fix assumes** — read `lib/orchestration/advance-weekly-cycle-slot.ts:95-140` directly, not just the caller. `fromStep: stalledSlot.step` is passed straight into `nextStepAfter(params.fromStep, params.script)` (`:108`), which starts its scan of `SLOT_STEP_ORDER` at `indexOf(step) + 1` (`:53`) — i.e., strictly the next applicable step, honoring the `slotNeedsPrimaryVideo`/`needsBroll` skip rules (`:56-57`). This is the exact same function and the exact same calling convention already used by `resume-weekly-cycle-from-job.ts:163-169`'s normal-completion continuation and by `resume-weekly-cycle-run.ts:176-182`'s own retry-loop continuation — the H2 fix does not invent a new contract, it reuses a well-exercised one. `attempt` defaults to `1` (`:114`) when omitted, which is correct here: since the next step's row cannot yet exist (per the disjointness argument above — the chain hasn't advanced past `fromStep` yet), this is genuinely its first attempt.

**3. Tests — ran directly, not trusted from the commit message.** `npx tsx --test lib/orchestration/resume-weekly-cycle-run.test.ts` passes in full. Read the three H2 tests (`:237-337`) and confirmed they assert real continuation, not just non-double-spend:
   - `:237-272` — a paused run with a `"completed"` `primary_video` row asserts `calls.advanceCalls.length === 1` and `deepEqual`s the exact call shape (`{ runId, clientId, slotIndex: 0, script, fromStep: "primary_video" }`) — this is the test QA specifically flagged as previously only checking non-double-spend; it now genuinely checks the chain moves forward.
   - `:274-301` — a terminal (`approval`, completed) slot 0 and an in-flight (`tts` completed + `broll` `pending_provider`) slot 1 both assert `calls.advanceCalls.length === 0` — confirms the "latest row" logic picks the `broll` row (not the stale `tts` row) for slot 1 and correctly excludes it via the status check, and confirms the step check excludes the terminal slot.
   - `:303-337` — a 3-slot mixed run (stalled / terminal / in-flight) asserts exactly one `advanceCalls` entry, for the correct slot.
   The test harness (`installMocks`, `:19-107`) stubs Supabase and sibling modules but loads the real `resume-weekly-cycle-run.ts` via `require` after `clearModuleCache()` — the filtering/grouping/looping logic under test is the actual production code, not a re-implementation. `advanceWeeklyCycleSlot` itself is mocked (appending to `calls.advanceCalls`), which is correct scope for a unit test of the caller. Note: there is no dedicated `advance-weekly-cycle-slot.test.ts` in the repo (confirmed by `find`/`grep` — it is exercised only as a mocked dependency inside `resume-weekly-cycle-from-job.test.ts`, `run-weekly-cycle-live.test.ts`, and `weekly-cycle-live.structural.test.ts`, never directly unit-tested); its `fromStep` contract for this fix was verified by direct source reading instead (point 2 above), which is why that reading was necessary rather than just trusting the mocked test assertions.

**4. Curated 22+1-file orchestration suite — ran directly: 203/203 pass**, matching the commit's claim exactly:
```
npx tsx --test app/api/cron/weekly-cycle/route.test.ts lib/content-strategy/approve-strategy-for-system-cycle-cas.test.ts lib/content-strategy/content-strategy.test.ts lib/orchestration/acquire-weekly-cycle-run.test.ts lib/orchestration/actions/trigger-weekly-cycle-for-client.test.ts lib/orchestration/dispatch-weekly-cycle-outbox.test.ts lib/orchestration/ensure-approval-package-for-system-cycle.test.ts lib/orchestration/list-eligible-clients-for-weekly-cycle.test.ts lib/orchestration/persist-weekly-cycle-run-plan.test.ts lib/orchestration/reconcile-weekly-cycle-run.test.ts lib/orchestration/resume-weekly-cycle-from-job.test.ts lib/orchestration/resume-weekly-cycle-run.test.ts lib/orchestration/run-weekly-cycle-batch.test.ts lib/orchestration/run-weekly-cycle-for-client.test.ts lib/orchestration/run-weekly-cycle-live.test.ts lib/orchestration/start-weekly-cycle-live-cas.test.ts lib/orchestration/verify-cron-secret.test.ts lib/orchestration/weekly-cycle-idempotency-key.test.ts lib/orchestration/weekly-cycle-live-env.test.ts lib/orchestration/weekly-cycle-live.structural.test.ts lib/orchestration/weekly-cycle-outbox.test.ts lib/orchestration/weekly-cycle.test.ts lib/orchestration/weekly-cycle-step-runs.test.ts
```
→ `tests 203 / pass 203 / fail 0`, 37 suites.

**Full-repo suite — ran directly: 1200/1209 pass, 9 fail, spot-checked as pre-existing (not a `72c22a9` regression).** Ran all 101 `*.test.ts`/`*.test.tsx` files in the repo via `npx tsx --test`: `tests 1209 / pass 1200 / fail 9`, matching the commit's claim exactly. The 9 failures (`markCalendarSlotPublishedCore`, `getReelCostRollupForScript`, `deleteAvatarReferenceAsset`, `closed write surface + migration`, `Preferencias upsert never writes consent ledger`, `upsertVisualPreferences action (isolated)`, plus 3 nested cases under `mark-calendar-slot-published.test.ts`/`get-reel-cost-rollup-for-script.test.ts`/`upsert-visual-preferences.test.ts`) all live in `lib/calendar/`, `lib/cost-policy/`, `lib/visual-preferences/`, `lib/media/`, `lib/qa/` — none touch `lib/orchestration/**`. Did not trust the "pre-existing test-pollution" claim on its face — instead of only diffing against `git stash`, created a disposable `git worktree` at `72c22a9~1` (= `4da9761`, the pre-H2-fix HEAD) and ran the identical full 101-file glob there: `tests 1207 / pass 1198 / fail 9`, with the **exact same 9 test names** failing (confirmed via `diff` of the `✖`-prefixed lines from both runs — byte-identical failure set). The only difference between the two runs is `1209` vs `1207` tests, `1200` vs `1198` pass — exactly the 2 new H2 regression tests added by `72c22a9`, both of which pass. This confirms the failures are genuine pre-existing cross-file pollution, unrelated to and unaffected by `72c22a9`. Worktree removed after the check.

**5. `npx tsc --noEmit -p tsconfig.json` — ran directly: 315 `error TS` lines, zero in the touched files.** `grep "resume-weekly-cycle-run\|advance-weekly-cycle-slot"` against the full `tsc` output returns nothing. `315` matches the baseline this story's prior VALIDATE passes have independently confirmed (see the `60de5f6` section above, which diffed `315` against a disposable worktree at `cb218ec`). Given `72c22a9` only adds a type import (`WeeklyCycleStepRunRow`) already exported by `weekly-cycle-step-runs.ts` and purely-additive logic that type-checks clean, and the touched-file grep is empty, this is **zero new errors**.

**6. H1 reopening check — traced the `primary_video → tts` boundary concretely; H1 is not reopened.** Scenario: `primary_video` job completes at the provider while the kill switch is off. `resumeWeeklyCycleFromJob`'s `PAUSED_LIVE_DISABLED` branch (`resume-weekly-cycle-from-job.ts:110-128`) marks that step_run `"completed"` (the real, already-paid-for outcome) and pauses the run — it does **not** call `advanceWeeklyCycleSlot`, so no `tts` row exists yet. On Operator resume, `stalledCompletedSlots` picks up this slot's latest row (`step: "primary_video"`, `status: "completed"`) and calls `advanceWeeklyCycleSlot({ ..., fromStep: "primary_video" })`. Inside, `nextStepAfter("primary_video", script)` returns `"tts"` — strictly the *next* step, never `"primary_video"` again (the scan starts at `indexOf(step) + 1`). `createOrGetReadyStepRun` for `(slot, "tts", attempt: 1)` is a fresh insert (no prior `tts` row for this slot could exist, by the same chain-sequencing argument as point 1) — so this dispatches a step that was never previously attempted, not a re-dispatch of `primary_video`. `primary_video`'s own step_run row is never touched, re-created, or re-submitted to the outbox by this or any other code path in the diff. No double-spend, no re-pay — H1's guarantee (the already-completed, already-paid-for step is never rebuilt) is preserved intact while H2's new behavior only ever moves the chain forward past it.

### Minor, non-blocking observation (not raised by QA, found during this pass)

`latestRowBySlot` (`resume-weekly-cycle-run.ts:99-102`) relies on `listStepRunsForRun`'s `ORDER BY created_at ASC` (`weekly-cycle-step-runs.ts:141-152`) plus `Map.set` "last write wins" to pick the latest row per slot. Postgres does not guarantee row order for `created_at` ties without a secondary sort key (e.g. `id`), so two step_run rows for the same slot inserted within the same timestamp tick could theoretically be returned in either order, and the wrong one could be treated as "latest." In practice `created_at` is a `timestamptz` with microsecond precision and this pipeline never batch-inserts multiple rows for the same slot in a single statement, so this is a low-likelihood, pre-existing ordering pattern (the same `listStepRunsForRun` call is already relied on by the untouched `retryableFailed` filter) rather than a defect introduced by `72c22a9`. Not blocking; worth a `.order("created_at").order("id")` tiebreaker as a future hardening pass if the team wants to close the theoretical gap.

### Gaps (what blocks PASS)

None. H2 is genuinely closed: the fix's core claims (disjoint loops, correct `fromStep` contract usage, correct latest-row selection, no H1 regression) all independently verified by reading the implementation and its true callee, not just the diff and commit message. All reported test/typecheck numbers were reproduced by direct execution, including the full-repo 9-failure claim, which was cross-checked against a disposable pre-fix worktree rather than taken on faith.

### Scope Creep

None found. The diff is exactly the continuation loop plus its three regression tests; no unrelated files touched.

### Recommended Next Actions

1. **qa-engineer**: re-review `72c22a9` against the High finding from `QA.md`/`4da9761`. This validator's independent read is that it is genuinely closed, including the double-advance and H1-reopening risks QA would reasonably probe for.
2. **product-owner**: on QA's sign-off, this closes both H1 (`60de5f6`) and H2 (`72c22a9`) for the kill-switch pause/resume feature — ready for CLOSE/merge from this validator's side.
3. Optional, non-blocking: add a `created_at, id` composite ordering tiebreaker to `listStepRunsForRun` per the minor observation above, and consider a follow-up regression test using two step_run rows sharing an identical `created_at` to lock in "true latest wins" deterministically. Neither blocks this PASS.
