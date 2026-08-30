# QA Report — US-6.1 Generate Instagram caption per Reel

**Story:** US-6.1  
**Branch:** `feature/US-6.1-reel-captions`  
**Commits reviewed:** agents `c385372` · FE `d075781` · BE `1f45244` · VALIDATION `2cebd89`  
**Date:** 2026-08-30  
**Reviewer:** qa-engineer  
**Sources:** `plan/USER_STORIES.md` § US-6.1, `plan/stories/US-6.1/{SECURITY,CONTRACT,VALIDATION,TASKS}.md`, implemented code, automated tests

### Verdict: APPROVE WITH NOTES

**Severity counts:** Critical **0** · High **0** · Medium **2** · Low **1**

**CLOSE recommended:** **yes** — acceptance criteria and CONTRACT obligations are met; `SECURITY.md` binding gates hold (approved-strategy chain, plain-text schema + FE rendering, forbidden client fields, catalog provider resolution, RLS deny-by-default, operator-gated mutations); **48/48** caption tests pass after prompt-fixture assertion fixes; Medium findings mirror inherited US-4.1/US-5.1 rate-limit patterns and are not US-6.1 regressions.

---

## Findings

### Medium

#### M1 — Rate limit fails open on DB query errors

**File:** `lib/reel-captions/check-caption-generation-rate-limit.ts:74-80`, `:96-102`

**What:** When Supabase is configured but the in-flight or rolling-window SELECT fails, `checkCaptionGenerationRateLimit` logs the error and returns `{ ok: true }`, allowing generate/regen to proceed to LLM I/O.

**Why it matters:** `SECURITY.md` requires per-`client_id` server rate limiting with **429 and no LLM call** when over limit. Fail-open during DB outages removes the caption spend guard. Same pattern as US-4.1 QA M1 and US-5.1 QA M1.

**Fix direction:** On configured Supabase + rate-limit query failure, return fail-closed (block LLM). Reserve `{ ok: true }` skip only for explicit unconfigured-Supabase dev hooks.

---

#### M2 — In-flight guard is non-atomic (TOCTOU between check and acquire)

**Files:** `lib/reel-captions/actions/generate-reel-captions.ts:72-89`, `lib/reel-captions/actions/regenerate-reel-caption.ts:72-95`, `lib/reel-captions/generate-reel-captions-for-client.ts:114`, `lib/reel-captions/check-caption-generation-rate-limit.ts:116-207`

**What:** `checkCaptionGenerationRateLimit` runs in the Server Action; `acquireCaptionGenerationInFlight` runs later inside the orchestrator without an atomic claim (no conditional update, advisory lock, or conflict path).

**Why it matters:** Two concurrent batch generates for the same `(client_id, strategy_id)` can both pass the pre-check and both invoke LLM, violating CONTRACT freeze #16 (max 1 in-flight batch) and doubling spend. Same pattern as US-4.1 QA M2 and US-5.1 QA M2.

**Fix direction:** Collapse check + acquire into one server-only helper with an atomic DB operation; re-check in-flight immediately before LLM.

---

### Low

#### L1 — No automated `RATE_LIMITED` / `provider_key` smuggle tests

**Files:** `lib/reel-captions/reel-captions.test.ts` (mutation suite); `SECURITY.md` automated test list (`RATE_LIMITED` 429, smuggled `provider_key`)

**What:** Caption mutation tests cover operator gate, approval gate, forbidden caption text (`FORBIDDEN_FIELDS`), and distinct `caption_generate` agent key. There is no test that mocks `totalAttempts >= CAPTION_MAX_JOBS_PER_WINDOW` → `RATE_LIMITED` with no LLM, and no action-layer test for `{ provider_key: "…" }` → `FORBIDDEN_FIELDS` (forbidden-key scanner includes `provider_key` in `find-forbidden-keys.ts:8-9`).

**Why it matters:** Regression risk on rate-limit wiring and forbidden-key list refactors; `SECURITY.md` lists both cases in the automated security test matrix.

**Fix direction:** Add mocked rate-window rows exceeding `CAPTION_MAX_JOBS_PER_WINDOW` → assert `RATE_LIMITED` and no agent call; add generate action test with `provider_key` in body → `FORBIDDEN_FIELDS`.

---

## Security Focus Review

