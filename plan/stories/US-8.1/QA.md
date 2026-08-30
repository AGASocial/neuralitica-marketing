# QA Report — US-8.1 Provider adapter interface

**Story:** US-8.1  
**Branch:** `feature/US-8.1-provider-adapter-interface`  
**Commits reviewed:** `335f73c` … `7367929` (through VALIDATION); implementation focus `a11d4ae`  
**Reviewed:** 2026-08-29  
**Reviewer:** qa-engineer  
**Sources:** `plan/stories/US-8.1/{CONTRACT,SECURITY,TASKS,VALIDATION}.md`, `lib/providers/*`, `lib/contracts/providers.ts`

### Verdict: BLOCK

**Severity counts:** Critical **0** · High **1** · Medium **1** · Low **3**  
**CLOSE recommended:** **No** — fix **H1** (production build type error) before merge/close. Medium/Low items are follow-ups or US-8.2 hardening, not additional merge gates once H1 is resolved.

---

## Findings

### High

| ID | Location | Issue | Why it matters | Fix direction |
|----|----------|-------|----------------|---------------|
| H1 | `lib/providers/normalize-provider-response.ts:8` | Imports `type VideoJobStatusResult` from `@/lib/contracts/providers`, but that module does not export `VideoJobStatusResult` (interface lives in `lib/providers/provider-adapters.ts:214-219`; contracts only export `videoJobStatusResultSchema`). | **`npm run build` fails** at Next.js type-check (`Checking validity of types … Failed to compile`). US-8.1 modules cannot ship to Vercel until resolved. Unit tests pass via `tsx --test` but production compile is blocked. | Export `VideoJobStatusResult` from contracts (e.g. `z.infer<typeof videoJobStatusResultSchema>`) **or** import the interface type from `provider-adapters.ts` in the normalizer. Re-run `npm run build` to confirm. |

### Medium

| ID | Location | Issue | Why it matters | Fix direction |
|----|----------|-------|----------------|---------------|
| M1 | `lib/providers/create-provider-registry.ts:67-103`, `144-149` | `getProviderRegistry()` lazy-init uses offline `buildBootstrapCatalog()` instead of live `getProviderCatalog()`. `initializeProviderRegistryFromCatalog()` exists (`152-158`) but has **zero call sites**. | CONTRACT bootstrap step 2 specifies catalog load via `getProviderCatalog()`. Offline snapshot matches V1 seed today, but DB/catalog drift (activation, cost model edits) would not be reflected in registry validation or stub estimate defaults until US-8.2 wires async init. Blast radius limited while no video job orchestration consumes the singleton in prod paths beyond `estimateVideoJobCost` optional default. | Wire `initializeProviderRegistryFromCatalog()` at server startup (instrumentation or first job path in US-8.2), or document intentional offline bootstrap until then. |

### Low

| ID | Location | Issue | Why it matters | Fix direction |
|----|----------|-------|----------------|---------------|
| L1 | `lib/providers/index.ts:20-24` | Barrel re-exports `createProviderRegistry` alongside `getProviderRegistry`. | SECURITY/CONTRACT: handlers should import **`getProviderRegistry()` only**; exporting the factory from the barrel increases accidental runtime re-bootstrap or handler misuse. No current `app/**` imports detected. | Remove `createProviderRegistry` from barrel (keep test/direct imports) or add file-level warning; prefer CONTRACT-recommended direct imports. |
| L2 | `lib/providers/video/create-stub-video-adapter.ts:46-52` | Stub `getJobStatus` returns Zod-validated fixed shapes without calling `normalizeProviderJobStatus` / `normalizeVideoJobStatusResult`. | CONTRACT adapter rule: real vendors must pipe untrusted payloads through normalizers. Stubs are deterministic and pass schema tests — acceptable for US-8.1 AC — but real adapters (US-8.2+) must not copy this shortcut. | No change for stubs; enforce in US-8.2 code review / adapter template. |
| L3 | `lib/providers/provider-adapters.test.ts:313-317` | Test 11 asserts `import "server-only"` only on `provider-adapters.ts` and `create-provider-registry.ts`. | CONTRACT frozen module list also includes `normalize-provider-response.ts` and `lib/providers/video/*` (manual inspection confirms `server-only` present; test gap only). | Extend test 11 file list for defense-in-depth. |

---

## Security Review Summary

