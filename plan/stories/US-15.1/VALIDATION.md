## Validation Report — US-15.1 Phase A

### Verdict: FAIL

The Phase A implementation has the intended plan-only architecture, but it does not satisfy the frozen validation contract. The required behavioral test matrix is largely absent, including the binding security requirement to mock or spy the spend modules and assert zero calls. In addition, GET and POST are not identical at the forbidden-field gate: only POST bodies are parsed, so a GET request carrying a forbidden JSON body reaches the batch runner.

**Implementation commits reviewed:** `54bfdbc`, `8828f73`

**Scope validated:** Phase A only; Phase B live orchestration, Operator trigger, and UI are deferred.

### Acceptance Criteria

| Criterion | Status | Evidence |
|---|---|---|
| Vercel Cron invokes `GET/POST /api/cron/weekly-cycle` with `Authorization: Bearer ${CRON_SECRET}`; missing/invalid secret → 401; no browser/Cliente exposure | **PASS WITH NOTES** | Schedule and path are correct in `vercel.json:1-5`. The route exports GET and POST, is dynamic, and sets `no-store` (`app/api/cron/weekly-cycle/route.ts:6-8,26-27`). Authentication is the first operation (`route.ts:10-12`); verification accepts Bearer only, hashes both values with SHA-256, and uses `timingSafeEqual` (`lib/orchestration/verify-cron-secret.ts:9-27`). Missing/wrong auth returns 401, while missing production config correctly returns the frozen 503. No Phase A manual action or Operator/Cliente UI was found. **Note:** the required valid/invalid/missing/prod-unset route/auth behavioral tests do not exist.
| Runner enumerates active clients with profile + visual mode; skips ineligible clients with reason | **PASS WITH NOTES** | Server-only enumeration filters `neuramark_clients.active = true` and orders results (`lib/orchestration/list-eligible-clients-for-weekly-cycle.ts:1,15-22`), then classifies missing/load-failed profile and missing visual mode (`:25-34`). Skipped entries are returned before eligible clients are processed (`lib/orchestration/run-weekly-cycle-batch.ts:14-24`) and therefore receive no ledger row. **Note:** no behavioral eligibility tests exist; the frozen minimum explicitly requires eligible, missing-profile, and inactive coverage.
| Canonical ISO Monday `weekStart`; same client/week is idempotent without duplicate spend; dry-run may re-plan | **PASS WITH NOTES** | Server authority uses the shared ISO Monday normalizer and schema (`lib/orchestration/resolve-week-start-for-cycle.ts:1-6`), and the route does not read caller `weekStart` (`route.ts:21-22`). The migration enforces unique `(client_id, week_start)` (`supabase/migrations/20260831110000_neuramark_weekly_cycle_runs.sql:3-20`). Acquire uses conflict-ignore insert followed by lookup of the existing row (`lib/orchestration/acquire-weekly-cycle-run.ts:15-32`), and re-runs update the same row's plan (`lib/orchestration/run-weekly-cycle-for-client.ts:15-18`; `persist-weekly-cycle-run-plan.ts:6-9`). **Note:** no first/second/concurrent acquire behavioral test proves the frozen semantics.
| `dryRun: true` executes eligibility + ordered 10-step plan only, with no spend side effects, and returns a structured plan | **FAIL** | The route hard-codes `dryRun: true` (`route.ts:22`); planner order and refs match the frozen contract (`lib/contracts/weekly-cycle.ts:10-21`; `lib/orchestration/plan-weekly-cycle-steps.ts:13-22`). The per-client runner has no spend imports and rejects non-true `dryRun` (`lib/orchestration/run-weekly-cycle-for-client.ts:1-18`). However, SECURITY's binding test requirement says tests must **mock or spy spend modules and assert zero calls**. The only spend test reads source text and checks substrings (`lib/orchestration/weekly-cycle.test.ts:13-19`); it never executes the runner and never asserts zero calls. No test verifies plan persistence, re-plan behavior, or the runtime dry-run guard. This is a CLOSE blocker.
| [SEC] Cron Route Handler is sole HTTP entry; orchestration is server-only; forbidden request fields rejected; no untrusted client authority | **FAIL** | The inspected orchestration modules use `import "server-only"` (`lib/orchestration/*.ts`, except the contract-designated pure resolver), and no alternate weekly-cycle HTTP/action entry was found. POST top-level forbidden fields are rejected (`route.ts:14-21`; `lib/contracts/weekly-cycle.ts:118-152`). But the shared handler only parses a body when `request.method === "POST"` (`route.ts:14-20`), despite GET/POST being frozen as aliases with identical auth and batch behavior. A GET request with a JSON body containing `clientId`, `weekStart`, or `dryRun` bypasses the forbidden-field gate and executes the batch. There is also no route test proving forbidden-field rejection or zero DB calls after auth failure.

### Binding SECURITY / CONTRACT Conditions

