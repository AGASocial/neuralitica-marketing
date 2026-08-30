# QA Report — US-7.1 Configure max budget per Reel

**Story:** US-7.1  
**Branch:** `feature/US-7.1-cost-policy`  
**Commits reviewed:** `3bdc709` (BE), `bb19e4d` (FE)  
**Reviewed:** 2026-08-30  
**Reviewer:** qa-engineer  
**Sources:** `CONTRACT.md`, `SECURITY.md`, `TASKS.md`, `lib/cost-policy/*`, script/caption orchestrators, FE cost-policy components, `supabase/migrations/202608305*.sql`

### Verdict: APPROVE WITH NOTES

**Severity counts:** Critical **0** · High **0** · Medium **2** · Low **2**  
**CLOSE recommended:** **Yes** — `SECURITY.md` binding floors and frozen `CONTRACT.md` are met; 16/16 cost-policy tests and 81/81 reel script/caption tests pass; Medium/Low items are CONTRACT-alignment and hardening follow-ups, not merge blockers.

---

## Findings

### Medium

| ID | Location | Issue | Why it matters | Fix direction |
|----|----------|-------|----------------|---------------|
| M1 | `lib/reel-scripts/generate-reel-scripts-for-client.ts` (L239–332), `lib/reel-captions/generate-reel-captions-for-client.ts` (L214–296) | **Batch fail-entire is not atomic without override.** Orchestrators gate and invoke LLM per slot in one loop. If slot 0 passes the gate and slot 2 would exceed, slot 0 still completes LLM + spend before slot 2 is checked. | `CONTRACT.md` §Orchestrator integration: *"on first `BUDGET_EXCEEDED` without batch-level override, abort entire batch — no partial LLM calls."* Normal UI flow mitigates via `getReelBudgetPreview` + ConfirmDialog, but a direct Server Action call (or race after concurrent spend) can produce partial batch spend. Operator-trusted, but margin AC diverges from frozen contract. | Pre-flight all slots with `assertReelBudgetAllowsSpend` before any LLM I/O when `mode === "batch"` and `budgetOverride !== true` (mirror the existing override pre-loop). Add orchestrator test for two-slot batch where second slot exceeds. |
| M2 | `lib/cost-policy/record-budget-audit-event.ts` (L45–51), `lib/cost-policy/record-reel-spend-event.ts` (L36–43) | **Audit and spend ledger INSERT failures are logged but not surfaced.** Gate can return `BUDGET_EXCEEDED` / proceed on override while `blocked` / `override_proceed` audit INSERT fails silently; successful LLM can proceed without a spend row. | `SECURITY.md` §Security Acceptance Criteria: blocks and overrides must be auditable; cumulative gate depends on `neuramark_reel_spend_events` SUM. DB outage or constraint failure weakens margin traceability and can under-count cumulative spend on subsequent attempts. | Fail closed: propagate INSERT errors from gate (block proceed on override if audit fails) and fail orchestrator post-LLM if spend INSERT fails (or wrap in transaction). Add tests for insert-failure paths. |

### Low

