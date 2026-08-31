# QA Report — US-15.1 Phase A

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
