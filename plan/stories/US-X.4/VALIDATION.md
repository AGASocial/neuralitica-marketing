# Validation Report — US-X.4

**Story:** Seed provider catalog and tier defaults  
**Branch:** `feature/US-X.4-provider-catalog`  
**Commit:** `5ba9876`  
**Validated:** 2026-08-29  
**Validator:** requirements-validator

### Verdict: PASS WITH NOTES

**Blockers:** 0  
**Tests:** `npx tsx --test lib/providers/providers.test.ts` — 26/26 pass

---

## Acceptance Criteria

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Catalog includes at minimum: `llm` low (siliconflow_deepseek / siliconflow_qwen), `tts` low (siliconflow_cosyvoice2), `talking_head` low (sadtalker_low), `talking_head` alt low (musetalk_low), `broll` low (siliconflow_wan21), `manual` (zero cost) | **PASS** | Migration seeds all 7 low-tier active rows with CONTRACT-frozen keys (`siliconflow_deepseek_flash`, `siliconflow_qwen`, etc.): `supabase/migrations/20260829260000_neuramark_provider_catalog.sql` L40–105. `DEFAULT_LOW_TIER_PROVIDER_KEYS` mirrors keys: `lib/contracts/providers.ts` L172–180. Resolver tests confirm each role: `lib/providers/providers.test.ts` L335–420. |
| High-tier rows exist but `active = false` until P1 (heygen_high, ltx_broll_high, elevenlabs_tts_high) — policy engine cannot select inactive rows | **PASS** | Migration seeds all three with `active = false`: `20260829260000_neuramark_provider_catalog.sql` L107–137. `resolveProvider` filters `row.active`: `lib/providers/provider-adapters.ts` L129–135. Tests throw `PROVIDER_NOT_FOUND` for high tier on all roles: `providers.test.ts` L391–403. |
| Each row stores `cost_model` JSON sufficient for US-7.2 estimates (per_run_cents, per_second_cents, or per_clip_cents) | **PASS** | Canonical `providerCostModelSchema` with `billingUnit` + `unitCostCents`: `lib/contracts/providers.ts` L27–31. Seed rows use `per_run`, `per_second`, `per_clip`, `per_1m_tokens`, `per_1m_chars` as appropriate: migration L49–135. Invalid `billingUnit` rejected: `providers.test.ts` L691–698. |
| `provider_tier` on `cost_policies` is the only tier switch in V1; no per-asset tier mixing in MVP | **PASS** | Global policy seed: `provider_tier = 'low'`, `max_cost_cents = 150`, `client_id IS NULL`: `supabase/migrations/20260829260100_neuramark_cost_policies.sql` L40–47. `getDefaultCostPolicy()` loads global row only: `lib/providers/get-default-cost-policy.ts` L67–74. Catalog rows carry tier per vendor but resolution uses single `context.tier` from policy — no per-asset tier field added. |
| **[SEC]** Catalog and cost policy writes are operator-only; catalog is not client-readable in full (only resolved provider name in operator views) | **PASS** | No write Server Actions or Route Handlers for catalog/policy (grep `app/**` — zero matches). No `/api/provider-catalog`: `providers.test.ts` L681–688. Only server helpers SELECT tables: `get-provider-catalog.ts`, `get-default-cost-policy.ts`. Operator UI deferred to US-7.1 per scope. |
| **[SEC]** API vendor keys referenced only by env var names in server config — never stored in catalog rows | **PASS** | Migration CHECK on `env_key_name`: `20260829260000_neuramark_provider_catalog.sql` L19–20. `envKeyNameSchema` rejects `NEXT_PUBLIC_*`: `lib/contracts/providers.ts` L33–37. Seed uses names only (`SILICONFLOW_API_KEY`, etc.): migration L50–135. Secret scan test passes: `providers.test.ts` L217–223. |

---

## Security Acceptance Criteria ([SEC])

