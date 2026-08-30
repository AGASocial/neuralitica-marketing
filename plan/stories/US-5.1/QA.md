# QA Report — US-5.1 Generate Reel script package per slot

**Story:** US-5.1  
**Branch:** `feature/US-5.1-reel-scripts`  
**Commits reviewed:** `a12cbc7` (agents), `aa1c13e` (BE), `18abc7e` (FE), `f387659` (VALIDATION)  
**Date:** 2026-08-29  
**Reviewer:** qa-engineer  
**Sources:** `plan/USER_STORIES.md` § US-5.1, `plan/stories/US-5.1/{SECURITY,CONTRACT,VALIDATION,TASKS}.md`, implemented code, automated tests

### Verdict: APPROVE WITH NOTES

**Severity counts:** Critical **0** · High **0** · Medium **3** · Low **3**

**CLOSE recommended:** **yes** — `SECURITY.md` floors for operator gate, approved-strategy verification, forbidden authority fields, Zod-before-persist, server-injected `must_disclose_not_owner`, catalog provider resolution, RLS deny-by-default, and `strategyHasScripts` lock handoff are implemented and tested; 47/47 story tests pass; findings are hardening/CONTRACT-alignment notes, not merge blockers.

---

## Findings

### Medium

#### M1 — Rate limit fails open on DB query errors

**File:** `lib/reel-scripts/check-script-generation-rate-limit.ts:75-80`, `:97-102`

**What:** When Supabase is configured but the in-flight or rolling-window SELECT fails, `checkScriptGenerationRateLimit` logs the error and returns `{ ok: true }`, allowing generate/regen to proceed to LLM I/O.

**Why it matters:** `SECURITY.md` requires per-`client_id` server rate limiting with **429 and no LLM call** when over limit. Fail-open during DB outages removes the spend guard — opposite of fail-closed. Same pattern as US-4.1 QA M1.

**Fix direction:** On configured Supabase + rate-limit query failure, return fail-closed (block LLM). Reserve `{ ok: true }` skip only for explicit unconfigured-Supabase dev hooks.

---

#### M2 — In-flight guard is non-atomic (TOCTOU between check and acquire)

**Files:** `lib/reel-scripts/actions/generate-reel-scripts.ts:74-91`, `lib/reel-scripts/actions/regenerate-reel-script-slot.ts:72-95`, `lib/reel-scripts/generate-reel-scripts-for-client.ts:139`, `lib/reel-scripts/check-script-generation-rate-limit.ts:117-157`

**What:** `checkScriptGenerationRateLimit` runs in the Server Action; `acquireScriptGenerationInFlight` runs later inside the orchestrator without an atomic claim (no conditional update, advisory lock, or conflict path).

**Why it matters:** Two concurrent batch generates for the same `(client_id, strategy_id)` can both pass the pre-check and both invoke LLM, violating CONTRACT freeze #16 (max 1 in-flight batch) and doubling spend. Same pattern as US-4.1 QA M2.

**Fix direction:** Collapse check + acquire into one server-only helper with an atomic DB operation; re-check in-flight immediately before LLM.

---

#### M3 — Batch persist is not transactional (CONTRACT freeze #9 partial gap)

**File:** `lib/reel-scripts/generate-reel-scripts-for-client.ts:226-282`

**What:** Batch flow validates all LLM outputs in memory (good), then UPSERTs slots sequentially in a loop. There is no Postgres transaction or compensating rollback if a mid-batch `persistReelScript` fails after earlier slots succeeded.

**Why it matters:** CONTRACT requires batch atomicity — all slots UPSERT or none on failure. Validation failures are correctly handled (test: slot 2 invalid → no UPSERT). A transient DB error on slot 3 after slots 0–2 persist would leave orphaned partial scripts and consumed LLM budget.

**Fix direction:** Wrap batch UPSERTs in a single transaction (or delete-on-failure compensating rollback). Add test for mid-batch persist failure → zero net new rows.

---

### Low

#### L1 — No automated IDOR / cross-tenant test

**Files:** CONTRACT unit test matrix #27; `lib/reel-scripts/persist-reel-script.ts:138-152` (read scoped by `client_id`)

**What:** List and persist paths correctly filter by server-resolved `clientId`. Implementation matches CONTRACT; automated test matrix item #27 (foreign week/tenant) is not present in `lib/reel-scripts/reel-scripts.test.ts`.

**Why it matters:** Regression risk on refactors to list/load helpers.

**Fix direction:** Add test asserting foreign-tenant strategy/week returns empty or uniform 404 with no script field leak.

---

#### L2 — Server Action `maxDuration` not declared

**Files:** `lib/reel-scripts/actions/generate-reel-scripts.ts`, CONTRACT freeze #17 (lean **120s** batch)

