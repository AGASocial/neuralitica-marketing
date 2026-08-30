# QA Report — US-7.2 Select provider by economics and quality floor

**Story:** US-7.2  
**Branch:** `feature/US-7.2-provider-ranking`  
**Commits reviewed:** `45c46e5` … `a507264` (full branch vs `main`)  
**Reviewed:** 2026-08-30  
**Reviewer:** qa-engineer  
**Sources:** `plan/stories/US-7.2/{CONTRACT,SECURITY,TASKS}.md`, `lib/providers/*`, `lib/cost-policy/*`, script/caption orchestrators, `components/scripts/ProviderRecommendationPanel.tsx`, `components/cost-policy/ReelBudgetConfirmDialog.tsx`, `supabase/migrations/20260830510300_neuramark_provider_decisions.sql`

### Verdict: BLOCK

**Severity counts:** Critical **0** · High **2** · Medium **2** · Low **2**  
**CLOSE recommended:** **No** — fix High merge blockers first (`npm run build` fails on duplicate imports; duplicate decision-log INSERT per successful LLM job). Security/CONTRACT alignment is otherwise strong; re-run QA after fixes.

---

## Findings

### High

| ID | Location | Issue | Why it matters | Fix direction |
|----|----------|-------|----------------|---------------|
| H1 | `lib/reel-scripts/generate-reel-scripts-for-client.ts:41,43` · `lib/reel-captions/generate-reel-captions-for-client.ts:41,43` · `lib/providers/provider-adapters.ts:28,29` | **Duplicate imports** of `logProviderDecision` (orchestrators) and `rankCatalogCandidatesByCost` (`provider-adapters`). | `npm run build` fails with `Identifier 'logProviderDecision' has already been declared` / duplicate binding. Production deploy blocked. `tsc` reports `TS2300: Duplicate identifier 'logProviderDecision'`. | Remove the duplicate import lines (keep one). Re-run `npm run build`. |
| H2 | `lib/reel-scripts/generate-reel-scripts-for-client.ts:413-435` · `lib/reel-captions/generate-reel-captions-for-client.ts:420-442` | **`logProviderDecision` called twice per successful LLM job** — once from gate fields (`item.gate` / `gate`) and again from `llmDecision`. | CONTRACT §Decision log: one append-only row per successful LLM job. Duplicate rows inflate analytics, break “canonical decision log” intent, and duplicate audit data alongside a single spend event. Values are identical today (both from `resolveProviderForJob` via gate → `estimateLlmJobCost`), so this is a merge artifact, not two policies. | Keep a single `logProviderDecision` call (prefer gate/spend tuple already used for `recordReelSpendEvent`). Add orchestrator test asserting one INSERT per success. |

### Medium

| ID | Location | Issue | Why it matters | Fix direction |
|----|----------|-------|----------------|---------------|
| M1 | `lib/cost-policy/log-provider-decision.ts:41-48` | **Decision log INSERT failures are logged only** — no throw, no orchestrator failure. | Same class as US-7.1 M2 on spend ledger: successful LLM + spend event can proceed without a decision row; margin/routing analytics gap. SECURITY §Decision log append-only expects reliable audit. | Fail orchestrator post-LLM if decision INSERT fails (or retry once); add test with mocked Supabase error. |
| M2 | `lib/providers/resolve-provider-for-job.ts:176-180` | **`high_tier_inactive` rationale not surfaced** on `PROVIDER_UNAVAILABLE` when policy tier is `high` and no active row exists. | CONTRACT §`rationaleKey` mapping and TASKS PO decision: Operator message should reference SQL activation. Today all failures return bare `PROVIDER_UNAVAILABLE`; FE i18n key `high_tier_inactive` exists but is unused on error paths. | Map `ProviderResolveError` + `providerTier === "high"` to a distinct error code or carry `rationaleKey: "high_tier_inactive"` in gate/recommendation failure envelopes. |

### Low

| ID | Location | Issue | Why it matters | Fix direction |
|----|----------|-------|----------------|---------------|
| L1 | `lib/providers/provider-adapters.ts:147-151` | **Loop-preference row returned without cost ranking** when multiple `prefersReferenceLoop` candidates exist. | CONTRACT: loop filter runs before rank among `talking_head` candidates. V1 seed has one loop row; low blast radius. | Apply `rankCatalogCandidatesByCost` to loop-eligible subset before pick. |
| L2 | Test matrix | **No automated test** for duplicate `logProviderDecision` or orchestrator “exactly one decision row per success”. | Regression risk for H2. | Extend `reel-scripts.test.ts` / `reel-captions.test.ts` with mocked `logProviderDecision` call count. |

---

## Security Review Summary

