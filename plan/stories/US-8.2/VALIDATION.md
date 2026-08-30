# Validation Report — US-8.2 (Phase A)

**Story:** SadTalker adapter (V1 default talking-head, low tier)  
**Phase:** **A** — adapter + registry + mocked-HTTP tests (CONTRACT § Phased BUILD acceptance)  
**Branch:** `feature/US-8.2-sadtalker-adapter`  
**Commit:** `fba526c` (`feat(US-8.2): Replicate SadTalker low-tier video adapter`)  
**Date:** 2026-08-29  
**Validator:** requirements-validator  

**Tests run:**

```bash
npx tsx --test lib/providers/video/sadtalker-low-adapter.test.ts \
  lib/providers/provider-adapters.test.ts
```

**Result:** **22/22 pass** (7 US-8.2 SadTalker + 15 US-8.1 registry/normalization)

| Suite | Pass | Fail |
|-------|------|------|
| `sadtalker-low-adapter.test.ts` | 7 | 0 |
| `provider-adapters.test.ts` | 15 | 0 |

---

## Verdict: PASS WITH NOTES

Phase A BUILD delivers the frozen CONTRACT scope: real `sadtalker_low` `VideoProviderAdapter` (Replicate HTTP), registry swap (stub deleted), `estimateCost` from catalog `per_run`, normalizers wired, `SADTALKER_ALLOWED_OUTPUT_HOSTS`, asset URL resolver + storage upload seams, and mocked-HTTP unit tests with no live network. No FE, no `neuramark_video_jobs` DDL/writes, no job-create/status Route Handlers — all correct per Phase A freeze.

**Full USER_STORIES § US-8.2 acceptance criteria remain intentionally open** until **US-8.4** (orchestration, poller, job DDL, consent/budget gates, status UI) and **US-9.3** (voiceover E2E). Phase B owner for those AC rows is documented below.

---

## Phase A vs Phase B (US-8.4) — AC ownership

| USER_STORIES AC | Phase A (`fba526c`) | Phase B (US-8.4 / US-9.3) |
|-----------------|---------------------|----------------------------|
| Default talking-head when `provider_tier = low` + `own_avatar` / `generic_avatar` | **Partial** — US-7.2 policy still resolves `sadtalker_low`; real adapter registered; no production job-create path | Orchestrator `createTalkingHeadVideoJob()` wires policy → adapter |
| Inputs: portrait still + voiceover (US-9.3) | **Partial** — adapter validates `portraitAssetId` / `referenceImageAssetId` + `voiceoverAssetId`; rejects `referenceVideoAssetId` (MuseTalk path) | US-9.3 produces voiceover asset; orchestrator resolves IDs with ownership |
| Successful job → playable video in `media_assets` (not third-party URL) | **Partial** — `fetchAsset` downloads allowlisted URL → Storage `{uuid}.mp4` → `storedMediaAssetSchema`; **no** `neuramark_media_assets` INSERT | Poller INSERT + job `output_media_asset_id` FK |
| Failures capture provider error; retries configurable | **Partial** — `sanitizeProviderErrorMessage` on vendor errors; retry/max-attempts → US-8.4 | Retry handler, `parent_job_id`, Operator UI |
| Estimated cost flat `per_run` (~10¢) | **PASS** — `estimateCost` uses `defaultEstimateCents` from catalog bootstrap (10¢) | Spend ledger sync on create/complete |
| [SEC] Consent (US-3.2) + budget (US-7.1) before submit | **Deferred** — forbidden inside adapter per CONTRACT | `createTalkingHeadVideoJob` gate order |
| [SEC] Status updated only by server poller | **Deferred** — no job rows or poll loop | Fly worker + US-8.4 |
| [SEC] Output downloaded server-side; provider URLs validated | **PASS** — `validateProviderOutputUrl` + hardened `downloadProviderOutput` in adapter | Poller calls same adapter methods |
| [SEC] Browser status poll scoped to client → 404 foreign | **Deferred** — no status Route Handler | US-8.4 `GET /api/video-jobs/[jobId]` |

---

