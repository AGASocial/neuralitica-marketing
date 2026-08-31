## Validation Report — US-15.1 Phase A

### Verdict: PASS WITH NOTES

Phase A now satisfies all five acceptance criteria and the binding Phase A conditions in `SPEC-REVIEW.md`, `SECURITY.md`, and the frozen `CONTRACT.md`. Fix commit `2658713` closes the three blockers from the initial validation (`29ebe97`): GET and POST now share forbidden-field handling, the frozen behavioral test matrix is present, and dry-run/idempotency behavior is exercised with zero-call assertions plus the structural no-spend import guard.

**Implementation commits reviewed:** `54bfdbc`, `8828f73`, `2658713`

**Validation history:** initial verdict **FAIL** at `29ebe97`; re-validation after fixes is **PASS WITH NOTES**.

**Scope:** Phase A only. Phase B live orchestration, Operator manual trigger, partial-failure live log, and UI remain deferred.

### Acceptance Criteria

| Criterion | Status | Evidence |
|---|---|---|
| Vercel Cron invokes `GET/POST /api/cron/weekly-cycle` with Bearer `CRON_SECRET`; invalid/missing → 401; no browser/Cliente exposure | **PASS** | `vercel.json:1-5` freezes Monday 06:00 UTC and the correct path. The route exports GET/POST aliases, `force-dynamic`, Node runtime, and `no-store` (`app/api/cron/weekly-cycle/route.ts:6-8,22-40`). Auth is the first action (`:26-27`). SHA-256 fixed-length digests and `timingSafeEqual` are used (`lib/orchestration/verify-cron-secret.ts:9-27`). Runtime tests cover valid, missing, wrong, and production-unset secret (`verify-cron-secret.test.ts:20-34`) and prove auth failure never invokes batch (`route.test.ts:32-46`). No alternate HTTP action or Phase A FE trigger was found. |
| Enumerates active clients; profile + visual mode gate; ineligible clients skipped with reason | **PASS** | Server-only query filters `active = true` (`lib/orchestration/list-eligible-clients-for-weekly-cycle.ts:25-34`), defensively rejects inactive rows, then checks profile existence/load failure and visual mode (`:36-50`). Batch maps skipped entries before processing eligible clients, so skipped clients get no ledger row (`run-weekly-cycle-batch.ts:13-24`). Tests cover eligible, missing-profile, and inactive classification (`list-eligible-clients-for-weekly-cycle.test.ts:12-28`). |
| Canonical ISO Monday `weekStart`; same client/week idempotent; dry-run may re-plan | **PASS** | Server week authority uses shared `normalizeToIsoMonday` plus schema (`resolve-week-start-for-cycle.ts:1-6`); the route does not consume caller week authority (`route.ts:29-35`). Migration uniquely constrains `(client_id, week_start)` (`supabase/migrations/20260831110000_neuramark_weekly_cycle_runs.sql:3-20`). Acquire performs conflict-ignore insert then existing-row lookup (`acquire-weekly-cycle-run.ts:15-35`). Tests prove first/second acquire and one winner across eight concurrent calls (`acquire-weekly-cycle-run.test.ts:41-62`). Runner test proves the same row plan is persisted/refreshed on CREATED and ALREADY_EXISTS (`run-weekly-cycle-for-client.test.ts:26-45`). |
| `dryRun: true` executes eligibility + ordered 10-step plan only, no spend side effects, structured per-client plan | **PASS** | Route hard-codes `dryRun: true` (`route.ts:35`); planner defines the frozen ten-step order and string refs (`lib/contracts/weekly-cycle.ts:10-21`; `plan-weekly-cycle-steps.ts:13-22`). The runner has only acquire/persist/planner imports and rejects false before dependencies run (`run-weekly-cycle-for-client.ts:1-5,24-35`). Tests execute create/re-plan, persist twice, assert ten spend-seam spies remain at zero calls, and prove `dryRun: false` triggers no dependency (`run-weekly-cycle-for-client.test.ts:14-58`). Structural grep additionally forbids all frozen spend import families (`weekly-cycle.test.ts:13-19`). |
| [SEC] Cron is sole System-cycle HTTP entry; server-only orchestration; forbidden request fields rejected; no untrusted client authority | **PASS** | All non-pure orchestration modules carry `import "server-only"`; the pure week resolver is the frozen exception (`weekly-cycle.test.ts:21-31`). The shared handler reads the body for both aliases and rejects frozen forbidden keys before resolving week or running batch (`route.ts:29-35`). Regression tests prove GET and POST forbidden bodies return 400 with zero batch calls (`route.test.ts:48-59`). Cron target selection remains exclusively server enumeration; no Phase A manual action or other weekly-cycle route exists. |

### Binding SECURITY / CONTRACT Conditions