**What:** Sync blocking batch generate relies on platform default timeout; no exported `maxDuration`.

**Why it matters:** Multi-slot LLM batch may behave differently across deploy targets; in-flight guard timeout is 5 min while action may time out earlier.

**Fix direction:** Export `maxDuration = 120` from generate action when production tuning is ready.

---

#### L3 — No automated test that logs exclude prompts / script bodies

**Files:** `lib/reel-scripts/generate-reel-scripts-for-client.ts:286-294`, `:239-245`; CONTRACT logging freeze #21

**What:** Production logging correctly emits only `clientId`, `strategyId`, `weekStart`, `mode`, `slotCount`, `providerKey`, `invokedBy`, and error codes — never full prompts or script text. No unit test asserts this invariant.

**Why it matters:** Regression risk if a future debug log adds LLM prompts or package fields to `console.*`.

**Fix direction:** Add logger-mock test on orchestrator success and agent failure paths.

---

## Security Focus Review

| Focus area | Status | Evidence |
|------------|--------|----------|
| Approved strategy gate | **PASS** | Actions call `getApprovedStrategyForWeek`; orchestrator re-verifies via `loadApprovedStrategyForScriptJob` with `status = 'approved'` + `client_id` (`load-approved-strategy-for-script-job.ts:34-40`; `generate-reel-scripts-for-client.ts:192-198`). Draft/missing → `STRATEGY_NOT_APPROVED`, no LLM (tests). |
| `must_disclose_not_owner` server injection | **PASS** | Computed per-slot in orchestrator (`generate-reel-scripts-for-client.ts:69-71`); persisted from server param only (`persist-reel-script.ts:40`). Request `mustDiscloseNotOwner` → `FORBIDDEN_FIELDS`. Tests: generic_avatar true; faceless false when profile flag true. |
| Schema validation before persist | **PASS** | `reelScriptPackageSchema.strict()` in orchestrator before UPSERT (`generate-reel-scripts-for-client.ts:252-258`); double-check in `persistReelScript`. Invalid LLM output → `SCRIPT_OUTPUT_INVALID`, no UPSERT. |
| `requireOperator` gate | **PASS** | `requireOperator("handler")` first on generate, regen, read actions. Operator layout `requireOperator("page")` on `/operator/scripts`. Non-operator → 403, no LLM (tests). |
| `strategyHasScripts` lock | **PASS** | Real EXISTS query (`strategy-has-scripts.ts:17-20`). US-4.2 `updateContentStrategyBrief` / `approveContentStrategy` consume it. Tests: false before insert, true after. |
| No client `provider_key` | **PASS** | Forbidden keys include `providerKey`/`provider_key`/`tier` (`find-forbidden-keys.ts:6-10`). Provider resolved server-side via catalog + `resolveProvider({ assetRole: "llm", llmVariant: "fallback" })` (`generate-reel-scripts-for-client.ts:173-179`). FE sends `{ weekStart }` / `{ weekStart, slotIndex }` only. No `@supabase` in `components/scripts/*`. Agent module `import "server-only"`. RLS enabled, zero policies on `neuramark_reel_scripts`. Script text rendered as React text nodes — no `dangerouslySetInnerHTML`. |

---

## Checks Run

| Command | Result |
|---------|--------|
| `npx tsx --test lib/reel-scripts/reel-scripts.test.ts lib/agents/content/generate-reel-script.test.ts` | **47/47 pass** |
| `npm run lint` | **Pre-existing failures** in test files (`@typescript-eslint/no-require-imports` in `lib/reel-scripts/reel-scripts.test.ts` and other `*.test.ts`); not introduced by US-5.1 logic paths |
| `npm run build` | **Failed** — `AUTH_DEV_FALLBACK must not be set when NODE_ENV=production` (local `.env` dev flag; not US-5.1 code defect). Type-check phase inside build reported compile success before page-data collection failed |

---

## What Was Not Covered

- Manual browser E2E on `/operator/scripts` (generate, regen, copy, week picker, EN/ES strings).
- Production deploy with real SiliconFlow LLM adapter and live Supabase migration applied.
- System/cron path `invokedBy: "system"` — correctly deferred per CONTRACT; orchestrator signature exists but no caller in BUILD.
- Full-repo lint clean (pre-existing test-file require() pattern across stories).
- Production build with dev auth flags stripped (Vercel env expected to omit `AUTH_DEV_FALLBACK`).

---

## Recommended Action

**APPROVE WITH NOTES.** Proceed to **CLOSE** — security acceptance criteria from `SECURITY.md` are satisfied; Medium findings mirror inherited US-4.1 rate-limit patterns plus batch transaction alignment; Low findings are test-coverage and ops polish.
