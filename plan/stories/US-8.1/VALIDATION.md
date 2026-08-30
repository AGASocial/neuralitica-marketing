# Validation Report — US-8.1

**Story:** Provider adapter interface  
**Branch:** `feature/US-8.1-provider-adapter-interface`  
**Commit:** `a11d4ae` (`feat(US-8.1): provider adapter interface, registry, and response normalizers.`)  
**Date:** 2026-08-29  
**Validator:** requirements-validator  

**Tests run:**

```bash
npx tsx --test lib/providers/provider-adapters.test.ts \
  lib/providers/providers.test.ts \
  lib/providers/provider-policy-engine.test.ts
```

**Result:** **52/52 pass** (14 US-8.1 + 38 upstream provider/policy suites)

| Suite | Pass | Fail |
|-------|------|------|
| `provider-adapters.test.ts` | 14 | 0 |
| `providers.test.ts` | 26 | 0 |
| `provider-policy-engine.test.ts` | 12 | 0 |

---

## Verdict: PASS WITH NOTES

The video adapter contract, frozen registry bootstrap, untrusted-response normalization helpers, Zod boundary schemas, and three deterministic video stubs match USER_STORIES § US-8.1, frozen CONTRACT.md, and SECURITY.md conditions. No FE scope; no HTTP routes; no DB migration — all correct for this story.

**Notes (non-blocking; track in US-8.2 / ops):**

1. **`getProviderRegistry()` uses offline bootstrap catalog** (`buildBootstrapCatalog()` in `create-provider-registry.ts:67-103`) rather than live `getProviderCatalog()` on first access. `initializeProviderRegistryFromCatalog()` exists (`create-provider-registry.ts:152-158`) but is not wired at app startup — prod should call it once Supabase is required for registry init, or document that offline bootstrap is intentional until US-8.2 job create lands.
2. **Stub adapters skip normalization helpers in `getJobStatus`** — they return Zod-validated fixed shapes directly (`create-stub-video-adapter.ts:46-52`). Acceptable for US-8.1 stubs; **real vendor adapters (US-8.2+)** must pipe vendor payloads through `normalizeVideoJobStatusResult` / `normalizeProviderJobStatus` per CONTRACT § Untrusted-response normalization.
3. **Test 11 asserts `server-only` only on `provider-adapters.ts` and `create-provider-registry.ts`** — CONTRACT also freezes `normalize-provider-response.ts` and `lib/providers/video/*`; those files contain `import "server-only"` but lack explicit test coverage (manual inspection confirms).
4. **Stub `fetchAsset` storage keys embed `externalJobId`** (`stub/{providerKey}/{externalJobId}.mp4`) — allowed by CONTRACT for stubs/tests only; production adapters must use server-generated UUID paths (CONTRACT § `fetchAsset` storage).
5. **LLM/TTS adapters not registered in factory** — CONTRACT marks this optional; video stubs are the AC focus. LLM continues direct stub imports (US-X.4 pattern).
6. **No `npm test` script** — provider suites run via `npx tsx --test` (consistent with repo convention).

---

## Acceptance Criteria

| Criterion | Status | Evidence |
|-----------|--------|----------|
| `VideoProviderAdapter` interface exists in `lib/providers/` with four methods; types shared via `lib/contracts/providers.ts` | **PASS** | Interface at `lib/providers/provider-adapters.ts:225-243` (`estimateCost`, `createJob`, `getJobStatus`, `fetchAsset`); shared types/schemas in `lib/contracts/providers.ts` (`externalJobIdSchema`, `costEstimateSchema`, `createVideoJobResultSchema`, `videoJobStatusResultSchema`, `storedMediaAssetSchema`). |
| New provider = new adapter class + catalog row + env var, no changes to assembly pipeline (US-9.x) | **PASS** | Registry + interface pattern; stub factories under `lib/providers/video/`; `createProviderRegistry` registers by catalog key (`create-provider-registry.ts:105-133`); no US-9.x / assembly files modified in `a11d4ae`. |
| All jobs share statuses: `queued`, `processing`, `completed`, `failed`, `cancelled` | **PASS** | `VIDEO_JOB_STATUSES` constant (`provider-adapters.ts:62-68`); `videoJobStatusSchema` in contracts; round-trip test asserts status ⊆ enum (`provider-adapters.test.ts:237-238`). |
| [SEC] All adapter code is server-only; provider API keys from server env only — never DB, `NEXT_PUBLIC_*`, responses, or logs | **PASS** | `import "server-only"` on `provider-adapters.ts:10`, `create-provider-registry.ts:1`, `normalize-provider-response.ts:1`, `create-stub-video-adapter.ts:1`, stub adapter files; stubs perform no env reads; catalog `envKeyName` remains name-only (upstream US-X.4); grep test 13 confirms no vendor host strings outside `lib/providers/**`. |
| [SEC] Adapter interface treats provider responses as untrusted: status/URL/error validated/normalized before persistence; error text sanitized before display | **PASS WITH NOTE** | Helpers shipped: `normalizeProviderJobStatus`, `sanitizeProviderErrorMessage`, `validateProviderOutputUrl`, `normalizeVideoJobStatusResult` (`normalize-provider-response.ts:44-152`); schemas reject invalid status and non-https URLs (`provider-adapters.test.ts:276-295`). **Note:** stubs bypass helpers but outputs pass Zod; real adapters must call helpers (item 2 above). |
| [SEC] `external_job_id` stored opaque; only sent back to same provider's adapter; never used for local file paths or DB queries beyond exact-match lookup | **PASS WITH NOTE** | `externalJobIdSchema` with max 512, charset, traversal rejection (`lib/contracts/providers.ts:117-136`); wired into `createVideoJobResultSchema:182`; tests reject `../evil`, `/`, `\`, overlong ids (`provider-adapters.test.ts:247-257`). Persistence/lookup rules documented in CONTRACT (US-8.2 DDL). **Note:** stub storage keys use `externalJobId` per CONTRACT stub allowance only. |