| Area | Status | Evidence |
|---|---|---|
| Auth order, Bearer-only secret, fixed-length timing-safe compare, prod fail-closed, session cannot bypass | **PASS** | `route.ts:26-27`; `verify-cron-secret.ts:9-27`; runtime coverage at `verify-cron-secret.test.ts:20-34` and `route.test.ts:32-46`. |
| Secret hygiene, logging redaction, minimal errors | **PASS** | No secret/header logging or response exposure exists; errors are frozen minimal envelopes. No query, cookie, `x-cron-secret`, or session bypass is implemented. |
| Structural Phase A spend block and production dry-run precedence | **PASS** | Route hard-codes true (`route.ts:35`); runner type/runtime guard at `run-weekly-cycle-for-client.ts:7,28`; imports at `:1-5` contain no spend module. Source guard covers all forbidden families (`weekly-cycle.test.ts:13-19`). |
| Executable zero-spend proof | **PASS** | Runner test executes both first-run and re-plan paths, asserts all ten named spend spies have zero calls, and rejects false before injected dependencies (`run-weekly-cycle-for-client.test.ts:14-58`). Together with structural import exclusion, Phase A has no reachable spend seam. |
| Server enumeration, eligibility, sequential processing, skipped clients without ledger rows | **PASS** | Eligibility `:25-51`; sequential `for ... of` batch at `run-weekly-cycle-batch.ts:18-23`; eligibility test `:12-28`. |
| Unique ledger, concurrent acquire, existing-row re-plan | **PASS** | Migration `:16-19`; acquire `:20-35`; concurrency test `acquire-weekly-cycle-run.test.ts:41-62`; persist/re-plan test `run-weekly-cycle-for-client.test.ts:26-45`. |
| Server-authoritative ISO Monday; caller week ignored/rejected | **PASS** | Resolver `:1-6`; route `:29-35`; frozen forbidden-key contract `lib/contracts/weekly-cycle.ts:118-152`. |
| Forbidden request fields for GET and POST | **PASS** | Shared body parse and gate at `route.ts:29-35`; both-method regression at `route.test.ts:48-59`. |
| RLS enabled, zero policies, prefixed schema | **PASS** | Migration `supabase/migrations/20260831110000_neuramark_weekly_cycle_runs.sql:3-35` contains the prefixed table/index/constraint names, enables RLS, and defines no policies. |
| Response minimalism and no-store | **PASS** | Minimal aggregate/client variants at `run-weekly-cycle-batch.ts:7-24`; `Cache-Control: no-store` at `route.ts:8,36`; no full profile or `step_log` in HTTP response. |
| No manual/browser trigger; no Phase B or out-of-scope work | **PASS** | Search found only the cron HTTP route and internal orchestration. No Operator/Cliente UI, manual action, IG publish, new agent/provider, FFmpeg, live spend wiring, or changes to existing production tables were added. |

### Convention Compliance

- Phase A is backend-only, so EN/ES and PrimeReact requirements do not apply yet.
- Supabase access and secrets remain server-side; the endpoint has the concrete Vercel Cron consumer.
- Database changes use a migration and `neuramark_` prefixes.
- No Client Component, browser Supabase SDK, browser token, or current-user/session shortcut was introduced.

### Test Results

```text
npx tsx --test \
  lib/contracts/weekly-cycle.test.ts \
  lib/orchestration/weekly-cycle.test.ts \
  lib/orchestration/verify-cron-secret.test.ts \
  app/api/cron/weekly-cycle/route.test.ts \
  lib/orchestration/list-eligible-clients-for-weekly-cycle.test.ts \
  lib/orchestration/acquire-weekly-cycle-run.test.ts \
  lib/orchestration/run-weekly-cycle-for-client.test.ts
```

Result: **17 passed, 0 failed** across **7 suites**.

Repository-wide `npx tsc --noEmit` was red during the initial validation because of broad pre-existing test/type errors outside US-15.1; no US-15.1 diagnostic appeared. The focused executable suite is green.

### Gaps

None blocking Phase A CLOSE.

### Notes

1. Tests use dependency injection/in-memory doubles rather than a live Supabase database. The DB unique constraint plus conflict-ignore code is present, and concurrency semantics are covered at the unit boundary; live migration/E2E verification remains an integration concern.
2. The zero-spend assertion uses named standalone spies while the stronger structural source test proves no spend module is imported. This combination satisfies the Phase A structural guard; Phase B must receive a new SECURITY/CONTRACT review before introducing actual spend dependencies.
3. Malformed JSON is treated as an empty body. The frozen contract specifies forbidden-key behavior but no malformed-JSON error, so this is non-blocking.

### Scope Creep

None found in `54bfdbc`, `8828f73`, or `2658713`.

### Recommended Next Actions

Advance to **Phase A QA**. On QA approval, the product-owner may CLOSE Phase A and check the five Phase A acceptance criteria. Before any Phase B BUILD, freeze the Phase B CONTRACT delta and obtain the required SECURITY review and FE signoff.
