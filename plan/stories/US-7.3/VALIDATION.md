## Validation Report — US-7.3

**Branch:** `feature/US-7.3-actual-cost`  
**Validated:** 2026-08-29  
**Validator:** requirements-validator

### Verdict: PASS WITH NOTES

Phase A (LLM sync actual-cost persistence, Operator weekly/slot cost on `/operator/scripts`, security gates) is complete and matches the frozen CONTRACT. Phase B items (video/TTS async backfill, `/operator/production` cost column) are explicitly deferred and documented — not blockers for Phase A close.

### Test execution

```bash
npx tsx --test \
  lib/cost-policy/actual-cost.test.ts \
  lib/cost-policy/cost-policy.test.ts \
  lib/cost-policy/get-reel-cost-summary-for-week.test.ts \
  lib/reel-scripts/reel-scripts.test.ts \
  lib/reel-captions/reel-captions.test.ts \
  lib/agents/content/generate-reel-script.test.ts \
  lib/agents/content/generate-reel-caption.test.ts
```

**Result:** 151 tests, 0 failures.

---

### Acceptance Criteria

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Every completed job has actual or `null` with failure reason | **PASS (Phase A — LLM only)** | `finalizeGenerationCost` (`lib/cost-policy/finalize-generation-cost.ts` L23–61) calls `computeLlmActualCost` then `recordReelSpendEvent` with `actualCostCents` or `actualCostUnavailableReason`. Wired from script orchestrator (`lib/reel-scripts/generate-reel-scripts-for-client.ts` L408–418) and caption orchestrator (`lib/reel-captions/generate-reel-captions-for-client.ts` L409+). Migration adds `actual_cost_unavailable_reason` + CHECK (`supabase/migrations/20260830510400_neuramark_reel_spend_events_actual_cost_reason.sql`). Tests: `actual-cost.test.ts` (compute + sync_insert), `get-reel-cost-summary-for-week.test.ts` (unavailable reason aggregation). **Note:** Video/TTS async jobs not wired (Phase B). |
| Dashboard aggregate cost per client per week (simple sum) | **PASS** | `getReelCostSummaryForWeek` (`lib/cost-policy/get-reel-cost-summary-for-week.ts`) aggregates per-slot and weekly totals; attached to `getReelScriptsForWeek` (`lib/reel-scripts/actions/get-reel-scripts-for-week.ts` L98–117). FE weekly footer in `components/scripts/ScriptsPageView.tsx` (`WeeklyCostFooter` L1772+). Tests: `get-reel-cost-summary-for-week.test.ts` (3 cases). |
| Operator-only: endpoint rejects non-operator sessions (403) | **PASS** | `getReelScriptsForWeek` calls `requireOperator("handler")` (L54) and returns `reelScriptForbiddenError()` on 403 (L39–41, L56–58). Test: `reel-scripts.test.ts` "non-operator read returns 403" (L948+). Cost data only on Operator action response (`costSummary` in `getReelScriptsForWeekSuccessSchema`, `lib/contracts/reel-script.ts` L93–94). |
| [SEC] `actual_cost_cents` written only by server-side job-completion handler from provider responses; no client endpoint can set/edit costs | **PASS** | Sole writer: `finalizeGenerationCost` (`import "server-only"`, `lib/cost-policy/finalize-generation-cost.ts` L1). Not exported as Server Action. Forbidden keys extended in `lib/contracts/cost-policy.ts` L87–104 (`actualCostCents`, `actual_cost_cents`, etc.). Tests: `actual-cost.test.ts` forbidden keys; `cost-policy.test.ts` rejects `actualCostCents` on generate input. `updateReelSpendEventActual` exported for Phase B seam only (`update-reel-spend-event-actual.ts`); unit-tested, not called in prod path. |

---

### Convention Compliance

