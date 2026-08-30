# QA Report — US-7.2 Select provider by economics and quality floor

**Story:** US-7.2  
**Branch:** `feature/US-7.2-provider-ranking`  
**Commits reviewed:** `45c46e5` … `a507264` (initial gate); **re-review after fix** `78e6aa1`  
**Reviewed:** 2026-08-30 (initial), 2026-08-30 (post-fix)  
**Reviewer:** qa-engineer  
**Sources:** `plan/stories/US-7.2/{CONTRACT,SECURITY,TASKS}.md`, `lib/providers/*`, `lib/cost-policy/*`, script/caption orchestrators, `components/scripts/ProviderRecommendationPanel.tsx`, `components/cost-policy/ReelBudgetConfirmDialog.tsx`, `supabase/migrations/20260830510300_neuramark_provider_decisions.sql`

### Verdict: APPROVE WITH NOTES

**Severity counts:** Critical **0** · High **0** (2 resolved) · Medium **2** · Low **2**  
**CLOSE recommended:** **Yes** — merge blockers H1/H2 fixed in `78e6aa1`. Policy engine, forbidden-field posture, Operator read surface, migration, and ranking behavior match frozen `CONTRACT.md` and `SECURITY.md`. M1/M2 remain post-close hardening (same pattern as US-7.1).

---

## Findings

### Resolved (post-fix `78e6aa1`)

| ID | Location | Issue | Resolution |
|----|----------|-------|------------|
| H1 | `lib/reel-scripts/generate-reel-scripts-for-client.ts` · `lib/reel-captions/generate-reel-captions-for-client.ts` · `lib/providers/provider-adapters.ts` | Duplicate imports (`logProviderDecision`, `rankCatalogCandidatesByCost`) blocked compile. | **Fixed** — duplicate import lines removed; webpack compiles and Next.js type-check passes. |
| H2 | `lib/reel-scripts/generate-reel-scripts-for-client.ts:412-422` · `lib/reel-captions/generate-reel-captions-for-client.ts:419-429` | `logProviderDecision` called twice per successful LLM job. | **Fixed** — single call per success using gate tuple (`item.gate` / `gate`), aligned with `recordReelSpendEvent`. |

### Medium (non-blocking)

| ID | Location | Issue | Why it matters | Fix direction |
|----|----------|-------|----------------|---------------|
| M1 | `lib/cost-policy/log-provider-decision.ts:41-48` | **Decision log INSERT failures are logged only** — no throw, no orchestrator failure. | Same class as US-7.1 M2 on spend ledger: successful LLM + spend event can proceed without a decision row; margin/routing analytics gap. SECURITY §Decision log append-only expects reliable audit. | Fail orchestrator post-LLM if decision INSERT fails (or retry once); add test with mocked Supabase error. |
| M2 | `lib/providers/resolve-provider-for-job.ts:176-180` | **`high_tier_inactive` rationale not surfaced** on `PROVIDER_UNAVAILABLE` when policy tier is `high` and no active row exists. | CONTRACT §`rationaleKey` mapping and TASKS PO decision: Operator message should reference SQL activation. Today all failures return bare `PROVIDER_UNAVAILABLE`; FE i18n key `high_tier_inactive` exists but is unused on error paths. | Map `ProviderResolveError` + `providerTier === "high"` to a distinct error code or carry `rationaleKey: "high_tier_inactive"` in gate/recommendation failure envelopes. |

### Low (non-blocking)

