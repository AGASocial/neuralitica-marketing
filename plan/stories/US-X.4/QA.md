# QA Report — US-X.4 Seed provider catalog and tier defaults

**Story:** US-X.4  
**Branch:** `feature/US-X.4-provider-catalog`  
**Commits reviewed:** `5ba9876` (BUILD), `2b46797` (VALIDATION)  
**Reviewed:** 2026-08-29  
**Reviewer:** qa-engineer  
**Sources:** `CONTRACT.md`, `SECURITY.md`, `VALIDATION.md`, `lib/providers/*`, `lib/contracts/providers.ts`, `supabase/migrations/20260829260000_neuramark_provider_catalog.sql`, `supabase/migrations/20260829260100_neuramark_cost_policies.sql`

### Verdict: APPROVE WITH NOTES

**Severity counts:** Critical **0** · High **0** · Medium **1** · Low **2**  
**CLOSE recommended:** **Yes** — no blockers; Medium/Low items are follow-ups, not merge gates.

---

## Findings

### Medium

| ID | Location | Issue | Why it matters | Fix direction |
|----|----------|-------|----------------|---------------|
| M1 | `lib/contracts/providers.ts` (L27–50), `lib/providers/map-provider-catalog-rows.ts` (L19–41) | CONTRACT §Shared schemas requires read-time rejection of **secret-shaped strings** in `cost_model` and `capabilities` jsonb (patterns: `sk-`, `Bearer`, base64 blobs), in addition to `envKeyName`. Implementation validates `envKeyName` format only; `providerCostModelSchema` and `capabilities` accept arbitrary string values in nested fields. | Operator SQL or compromised service-role write could persist a literal API key in jsonb metadata; row would pass Zod and enter the in-memory catalog passed to `resolveProvider` / adapters. Blast radius is limited in V1 (migration-only writes, RLS deny-by-default) but diverges from frozen CONTRACT/SECURITY acceptance criteria. | Add a shared `rejectSecretPatterns` refine/superRefine on `providerCatalogRowSchema` (scan serialized `costModel` + `capabilities` for forbidden substrings) or a dedicated validator in `mapRowToDto` before `safeParse`. Add unit test with `sk-` in metadata. |

### Low

| ID | Location | Issue | Why it matters | Fix direction |
|----|----------|-------|----------------|---------------|
| L1 | `lib/providers/index.ts` (L1–16) | Barrel re-exports `getProviderCatalog`, `getDefaultCostPolicy`, and `resolveProvider` alongside server-only modules. No current Client Component imports detected, but `@/lib/providers` is an easy mistaken import path. | Next.js `server-only` would fail the build if a client graph imported the barrel, but the indirection weakens the explicit per-module boundary CONTRACT documents. | Prefer direct imports from `get-provider-catalog.ts` / `provider-adapters.ts` in downstream stories; consider removing loader exports from the barrel or adding a file-level comment warning. |
| L2 | `lib/providers/map-provider-catalog-rows.ts` (entire file) | Pure mapper module lacks `import "server-only"` (intentionally testable). Only consumed by `get-provider-catalog.ts` today. | Defense-in-depth gap: a future import from a non–server-only module could expose mapping logic (including `envKeyName` DTO shape) without triggering the `server-only` guard. | Add `import "server-only"` and test via `mapProviderCatalogRows` inputs only, or document as explicitly server-adjacent in CONTRACT. |

---

## Security Review Summary

