# QA Report — US-8.2 Phase A (SadTalker adapter slice)

**Story:** US-8.2 — SadTalker adapter (V1 default talking-head, low tier)  
**Scope:** Phase A BUILD only — real `sadtalker_low` adapter, registry swap, asset resolver seam, mocked-HTTP tests  
**Branch:** `feature/US-8.2-sadtalker-adapter`  
**Commit reviewed:** `fba526c`  
**Reviewed:** 2026-08-29  
**Reviewer:** qa-engineer  
**Sources:** `plan/stories/US-8.2/{CONTRACT,SECURITY,TASKS}.md`, `lib/providers/video/sadtalker-low-adapter.ts`, `lib/contracts/sadtalker-low.ts`, `lib/media/resolve-media-asset-url-for-provider.ts`, `lib/media/upload-generated-video-buffer.ts`

### Verdict: APPROVE WITH CONDITIONS

**Severity counts:** Critical **0** · High **1** · Medium **1** · Low **2**  
**CLOSE recommended:** **Yes** — for **Phase A adapter slice** after **H1** (production build type error) is fixed. Phase A CONTRACT/SECURITY floors for the adapter module, registry swap, normalizers, allowlist, and mocked test matrix are met. **M1** (missing provider-asset read route) must land before any live `createJob` using the default asset resolver — acceptable to track into US-8.4 orchestration if orchestrator continues to inject URL resolvers in tests until then.

---

## Findings

### High

| ID | Location | Issue | Why it matters | Fix direction |
|----|----------|-------|----------------|---------------|
| H1 | `lib/contracts/sadtalker-low.ts:35` | `SADTALKER_FETCH_MAX_BYTES = 100 * 1024 * 1024 as const` — TypeScript rejects `as const` on a computed expression. | **`npm run build` fails** at type-check (`Checking validity of types … Failed to compile`). Phase A cannot deploy to Vercel until resolved. Unit tests pass via `tsx --test` but production compile is blocked. | Use a literal (e.g. `104_857_600 as const`) or drop `as const` on the computed value. Re-run `npm run build` to confirm. |

### Medium

| ID | Location | Issue | Why it matters | Fix direction |
|----|----------|-------|----------------|---------------|
| M1 | `lib/media/resolve-media-asset-url-for-provider.ts:63` | Default resolver builds signed URLs to `GET /api/media/provider-assets/{assetId}`, but **no Route Handler exists** (only `app/api/media/assets/[assetId]/route.ts` for session-authenticated avatar serve). | CONTRACT § Input asset resolution requires default impl to return a short-lived HTTPS URL Replicate can GET. Without the route, default-path `createJob` produces URLs that 404 when Replicate fetches inputs. Injectable resolver in tests masks this; live orchestration (US-8.4) will fail unless route ships or resolver stays injected. | Add `app/api/media/provider-assets/[assetId]/route.ts` with HMAC sig + `exp` + tenant validation (no session cookie — vendor-readable), **or** switch default to Storage presign. Must ship before production `createJob` with default resolver. |

### Low

| ID | Location | Issue | Why it matters | Fix direction |
|----|----------|-------|----------------|---------------|
| L1 | `lib/providers/video/sadtalker-low-adapter.ts:297-407` | `fetchAsset` requires `jobContextByExternalId` populated by `createJob` on the **same adapter instance**. | CONTRACT defers durable context to Phase B job row / orchestrator memory. Fly worker poller with fresh adapter instances will hit `PROVIDER_JOB_CONTEXT_MISSING` unless orchestrator passes lineage into `fetchAsset` or reloads context from DB. Acceptable for Phase A isolated tests; document for US-8.4. | US-8.4: pass `clientId`/`reelScriptId` from job row into download path or extend adapter factory params. |
| L2 | `lib/media/resolve-media-asset-url-for-provider.ts:19-23` | HMAC signing secret falls back to `SUPABASE_SERVICE_ROLE_KEY` when `NEURAMARK_PROVIDER_ASSET_URL_SECRET` unset. | Works locally; coupling URL MAC to service-role material is acceptable for dev but prefer dedicated secret in production. | Document in `.env.example`; set dedicated secret in deploy env before live vendor I/O. |