| Control | Status | Evidence |
|---------|--------|----------|
| Central policy engine `import "server-only"` | **PASS** | `lib/providers/resolve-provider-for-job.ts:1` |
| Single assigner of `providerKey` + estimate | **PASS** | `resolveProviderForJob`; `estimateLlmJobCost` delegates (`estimate-llm-job-cost.ts:26-30`) |
| Tier from `getCostPolicyForClient` only (not request) | **PASS** | `resolve-provider-for-job.ts:145-150` |
| Forbidden provider authority keys on script/caption paths | **PASS** | `FORBIDDEN_PROVIDER_AUTHORITY_KEYS` merged in `find-forbidden-keys.ts`; tests in `provider-policy-engine.test.ts` |
| `requireOperator()` on recommendation action | **PASS** | `get-reel-provider-recommendations.ts:65` |
| FE action boundary: no client `clientId` | **PASS** | `getReelProviderRecommendationsActionInputSchema` — `weekStart` + optional `slotIndex` only |
| Production context server-loaded (no client `visualMode` / `modalidad` authority) | **PASS** | `build-reel-production-context.ts` loads profile, strategy slot, scripts, media |
| Operator DTO allowlist (no `envKeyName` / `cost_model`) | **PASS** | `operatorProviderRecommendationComponentSchema`; FE does not render `providerKey` |
| No catalog write surface in US-7.2 | **PASS** | Grep: no app INSERT/UPDATE/DELETE on `neuramark_provider_catalog` |
| Adapter factories fed from engine output only | **PASS** | `createSiliconFlowLlmAdapter(provider.key, …)` from resolved row; orchestrators use `llmDecision.providerKey` |
| Decision log: no secrets in columns | **PASS** | Migration stores `rationale_key` text only |
| RLS deny-by-default on `neuramark_provider_decisions` | **PASS** | Migration enables RLS, zero policies |
| No `@supabase` in Client Components (US-7.2 FE) | **PASS** | `ProviderRecommendationPanel` calls Server Action only |
| Cheapest-active ranking | **PASS** | `rankCatalogCandidatesByCost`; integrated in `resolveProvider` |
| Faceless → no `talking_head` | **PASS** | `resolveProviderForJob` + `rolesForContext` |
| Manual excluded from auto-rank | **PASS** | `resolveProvider` filter `manualFallback !== true` unless `allowManualFallback` |

---

## CONTRACT Compliance (spot-check)

| Item | Status |
|------|--------|
| `resolveProviderForJob` canonical export | **PASS** |
| `rankCatalogCandidatesByCost` comparator + tie-break | **PASS** |
| `buildReelProductionContext` trusted inputs | **PASS** |
| `getReelProviderRecommendations` Operator gate + DTO | **PASS** |
| `estimateLlmJobCost` delegates to engine | **PASS** |
| `llmRecommendation` on `reelBudgetPreviewSchema` | **PASS** |
| `neuramark_provider_decisions` DDL + indexes | **PASS** |
| `logProviderDecision` after successful LLM (four orchestrators) | **PARTIAL** — wired but **double** INSERT (H2) |
| Forbidden client `providerKey` / tier / estimate | **PASS** |
| `createVideoJobRequestSchema` / resolved internal schemas | **PASS** |
| FE expand-row panel + EN/ES `scripts.providerRecommendation.*` | **PASS** |
| `ReelBudgetConfirmDialog` LLM block | **PASS** |
| Video/TTS blocking gate | **N/A** (out of scope — projection only) |
| `high_tier_inactive` Operator messaging | **PARTIAL** — see M2 |

---

## Checks Run

| Command | Result |
|---------|--------|
| `npx tsx --test lib/providers/provider-policy-engine.test.ts lib/providers/providers.test.ts lib/cost-policy/cost-policy.test.ts` | **56/56 pass** |
| `npm run build` | **FAIL** — duplicate identifier errors in `generate-reel-scripts-for-client.ts`, `generate-reel-captions-for-client.ts`, `provider-adapters.ts` (H1) |
| `npx tsc --noEmit` | **Errors in US-7.2 orchestrators** (`TS2300` duplicate `logProviderDecision`); plus pre-existing test-file noise |
| `npm run lint` | **Exit 0** with pre-existing `no-require-imports` warnings in unrelated test files |
| Grep: catalog mutation from `lib/**` | **0 matches** |
| Grep: `@supabase` in `components/scripts/**` | **0 matches** |

---

## What Was Not Covered

- Live browser E2E of expand-row recommendation panel and budget confirm LLM line on `/operator/scripts`.
- Migration apply against live Supabase (`neuramark_provider_decisions`).
- Cliente-role session **403** on `getReelProviderRecommendations` (code path present; no Cliente harness).
- Full `reel-scripts.test.ts` / `reel-captions.test.ts` suite after US-7.2 orchestrator changes (not run this gate).
- US-8.x video job consumption of `resolveProviderForJob` (documented seam only).

---

## Recommended actions before CLOSE

| Priority | Action | Owner |
|----------|--------|-------|
| **Block merge** | Remove duplicate imports (H1) | nextjs-backend / media-pipeline-engineer |
| **Block merge** | Single `logProviderDecision` per successful LLM (H2) | nextjs-backend |
| Post-fix | Re-run `npm run build` + US-7.2 test trio | qa-engineer |
| Non-blocking | Fail closed on decision log INSERT failure (M1) | nextjs-backend |
| Non-blocking | Surface `high_tier_inactive` on high-tier unavailable (M2) | nextjs-backend + nextjs-frontend |
| CLOSE | PO checks AC boxes in `plan/USER_STORIES.md` § US-7.2 | product-owner |

---

## CLOSE recommendation

**Do not CLOSE yet.** Policy engine, forbidden-field posture, Operator read surface, migration, and ranking behavior match frozen `CONTRACT.md` and `SECURITY.md`. Merge is blocked by **H1** (build break) and **H2** (duplicate audit rows). After those two fixes and a green `npm run build`, re-run this QA gate; **CLOSE is expected** with M1/M2 as post-close hardening (same pattern as US-7.1).

---

## Verdict Rationale

**BLOCK** — not a security redesign: server-only engine, tier lock, forbidden client authority, and catalog read-only posture are correctly implemented. The branch cannot ship because webpack fails on duplicate imports, and every successful script/caption LLM job would write two identical decision-log rows. Fix H1–H2, then treat as **APPROVE WITH NOTES** for M1/M2 follow-ups.