| Control | Status | Evidence |
|---------|--------|----------|
| Registry bootstrap sole mutation site; frozen after init | **PASS** | `create-provider-registry.ts:128-132`; `RegistryFrozenError` (`provider-adapters.ts:323-327`); test 4 |
| Bootstrap validates adapter keys ∈ catalog | **PASS** | Key set check + mismatch guard (`create-provider-registry.ts:109-126`) |
| Singleton `getProviderRegistry()` | **PASS** | `create-provider-registry.ts:144-149`; test 1 |
| `ProviderAdapterNotFoundError` + `PROVIDER_ADAPTER_NOT_FOUND` | **PASS** | `provider-adapters.ts:114-121`; test 3 |
| TTS/LLM getters throw typed not-found (not generic `Error`) | **PASS** | `provider-adapters.ts:352-365` |
| `registerVideo(` only in bootstrap (+ tests + interface def) | **PASS** | Grep test 12; no `app/**` register calls |
| No vendor HTTP in US-8.1 stubs | **PASS** | Stubs have no `fetch`; grep test 13 |
| Untrusted-response helpers shipped | **PASS** | `normalizeProviderJobStatus`, `sanitizeProviderErrorMessage`, `validateProviderOutputUrl`, `normalizeVideoJobStatusResult` (`normalize-provider-response.ts`) |
| `sanitizeProviderErrorMessage` redaction spec | **PASS** | Bearer/sk-/query param/base64 redaction; empty → generic fallback; test 8 |
| `externalJobIdSchema` opaque + traversal rejection | **PASS** | `lib/contracts/providers.ts:117-136`; test 6 |
| `persistedVideoJobStatusSchema` excludes `rawOutputUrl` | **PASS** | `providers.ts:201-205`; test 10 |
| `videoJobStatusResultSchema` rejects non-enum status / http URLs | **PASS** | test 9 |
| `import "server-only"` on adapter/registry/normalizer/stub modules | **PASS** | All US-8.1 provider modules; test 11 partial — see L3 |
| No Client Component imports of `lib/providers/**` | **PASS** | Grep: zero `@/lib/providers` under `components/**` |
| No new Route Handlers / job HTTP surface | **PASS** | Grep `app/**`: no registry/provider job routes |
| No DB migration / no unprefixed objects | **PASS** | No migration in branch diff |
| Adapter lookup from engine output only (production paths) | **PASS** | `estimateVideoJobCost` uses `resolveProvider` → `row.key` → `getVideoAdapter` (`provider-adapters.ts:384-388`); no handler `getVideoAdapter(request…)` pattern |
| Secrets not in stub responses / no env reads in stubs | **PASS** | Stub bodies deterministic; no `process.env` in stub adapters |

---

## CONTRACT Compliance (spot-check)

| Item | Status |
|------|--------|
| `VideoProviderAdapter` four-method interface + `ExternalJobId` | **PASS** |
| `createProviderRegistry` + `getProviderRegistry` singleton + freeze | **PASS** |
| `ProviderAdapterNotFoundError`, `RegistryFrozenError` | **PASS** |
| Stub keys: `sadtalker_low`, `siliconflow_wan21_turbo`, `heygen_high` + roles | **PASS** |
| `normalize-provider-response.ts` helpers + composer | **PASS** (H1 is type export only, not behavior) |
| Zod: `externalJobIdSchema`, `costEstimateSchema`, `persistedVideoJobStatusSchema` | **PASS** |
| `createVideoJobResultSchema` uses `externalJobIdSchema` | **PASS** |
| `estimateVideoJobCost` optional default registry | **PASS** |
| Automated test matrix (14 tests) | **PASS** |
| No Route Handlers / no FE / no migration | **PASS** |
| Bootstrap loads catalog via `getProviderCatalog()` | **PARTIAL** — see M1 |
| Production build / type-check clean | **FAIL** — see H1 |

---

## Checks Run

| Command | Result |
|---------|--------|
| `npx tsx --test lib/providers/provider-adapters.test.ts` | **14/14 pass** |
| `npx tsx --test lib/providers/providers.test.ts` | **29/29 pass** (no regressions) |
| `npm run build` | **FAIL** — type error `VideoJobStatusResult` not exported from `@/lib/contracts/providers` (`normalize-provider-response.ts:8`) |
| `npx tsc --noEmit` | **FAIL** on US-8.1 file above; pre-existing test-file noise elsewhere (TS5097 harness pattern) |
| `npm run lint` | **Exit 0**; pre-existing `no-require-imports` in unrelated test files |
| Grep: `registerVideo(` outside bootstrap | **PASS** (test 12) |
| Grep: vendor hosts outside `lib/providers/**` | **PASS** (test 13) |
| Grep: `@/lib/providers` in Client Components | **0 matches** |
| Grep: `getProviderRegistry` / `registerVideo` in `app/**` | **0 matches** |

---

## What Was Not Covered

- Live Supabase apply or runtime call to `initializeProviderRegistryFromCatalog()`.
- End-to-end video job create/poller (US-8.2 / US-8.4 — explicitly out of scope).
- Production bundle analysis for accidental registry leakage (no FE consumers; `server-only` expected to guard client graph).
- Automated grep for `getVideoAdapter(` fed from `req` / `body` / `searchParams` (no production video orchestration call sites yet; SECURITY test deferred to US-8.2 wiring).
- Full combined provider/policy suite re-run (VALIDATION reported 52/52 at `7367929`; QA re-ran US-8.1 + `providers.test.ts` only).

---

## Recommended Next Actions

| Action | Owner | Priority |
|--------|-------|----------|
| **Fix H1** — resolve `VideoJobStatusResult` import; confirm `npm run build` passes | **media-pipeline-engineer** / **nextjs-backend** | **Block merge** |
| Re-run QA gate after H1 fix | **qa-engineer** | After fix |
| Wire catalog-backed registry init or document offline bootstrap until US-8.2 | **nextjs-backend** | Medium (M1) |
| PO AC checkoff in `plan/USER_STORIES.md` § US-8.1 | **product-owner** | After H1 + QA re-pass |
| Optional: barrel trim (L1), extend server-only test (L3) | **media-pipeline-engineer** | Low |

---

## Signoff

- [x] Security boundaries verified against frozen SECURITY.md (registry freeze, closed schemas, server-only, no HTTP/FE)
- [x] CONTRACT behavior spot-checked (stubs, normalizers, Zod, test matrix)
- [x] Automated US-8.1 test matrix executed (14/14)
- [ ] Production build passes — **blocked by H1**
- [ ] **CLOSE** US-8.1 — **not recommended until H1 resolved and build green**