---

## Phase A SECURITY Review (binding items in scope)

| Control | Status | Evidence |
|---------|--------|----------|
| `REPLICATE_API_TOKEN` server-only; missing → `PROVIDER_CONFIG_MISSING` before fetch | **PASS** | `sadtalker-low-adapter.ts:65-73`, `311-313`; test 2 |
| Token never in error messages (sanitized) | **PASS** | `readResponseErrorMessage` → `sanitizeProviderErrorMessage`; test 5 |
| Replicate control plane confined to `https://api.replicate.com` | **PASS** | `REPLICATE_API_BASE_URL` + `replicateRequest`; grep allows `lib/contracts/sadtalker-low.ts` |
| `SADTALKER_ALLOWED_OUTPUT_HOSTS` frozen; validated in `getJobStatus` + `fetchAsset` | **PASS** | `sadtalker-low.ts:27-31`; adapter `345-352`, `389-396`, `423-427`; tests 3–4 |
| Download hardening: timeout, max bytes, redirect cap, manual redirect re-validation, video content-type | **PASS** | `downloadProviderOutput` `158-272`; constants in `sadtalker-low.ts:34-36` |
| Input assets via server-resolved IDs (no client URL strings) | **PASS** (resolver) / **PARTIAL** (route) | `resolveMediaAssetUrlForProvider` parameterized tenant query; adapter rejects `referenceVideoAssetId`; see **M1** for serve route |
| Mandatory normalization pipeline on Replicate JSON | **PASS** | `normalizeVideoJobStatusResult`, `parseExternalJobId`, `parseCreateVideoJobResult`; `starting` alias added `normalize-provider-response.ts:28` |
| `import "server-only"` on adapter + media helpers | **PASS** | Adapter, resolver, upload helper; test 7 |
| No `rawOutputUrl` / provider CDN URL persisted | **PASS** | Adapter returns `StoredMediaAsset` only; no DB writes in Phase A |
| Registry swap: real adapter, stub deleted | **PASS** | `create-provider-registry.ts:56`; `sadtalker-low-stub-adapter.ts` removed; test 5b |
| `replicate.com` only under `lib/providers/**` (+ contracts exception) | **PASS** | `provider-adapters.test.ts` test 13 |
| Phase B-only SEC (consent/budget gates, poller-only writes, IDOR poll) | **N/A** | Explicitly deferred to US-8.4 per CONTRACT phased acceptance |
| No Client Component imports of adapter modules | **PASS** | Grep: zero `@/lib/providers` under `components/**` |

---

## Phase A CONTRACT Compliance

| Item | Status |
|------|--------|
| Real `createSadtalkerLowAdapter` implementing `VideoProviderAdapter` | **PASS** |
| Registry registers real adapter for `sadtalker_low` | **PASS** |
| `estimateCost` from `defaultEstimateCents` (no hardcoded 10 in body) | **PASS** |
| Replicate create/get with frozen model version + input map | **PASS** |
| Input matrix: voiceover required; portrait/reference image; reject reference video | **PASS** |
| Prefer `portraitAssetId` when both portrait + reference image set | **PASS** |
| `fetchAsset` download-and-own → flat `{uuid}.mp4` storage key | **PASS** |
| Injectable `resolveMediaAssetUrl` + `uploadGeneratedVideo` + `fetchImpl` | **PASS** |
| Mocked-HTTP test matrix (CONTRACT § Automated tests cases 1–8) | **PASS** — 7 adapter tests + registry test 5b |
| Forbidden: `neuramark_video_jobs` DDL/writes | **PASS** — no migration in diff |
| Forbidden: job create/status Route Handlers / Server Actions | **PASS** |
| Forbidden: live Replicate in CI | **PASS** |
| Forbidden: client imports of adapter | **PASS** |
| Default asset URL resolver end-to-end | **PARTIAL** — see **M1** |
| Production build / type-check clean | **FAIL** — see **H1** |

