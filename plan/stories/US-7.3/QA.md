# QA Report — US-7.3 Track actual cost per generation job

**Story:** US-7.3  
**Branch:** `feature/US-7.3-actual-cost`  
**Commits reviewed:** `f6038e9` … `030d85f`  
**Reviewed:** 2026-08-30  
**Reviewer:** qa-engineer  
**Sources:** `plan/stories/US-7.3/{CONTRACT,SECURITY,TASKS}.md`, `lib/cost-policy/*`, script/caption orchestrators, `getReelScriptsForWeek`, `components/scripts/ScriptsPageView.tsx`, `supabase/migrations/20260830510400_neuramark_reel_spend_events_actual_cost_reason.sql`

### Verdict: APPROVE WITH NOTES

**Severity counts:** Critical **0** · High **1** · Medium **2** · Low **3**  
**CLOSE recommended:** **Yes** — after one-line FE fallback fix for **H1** (trivial; does not change security or contract shape). Phase A LLM actual-cost path, Operator-only reads, forbidden-key posture, migration, and security tests align with frozen `CONTRACT.md` and `SECURITY.md`.

---

## Findings

### High (fix before merge)

| ID | Location | Issue | Why it matters | Fix direction |
|----|----------|-------|----------------|---------------|
| H1 | `app/(app)/operator/scripts/page.tsx:58-64`, `:71-79` | Error/fallback success objects omit required `costSummary` after `getReelScriptsForWeekSuccessSchema` extension. | **`npm run build` fails** type-check (`TS2322` / `TS2719`). Operator scripts page cannot ship. | Add `costSummary: { weekStart, clientId: operator.id or empty UUID from user, slots: [], weeklyEstimatedCostCents: 0, weeklyActualCostCents: null, hasPartialActual: false }` to both fallback literals (mirror `emptyWeekCostSummary` in the action). |

### Medium (non-blocking)

| ID | Location | Issue | Why it matters | Fix direction |
|----|----------|-------|----------------|---------------|
| M1 | `lib/reel-scripts/generate-reel-scripts-for-client.ts:408-418` · `lib/reel-captions/generate-reel-captions-for-client.ts:409-419` | Orchestrators `await finalizeGenerationCost(...)` without checking `{ ok: false }`. | CONTRACT: spend persist failure must propagate. DB INSERT throws (good), but a validation failure would leave a persisted script/caption **without** a spend row — AC gap and silent economics loss. Unlikely today because orchestrators always pass `llmUsage`, but the contract path allows soft failure. | Check result; on `!ok` throw or return internal error (fail closed post-persist). Add orchestrator test with mocked `{ ok: false }`. |
| M2 | `lib/cost-policy/compute-llm-actual-cost.ts` · `lib/providers/siliconflow-llm-adapter.ts` | `provider_no_billing` enum is frozen in DDL/i18n but **never emitted** — failures map to `usage_missing` or `catalog_cost_model_unsupported` only. | AC / CONTRACT allow null actual + closed reason; one enum value is dead. Stub adapters that cannot bill should return this reason for Operator clarity. | Return `provider_no_billing` from stub/adapter when vendor explicitly omits billing (e.g. stub with zero usage by design). |

### Low (non-blocking)

| ID | Location | Issue | Why it matters | Fix direction |
|----|----------|-------|----------------|---------------|
| L1 | CONTRACT surface #8 `sumReelActualCostCents` | Helper not extracted; per-`reel_script_id` SUM lives inline in `getReelCostSummaryForWeek`. | CONTRACT module map drift; behavior is covered by aggregation tests. | Optional extract to `lib/cost-policy/sum-reel-actual-cost-cents.ts` or mark N/A in CONTRACT at CLOSE. |
| L2 | SECURITY test matrix S7 | No repo grep/CI test asserting zero `actual_cost_cents` in exported client-request Zod schemas. | Partial coverage via forbidden-key unit tests only. | Add grep test mirroring US-7.1/7.2 pattern. |
| L3 | `lib/cost-policy/record-reel-spend-event.ts` | Still exported; caller restriction is convention-only (prod: `finalizeGenerationCost` only). | Future drift could bypass central writer. | Document in module header or narrow export surface in a follow-up. |

---

## Security Review Summary

| Control | Status | Evidence |
|---------|--------|----------|
| Central module `import "server-only"` sole writer | **PASS** | `finalize-generation-cost.ts:1`, `compute-llm-actual-cost.ts:1`, `update-reel-spend-event-actual.ts:1` |
| No client write surface for actual cost | **PASS** | `FORBIDDEN_BUDGET_SPEND_KEYS` extended (`cost-policy.ts:87-104`); script/caption forbidden helpers merge list |
| Adapter-sourced actuals only | **PASS** | Orchestrators pass `llmUsage.adapterReportedCents` from agent completion, not request body |
| `recordReelSpendEvent` INSERT-only from central module | **PASS** | Grep: single prod caller `finalize-generation-cost.ts:48` |
| Immutability `WHERE actual_cost_cents IS NULL` | **PASS** | `update-reel-spend-event-actual.ts:78`; tests S3/S4 |
| Tenant scope on async UPDATE | **PASS** | `update-reel-spend-event-actual.ts:38-43`, `:76-77` |
| Operator reads `requireOperator` first | **PASS** | `get-reel-scripts-for-week.ts:54`; non-operator 403 tests |
| `clientId` server-derived (no foreign tenant in body) | **PASS** | `get-reel-scripts-for-week.ts:73` |
| Cliente cost exclusion (response shape) | **PASS** | `costSummary` on Operator action only; `reelScriptListItemSchema` has no cost fields |
| Failure reason closed enum + DB CHECK | **PASS** | Migration `neuramark_reel_spend_events_unavailable_reason_chk` |
| Decision log append-only | **PASS** | No UPDATE to `neuramark_provider_decisions` |
| Budget gate unchanged (estimates only) | **PASS** | `assertReelBudgetAllowsSpend` / `sumReelCumulativeCostCents` unchanged |
| RLS deny-by-default on spend ledger | **PASS** | Prior migration; no new policies |
| No `@supabase` in US-7.3 Client Component | **PASS** | `ScriptsPageView` uses Server Actions + display types only |
| Phase B async seam exported, not wired | **PASS** | `updateReelSpendEventActual` tested; no prod US-8.x call sites |

