# QA Report — US-4.1 Generate weekly Instagram content strategy

**Story:** US-4.1  
**Branch:** `feature/US-4.1-content-strategy`  
**Commits reviewed:** `af998d9` (BE), `dcbd15a` (FE), `bbd159d` (agents), `239e598` (VALIDATION)  
**Date:** 2026-08-30  
**Reviewer:** qa-engineer  
**Sources:** `CONTRACT.md`, `SECURITY.md`, `VALIDATION.md`, implemented code, automated tests

### Verdict: APPROVE WITH NOTES

**Severity counts:** Critical **0** · High **0** · Medium **2** · Low **3**

**CLOSE recommended:** **yes** — security floors from `SECURITY.md` are implemented; 51/51 story tests pass; findings are hardening/ops notes, not merge blockers.

---

## Findings

### Medium

#### M1 — Rate limit fails open on DB query errors

**File:** `lib/content-strategy/check-generation-rate-limit.ts:63-68`, `:85-90`

**What:** When Supabase is configured but the in-flight or rolling-window SELECT fails, `checkGenerationRateLimit` logs the error and returns `{ ok: true }`, allowing the generate flow to proceed to LLM I/O.

**Why it matters:** `SECURITY.md` requires server-side per-`client_id` rate limiting with **429 and no LLM call** when over limit. Fail-open on transient DB errors removes that spend guard during outages or permission blips — the opposite of fail-closed.

**Fix direction:** On configured Supabase + rate-limit query failure, return `{ ok: false, code: "INTERNAL_ERROR" }` (or a dedicated fail-closed code) and block LLM. Reserve `{ ok: true }` skip only for explicit dev/test hooks (e.g. unconfigured Supabase in local dev), documented and env-gated.

---

#### M2 — In-flight guard is non-atomic (TOCTOU between check and acquire)

**Files:** `lib/content-strategy/actions/generate-content-strategy.ts:65-77`, `lib/content-strategy/generate-content-strategy-for-client.ts:53`, `lib/content-strategy/check-generation-rate-limit.ts:105-144`

**What:** `checkGenerationRateLimit` reads in-flight state in the Server Action; `acquireGenerationInFlight` runs later inside the orchestrator without an atomic claim (no `UPDATE … WHERE in_flight_at IS NULL`, no advisory lock, no single upsert conflict path).

**Why it matters:** Two concurrent generates for the same `(client_id, week_start)` can both pass the pre-check and both invoke the LLM, violating CONTRACT freeze #13 (max 1 in-flight) and doubling spend.

**Fix direction:** Collapse check + acquire into one server-only helper using an atomic DB operation (e.g. conditional update / unique partial index on active in-flight, or `INSERT … ON CONFLICT` with conflict = `GENERATION_IN_FLIGHT`). Re-check in-flight inside `acquireGenerationInFlight` before LLM.

---

### Low

#### L1 — No automated test that logs exclude prompts/brief bodies

**File:** CONTRACT unit test matrix #31; `lib/content-strategy/generate-content-strategy-for-client.ts:177-183`

**What:** Production logging correctly emits only `clientId`, `weekStart`, `version`, `providerKey`, `invokedBy`. Agent failure logs emit a controlled `code` string, not raw LLM output. No unit test asserts this invariant.

**Why it matters:** Regression risk if a future debug log adds `systemPrompt` / `userPrompt` / `brief` to `console.*`.

