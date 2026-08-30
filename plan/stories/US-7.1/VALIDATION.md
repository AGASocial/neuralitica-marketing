# Validation Report — US-7.1

**Story:** Configure max budget per Reel  
**Branch:** `feature/US-7.1-cost-policy`  
**Date:** 2026-08-30 (re-validated after fix `69d274f`)  
**Validator:** requirements-validator  

**Tests run:**

```bash
npx tsx --test lib/cost-policy/cost-policy.test.ts \
  lib/reel-scripts/reel-scripts.test.ts \
  lib/reel-captions/reel-captions.test.ts
```

**Result:** 99/99 pass (cost-policy 17, reel-scripts 30, reel-captions 52).

---

## Verdict: PASS WITH NOTES

Core policy resolution, gate math, audit events, Operator settings, preview DTOs, migrations, and batch/single-slot flows match CONTRACT and story AC. Fix `69d274f` resolves the prior **batch pre-gate ordering** gap: batch generate/regenerate without `budgetOverride` now evaluates all target slots through `assertReelBudgetAllowsSpend` before any LLM I/O, with integration tests asserting zero LLM calls on `BUDGET_EXCEEDED`.

**Notes (non-blocking):** batch orchestrator error responses still return only the first failing `blockedSlotIndexes` entry (preview returns all); CONTRACT unit-test matrix rows 11, 13, 14, 16 remain uncovered.

---

## Acceptance Criteria

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Global default `provider_tier` is `low`; per-client override optional | **PASS** | US-X.4 seed `provider_tier = low` (`supabase/migrations/20260829260100_neuramark_cost_policies.sql`); `getCostPolicyForClient` client→global fallback (`lib/cost-policy/get-cost-policy-for-client.ts`); client override UPSERT/DELETE (`lib/cost-policy/actions/update-client-cost-policy-override.ts:86-148`); settings UI (`components/cost-policy/CostPolicySettingsForm.tsx`, `app/(app)/operator/settings/cost-policy/page.tsx`). |
| Seeded default `max_cost_cents` is **150** ($1.50/Reel) | **PASS** | US-X.4 migration seed; `DEFAULT_MAX_COST_CENTS = 150` (`lib/contracts/cost-policy.ts:15`); global fallback test (`lib/cost-policy/cost-policy.test.ts:161-219`). |
| Generation blocked if estimate exceeds max without override | **PASS** | Gate returns `BUDGET_EXCEEDED` + `blocked` audit (`lib/cost-policy/assert-reel-budget-allows-spend.ts:106-124`); single-slot tests (`cost-policy.test.ts:429-451`); batch pre-gate before LLM (`generate-reel-scripts-for-client.ts:239-280`, `generate-reel-captions-for-client.ts:211-244`); integration tests assert zero LLM (`reel-scripts.test.ts:1370-1420`, `reel-captions.test.ts:1100+`). |
| Policy considers avatar required vs faceless | **PASS** (V1 projection) | `resolveProjectionHintKey` maps `visualMode` + `modalidad` + b-roll (`lib/cost-policy/resolve-projection-hint.ts`); preview DTO includes `projectionHintKey` (`lib/cost-policy/build-reel-budget-preview.ts:145-149`); i18n hints (`messages/en.json:953-957`, `messages/es.json`). Blocking estimate remains LLM-only per TASKS/CONTRACT V1 scope. |
| Estimate shown before user confirms generation | **PASS** | `getReelBudgetPreview` Operator-gated (`lib/cost-policy/actions/get-reel-budget-preview.ts:42-69`); `ScriptsPageView` opens `ReelBudgetConfirmDialog` before mutations (`components/scripts/ScriptsPageView.tsx:454,705-721`). |
| Budget check counts cumulative cost of all attempts for the same Reel | **PASS** (LLM V1) | `neuramark_reel_spend_events` + `sumReelCumulativeCostCents` (`lib/cost-policy/sum-reel-cumulative-cost-cents.ts`); `recordReelSpendEvent` after successful LLM (`lib/reel-scripts/generate-reel-scripts-for-client.ts:391-399`, `lib/reel-captions/generate-reel-captions-for-client.ts:398+`). Video/TTS deferred per CONTRACT out-of-scope. |
| Operator-only: policy/budget settings writes reject non-operator (403) | **PASS** | `requireOperator("handler")` on settings actions (`get-cost-policy-for-settings.ts:36`, `update-global-cost-policy.ts:61`, `update-client-cost-policy-override.ts:52`). |
| [SEC] Budget check server-side in job path; client cannot skip via crafted payload | **PASS** | `assertReelBudgetAllowsSpend` in orchestrators before LLM; forbidden keys on actions (`lib/reel-scripts/find-forbidden-keys.ts`, `lib/reel-captions/find-forbidden-keys.ts`); test (`cost-policy.test.ts:69-76`). Reel regression tests mock gate but do not bypass it. |
| [SEC] `max_cost_cents` / policy editable only by Operator with validated bounds | **PASS** | `updateGlobalCostPolicyInputSchema` min 1 / max `MAX_COST_CENTS_CEILING` (10_000) (`lib/contracts/cost-policy.ts:77-82`); `updateGlobalCostPolicy` (`update-global-cost-policy.ts`); ceiling test (`cost-policy.test.ts:60-66`). |
| [SEC] Every budget block and override recorded (who, when, estimate vs cap) | **PASS** | `neuramark_budget_audit_log` migration (`supabase/migrations/20260830510100_neuramark_budget_audit_log.sql`); `recordBudgetAuditEvent` for `blocked`, `override_proceed`, `policy_updated`; gate tests (`cost-policy.test.ts:429-475`). |

---

## CONTRACT Match