**SECURITY spot-check (post-CONTRACT):** All binding conditions from `SECURITY.md` **Design Concerns** and **Security Acceptance Criteria** are satisfied in Phase A BUILD.

---

## CONTRACT Compliance (Phase A)

| Item | Status |
|------|--------|
| `neuramark_reel_spend_events` canonical ledger | **PASS** |
| Migration `actual_cost_unavailable_reason`, `duration_sec`, indexes, CHECKs | **PASS** |
| `computeLlmActualCost` — adapter ≥1 cent precedence, catalog token math | **PASS** |
| `finalizeGenerationCost` sync_insert sole writer | **PASS** |
| `updateReelSpendEventActual` async seam (exported, not wired) | **PASS** |
| Orchestrators wire script + caption via `finalizeGenerationCost` | **PASS** |
| `getReelCostSummaryForWeek` aggregation rules | **PASS** |
| `getReelScriptsForWeek` attaches `costSummary` | **PASS** |
| `/operator/scripts` cost column + weekly footer + EN/ES | **PASS** |
| Forbidden keys on generate/regenerate | **PASS** |
| SiliconFlow token-based actual (replaces placeholder 0 path via recompute) | **PASS** |
| `sumReelActualCostCents` standalone helper | **PARTIAL** — see L1 |
| Phase B `OperatorProductionJobCostDto` / production list | **N/A** (deferred US-8.4) |
| Security test matrix S1–S7 | **PARTIAL** — S7 see L2; S1–S6 **PASS** |

---

## Checks Run

| Command | Result |
|---------|--------|
| `npx tsx --test lib/cost-policy/actual-cost.test.ts lib/cost-policy/get-reel-cost-summary-for-week.test.ts lib/cost-policy/cost-policy.test.ts lib/reel-scripts/reel-scripts.test.ts lib/reel-captions/reel-captions.test.ts` | **117/117 pass** |
| `npm run build` | **FAIL** — `page.tsx` missing `costSummary` (H1) |
| `npx tsc --noEmit` | **FAIL** — same H1 in app code (+ pre-existing test-file TS noise) |
| `npm run lint` | **Exit 1** — pre-existing `no-require-imports` in test files; unrelated app lint in `operator/playbook/page.tsx` |
| Grep: prod `recordReelSpendEvent(` callers | **1** — `finalize-generation-cost.ts` only |
| Grep: public Server Action accepting `actualCostCents` | **0** |
| Grep: `@supabase` in `components/scripts/ScriptsPageView.tsx` | **0** |

---

## What Was Not Covered

- Live browser E2E of cost column and weekly footer on `/operator/scripts`.
- Migration apply against live Supabase (`20260830510400_*`).
- Cliente-role session harness on cost-bearing response (403 path covered in unit tests only).
- Phase B video/TTS `async_update` wiring (explicitly out of Phase A scope).
- Full production build after H1 fix (expected PASS).
- Historical pre-7.3 row backfill (out of scope per TASKS).

---

## Recommended actions

| Priority | Action | Owner |
|----------|--------|-------|
| **Pre-merge** | Fix `page.tsx` fallback `costSummary` (H1) | nextjs-frontend |
| **CLOSE** | PO checks Phase A AC boxes in `plan/USER_STORIES.md` § US-7.3 | product-owner |
| Post-close | Fail closed when `finalizeGenerationCost` returns `!ok` (M1) | nextjs-backend |
| Post-close | Wire `provider_no_billing` from stub adapter path (M2) | media-pipeline-engineer |
| Post-close | Grep test for client Zod schemas (L2) | nextjs-backend |

---

## CLOSE recommendation

**Yes — CLOSE recommended** for Phase A after **H1** is fixed (expected one small diff in `app/(app)/operator/scripts/page.tsx`). Core story intent is met: LLM jobs persist actual or null + reason on the spend ledger via a server-only central module; Operator sees estimated vs actual per slot and weekly sum on `/operator/scripts`; client forgery and Cliente leakage controls match `SECURITY.md`. Remaining Medium/Low items are hardening and CONTRACT hygiene, not merge blockers once H1 is resolved.

---

## Verdict Rationale

**APPROVE WITH NOTES** — implementation faithfully executes frozen CONTRACT Phase A and satisfies SECURITY conditions (central writer, forbidden keys, immutability, Operator gating, estimate-only budget gate). Automated coverage is strong (117 tests). The only merge blocker is a FE fallback type omission (H1), not a trust-boundary defect.