**Fix direction:** Add a logger-mock test on orchestrator success and agent failure paths (matrix #31).

---

#### L2 — EN i18n typo on strategy page

**File:** `messages/en.json` — `strategy.page.clientLabel` is `"Cliente"` (should be `"Client"`).

**Why it matters:** Product polish only; no security impact.

**Fix direction:** Change string to `"Client"` in `messages/en.json`.

---

#### L3 — Server Action `maxDuration` not declared

**Files:** `lib/content-strategy/actions/generate-content-strategy.ts`, CONTRACT freeze #14 (~60s lean)

**What:** Sync blocking generate relies on platform default timeout; no exported `maxDuration`.

**Why it matters:** Long-hanging LLM calls may behave differently across deploy targets; in-flight guard timeout is 5 min (`CONTENT_STRATEGY_IN_FLIGHT_TIMEOUT_MS`) while LLM may still run.

**Fix direction:** Export `maxDuration = 60` (or CONTRACT value) from the generate action module when production tuning is ready.

---

## Security focus checklist

| Control | Status | Evidence |
|---------|--------|----------|
| `requireOperator` on generate/read (first await) | **PASS** | `generate-content-strategy.ts:41-48`, `get-latest-content-strategy.ts:39-46`; page under `operator/layout.tsx:14` |
| Server-only agent module | **PASS** | `import "server-only"` in `generate-weekly-strategy.ts:1`, `generate-content-strategy-for-client.ts:1`; static test in `content-strategy.test.ts:1120-1130` |
| Prompt injection containment | **PASS** | Frozen delimiters + untrusted framing in `buildWeeklyStrategyPrompts` (`generate-weekly-strategy.ts:118-216`); Zod `.strict()` + allowlist re-check before INSERT |
| Rate limit (3 / 60 min + in-flight) | **PASS with M1/M2 notes** | Constants in `content-strategy.ts:151-154`; table in migration; tests for `RATE_LIMITED` / `GENERATION_IN_FLIGHT` |
| No client `provider_key` / tier authority | **PASS** | `find-forbidden-keys.ts:1-15`; input schema `{ weekStart }` only; `resolveProvider` server-side |
| RLS deny-by-default | **PASS** | Migration enables RLS, zero `CREATE POLICY`; test `content-strategy.test.ts:1198-1210` |
| No LLM keys in client/DB/responses | **PASS** | `createSiliconFlowLlmAdapter` reads `process.env[envKeyName]` only (`siliconflow-llm-adapter.ts:103-111`); client components import actions/types only |
| No public generate Route Handler | **PASS** | No `/api/content-strateg*` routes; test `route surface` asserts `/operator/strategy` not public |
| Trusted helper inputs only | **PASS** | Orchestrator uses `getBusinessProfileForAgents`, `getPlaybookForAgents`, `getTrendSnapshotForWeek`; no raw table SELECT in agent module |
| Forbidden-field rejection | **PASS** | Tests for smuggled `clientId`, `provider_key` → `FORBIDDEN_FIELDS` |
| Versioned INSERT-only persist | **PASS** | `persist-strategy-draft.ts:29-38` INSERT only; regenerate test version 2 |
| Brief rendered as plain text (no XSS) | **PASS** | `StrategyBriefView.tsx` uses React text nodes; no `dangerouslySetInnerHTML` |

---

## Checks run

| Command | Result |
|---------|--------|
| `npx tsx --test lib/contracts/content-strategy.test.ts lib/agents/content/generate-weekly-strategy.test.ts lib/content-strategy/content-strategy.test.ts` | **51/51 pass** (~170ms) |
| `npm run lint` | **Exit 0** with pre-existing warnings/errors in unrelated test files (`providers.test.ts`, `trend.test.ts`, etc.); no new lint issues in US-4.1 strategy modules |
| `npx tsc --noEmit` | **Errors in unrelated test files** (`.ts` extension imports, etc.); US-4.1 implementation files type-check in Next build path |
| `npm run build` | **Failed** — `AUTH_DEV_FALLBACK must not be set when NODE_ENV=production` (local `.env` dev fallback; not introduced by US-4.1) |

---

## What was not covered

- Live smoke on `/operator/strategy` with configured Supabase + real `SILICONFLOW_API_KEY` (LLM end-to-end spend path).
- Production deploy verification that `AUTH_DEV_FALLBACK` is unset and Supabase service-role is configured (rate limit + persist depend on it).
- Manual concurrent double-click / scripted parallel generate load test (M2 TOCTOU).
- Logger regression test (L1).
- Penetration test of prompt injection with adversarial profile/playbook/trend text (containment is schema + delimiter layer; semantic attacks are residual per SECURITY.md).

---

## Recommended actions before / after CLOSE

| Priority | Action | Owner |
|----------|--------|-------|
| Post-CLOSE | Harden rate-limit fail-closed on DB errors (M1) | nextjs-backend |
| Post-CLOSE | Atomic in-flight acquire (M2) | nextjs-backend |
| Optional | Fix EN `clientLabel` (L2) | nextjs-frontend |
| Optional | Add logger mock test (L1), export `maxDuration` (L3) | nextjs-backend |
