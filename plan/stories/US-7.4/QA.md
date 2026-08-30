# QA Report — US-7.4 Report real total cost per Reel

**Story:** US-7.4  
**Branch:** `feature/US-7.4-reel-cost-rollup`  
**Commits reviewed:** BE `5c9abb4` · FE `8735be2`  
**Reviewed:** 2026-08-30  
**Reviewer:** qa-engineer  
**Sources:** `plan/stories/US-7.4/{CONTRACT,SECURITY,TASKS,README}.md`, `lib/cost-policy/*`, `lib/reel-scripts/actions/get-reel-scripts-for-week.ts`, `components/scripts/{ReelCostRollupPanel,ScriptsPageView}.tsx`, `app/(app)/operator/scripts/page.tsx`, `messages/{en,es}.json`

### Verdict: APPROVE WITH CONDITIONS

**Severity counts:** Critical **0** · High **1** · Medium **2** · Low **2**  
**CLOSE recommended:** **Yes** — after **H1** (one-line property name fix). Phase A ledger-only aggregation, Operator gating, batch `reelCostRollups`, reconciliation tests, forbidden-key posture, and FE panel placement align with frozen `CONTRACT.md` and `SECURITY.md`.

---

## Findings

### High (fix before merge)

| ID | Location | Issue | Why it matters | Fix direction |
|----|----------|-------|----------------|---------------|
| H1 | `lib/cost-policy/get-reel-cost-rollup-for-script.ts:85` | Uses `policyResult.policy.max_cost_cents`; `CostPolicyRow` exposes **`maxCostCents`** (camelCase). | **`npm run build` fails** (`TS2551`). Production compile blocked. Unit tests mock policy and do not catch this. | Change to `policyResult.policy.maxCostCents`. |

### Medium (non-blocking)

| ID | Location | Issue | Why it matters | Fix direction |
|----|----------|-------|----------------|---------------|
| M1 | `components/scripts/ReelCostRollupPanel.tsx:138-142` | Empty UI when `!rollup \|\| !hasComponents` — hides server totals when `components[]` is empty but `estimatedTotalCents > 0` (e.g. spend rows with unknown `asset_role` still summed in `aggregateSpendEventsForReelScript`). | CONTRACT: empty-event rollups still return totals; FE should not treat `components.length === 0` as “no data” when totals exist. Operator could miss non-zero spend. | Gate empty state on `!rollup`; show totals row when `estimatedTotalCents > 0` or `actualTotalCents !== null` even with empty breakdown. |
| M2 | `lib/reel-scripts/actions/get-reel-scripts-for-week.ts:106-118` | Per-script rollup loads via `Promise.all` with **2 Supabase round-trips each** (script ownership + spend SELECT), sequential to weekly summary. | Scales poorly on 7-slot weeks (14+ queries). Not a trust-boundary defect; ops latency under load. | Batch spend fetch once (same pattern as `getReelCostSummaryForWeek`) and compute rollups in memory; or single query with `in(reel_script_id, …)`. |

### Low (non-blocking)

| ID | Location | Issue | Why it matters | Fix direction |
|----|----------|-------|----------------|---------------|
| L1 | SECURITY test matrix S2 | No automated parse/snapshot asserting `reelScriptListItemSchema` excludes cost/rollup keys. | Partial coverage via forbidden-key unit tests only. | Add schema parse test with sample list item (mirror US-7.3 pattern). |
| L2 | `getReelCostRollupForScriptActionInputSchema` | Defined in `actual-cost.ts` but no browser action wired (Phase A). | Harmless; future lazy-fetch must add `requireOperator` first await. | Document in module header or wire only when Phase B lazy path ships. |

---

## Security Review Summary

| Control | Status | Evidence |
|---------|--------|----------|
| Server-only aggregation (`import "server-only"`) | **PASS** | `aggregate-spend-events-for-reel-script.ts:1`, `get-reel-cost-rollup-for-script.ts:1` |
| Canonical ledger only (`neuramark_reel_spend_events`) | **PASS** | `get-reel-cost-rollup-for-script.ts:66-73`; grep: no `video_jobs` / `media_assets.cost` in `lib/cost-policy/` |
| Operator gate on browser path | **PASS** | `get-reel-scripts-for-week.ts:43` `requireOperator("handler")` first; page `operator/layout.tsx` gate |
| No standalone public rollup action (Phase A) | **PASS** | `getReelCostRollupForScript` internal helper only |
| IDOR / tenancy before read | **PASS** | Script row `eq(client_id)` + `eq(id)` before spend SELECT; foreign id → `null` (`get-reel-cost-rollup-for-script.ts:49-62`) |
| Parameterized Supabase queries | **PASS** | `.eq()` / `.gte()` / `.lt()` — no concatenated SQL |
| Server-computed totals authority | **PASS** | FE displays `estimatedTotalCents`, `actualTotalCents`, `varianceCents`, `isOverBudget` from DTO; no client re-SUM |
| Over-budget cap server-resolved | **PASS** (runtime blocked by H1) | `getCostPolicyForClient` + `DEFAULT_MAX_COST_CENTS` fallback; no client cap input |
| Component DTO allowlist (no catalog leakage) | **PASS** | `reelCostRollupComponentSchema` — `assetRole`, cents, `eventCount`, `hasPendingActual`, `unavailableReasonKeys` only |
| Cliente serializer exclusion | **PASS** | `reelScriptListItemSchema` unchanged (no cost keys); `reelCostRollups` only on `getReelScriptsForWeekSuccessSchema` |
| Forbidden rollup keys on list input | **PASS** | `FORBIDDEN_REEL_COST_ROLLUP_KEYS` merged in `find-forbidden-keys.ts`; unit tests |
| Budget gate unchanged (estimates only) | **PASS** | `computeReelCostIsOverBudget` documented reporting-only; no gate changes |
| No `@supabase` in rollup Client Component | **PASS** | `ReelCostRollupPanel.tsx` imports contract types + `formatCentsForDisplay` only |
| Reconciliation invariant tested | **PASS** | `get-reel-cost-rollup-for-script.test.ts` slot + weekly equalities |