| Criterion | Status | Evidence |
|-----------|--------|----------|
| **[SEC] RLS enabled, zero policies** on new tables (inherited US-14.5) | **PASS** | Both migrations `ENABLE ROW LEVEL SECURITY` with no `CREATE POLICY`: catalog L33–34, cost policy L34–35. Tests assert zero policies: `providers.test.ts` L195, L208. |
| **[SEC] Service-role key Node server modules only** (inherited US-14.5) | **PASS** | `createServerSupabaseClient()` uses `getServiceRoleKey()`: `lib/supabase/server.ts` L15–25. Helpers are `import "server-only"`. |
| **[SEC] Catalog/cost policy writes operator-only; no full client catalog read** | **PASS** | See AC table above. |
| **[SEC] Env var names only in catalog** | **PASS** | See AC table above. |
| **[SEC] (US-7.2) cost_model/capabilities trusted; no V1 catalog write endpoints** | **PASS** | Migration-only writes; Zod on read in `map-provider-catalog-rows.ts` L30–41. |
| **[SEC] (US-7.2 floor) provider_key server-derived at job creation** | **PASS** (floor documented) | No job-creation endpoints in this story. CONTRACT freeze preserved; no client `providerKey` input smuggled in. |
| **[SEC] (added) V1 seeded by migration only** | **PASS** | Two migration files with INSERT seeds only; no app mutations. |
| **[SEC] (added) No Cliente-facing full catalog read** | **PASS** | No HTTP/FE surfaces; grep confirms sole DB access via server helpers. |
| **[SEC] (added) `getProviderCatalog()` server-only, sole SELECT path** | **PASS** | `import "server-only"` + MUST-import comment: `get-provider-catalog.ts` L1–11, L32–36. No other app SELECT of `neuramark_provider_catalog`. |
| **[SEC] (added) `resolveProvider` server-only; active filter; typed error** | **PASS** | `import "server-only"` on `provider-adapters.ts` L10. `ProviderResolveError` with `PROVIDER_NOT_FOUND`: L96–107, L137–143. |
| **[SEC] (added) envKeyName UPPER_SNAKE_CASE; no secrets** | **PASS** | DB CHECK + Zod schema + tests (see above). |
| **[SEC] (added) Read-time Zod validation; corrupt rows skipped** | **PASS** | `mapProviderCatalogRows` skips invalid rows, logs code + key only: `map-provider-catalog-rows.ts` L30–41, L67–80. Tests: `providers.test.ts` L282–332. |
| **[SEC] (added) High-tier seed rows inactive** | **PASS** | Migration `active = false`; resolver tests (see AC). |
| **[SEC] (added) Global default cost policy low / 150** | **PASS** | Migration INSERT + `getDefaultCostPolicy` test: `providers.test.ts` L568–626. |
| **[SEC] (added) Parameterized queries; RLS deny-by-default** | **PASS** | Supabase client `.from().select()` builders; RLS enabled zero policies. |
| **[SEC] (added) No full jsonb logging** | **PASS** | Logs use codes + key/dbCode only: `map-provider-catalog-rows.ts` L34–37, `get-default-cost-policy.ts` L77–95. |
| **[SEC] (added) Automated security tests** | **PASS** | 26 tests cover migrations, RLS grep, secret scan, server-only boundaries, inactive exclusion, HTTP surface, Zod rejection. |

---

## CONTRACT Compliance