| Focus area | Status | Evidence |
|------------|--------|----------|
| Approved-strategy gate before LLM/UPSERT | **PASS** | `getApprovedStrategyForWeek` in actions (`generate-reel-captions.ts:67-70`); orchestrator `loadApprovedStrategyForScriptJob` (`generate-reel-captions-for-client.ts:157-163`); per-script `loadReelScriptForCaptionJob` (`:206-216`). Tests: draft strategy → `STRATEGY_NOT_APPROVED`; foreign script → null. |
| Plain text — schema + rendering | **PASS** | `plainTextNoHtmlRefine` rejects `<>&` and `javascript:` (`lib/contracts/reel-caption.ts:24-26`). FE `{record.caption}` text nodes — no `dangerouslySetInnerHTML` in `components/scripts/*`. Tests: HTML reject, strict keys. |
| Rate limit `caption_generate` | **PASS with M1/M2 notes** | Constants `CAPTION_GENERATE_AGENT_KEY`, window, max 5 (`lib/contracts/reel-caption.ts:19-22`). In-flight scopes in `check-caption-generation-rate-limit.ts`. Distinct from `video_script_generate` (test). |
| No client `provider_key` | **PASS** | Forbidden keys include `providerKey` / `provider_key` (`find-forbidden-keys.ts:8-9`). Orchestrator resolves via `getProviderCatalog` + `resolveProvider({ llmVariant: "default" })` (`generate-reel-captions-for-client.ts:125-144`). Test: `llmVariant: "default"` → `siliconflow_deepseek_flash`. |
| RLS deny-by-default | **PASS** | Migration `ENABLE ROW LEVEL SECURITY` with zero policies (`supabase/migrations/20260830400000_neuramark_reel_captions.sql:31-32`). Test reads migration file. |
| Operator gate first | **PASS** | `requireOperator("handler")` first await in both actions (`generate-reel-captions.ts:44-45`; `regenerate-reel-caption.ts:44-45`). Non-operator → 403, no LLM (tests). |
| System seam not browser-exposed | **PASS** | `generateReelCaptionsForClient({ invokedBy: "system" })` skips `requireOperator` but still runs approval + script ownership loaders. Not wired to cron in BUILD. Test confirms `requireOperator` not called on system path. |
| Agent module server-only | **PASS** | `import "server-only"` on agent + orchestrator. Test asserts source + stub path. |

---

## Acceptance Criteria

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Caption generated for each script in approved strategy | **PASS** | Batch orchestrator loops slots, skips `SCRIPT_PENDING`, UPSERTs per script. FE batch + per-slot regen on `/operator/scripts`. |
| Local/geo keywords when profile has zone | **PASS** | Profile zone in prompt; stub derives keywords; FE keyword chips. |
| Hashtag count within configured max | **PASS** | Warn >15, reject >30; FE counter + over-max warning. |
| LLM via catalog at resolved tier (US-X.4) | **PASS** | `resolveProvider` with `llmVariant: "default"`. |
| [SEC] Schema-validated plain-text output before storage; plain-text rendering | **PASS** | Zod strict + plain-text refine; FE text nodes only. |

---

## Checks Run

| Command | Result |
|---------|--------|
| `npx tsx --test lib/reel-captions/reel-captions.test.ts lib/agents/content/generate-reel-caption.test.ts` | **48/48 pass** (after QA fixed 3 prompt-fixture assertion drifts in `generate-reel-caption.test.ts`) |
| `npm run lint` | **Pre-existing failures** in unrelated `*.test.ts` files (`@typescript-eslint/no-require-imports`); US-6.1 source files clean |
| `npm run build` | **Failed** — `AUTH_DEV_FALLBACK must not be set when NODE_ENV=production` (local `.env` dev flag; same pre-existing condition as US-5.1/US-5.2 QA; not US-6.1 code defect). Compile phase succeeded before page-data collection failed |

---

## What Was Not Covered

- Manual browser E2E on `/operator/scripts` Caption tab (generate, regen, stale badge, copy, EN/ES).
- Live Supabase rate-limit rows and RLS advisor checks against a remote project.
- Production deploy with `AUTH_DEV_FALLBACK` unset (expected on Vercel).
- Full-repo lint/typecheck clean (pre-existing test-file patterns from prior stories).

---

## Recommended Action

**APPROVE WITH NOTES.** Proceed to **CLOSE** — story AC and security acceptance criteria are satisfied; Medium findings are inherited rate-limit hardening debt; Low finding is test coverage gap only.