**SECURITY spot-check (post-CONTRACT):** All binding conditions from `SECURITY.md` **Design Concerns** and **Security Acceptance Criteria** are satisfied for Phase A BUILD, except automated S2 schema snapshot (L1).

---

## CONTRACT Compliance (Phase A)

| Item | Status |
|------|--------|
| `aggregateSpendEventsForReelScript` shared module | **PASS** |
| `getReelCostRollupForScript` week-scoped, ownership check | **PASS** |
| `getReelCostSummaryForWeek` refactored to shared aggregator | **PASS** |
| Batch `reelCostRollups` on `getReelScriptsForWeek` | **PASS** |
| `ReelCostRollupDto` / Zod schemas in `actual-cost.ts` | **PASS** |
| Variance + over-budget formulas (`computeReelCost*`) | **PASS** |
| `FORBIDDEN_REEL_COST_ROLLUP_KEYS` | **PASS** |
| `ReelCostRollupPanel` below `ProviderRecommendationPanel`, above tabs | **PASS** |
| EN/ES `scripts.cost.rollup.*` | **PASS** |
| Week-scoped reconciliation slot + weekly | **PASS** (tests) |
| Empty-event rollup still returned (zeros / empty components) | **PASS** (BE) · **PARTIAL** (FE — see M1) |
| No lazy rollup Server Action (Phase A) | **PASS** |
| Ledger-only authority (no dual-store SUM) | **PASS** |
| Security test matrix S1–S5 | **PARTIAL** — S1/S3/S4/S5 pass; S2 see L1 |

---

## Checks Run

| Command | Result |
|---------|--------|
| `npx tsx --test lib/cost-policy/get-reel-cost-rollup-for-script.test.ts lib/cost-policy/get-reel-cost-summary-for-week.test.ts` | **15/15 pass** |
| `npm run build` | **FAIL** — `get-reel-cost-rollup-for-script.ts:85` `max_cost_cents` vs `maxCostCents` (H1) |
| `npm run lint` | **Exit 1** — pre-existing repo issues; US-7.4 files clean (no new errors in changed paths) |
| Grep: `video_jobs` / `media_assets.cost` in rollup modules | **0** |
| Grep: `reelCostRollups` on Cliente routes | **0** |
| Grep: `@supabase` in `ReelCostRollupPanel.tsx` | **0** |

---

## What Was Not Covered

- Live browser E2E of expand-row Cost section on `/operator/scripts`.
- Migration apply (no new migration in US-7.4).
- Cliente-role session harness against rollup payload (403 inherited from `getReelScriptsForWeek` unit tests).
- Phase B lazy `getReelCostRollupForScriptAction` (explicitly out of Phase A).
- Full production build after H1 fix (expected **PASS**).
- Load/perf test for N+1 rollup queries (M2).

---

## Recommended actions

| Priority | Action | Owner |
|----------|--------|-------|
| **Pre-merge** | Fix `maxCostCents` property (H1) | nextjs-backend |
| **CLOSE** | PO checks Phase A AC boxes in `plan/USER_STORIES.md` § US-7.4 | product-owner |
| Post-close | FE empty-state vs zero-total rollup (M1) | nextjs-frontend |
| Post-close | Batch rollup DB reads (M2) | nextjs-backend |
| Post-close | `reelScriptListItemSchema` cost-free snapshot test (L1) | nextjs-backend |

---

## CLOSE recommendation

**Yes — CLOSE recommended** for Phase A after **H1** is fixed (expected one-line diff in `get-reel-cost-rollup-for-script.ts`). Core story intent is met: Operator sees per-Reel estimated vs actual totals, LLM component breakdown, variance, and over-budget highlight on `/operator/scripts` expand row; data is ledger-only and reconciles with US-7.3 weekly/slot sums; margin data stays Operator-gated with forbidden-key and IDOR controls per `SECURITY.md`. Remaining Medium/Low items are UX edge case, performance, and test hygiene — not merge blockers once H1 is resolved.

---

## Verdict Rationale

**APPROVE WITH CONDITIONS** — implementation faithfully executes frozen CONTRACT Phase A and satisfies SECURITY trust boundaries (server-only aggregation, Operator gate, tenancy check, serializer exclusion, reconciliation tests). The sole merge blocker is a TypeScript property typo (H1) that unit mocks mask but production build catches. No Critical security defects, back doors, or Cliente leakage paths identified.