| Contract item | Status | Evidence |
|---------------|--------|----------|
| `neuramark_provider_catalog` + `neuramark_cost_policies` DDL | **PASS** | Migrations match frozen DDL (columns, indexes, triggers, CHECK constraints). |
| Seed rows (10 keys) + global policy | **PASS** | All `V1_CATALOG_SEED_KEYS` present: `lib/contracts/providers.ts` L183–194; migration grep tests. |
| `getProviderCatalog()` + `cache()` + soft failure | **PASS** | `get-provider-catalog.ts` L22–41. |
| `getDefaultCostPolicy()` + `cache()` + soft failure | **PASS** | `get-default-cost-policy.ts` L60–102. |
| `llmVariant` routing (default / fallback) | **PASS** | `provider-adapters.ts` L163–177; tests L338–369. |
| `manual` excluded unless `allowManualFallback` | **PASS** | `provider-adapters.ts` L127–135; test L405–420. |
| MuseTalk `hasReferenceLoop` preference | **PASS** | `provider-adapters.ts` L145–161; test L381–389. |
| No write endpoints / no HTTP catalog API | **PASS** | Grep + test L681–688. |
| Error codes frozen | **PASS** | `lib/contracts/providers.ts` L90–96; used in loaders. |

---

## Convention Compliance

| Convention | Status | Notes |
|------------|--------|-------|
| BE-only story (no FE) | **PASS** | No app routes, components, or i18n strings added — correct per USER_STORIES FE column `—`. |
| `neuramark_` DB prefix | **PASS** | Table, index, trigger, constraint names prefixed. |
| Supabase migrations only | **PASS** | Two files under `supabase/migrations/`. |
| Server-only Supabase access | **PASS** | Helpers use `createServerSupabaseClient()`; no browser SDK. |
| `import "server-only"` on loaders + resolver module | **PASS** | All three provider modules guarded. |
| No speculative HTTP APIs | **PASS** | Helpers only; mirrors `getPlaybookForAgents()` pattern. |
| Dependency US-X.3 | **PASS** | Story marked ✅ in TASKS.md; catalog is global config (no `client_id` on catalog per CONTRACT). US-X.3 `getCurrentUser()` seam unaffected. |

---

## Gaps (what blocks PASS)

None. **0 blockers.**

---

## Scope Creep

None identified. Implementation stays within BE/DB scope:

- No Operator UI (US-7.1)
- No policy engine / job creation (US-7.2+)
- No vendor adapter HTTP calls (US-8.x)
- No catalog write API

`lib/providers/index.ts` barrel re-exports server-only helpers — acceptable convenience; no Client Component imports detected.

---

## Notes (non-blocking)

1. **`plan/PROVIDER_TIERS.html` not fully synced** — seed table still omits `siliconflow_qwen`, `ltx_broll_high`, and `elevenlabs_tts_high` (CONTRACT marked html sync as optional doc follow-up). Migration and code are authoritative.
2. **AC key shorthand vs frozen keys** — USER_STORIES prose uses `siliconflow_deepseek` / `siliconflow_wan21`; implementation correctly uses CONTRACT keys `siliconflow_deepseek_flash` / `siliconflow_wan21_turbo` (SPEC-REVIEW resolution).
3. **`resolveProvider` signature** — USER_STORIES table says `resolveProvider(assetRole, tier)`; implementation is `resolveProvider(catalog, context)` per frozen CONTRACT (catalog loaded via `getProviderCatalog()`). Downstream agents must load catalog first — documented in helper comments.
4. **Barrel export caution** — `lib/providers/index.ts` exports server-only symbols; downstream should prefer direct imports from `get-provider-catalog.ts` / `provider-adapters.ts` to keep client bundle boundaries obvious (no current violations).

---

## Recommended Next Actions

| Action | Owner |
|--------|-------|
| QA gate on `feature/US-X.4-provider-catalog` @ `5ba9876` | qa-engineer |
| PO check off US-X.4 AC in `plan/USER_STORIES.md` after QA APPROVE | product-owner |
| Optional: sync `plan/PROVIDER_TIERS.html` seed table with all 10 keys | nextjs-backend (low priority) |
| Proceed **US-4.1** — consume `getProviderCatalog()` + `resolveProvider()` with `llmVariant: 'default'` | content-agents-engineer |

---

## Test Evidence

```
npx tsx --test lib/providers/providers.test.ts
ℹ tests 26 | pass 26 | fail 0
```