| Area | Status | Evidence / finding |
|---|---|---|
| Auth order, Bearer-only secret, timing-safe fixed-length compare, prod fail-closed, secret hygiene | **PASS (static)** | `app/api/cron/weekly-cycle/route.ts:10-12`; `lib/orchestration/verify-cron-secret.ts:9-27`. No logging of the secret/header was found. Runtime coverage required by CONTRACT is absent.
| Phase A structural spend block and production plan-only precedence | **PASS (static)** | Route hard-codes `dryRun: true` (`route.ts:22`); per-client imports are limited to acquire/persist/planner (`run-weekly-cycle-for-client.ts:1-5`) and runtime rejects false (`:12-14`). No live spend modules, dynamic imports, provider adapters, new agents, FFmpeg, or worker enqueue were added.
| Dry-run zero-call proof | **FAIL — blocker** | Required mock/spy zero-call assertion is absent; `lib/orchestration/weekly-cycle.test.ts:13-19` is only a source-string grep.
| Server-only enumeration, eligibility, no ledger row for skipped clients | **PASS (static), untested** | `list-eligible-clients-for-weekly-cycle.ts:15-35`; `run-weekly-cycle-batch.ts:14-24`.
| Unique ledger, concurrent acquire, re-plan existing row | **PASS (static), untested** | Unique constraint at migration `:16-19`; conflict-ignore acquire at `acquire-weekly-cycle-run.ts:17-31`; re-plan update at `persist-weekly-cycle-run-plan.ts:6-9`. The frozen first/second/concurrent behavior has no executable test.
| Server-authoritative ISO Monday | **PASS** | `resolve-week-start-for-cycle.ts:1-6`; route `:22`. Query parameters are not consulted.
| Forbidden request fields | **FAIL — blocker** | POST is guarded, but GET bodies are never parsed (`route.ts:14-21`), contrary to the frozen GET/POST alias behavior and the binding requirement that presence of forbidden authority fields returns 400.
| Ledger RLS and zero policies | **PASS** | RLS enabled with no policy declarations in the new migration (`supabase/migrations/20260831110000_neuramark_weekly_cycle_runs.sql:34-35`). All new object names use `neuramark_`.
| Minimal response and cache behavior | **PASS** | Batch response contains counts plus minimal per-client variants (`run-weekly-cycle-batch.ts:7-24`); route returns no full profile/step log and sets `Cache-Control: no-store` (`route.ts:8,23`).
| Phase A scope / no-spend | **PASS** | No manual trigger, Operator UI, Cliente UI, IG publish, new agent/provider adapter, or live pipeline wiring appears in commits `54bfdbc` / `8828f73`.

### Convention Compliance

- Backend-only Phase A: no localization or PrimeReact work is required.
- Supabase access remains server-side; the cron route has a concrete Vercel Cron consumer.
- Database objects follow the `neuramark_` prefix and are delivered through a migration.
- No browser Supabase SDK usage, client-side tokens, or current-user/session bypass was introduced.

### Test Results

| Command | Result |
|---|---|
| `npx tsx --test lib/contracts/weekly-cycle.test.ts lib/orchestration/weekly-cycle.test.ts` | **7 passed, 0 failed**. These cover schemas, forbidden-key helper, resolver source shape, server-only markers, and source-level spend-import absence. |
| `npx tsc --noEmit` | **Failed due to broad pre-existing repository test/type errors** outside US-15.1. No US-15.1 file appeared in the reported diagnostics; this command is not a clean story-level signal. |

The frozen Phase A minimum test matrix is not implemented: no `verify-cron-secret.test.ts`, cron route test, eligibility test, acquire/idempotency test, or executable per-client runner test exists.

### Gaps (what blocks PASS)

1. **nextjs-backend:** make GET and POST apply the same forbidden-body-field gate, or explicitly reject GET bodies before batch execution. Add a route regression test showing forbidden GET/POST authority fields return 400 and do not call the batch.
2. **nextjs-backend / integrations-engineer:** implement the frozen behavioral suites for auth (valid, missing, wrong, production unset, no DB/batch after auth failure), eligibility, first/second acquire, concurrent idempotency, per-client plan persistence/re-plan, and forbidden fields.
3. **integrations-engineer:** replace or supplement the source grep with an executable dry-run test that mocks/spies the named spend seams and asserts zero calls, as required by SECURITY. Keep the structural grep as defense in depth.

### Scope Creep

None found in commits `54bfdbc` and `8828f73`.

### Recommended Next Actions (and which agent should take them)

Return to **BUILD/FIX** with `nextjs-backend` for the route/auth/idempotency test matrix and GET forbidden-field fix, plus `integrations-engineer` for executable eligibility/runner/zero-spend tests. After an atomic fix commit, rerun **requirements-validator**. Do not advance to QA or Phase B while these Phase A blockers remain.