| CONTRACT area | Status | Notes |
|---------------|--------|-------|
| Frozen constants (`MAX_COST_CENTS_CEILING = 10_000`, override reason 1–500) | **PASS** | `lib/contracts/cost-policy.ts:12-18` |
| `getCostPolicyForClient` resolver | **PASS** | Implementation + tests #1–2 |
| `sumReelCumulativeCostCents` | **PASS** | Test #3 |
| `estimateLlmJobCost` + `PROVIDER_UNAVAILABLE` fail-closed | **PASS** | Gate test #17 |
| `assertReelBudgetAllowsSpend` flow + `server-only` | **PASS** | `assert-reel-budget-allows-spend.ts`; tests #5–8, #17 |
| `recordReelSpendEvent` after successful LLM only | **PASS** (impl) | Orchestrators post-persist; not covered by dedicated unit test (#16 gap) |
| Operator DTO allowlists (no `envKeyName` / `cost_model`) | **PASS** | `operatorCostSettingsDtoSchema`, `reelBudgetPreviewSchema` (`lib/contracts/cost-policy.ts`); `loadCostSettingsDto.ts`; label test (`cost-policy.test.ts:79-87`) |
| Settings Server Actions | **PASS** | `getCostPolicyForSettings`, `updateGlobalCostPolicy`, `updateClientCostPolicyOverride` |
| `getReelBudgetPreview` | **PASS** | `build-reel-budget-preview.ts`, batch `blockedSlotIndexes` |
| Generate action extensions (`budgetOverride`, forbidden keys) | **PASS** | `generate-reel-scripts.ts`, `regenerate-reel-script-slot.ts`, caption counterparts |
| DB migrations (spend events, audit log, client unique index) | **PASS** | `20260830510000_*`, `20260830510100_*`, `20260830510200_*` |
| **Batch fail-entire without override — no partial LLM** | **PASS** | Fix `69d274f`: pre-loop gate for all batch slots (`generate-reel-scripts-for-client.ts:239-280`, `generate-reel-captions-for-client.ts:211-244`); LLM loop uses cached gate results (`289-373`, `254+`). Tests: `reel-scripts.test.ts:1370-1420`, `reel-captions.test.ts:1100+`. |
| Batch `blockedSlotIndexes` on server error | **PARTIAL** | Preview returns all blocked slots (`build-reel-budget-preview.ts:237-243`). Orchestrator returns only first failing slot (`generate-reel-scripts-for-client.ts:265-267`, `generate-reel-captions-for-client.ts:229-231`). Acceptable for V1 — FE uses preview for confirm dialog. |
| CONTRACT unit test matrix rows 9, 11, 13, 14, 16 | **PARTIAL** | Row #9 covered (batch zero-LLM integration). Rows 11, 13, 14, 16 still missing: settings non-operator, global `clientId` reject, client override lifecycle, spend-after-LLM unit test. |

---

## Convention Compliance

| Check | Status | Evidence |
|-------|--------|----------|
| EN + ES user-facing strings | **PASS** | `messages/en.json` + `messages/es.json` — `settings.costPolicy.*`, `scripts.budget.*`, `header.nav.costPolicy` |
| Server Components default; minimal `"use client"` | **PASS** | Settings page RSC (`cost-policy/page.tsx`); client islands `CostPolicySettingsForm`, `ReelBudgetConfirmDialog`, `ScriptsPageView` |
| PrimeReact-first | **PASS** | Settings form + confirm dialog use PrimeReact inputs/dialogs |
| Loading / empty / error / pending | **PASS** | Settings load error (`cost-policy/page.tsx:38-46`); preview loading in dialog; budget error keys on scripts |
| No Supabase in Client Components | **PASS** | FE calls Server Actions only |
| `getCurrentUser()` / `requireOperator()` identity seam | **PASS** | All cost surfaces use `requireOperator("handler")` or operator layout page gate |
| `neuramark_` DB prefix | **PASS** | Migrations and table names |

---

## Gaps (non-blocking notes)

1. **Batch `blockedSlotIndexes` parity** — Orchestrator returns first failing slot only; preview returns all. FE confirm flow uses preview; no user-facing defect observed.

2. **CONTRACT test matrix gaps** — Rows #11 (settings non-operator 403), #13 (global `clientId` reject), #14 (client override UPSERT/delete), #16 (spend-after-LLM unit) not automated. Recommended follow-up hardening, not story blockers.

---

## Scope Creep

None identified. Video/TTS gate, catalog CRUD, Cliente cost UI, and US-7.2 ranking correctly deferred per CONTRACT out-of-scope table.

---

## Recommended Next Actions

| Action | Owner |
|--------|-------|
| PO checks AC boxes in `USER_STORIES.md` (already checked per source file) | **product-owner** |
| Optional: return full `blockedSlotIndexes` on batch `BUDGET_EXCEEDED` to match preview | **nextjs-backend** |
| Optional: add tests for settings 403, global `clientId` reject, client override lifecycle, spend-after-LLM (#11, #13, #14, #16) | **nextjs-backend** |
| Merge `feature/US-7.1-cost-policy` when ready | **product-owner** |

---

## Dependencies

| Story | Status |
|-------|--------|
| US-3.1 `visual_mode` | Satisfied (profile + projection hints) |
| US-5.1 reel scripts generate/regenerate | Satisfied (extended with gate) |
| US-X.4 cost policies seed + catalog | Satisfied (prior VALIDATION PASS) |
| US-14.5 `requireOperator()` | Satisfied (used on all cost surfaces) |

---

## Fix history

| Commit | Change |
|--------|--------|
| `69d274f` | Batch orchestrators pre-gate all slots before LLM I/O; integration tests for zero LLM on `BUDGET_EXCEEDED`. Resolves prior FAIL on batch gate ordering. |