---

## Checks Run

| Command | Result |
|---------|--------|
| `npx tsx --test lib/providers/video/sadtalker-low-adapter.test.ts lib/providers/provider-adapters.test.ts` | **22/22 pass** |
| `npx tsx --test lib/providers/providers.test.ts` | **29/29 pass** (no regressions) |
| `npm run build` | **FAIL** — type error `SADTALKER_FETCH_MAX_BYTES` const assertion (`sadtalker-low.ts:35`) |
| `npm run lint` | **Exit 1** — pre-existing repo issues + `no-require-imports` in test harness files (including new adapter test); no new lint errors in production adapter modules |
| Grep: `@/lib/providers` in Client Components | **0 matches** |
| Grep: `neuramark_video_jobs` in `lib/` / `app/` / `supabase/migrations/` on branch | **0 implementation** (plan docs only) |
| Grep: `sadtalker-low-stub-adapter` imports | **0** (file deleted) |

---

## What Was Not Covered

- Live Replicate API integration (explicitly out of scope — mocked HTTP only).
- End-to-end `createJob` with default `resolveMediaAssetUrlForProvider` against running Next.js (blocked by **M1** missing route).
- US-8.4 orchestration: consent/budget gates, poller, `neuramark_video_jobs`, IDOR-safe status poll, `finalizeGenerationCost`.
- SECURITY test (5) IDOR 404 on job status poll — Phase B / US-8.4.
- Full combined provider/policy suite (US-8.1 VALIDATION matrix); QA re-ran adapter + registry + `providers.test.ts` only.
- Production bundle analysis for `REPLICATE_API_TOKEN` leakage (no FE consumers; `server-only` on adapter path).

---

## Recommended Next Actions

| Action | Owner | Priority |
|--------|-------|----------|
| **Fix H1** — `SADTALKER_FETCH_MAX_BYTES` type; confirm `npm run build` passes | **media-pipeline-engineer** / **nextjs-backend** | **Block merge** |
| **Fix M1** — provider-asset read Route Handler (or presign default) before live vendor create | **nextjs-backend** | **Before US-8.4 live createJob** |
| Re-run QA gate after H1 fix | **qa-engineer** | After fix |
| US-8.4: wire job-row context for `fetchAsset` on worker (see L1) | **media-pipeline-engineer** | Phase B |
| PO: mark Phase A BUILD complete in `TASKS.md`; full USER_STORIES AC remains US-8.4 + US-9.3 | **product-owner** | After H1 |

---

## Signoff

- [x] Phase A SECURITY floors verified (adapter token hygiene, allowlist, normalization, server-only, no persistence of provider URLs)
- [x] Phase A CONTRACT behavior spot-checked (adapter methods, registry swap, test matrix, forbidden surfaces)
- [x] Automated Phase A test matrix executed (22/22 adapter + registry)
- [ ] Production build passes — **blocked by H1**
- [x] **CLOSE Phase A adapter slice recommended** after **H1** resolved; **M1** before live default-path `createJob`

**Yes — CLOSE recommended** for US-8.2 **Phase A** after **H1** is fixed (expected one-line diff in `lib/contracts/sadtalker-low.ts`). Core Phase A intent is met: first real vendor `VideoProviderAdapter` for `sadtalker_low` with Replicate create/poll/download, registry stub replacement, frozen allowlist/constants, injectable seams, and mocked security tests aligned with `CONTRACT.md` and Phase A `SECURITY.md` reconciliation. Full USER_STORIES US-8.2 acceptance (orchestration, poller, FE status, E2E playable Reel) remains **US-8.4 + US-9.3**.