| ID | Location | Issue | Why it matters | Fix direction |
|----|----------|-------|----------------|---------------|
| L1 | `lib/providers/provider-adapters.ts:147-151` | **Loop-preference row returned without cost ranking** when multiple `prefersReferenceLoop` candidates exist. | CONTRACT: loop filter runs before rank among `talking_head` candidates. V1 seed has one loop row; low blast radius. | Apply `rankCatalogCandidatesByCost` to loop-eligible subset before pick. |
| L2 | Test matrix | **No automated test** asserting exactly one `logProviderDecision` call per successful LLM job. | Regression risk for H2 class of bug. Fix `78e6aa1` updated orchestrator mocks for `resolveProviderForJob` but did not add explicit call-count assertion. | Extend `reel-scripts.test.ts` / `reel-captions.test.ts` with mocked `logProviderDecision` call count === 1 on happy path. |

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
| Single decision log row per successful LLM job | **PASS** | One `logProviderDecision` call per success in script/caption orchestrators (post `78e6aa1`) |

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
| `logProviderDecision` after successful LLM (four orchestrators) | **PASS** — single INSERT via gate tuple |
| Forbidden client `providerKey` / tier / estimate | **PASS** |
| `createVideoJobRequestSchema` / resolved internal schemas | **PASS** |
| FE expand-row panel + EN/ES `scripts.providerRecommendation.*` | **PASS** |
| `ReelBudgetConfirmDialog` LLM block | **PASS** |
| Video/TTS blocking gate | **N/A** (out of scope — projection only) |
| `high_tier_inactive` Operator messaging | **PARTIAL** — see M2 |

---

## Checks Run (post-fix re-review)

| Command | Result |
|---------|--------|
| `npx tsx --test lib/providers/provider-policy-engine.test.ts lib/providers/providers.test.ts lib/cost-policy/cost-policy.test.ts lib/reel-scripts/reel-scripts.test.ts lib/reel-captions/reel-captions.test.ts` | **139/139 pass** |
| `npm run build` | **Compile + type-check PASS**; full build exits non-zero — `AUTH_DEV_FALLBACK must not be set when NODE_ENV=production` (pre-existing `.env` dev flag; not introduced by `78e6aa1`) |
| Grep: duplicate `logProviderDecision` import/call in orchestrators | **0 duplicates** — one import + one call each |
| Grep: duplicate `rankCatalogCandidatesByCost` in `provider-adapters.ts` | **0 duplicates** |
| `npm run lint` | **Exit 0** with pre-existing `no-require-imports` warnings in unrelated test files |
| Grep: catalog mutation from `lib/**` | **0 matches** |
| Grep: `@supabase` in `components/scripts/**` | **0 matches** |

---

## What Was Not Covered

- Live browser E2E of expand-row recommendation panel and budget confirm LLM line on `/operator/scripts`.
- Migration apply against live Supabase (`neuramark_provider_decisions`).
- Cliente-role session **403** on `getReelProviderRecommendations` (code path present; no Cliente harness).
- Explicit `logProviderDecision` call-count regression test (see L2).
- US-8.x video job consumption of `resolveProviderForJob` (documented seam only).
- Production build with `AUTH_DEV_FALLBACK` unset (CI/Vercel env expected to pass).

---

## Recommended actions

| Priority | Action | Owner |
|----------|--------|-------|
| **CLOSE** | PO checks AC boxes in `plan/USER_STORIES.md` § US-7.2 | product-owner |
| Post-close | Fail closed on decision log INSERT failure (M1) | nextjs-backend |
| Post-close | Surface `high_tier_inactive` on high-tier unavailable (M2) | nextjs-backend + nextjs-frontend |
| Post-close | Add orchestrator call-count test for decision log (L2) | nextjs-backend |
| Post-close | Rank loop-preference subset by cost when multi-row (L1) | media-pipeline-engineer |

---

## CLOSE recommendation

**Yes — CLOSE recommended.** Fix `78e6aa1` resolves both High merge blockers (duplicate imports, duplicate decision-log INSERT). Core US-7.2 automated coverage is green (139/139). Security and CONTRACT alignment remain strong. Ship with M1/M2/L1/L2 tracked as follow-ups.

---

## Verdict Rationale

**APPROVE WITH NOTES** — server-only engine, tier lock, forbidden client authority, catalog read-only posture, and single decision-log write per LLM success are correctly implemented. Initial **BLOCK** lifted after `78e6aa1`. Remaining Medium/Low items are hardening and Operator UX polish, not merge blockers.
