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
