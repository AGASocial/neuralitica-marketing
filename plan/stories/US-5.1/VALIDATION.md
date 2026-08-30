# Validation Report — US-5.1

**Story:** US-5.1 — Generate Reel script package per slot  
**Branch:** `feature/US-5.1-reel-scripts`  
**Builds:** agents `a12cbc7` · BE `aa1c13e` · FE `18abc7e`  
**Date:** 2026-08-29  
**Validator:** requirements-validator  
**Sources:** `plan/USER_STORIES.md` § US-5.1, `plan/stories/US-5.1/CONTRACT.md`, `plan/stories/US-5.1/SECURITY.md`, `plan/stories/US-5.1/TASKS.md`, implemented code, automated tests

### Verdict: PASS WITH NOTES

**Blockers:** 0  
**Tests:** 109/109 pass (`npx tsx --test lib/reel-scripts/reel-scripts.test.ts lib/agents/content/generate-reel-script.test.ts lib/content-strategy/content-strategy.test.ts`)

---

## Acceptance Criteria

| Criterion | Status | Evidence |
|-----------|--------|----------|
| One script package per Reel slot in approved strategy | **PASS** | Batch action loops `strategy.brief.slots[]` and UPSERTs one row per slot (`lib/reel-scripts/generate-reel-scripts-for-client.ts:204–282`). DB `UNIQUE (strategy_id, slot_index)` in migration (`supabase/migrations/20260830300000_neuramark_reel_scripts.sql:22–23`). List merges brief slots with persisted scripts (`lib/reel-scripts/list-reel-scripts-for-week.ts:24–55`). FE DataTable one row per slot (`components/scripts/ScriptsPageView.tsx:360–425`). Test: happy batch 3 slots UPSERTs all (`lib/reel-scripts/reel-scripts.test.ts`). |
| Scripts adapt tone to profile and constraints (no false owner claims in generic mode) | **PASS** | Five-helper pipeline loads profile, playbook, trend before LLM (`generate-reel-scripts-for-client.ts:142–190`). Agent prompts include profile fields in delimited blocks, locale from profile, modality, duration bounds, and disclosure rules (`lib/agents/content/generate-reel-script.ts:191–264`). `mustDiscloseForSlot` = `generic_avatar` + profile flag (`generate-reel-scripts-for-client.ts:69–71`; agent `133–134`). `buildGenericDisclosurePromptHint` injected when true (`generate-reel-script.ts:203–206`). Tests: disclosure true for generic_avatar; false for faceless when profile flag true. |
| Regenerate single slot without regenerating entire week | **PASS** | `regenerateReelScriptSlot({ weekStart, slotIndex })` Server Action (`lib/reel-scripts/actions/regenerate-reel-script-slot.ts:39–109`). Orchestrator `mode: "slot"` processes one slot only (`generate-reel-scripts-for-client.ts:207–217`). FE per-row **Regenerate this Reel** button (`ScriptsPageView.tsx:407–423`). Test: happy single slot regen UPSERTs one row. |
| [SEC] Script generation verifies server-side that the referenced strategy is `approved` and belongs to the current client before invoking the agent | **PASS** | Actions call `getApprovedStrategyForWeek` then pass `strategyId` to orchestrator (`generate-reel-scripts.ts:69–91`). Orchestrator calls `loadApprovedStrategyForScriptJob({ strategyId, clientId })` with `status = 'approved'` filter before LLM (`load-approved-strategy-for-script-job.ts:34–40`; `generate-reel-scripts-for-client.ts:192–198`). Draft/missing → `STRATEGY_NOT_APPROVED`, no LLM (tests #9–10). Tenancy: `clientId = operator.id` server-resolved (`generate-reel-scripts.ts:66`). |
| LLM calls use the catalog row for asset role `llm` at the resolved `provider_tier` (US-X.4) | **PASS** | `getProviderCatalog()` + `getDefaultCostPolicy()` + `resolveProvider(catalog, { assetRole: "llm", tier: policy.providerTier, llmVariant: "fallback" })` (`generate-reel-scripts-for-client.ts:160–179`). Adapter created from resolved row (`184–187`). Test asserts `llmVariant: "fallback"` → `siliconflow_qwen`. Forbidden `provider_key` in request → `FORBIDDEN_FIELDS`. |
| [SEC] Agent output is schema-validated before persistence; rule flags like `must_disclose_not_owner` injected from server-side profile, never from request input | **PASS** | All slots validated with `reelScriptPackageSchema.strict()` before any UPSERT (`generate-reel-scripts-for-client.ts:252–258`). Invalid output → `SCRIPT_OUTPUT_INVALID`, no persist for failed slot (test slot 2 invalid LLM). `must_disclose_not_owner` set in `persistReelScript` from server-computed `mustDiscloseNotOwner` (`persist-reel-script.ts:40`; orchestrator `263–275`). Request `mustDiscloseNotOwner` → `FORBIDDEN_FIELDS` (test). Migration column NOT NULL (`20260830300000_neuramark_reel_scripts.sql:18`). |

---

## Convention Compliance

| Check | Status | Evidence |
|-------|--------|----------|
| EN + ES user-facing strings | **PASS** | `messages/en.json:803–861`, `messages/es.json:803–861` — page chrome, columns, fields, errors, toasts. Nav EN "Scripts" / ES "Guiones" (`en.json:54`, `es.json:54`). |
| Server Components by default; minimal `"use client"` | **PASS** | RSC page `app/(app)/operator/scripts/page.tsx` with `dynamic = "force-dynamic"`. Client island `ScriptsPageView` for week picker, generate/regen, expand/copy only. Loading route `loading.tsx` + `ScriptsLoading.tsx`. |
| PrimeReact-first UI | **PASS** | `Button`, `Calendar`, `DataTable`, `Column`, `Tag`, `Message`, `Toast`, `Skeleton`, `ProgressSpinner` in scripts components. |
| Loading / empty / error / pending states | **PASS** | Route loading skeleton (`loading.tsx`). Empty: no approved strategy + link to strategy (`ScriptsPageView.tsx:339–350`); approved but pending scripts (`353–358`). Load error path (`249–262`). Batch generating skeleton + disabled controls (`337–338`, `318–319`, `420`). Error banner from server codes (`333–335`). |
| Auth via `getCurrentUser()` / `requireOperator()` | **PASS** | Operator layout `requireOperator("page")` (`app/(app)/operator/layout.tsx:14`). All three Server Actions gate `requireOperator("handler")` first (`generate-reel-scripts.ts:47`, `regenerate-reel-script-slot.ts:45`, `get-reel-scripts-for-week.ts:39`). No Supabase in `components/scripts/*`. |
| Backend endpoints map to concrete FE consumers | **PASS** | `/operator/scripts` consumes `getReelScriptsForWeek`, `generateReelScripts`, `regenerateReelScriptSlot`. Strategy page link when approved (`StrategyPageView.tsx:476–486`). `strategyHasScripts` wired for US-4.2 lock (`lib/content-strategy/strategy-has-scripts.ts:11–30`). No public Route Handlers. |
| `neuramark_` DB prefix + RLS deny-by-default | **PASS** | Table `neuramark_reel_scripts`, indexes, constraints, trigger, RLS enabled zero policies (`20260830300000_neuramark_reel_scripts.sql`). Test: migration RLS posture. |
| CONTRACT frozen shapes / error envelope | **PASS** | Schemas in `lib/contracts/reel-script.ts`. Error codes match CONTRACT (`lib/reel-scripts/errors.ts`). Input strip/reject via `findForbiddenReelScriptKeys`. `revalidatePath("/operator/scripts")` and `/operator/strategy` on success (`generate-reel-scripts.ts:94–95`). |

---

## Security Acceptance Criteria (SECURITY.md)

| Criterion | Status | Evidence |
|-----------|--------|----------|
| `requireOperator("handler")` first on generate + regen | **PASS** | Both actions; tests: non-operator → 403, no LLM/UPSERT. |
| Script read gated | **PASS** | `getReelScriptsForWeek` requires operator; page under operator layout. |
| `loadApprovedStrategyForScriptJob` before LLM/UPSERT | **PASS** | Orchestrator step before slot loop (`generate-reel-scripts-for-client.ts:192–198`). |
| Forbidden authority fields rejected | **PASS** | `findForbiddenReelScriptKeys` + `.strict()` schemas; tests for hook text, mustDiscloseNotOwner, strategyId smuggle. |
| Zod `.strict()` before persist; batch no partial on validation failure | **PASS** | Validate all packages in memory before persist loop; slot 2 invalid → no UPSERT (test). |
| `must_disclose_not_owner` server-injected | **PASS** | Persist from `mustDiscloseForSlot`; never from request/LLM authority. |
| Provider via catalog + `resolveProvider` | **PASS** | No client `provider_key`; fallback variant test. |
| Rate limit + in-flight guards | **PASS** | `check-script-generation-rate-limit.ts`; tests: 6th job `RATE_LIMITED`, concurrent `GENERATION_IN_FLIGHT`. |
| Agent `import "server-only"` + delimited untrusted blocks | **PASS** | `generate-reel-script.ts:1`, delimiter tags + tests. |
| `strategyHasScripts` real EXISTS query | **PASS** | `strategy-has-scripts.ts:17–20`; tests before/after insert. |
| RLS zero policies | **PASS** | Migration + test assertion. |

---

## Dependency Stories

| Dependency | Status | Notes |
|------------|--------|-------|
| US-4.2 Review and approve strategy | **Satisfied** | CLOSED; `getApprovedStrategyForWeek`, approve flow, lock stub now live via `strategyHasScripts`. |
| US-3.4 Visual preferences / disclosure | **Satisfied** | `visualModeSummary.mustDiscloseNotOwner` consumed in orchestrator + agent prompts. |
| US-X.4 Provider catalog | **Satisfied** | `resolveProvider` with `assetRole: "llm"`, `llmVariant: "fallback"`. |

---

## Test Results

```
npx tsx --test lib/reel-scripts/reel-scripts.test.ts \
  lib/agents/content/generate-reel-script.test.ts \
  lib/content-strategy/content-strategy.test.ts

ℹ tests 109
ℹ pass 109
ℹ fail 0
ℹ duration_ms ~281
```

US-5.1-focused coverage in `lib/reel-scripts/reel-scripts.test.ts`: schema (7), mutations (17), helpers (3), agent integration (4), migration RLS (1) — **32 tests**. Agent module: **10 tests** in `generate-reel-script.test.ts`. Regression: US-4.2 `strategyHasScripts` lock path in `content-strategy.test.ts`.

---

## Scope Creep

None identified. Out-of-scope items correctly absent: no captions (`neuramark_reel_captions`), no US-5.2 char warnings, no Cliente read route, no inline script edit, no budget pre-check (US-7.1), no cron/system path wiring.

---

## Gaps (what blocks PASS)

None. All six USER_STORIES acceptance criteria and binding SECURITY items are implemented with automated test evidence.

---

## Notes (non-blocking)

1. **`maxDuration` not set** on batch Server Action — CONTRACT frozen decision #17 suggests `maxDuration: 120` on batch action; not exported in `generate-reel-scripts.ts` (same gap as US-4.1 content-strategy actions). Default platform timeout applies.
2. **Batch DB atomicity** — LLM/validation failures are atomic (validate all slots before any UPSERT). Sequential UPSERTs are not wrapped in an explicit SQL transaction; a rare mid-batch DB failure could leave partial rows. CONTRACT matrix #14 (re-run batch UPSERT refresh) is not an automated test.
3. **`TASKS.md` doc lag** — FE checklist marked done in file body but header status still says "FE pending"; content-agents-engineer checklist boxes remain unchecked though agent module and schemas are implemented.

---

## Recommended Next Actions

| Action | Owner |
|--------|-------|
| Run **QA** security/quality review → `plan/stories/US-5.1/QA.md` | qa-engineer |
| Optional: add `export const maxDuration = 120` to batch generate action | nextjs-backend |
| Update `TASKS.md` gate + status lines to reflect FE/agent completion | product-owner |
| After QA PASS, PO checks AC boxes in `plan/USER_STORIES.md` § US-5.1 | product-owner |