## Acceptance Criteria (USER_STORIES § US-8.2 — full story text)

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Default talking-head provider when `provider_tier = low` and visual mode is `own_avatar` or `generic_avatar` | **PARTIAL (Phase A)** | Policy: `providers.test.ts` / `provider-policy-engine.test.ts` resolve talking-head → `sadtalker_low` (US-7.2 ✅). Registry registers real adapter: `create-provider-registry.ts:55-56`, `sadtalker-low-adapter.ts:300-301`. No E2E job submission in Phase A. |
| Inputs: one approved reference image (own avatar) or generic loop still + voiceover audio from US-9.3 | **PARTIAL (Phase A)** | `validateCreateJobInput` requires `voiceoverAssetId` + portrait/reference image; rejects video loop (`sadtalker-low-adapter.ts:76-99`). Tests use fixture asset IDs with injected URL resolver (`sadtalker-low-adapter.test.ts:76-87`, test 1). US-9.3 orchestration not wired. |
| Successful job returns playable video stored as `media_assets` (not a long-lived third-party URL) | **PARTIAL (Phase A)** | `fetchAsset`: allowlist → download → `uploadGeneratedVideoBuffer` → `storedMediaAssetSchema` (`sadtalker-low-adapter.ts:399-442`; `upload-generated-video-buffer.ts:23-35`). No DB INSERT (CONTRACT Phase A). Round-trip test 1 passes. |
| Failures capture provider error message; retries configurable with max attempts | **PARTIAL (Phase A)** | `readResponseErrorMessage` + `sanitizeProviderErrorMessage` (`sadtalker-low-adapter.ts:122-138`, test 5). Retry/max attempts → US-8.4 CONTRACT. |
| Estimated cost uses flat per-run model from `provider_catalog` (~$0.10/Reel at research baseline) | **PASS** | `estimateCost` returns `defaultEstimateCents` from registry bootstrap (`sadtalker-low-adapter.ts:303-308`). Bootstrap catalog `sadtalker_low` = 10¢ `per_run` (`create-provider-registry.ts:72-77`). Test 14 in `provider-adapters.test.ts`. |
| [SEC] Job creation re-verifies active avatar consent (US-3.2) when mode is `own_avatar`, and budget (US-7.1) server-side immediately before submit | **DEFERRED (US-8.4)** | CONTRACT forbids gates inside adapter (`CONTRACT.md` § Forbidden surfaces). No `createTalkingHeadVideoJob` in `fba526c`. |
| [SEC] Job status is updated only by the server-side poller; no client-callable endpoint can set status or `output_url` | **DEFERRED (US-8.4)** | No `neuramark_video_jobs` writes; no status Route Handlers in commit. |
| [SEC] Output video is downloaded server-side; provider URLs are validated (https, expected host) before fetch | **PASS** | `SADTALKER_ALLOWED_OUTPUT_HOSTS` (`lib/contracts/sadtalker-low.ts:27-31`); `validateProviderOutputUrl` in `getJobStatus` path via normalizer and explicitly in `fetchAsset` + redirect loop (`sadtalker-low-adapter.ts:163-204`, `423-427`). Tests 3–4. |
| [SEC] Status polling from the browser is scoped to jobs owned by the current client; foreign job IDs return 404 | **DEFERRED (US-8.4)** | No poll Route Handler in Phase A. |

---

## Phase A CONTRACT checklist

| Deliverable | Status | Evidence |
|-------------|--------|----------|
| `createSadtalkerLowAdapter` — Replicate Predictions API | **PASS** | `sadtalker-low-adapter.ts:275-444` — POST `/v1/predictions`, GET `/v1/predictions/{id}` |
| `lib/contracts/sadtalker-low.ts` frozen constants | **PASS** | Model version, hosts, MIME allowlists, fetch limits (`sadtalker-low.ts`) |
| Registry swap; delete stub | **PASS** | `create-provider-registry.ts:14,55-56`; `sadtalker-low-stub-adapter.ts` removed (0 files in tree) |
| `estimateCost` from catalog `per_run` | **PASS** | See AC row above |
| Normalizers wired (`normalizeVideoJobStatusResult`, sanitization) | **PASS** | `createJob`/`getJobStatus` (`sadtalker-low-adapter.ts:345-396`); `starting` → `queued` alias added (`normalize-provider-response.ts:28`) |
| `resolveMediaAssetUrlForProvider` seam | **PASS WITH NOTE** | `resolve-media-asset-url-for-provider.ts:74-131` — tenant-scoped DB lookup + HMAC signed URL. **Note:** URL targets `/api/media/provider-assets/{id}` but **no Route Handler exists** in repo (only `/api/media/assets/[assetId]` for session auth). Tests inject mock resolver; production default path needs US-8.4 route or Storage presign. |
| `uploadGeneratedVideoBuffer` — flat `{uuid}.mp4` | **PASS** | `upload-generated-video-buffer.ts:26-27` |
| Mocked-HTTP tests (CONTRACT matrix § Automated tests) | **PASS** | All 8 CONTRACT cases covered in `sadtalker-low-adapter.test.ts` + test 5b registry regression |
| No `neuramark_video_jobs` DDL/writes | **PASS** | No migration or job persistence in `fba526c` |
| No Route Handlers / Server Actions for job create or status | **PASS** | `git show fba526c --name-only` — no `app/**/route.ts` |
| No FE | **PASS** | No `app/` or `components/` changes in commit |
| `import "server-only"` on adapter + media helpers | **PASS** | `sadtalker-low-adapter.ts:1`; resolver/upload modules; test 7 |
| No live Replicate in CI | **PASS** | `fetchImpl` injection in tests |

---

## SECURITY.md (Phase A binding items)