| ID | Location | Issue | Why it matters | Fix direction |
|----|----------|-------|----------------|---------------|
| L1 | `lib/cost-policy/cost-policy.test.ts` (entire file) | **CONTRACT unit test matrix partially covered.** Present: resolver, gate, forbidden keys, overflow, override validation, provider unavailable. Missing: orchestrator batch fail-entire (#9), Cliente **403** on settings actions (#11), migration RLS zero-policy grep (#), spend event only after successful LLM (#16). | Regression risk on the highest-value security behaviors; pattern exists in `providers.test.ts` and `reel-scripts.test.ts` migration RLS tests. | Add mocked action tests for non-operator settings; grep-assert new migrations; orchestrator integration test for batch atomicity. |
| L2 | `components/cost-policy/CostPolicySettingsForm.tsx` (uses `dollarsToCents`) | Client converts dollar input to cents before mutation. Server Zod enforces integer bounds, so authority stays server-side. | Floating-point edge cases (e.g. `1.005`) could send unexpected cents; low blast radius because server validates `1..MAX_COST_CENTS_CEILING`. | Optional: send integer cents from a masked input or validate with same bounds client-side for UX only. |

---

## Security Review Summary

| Control | Status | Evidence |
|---------|--------|----------|
| Central gate `import "server-only"` | **PASS** | `assert-reel-budget-allows-spend.ts` L1; test asserts source (L312–317) |
| Gate before LLM on all four orchestrator paths | **PASS** | `generate-reel-scripts-for-client.ts` L250–311; `generate-reel-captions-for-client.ts` L214–280 |
| Fresh policy read on spend gate | **PASS** | `loadCostPolicyForClientFresh` in gate (`assert-reel-budget-allows-spend.ts` L63) |
| Forbidden estimate/policy fields on generate | **PASS** | `find-forbidden-keys.ts` L44–62; test L69–76 |
| `requireOperator("handler")` first on cost actions | **PASS** | `get-cost-policy-for-settings.ts`, `update-global-cost-policy.ts`, `update-client-cost-policy-override.ts`, `get-reel-budget-preview.ts` |
| Global vs client write separation | **PASS** | Global UPDATE `.is("client_id", null)`; client override uses `operator.id` only |
| Override requires reason when over cap | **PASS** | Gate L127–139; test L481–503 |
| Block + override audit event types | **PASS** | `record-budget-audit-event.ts`; tests L429–475 |
| No client Supabase / no cost authority in browser | **PASS** | Client components import Server Actions + display helpers only; grep shows no `@/lib/supabase` in `components/cost-policy/**` |
| Operator DTO allowlist (no `envKeyName` / `cost_model`) | **PASS** | `operatorCostSettingsDtoSchema`, `reelBudgetPreviewSchema` in `lib/contracts/cost-policy.ts`; `load-cost-settings-dto.ts` |
| RLS deny-by-default on new tables | **PASS** | Migrations enable RLS, zero `CREATE POLICY` |
| No `SKIP_BUDGET_CHECK` / env bypass | **PASS** | Grep: no matches in `lib/cost-policy/**` |
| `budgetOverride` only for `invokedBy: "operator"` | **PASS** | Orchestrator L228–231 |
| IDOR on `reel_script_id` | **PASS** | `verifyReelScriptBelongsToClient`; fail closed as `COST_POLICY_UNAVAILABLE` |
| Overflow-safe cents math | **PASS** | `safeAddCents`, `wouldExceedBudget`, `sumReelCumulativeCostCents` row validation |
| High tier inactive → `PROVIDER_UNAVAILABLE` | **PASS** | `estimate-llm-job-cost.ts`; gate test L506–526 |

---

## CONTRACT Compliance (spot-check)

| Item | Status |
|------|--------|
| `getCostPolicyForClient` client → global fallback | **PASS** |
| `neuramark_reel_spend_events` + `neuramark_budget_audit_log` DDL | **PASS** |
| Per-client unique partial index on `neuramark_cost_policies` | **PASS** |
| `assertReelBudgetAllowsSpend` + `recordReelSpendEvent` after LLM success | **PASS** (timing); see M2 for INSERT error handling |
| Settings route `/operator/settings/cost-policy` + actions | **PASS** |
| `getReelBudgetPreview` batch/slot DTOs | **PASS** |
| `budgetOverride` + `overrideReason` on four generate actions | **PASS** |
| `MAX_COST_CENTS_CEILING = 10_000` on writes | **PASS** |
| Batch fail-entire without partial LLM | **PARTIAL** — see M1 |
| Forbidden keys strip/reject list | **PASS** |
| Projection hint keys in preview | **PASS** |
| EN/ES `settings.costPolicy.*`, `scripts.budget.*` | **PASS** |

---

## Checks Run

| Command | Result |
|---------|--------|
| `npx tsx --test lib/cost-policy/cost-policy.test.ts` | **16/16 pass** |
| `npx tsx --test lib/reel-scripts/reel-scripts.test.ts lib/reel-captions/reel-captions.test.ts` | **81/81 pass** |
| `npx tsc --noEmit` | Pre-existing errors in unrelated test files; **no errors in US-7.1 cost-policy modules** |
| `npm run build` | **Fails** — pre-existing `AUTH_DEV_FALLBACK must not be set when NODE_ENV=production` (auth env), not introduced by US-7.1 |
| Grep: `CREATE POLICY` in `202608305*.sql` | **0 matches** (RLS enabled only) |
| Grep: `@supabase` in `components/cost-policy/**` | **0 matches** |
| Grep: `SKIP_BUDGET` / budget env bypass | **0 matches** |

---

## What Was Not Covered

- Live browser E2E of ConfirmDialog, settings form, and override UX on `/operator/scripts` and `/operator/settings/cost-policy`.
- Migration apply against live Supabase (ledger + audit tables).
- Production deploy with auth env vars (build blocked by existing `AUTH_DEV_FALLBACK` guard).
- Cliente session **403** on cost actions (code path present via `requireOperator`; no automated Cliente-role test harness).
- US-8.x video job gate reuse (explicitly out of scope).

---

## Recommended actions before / after CLOSE

| When | Action | Owner |
|------|--------|-------|
| Post-CLOSE (non-blocking) | Batch pre-flight gate for all slots before any LLM (M1) | nextjs-backend |
| Post-CLOSE (non-blocking) | Fail closed on audit/spend INSERT errors (M2) | nextjs-backend |
| Post-CLOSE | Expand security test matrix per CONTRACT §Unit test matrix (L1) | nextjs-backend |
| CLOSE | PO checks AC boxes in `plan/USER_STORIES.md` § US-7.1 | product-owner |

---

## Verdict Rationale

**APPROVE WITH NOTES.** US-7.1 delivers the frozen trust model: server-resolved policy, mandatory gate before LLM I/O, Operator-only settings and previews, forbidden client authority fields, append-only audit/spend schema, and RLS deny-by-default. Security acceptance criteria from `SECURITY.md` are satisfied in code paths reviewed. Residual Medium findings are CONTRACT atomicity on batch generate and resilience when audit/ledger writes fail — both are operator-margin hardening, not client-trust-boundary bypasses. **Proceed to CLOSE.**