| Area | Status | Evidence |
|------|--------|----------|
| EN + ES user-facing strings | **PASS** | `messages/en.json` L929–944, `messages/es.json` L929–944 (`scripts.cost.actual.*`). |
| Server Components by default | **PASS** | `app/(app)/operator/scripts/page.tsx` is Server Component; data via `getReelScriptsForWeek`. |
| PrimeReact-first UI | **PASS** | Cost column uses PrimeReact `Column` in `ScriptsPageView.tsx` L1005–1028. |
| Loading / empty / error states | **PASS** | Column hidden when `costSummary` absent (`showCostSummary` L462–463); `—` for empty slots (`renderEstimatedCostValue` / `renderActualCostValue`); weekly actual shows `—` when null (L1784–1787). |
| Auth via `requireOperator()` | **PASS** | Operator layout + handler gate on list action. |
| No Supabase in Client Components | **PASS** | Cost reads/writes server-only modules under `lib/cost-policy/`. |
| `neuramark_` DB prefix | **PASS** | Migration alters `neuramark_reel_spend_events`; index `neuramark_reel_spend_events_client_created_at_idx`. |
| Budget gate unchanged (estimates only) | **PASS** | `sum-reel-cumulative-cost-cents.ts` selects `estimated_cost_cents` only (L25). |

---

### Gaps (what blocks PASS)

None for **Phase A** scope as frozen in CONTRACT. Full USER_STORIES literal AC for all job types (video/TTS/production list) remains open until Phase B.

---

### Scope Creep

None observed. Implementation stays within CONTRACT Phase A: LLM orchestrators, spend-ledger DDL, Operator scripts cost column/footer, security extensions. No Cliente cost fields, no manual edit UI, no gate algorithm change.

---

### Notes (PASS WITH NOTES rationale)

1. **Phased acceptance (CONTRACT § Phased BUILD):** Video/TTS `async_update` path and `/operator/production` `OperatorProductionJobCostDto` are documented but not wired — correct per frozen contract, not a Phase A defect.
2. **USER_STORIES vs CONTRACT surface:** Story FE row says "production list"; CONTRACT Phase A routes cost to `/operator/scripts`. Implementation follows CONTRACT (FE signoff 2026-08-29). PO may update USER_STORIES DB row (`video_jobs.*`) to reflect spend-ledger canonical store.
3. **`sumReelActualCostCents` helper:** CONTRACT lists a standalone helper; aggregation is inlined in `getReelCostSummaryForWeek`. Behavior covered by tests; optional refactor for US-7.4 reuse.
4. **Security matrix S5/S7:** No dedicated grep/snapshot test for client Zod schemas or shared Reel DTO exclusion; partial coverage via `FORBIDDEN_BUDGET_SPEND_KEYS` + `findForbiddenReelScriptKeys` tests. Recommend qa-engineer add in QA gate.
5. **Orchestrator integration test:** Reel mutation tests mock `finalizeGenerationCost`; end-to-end assert that happy-path generate passes `llmUsage` with computed actual is not present (covered indirectly via `finalizeGenerationCost` + `computeLlmActualCost` unit tests).
6. **SiliconFlow adapter:** Returns `actualCostCents: 0` when `computeLlmActualCost` fails (`siliconflow-llm-adapter.ts` L109); orchestrator re-computes via `finalizeGenerationCost` from `llmUsage`, so spend row still gets null + reason when tokens missing.
7. **Downstream gates:** `QA.md` not yet authored; `TASKS.md` BE checklist boxes not updated in plan folder (implementation present).

---

### Recommended Next Actions

| Action | Owner |
|--------|-------|
| PO checks US-7.3 acceptance criteria in `USER_STORIES.md` for Phase A close | product-owner |
| Run `qa-engineer` gate (`QA.md`) — security matrix S5/S7, Operator UI smoke | qa-engineer |
| Wire Phase B: US-8.4 poller → `finalizeGenerationCost({ mode: "async_update" })`; US-9.3 TTS; production list column | media-pipeline-engineer + nextjs-frontend |
| Reconcile USER_STORIES DB row to spend ledger (optional doc hygiene) | product-owner |