| Condition | Status | Evidence |
|-----------|--------|----------|
| `REPLICATE_API_TOKEN` server-only; missing → `PROVIDER_CONFIG_MISSING` before I/O | **PASS** | `getReplicateApiToken` (`sadtalker-low-adapter.ts:65-74`); tests 2, 5b |
| Output URL allowlist + https only | **PASS** | `SADTALKER_ALLOWED_OUTPUT_HOSTS`; tests 3–4 |
| Input assets via Storage ownership, not client URLs | **PASS** | `resolveMediaAssetUrlForProvider` — DB `client_id` match + MIME allowlist; never accepts URL strings on job input |
| Untrusted vendor JSON → normalizers | **PASS** | `normalizeVideoJobStatusResult`, `sanitizeProviderErrorMessage`, `parseExternalJobId` |
| No canonical provider URL in persistence | **PASS (Phase A)** | `fetchAsset` returns `storageKey` only; no job DB in Phase A |
| Budget + consent gates before vendor I/O | **DEFERRED (US-8.4)** | Orchestrator responsibility per CONTRACT |
| Poller-only status writes | **DEFERRED (US-8.4)** | — |
| IDOR on poll → 404 | **DEFERRED (US-8.4)** | — |

---

## Convention Compliance

| Rule | Status | Notes |
|------|--------|-------|
| English + Spanish user-facing strings | **N/A** | BE-only Phase A; no new UI |
| Server Components default; minimal `"use client"` | **N/A** | No FE |
| PrimeReact-first | **N/A** | No FE |
| Loading / empty / error / pending states | **N/A** | No FE |
| Auth via Next.js endpoints; `getCurrentUser()` | **N/A** | No new user-facing endpoints in Phase A |
| Backend endpoints map to concrete FE consumer | **N/A** | Adapter is internal; status UI → US-8.4 |
| `neuramark_` DB prefix | **PASS** | Resolver queries `neuramark_media_assets` (`resolve-media-asset-url-for-provider.ts:13`) |
| No Supabase in Client Components | **PASS** | All new modules `server-only` |

---

## Dependencies

| Dependency | Status | Evidence |
|------------|--------|----------|
| US-8.1 ✅ adapter interface + registry + normalizers | **Satisfied** | Extends `VideoProviderAdapter`; uses US-8.1 helpers |
| US-X.4 ✅ `sadtalker_low` catalog seed | **Satisfied** | Bootstrap row 10¢ / `REPLICATE_API_TOKEN` (`create-provider-registry.ts:72-77`) |
| US-7.2 ✅ policy routes low talking-head → `sadtalker_low` | **Satisfied** | Unchanged; registry now serves real adapter for resolved key |
| US-3.3 portrait `media_assets` | **Satisfied (seam)** | Resolver reads `neuramark_media_assets` with tenant filter |
| US-9.3 voiceover | **Soft** | Adapter consumes `voiceoverAssetId`; E2E deferred |
| US-8.4 orchestration | **Not started** | Required for full AC closure |

---

## Gaps (what blocks full US-8.2 PASS — not Phase A)

1. **`/api/media/provider-assets/[assetId]` Route Handler missing** — default `resolveMediaAssetUrlForProvider` emits signed URLs to this path (`resolve-media-asset-url-for-provider.ts:63-67`); Replicate cannot fetch inputs until US-8.4 ships handler or switches to Storage presign.
2. **`fetchAsset` in-memory `jobContextByExternalId`** — context set on `createJob` in same adapter instance (`sadtalker-low-adapter.ts:354-357,402-408`). Fly worker poller (new process) must pass `rawOutputUrl` **and** US-8.4 must extend orchestration to supply `clientId`/`reelScriptId` for upload (job row) — map will not survive worker boundary.
3. **No `neuramark_media_assets` INSERT** after `fetchAsset` — by Phase A design; orchestrator owns INSERT in US-8.4.
4. **Consent, budget, poller, status poll IDOR, retries** — US-8.4 scope per CONTRACT Phase B table.

None of the above block **Phase A PASS WITH NOTES**.

---

## Scope Creep

None identified. Commit `fba526c` touches only adapter, media seams, registry, normalizer alias, and tests (8 files). `lib/contracts/sadtalker-low.ts` was frozen in prior commit `bb25b18` on the same branch — not re-opened in BUILD. No speculative APIs, no job UI, no migrations.

---

## Recommended Next Actions

| # | Action | Owner |
|---|--------|-------|
| 1 | Ship US-8.4 Phase B: `neuramark_video_jobs` migration, `createTalkingHeadVideoJob()`, Fly poller, provider-assets read route (or presign), `media_assets` INSERT | **nextjs-backend** + **media-pipeline-engineer** |
| 2 | Extend `fetchAsset` orchestration for worker context (job row → upload args) or factory params from poller | **media-pipeline-engineer** |
| 3 | Wire `initializeProviderRegistryFromCatalog()` on first orchestration path | **nextjs-backend** |
| 4 | US-9.3 voiceover asset for E2E talking-head path | **content-agents-engineer** / pipeline |
| 5 | QA.md security regression (token redaction, allowlist) after US-8.4 wiring | **qa-engineer** |

**PO:** Do **not** check US-8.2 acceptance criteria in `USER_STORIES.md` until US-8.4 closes Phase B rows above.

---

## Changelog

| Date | Change |
|------|--------|
| 2026-08-29 | Phase A validation on `fba526c` — PASS WITH NOTES |