| Control | Status | Evidence |
|---------|--------|----------|
| No client catalog HTTP surface | **PASS** | No matches under `app/**` for catalog/policy tables; test asserts no `app/api/provider-catalog` route (`providers.test.ts` L682–687). |
| No write endpoints (migration-only V1) | **PASS** | Grep: no Server Actions / Route Handlers mutating catalog or cost policy. Seeds only in migrations. |
| `envKeyName` names only | **PASS** | DB CHECK `^[A-Z][A-Z0-9_]+$` + no `NEXT_PUBLIC_%` (`20260829260000_…sql` L19–20); `envKeyNameSchema` (`providers.ts` L33–37); seed uses `SILICONFLOW_API_KEY`, etc. |
| RLS deny-by-default | **PASS** | Both migrations `ENABLE ROW LEVEL SECURITY` with zero `CREATE POLICY`; tests grep-assert (`providers.test.ts` L192–208). |
| Server-only modules | **PASS** | `import "server-only"` on `get-provider-catalog.ts`, `get-default-cost-policy.ts`, `provider-adapters.ts`; sole DB SELECT paths are those helpers. |
| No Client Component imports of provider loaders | **PASS** | Grep: zero `@/lib/providers` imports outside server graph. |
| Service-role Node only | **PASS** | `createServerSupabaseClient()` uses service-role key (`lib/supabase/server.ts` L15–30); helpers are server-only. |
| `resolveProvider` security | **PASS** | Filters `active`, tier, assetRole; excludes `manualFallback` unless `allowManualFallback`; LLM variant keyed lookup (no silent `candidates[0]` for LLM); MuseTalk loop preference; throws `ProviderResolveError` / `PROVIDER_NOT_FOUND`. |
| Logging — no jsonb/env leakage | **PASS** | Loaders log error codes + key/dbCode only (`map-provider-catalog-rows.ts` L34–37, `get-default-cost-policy.ts` L77–95). |
| Seed invariants | **PASS** | 10 keys, high-tier `active = false`, manual zero-cost, `llmFallback` in `DEFAULT_LOW_TIER_PROVIDER_KEYS`; resolver tests cover all roles. |

---

## CONTRACT Compliance (spot-check)

| Item | Status |
|------|--------|
| DDL + indexes + triggers + CHECK constraints | **PASS** |
| 10 seed keys + global policy `low` / 150 | **PASS** |
| `getProviderCatalog()` + `cache()` + soft failure | **PASS** |
| `getDefaultCostPolicy()` + `cache()` + soft failure | **PASS** |
| `llmVariant` default/fallback routing | **PASS** |
| Manual exclusion + MuseTalk preference | **PASS** |
| Error codes frozen | **PASS** |
| Read-time secret scan on jsonb fields | **PARTIAL** — see M1 |

---

## Checks Run

| Command | Result |
|---------|--------|
| `npx tsx --test lib/providers/providers.test.ts` | **26/26 pass** |
| `npx tsc --noEmit` | Pre-existing errors in other test files; **no errors in US-X.4 provider modules** |
| `npm run lint` | Pre-existing repo lint noise; **one `require()` in `providers.test.ts` L74** (test harness pattern, not production) |
| Grep: `app/**` catalog/policy routes | **0 matches** |
| Grep: `@/lib/providers` client imports | **0 matches** |
| Grep: `CREATE POLICY` in US-X.4 migrations | **0 matches** |
| Grep: direct `neuramark_provider_catalog` SELECT outside helpers | **0 matches** (helpers + tests only) |

---

## What Was Not Covered

- Live Supabase migration apply / RLS introspection against a running database (review relied on migration SQL + unit tests).
- Production build (`next build`) bundle analysis for accidental catalog leakage (no FE consumers exist; server-only guards expected to hold).
- End-to-end orchestration with US-4.1 / US-7.2 (out of scope; downstream consumption not yet built).
- `plan/PROVIDER_TIERS.html` sync (optional doc follow-up per VALIDATION).

---

## Recommended Next Actions

| Action | Owner | Priority |
|--------|-------|----------|
| **CLOSE** US-X.4 after PO AC checkoff | product-owner | Now |
| Remediate M1 (jsonb secret-pattern Zod) or accept as US-7.1 hardening | nextjs-backend | Medium |
| Proceed US-4.1 with `getProviderCatalog()` + `resolveProvider({ llmVariant: 'default' })` | content-agents-engineer | Next |
| Optional: sync `plan/PROVIDER_TIERS.html` | nextjs-backend | Low |

---

## Signoff

- [x] Security boundaries verified (no client catalog exposure, no writes, RLS, server-only)
- [x] Resolver behavior matches frozen CONTRACT
- [x] Automated test matrix executed
- [x] No Critical or High findings
- [ ] M1 jsonb secret scan (non-blocking follow-up)