---

## SECURITY.md (binding conditions)

| Condition | Status | Evidence |
|-----------|--------|----------|
| Registry bootstrap sole mutation site; frozen after init | **PASS** | `createProviderRegistry` registers stubs then `registry.freeze()` (`create-provider-registry.ts:128-132`); `RegistryFrozenError` on post-freeze register (`provider-adapters.ts:323-327`, test 4). |
| Bootstrap validates adapter `providerKey` against catalog | **PASS** | Catalog key set check before register (`create-provider-registry.ts:109-114`); adapter key mismatch guard (`create-provider-registry.ts:124-126`). |
| Singleton `getProviderRegistry()` | **PASS** | Lazy singleton (`create-provider-registry.ts:144-149`); test 1 same-instance. |
| `ProviderAdapterNotFoundError` with `PROVIDER_ADAPTER_NOT_FOUND` | **PASS** | Error class (`provider-adapters.ts:114-121`); test 3. |
| `registerVideo(` only in bootstrap (+ tests) | **PASS** | Grep test 12. |
| No vendor HTTP outside `lib/providers/**` | **PASS** | Stubs have no `fetch`; grep test 13. |
| Closed result schemas; `rawOutputUrl` non-persistent | **PASS** | `persistedVideoJobStatusSchema` omits `rawOutputUrl` (`providers.ts:201-205`); test 10 rejects persisted URL. |
| `sanitizeProviderErrorMessage` spec | **PASS** | Redacts Bearer/sk-/query params; empty → generic fallback (`normalize-provider-response.ts:53-76`); test 8. |

---

## CONTRACT Match

| CONTRACT area | Status | Notes |
|---------------|--------|-------|
| `VideoProviderAdapter` four-method interface | **PASS** | Frozen signatures with `ExternalJobId` |
| `createProviderRegistry` + `getProviderRegistry` | **PASS** | Offline bootstrap default; async catalog init available |
| `normalize-provider-response.ts` helpers | **PASS** | All three helpers + composer |
| Stub adapters: `sadtalker_low`, `siliconflow_wan21_turbo`, `heygen_high` | **PASS** | Roles: primary / broll / primary; registered in bootstrap |
| Zod: `externalJobIdSchema`, `costEstimateSchema`, `persistedVideoJobStatusSchema` | **PASS** | `lib/contracts/providers.ts` |
| `ProviderAdapterNotFoundError`, `RegistryFrozenError` | **PASS** | `provider-adapters.ts` |
| ADR-0003 runtime split documented | **PASS** | CONTRACT § ADR-0003 (interface-only BUILD; no poller wiring — correct) |
| Automated test matrix (14 tests) | **PASS** | `provider-adapters.test.ts` |
| No Route Handlers / no migration / no FE | **PASS** | `a11d4ae` diff; grep `app/**` — no provider job routes |

---

## Convention Compliance

| Check | Status | Evidence |
|-------|--------|----------|
| EN + ES user-facing strings | **N/A** | BE-only story; no UI |
| Server Components default / minimal `"use client"` | **N/A** | No FE |
| PrimeReact-first | **N/A** | No FE |
| Loading / empty / error / pending states | **N/A** | No FE |
| Auth via `getCurrentUser()` / no browser Supabase | **N/A** | No user-facing endpoints |
| Backend endpoints map to concrete FE consumer | **PASS** | No speculative HTTP; helpers consumed by US-8.2+ / `estimateVideoJobCost` |
| `neuramark_` DB prefix | **N/A** | No migration in scope |
| Depends on US-7.2 | **PASS** | `resolveProviderForJob`, forbidden keys, policy tests pass in combined run |

---

## Gaps (what blocks PASS)

None. All USER_STORIES § US-8.1 acceptance criteria are satisfied at commit `a11d4ae`. Notes above are follow-ups for downstream stories, not blockers.

---

## Scope Creep

None observed in `a11d4ae`. Changes limited to:

- `lib/contracts/providers.ts` — Zod extensions
- `lib/providers/provider-adapters.ts` — error types, registry freeze, default registry in `estimateVideoJobCost`
- `lib/providers/create-provider-registry.ts` — new
- `lib/providers/normalize-provider-response.ts` — new
- `lib/providers/video/*` — stub factories
- `lib/providers/provider-adapters.test.ts` — new
- `lib/providers/index.ts` — export `getProviderRegistry`

No Route Handlers, migrations, FE, or vendor HTTP.

---

## Recommended Next Actions

| Action | Owner |
|--------|-------|
| Wire `initializeProviderRegistryFromCatalog()` at server startup (or document offline bootstrap until US-8.2) | **nextjs-backend** / **media-pipeline-engineer** (US-8.2) |
| Implement real `sadtalker_low` adapter using normalization helpers + Storage upload | **media-pipeline-engineer** (US-8.2) |
| PO checks acceptance criteria boxes in `plan/USER_STORIES.md` § US-8.1 | **product-owner** |
| Run **qa-engineer** gate (`QA.md`) | **qa-engineer** |
| Extend test 11 to cover `normalize-provider-response.ts` and `lib/providers/video/*` `server-only` | **media-pipeline-engineer** (optional polish) |

---

## Gate status (TASKS.md)

| Gate | Status |
|------|--------|
| SPEC-REVIEW | ✅ |
| SECURITY | ✅ |
| CONTRACT | ✅ Frozen |
| BUILD | ✅ (commit `a11d4ae`) |
| VALIDATION | ✅ PASS WITH NOTES (this report) |
| QA | Pending |
