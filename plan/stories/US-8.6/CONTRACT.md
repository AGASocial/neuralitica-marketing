Reviewed by FE: N/A — 2026-08-30 — BE-only BUILD; Operator status UI reuses US-8.4 provider-agnostic surfaces.

# API Contract — US-8.6 MuseTalk adapter (low-tier talking-head loop path)

**Story:** US-8.6  
**Status:** Frozen — 2026-08-30  
**Security:** `plan/stories/US-8.6/SECURITY.md` (APPROVE WITH CONDITIONS — reconciled below)  
**Spec review:** `plan/stories/US-8.6/SPEC-REVIEW.md` (GAPS — resolved by phased freeze below)  
**Depends on:** US-8.1 ✅ adapter interface + registry + normalizers · US-X.4 ✅ `musetalk_low` catalog seed · US-7.2 ✅ policy routes loop → `musetalk_low` · US-8.4 ✅ job orchestration + poller + Operator UI · US-8.2 ✅ SadTalker adapter pattern · US-3.1 ✅ `generic_avatar` · US-3.3 ✅ `avatar_reference` assets · US-3.4 ✅ disclosure rules (SEC)  
**ADR:** `docs/adr/0003-worker-flyio-ffmpeg.md` — Vercel create/enqueue; Fly poll + `fetchAsset`  
**Feature branch:** `feature/US-8.6-musetalk-adapter`

**This document is CONTRACT ONLY.** Zod mirrors live in `lib/contracts/musetalk-low.ts` and extensions to `lib/contracts/video-job.ts`. **Phase A BUILD** ships the real `musetalk_low` adapter + registry + mocked-HTTP tests. **Phase B BUILD (same story)** unlocks `createTalkingHeadVideoJob()` for policy-selected `musetalk_low` with server-side reference-loop resolution — reuses US-8.4 poller, job rows, retry UI. **No new FE.**

**Terminology:** **provider adapter** · **provider key** · **bucle de referencia** · **external job id** · **download-and-own** · **Job de generación**. Technical enums (`musetalk_low`, `queued`) OK in code/Operator diagnostics. Do **not** use CONTEXT _Evitar_ terms in product-facing strings.

**README PO #9 amendment (binding):** Physical storage keys are **flat `{uuid}.mp4`** per US-3.3 `STORAGE_KEY_REGEX` and US-8.2 CONTRACT — **not** hierarchical `neuramark/{clientId}/{reelScriptId}/{uuid}.mp4`. Logical lineage (`clientId`, `reelScriptId`) lives in the job row and adapter job-context map only.

---

## SPEC-REVIEW blocking gaps closed

| # | Gap | Resolution |
|---|-----|------------|
| 1 | No US-8.6 CONTRACT.md | This document; freezes `lib/contracts/musetalk-low.ts`, Replicate create/poll contract, adapter factory |
| 2 | Orchestrator blocks MuseTalk today | § Phase B orchestrator unlock — remove `museTalkNotSupported`; allow `sadtalker_low` \| `musetalk_low` |
| 3 | Reference-loop asset resolution undefined | § `getPrimaryReferenceLoopVideoAssetForClient` — server-only; earliest video `avatar_reference` |
| 4 | Storage key shape vs US-3.3 | § `fetchAsset` storage — flat `{uuid}.mp4` (reconciles README PO #9) |
| 5 | Operator SadTalker↔MuseTalk override AC | § Phased acceptance — V1 policy-only; operator override → **P1 defer** |
| 6 | `portrait_asset_id` semantic overload | § Job row audit semantics — per-`provider_key` FK meaning |
| 7 | Asset resolver video-kind seam | § Input asset resolution — `kind: "video" \| "audio" \| "portrait"` |
| 8 | US-9.3 soft dependency | § Phased acceptance — fixture `voiceoverAssetId` OK for V1 VALIDATION |
| 9 | Multiple loop videos per client | § Loop selection — deterministic earliest `created_at` wins |
| 10 | Registry bootstrap for real adapter | § Registry bootstrap — `createMusetalkLowAdapter` replaces stub |

## SECURITY reconciliation (binding)

| Topic | SECURITY condition | **Frozen in this contract** |
|-------|-------------------|----------------------------|
| Loop asset authority | Server-resolved only; no client IDOR | § Loop resolver + `referenceVideoAssetId` in `FORBIDDEN_VIDEO_JOB_AUTHORITY_KEYS` |
| Dual-input SSRF | Signed M1 URLs for video + audio | § Input asset resolution; `MUSETALK_VIDEO_MIME_ALLOWLIST` + audio allowlist |
| own_avatar + MuseTalk | Reject path confusion | § Orchestrator guards — MuseTalk only for `generic_avatar` + loop |
| Output URL SSRF | Allowlist + hardened fetch | `MUSETALK_ALLOWED_OUTPUT_HOSTS`; same limits as SadTalker |
| Token hygiene | Server-only in adapter module | `MUSETALK_ENV_KEY_NAME`; missing → `PROVIDER_CONFIG_MISSING` |
| Untrusted JSON | Mandatory normalizers | `normalizeVideoJobStatusResult`; `sanitizeProviderErrorMessage`; `parseExternalJobId` |
| US-3.4 disclosure | No adapter bypass | § US-3.4 non-bypass note; no skip-QA flag |
| Job row audit | Provider-specific `portrait_asset_id` | § Job row audit semantics |
| Poller-only writes | No client status mutation | Reuse US-8.4 — unchanged |
| Budget + consent gates | Before `createJob` | § Phase B gate order — consent only for `own_avatar` (SadTalker path) |

---

## Phased BUILD acceptance

| Phase | Scope | Closes AC |
|-------|-------|-----------|
| **A** | Real `musetalk_low` `VideoProviderAdapter` (Replicate HTTP); `lib/contracts/musetalk-low.ts`; registry registers `createMusetalkLowAdapter`; `estimateCost` from catalog **19¢**; normalizers + `MUSETALK_ALLOWED_OUTPUT_HOSTS`; asset resolver kind seam (`video` \| `audio`); mocked-HTTP unit tests; **no** orchestrator unlock | Adapter interface + registry + download-and-own module proof; partial AC |
| **B** | `getPrimaryReferenceLoopVideoAssetForClient`; unlock `createTalkingHeadVideoJob` for `musetalk_low`; server-resolve loop id; extend default `resolveMediaAssetUrlForProvider` kind param; orchestrator + retry tests with fixture assets | Full USER_STORIES US-8.6 AC except operator override (P1 defer) |

**V1 VALIDATION closes:** policy-selected `generic_avatar` + reference loop → `musetalk_low` E2E with fixture voiceover.  
**V1 VALIDATION defers:** operator-configured SadTalker↔MuseTalk override (USER_STORIES AC #1 partial — P1 story).  
**Soft:** US-9.3 TTS orchestration — pre-uploaded `voiceoverAssetId` OK.

---

## Overview — Phase A (BUILD scope)

Ship the **MuseTalk loop-path** `VideoProviderAdapter` for catalog key **`musetalk_low`**:

1. **`lib/providers/video/musetalk-low-adapter.ts`** — Replicate Predictions API (`create` + `get`); `import "server-only"`.
2. **Registry** — `createProviderRegistry()` / `buildBootstrapCatalog()` register **`createMusetalkLowAdapter`** (not stub).
3. **`estimateCost`** — flat **`per_run`** cents from registry bootstrap (`defaultEstimateCents` from catalog — seed **19¢**).
4. **`createJob`** — resolve reference-loop **video** + voiceover **audio** URLs server-side; POST prediction; return normalized `CreateVideoJobResult`.
5. **`getJobStatus`** — GET prediction; pipe through **`normalizeVideoJobStatusResult(vendor, MUSETALK_ALLOWED_OUTPUT_HOSTS)`**.
6. **`fetchAsset`** — `validateProviderOutputUrl` → hardened download → Storage `put` → **`storedMediaAssetSchema`**.
7. **Tests** — mocked HTTP only in CI; registry regression asserts real adapter for `musetalk_low`.

**Surfaces (Phase A)**

| # | Surface | Kind | New vs reused |
|---|---------|------|---------------|
| 1 | `createMusetalkLowAdapter` | Adapter factory | **New** |
| 2 | `lib/contracts/musetalk-low.ts` | Frozen constants | **New** |
| 3 | `resolveMediaAssetUrlForProvider` (kind seam) | Server helper | **Extended** — `video` \| `audio` \| `portrait` |
| 4 | Registry bootstrap | `create-provider-registry.ts` | **Modified** — real MuseTalk |
| 5 | `musetalk-low-adapter.test.ts` | Unit tests | **New** |
| 6 | `provider-adapters.test.ts` | Regression | **Modified** |

**Forbidden surfaces (Phase A BUILD veto):**

- Orchestrator accepting `musetalk_low` (Phase B only).
- Client-authoritative `referenceVideoAssetId` on create.
- Live Replicate calls in CI.
- Hierarchical storage keys in `fetchAsset`.
- Consent/budget checks **inside** adapter `createJob` (orchestrator only — Phase B).

---

## Frozen decisions (do not reopen)

| # | Topic | Freeze |
|---|-------|--------|
| 1 | Provider key | **`musetalk_low`** · **`videoAssetRole: primary`** |
| 2 | Vendor | Replicate REST (`fetch`, no new npm SDK) |
| 3 | Env | **`REPLICATE_API_TOKEN`** — catalog `env_key_name` (shared with SadTalker) |
| 4 | Model version | **`MUSETALK_REPLICATE_MODEL_VERSION`** — `douwantech/musetalk` commit `cf72088c…` |
| 5 | Cost | **`per_run`** `unitCostCents` from catalog at registry bootstrap — **19¢** at seed |
| 6 | Output hosts | **`MUSETALK_ALLOWED_OUTPUT_HOSTS`** — same CDN set as SadTalker V1 |
| 7 | Storage key | Flat **`{uuid}.mp4`** per `STORAGE_KEY_REGEX` |
| 8 | Loop selection | Earliest `avatar_reference` video MIME row by `created_at ASC` |
| 9 | Client loop id | **`referenceVideoAssetId` forbidden** on create/retry (`FORBIDDEN_VIDEO_JOB_AUTHORITY_KEYS`) |
| 10 | own_avatar | **Never** invoke MuseTalk adapter — `generic_avatar` + loop only |
| 11 | Job row FK | MuseTalk: `portrait_asset_id` = reference-loop **video** id (no DDL) |
| 12 | Operator override | P1 defer — policy-only V1 routing |

---

## Replicate API contract

**Control plane (create + poll only):**

| Constant | Value |
|----------|-------|
| Base URL | `https://api.replicate.com` (`REPLICATE_API_BASE_URL`) |
| Create | `POST /v1/predictions` |
| Get | `GET /v1/predictions/{id}` |
| Auth | `Authorization: Bearer ${process.env.REPLICATE_API_TOKEN}` header only |

**Create body (frozen):**

```json
{
  "version": "cf72088c48fe548434d8603194e74af287b84f60",
  "input": {
    "video": "<https-url-reference-loop-mp4>",
    "audio": "<https-url-voiceover-audio>",
    "bbox_shift": 0,
    "cycle": true
  }
}
```

| Replicate field | Source |
|-----------------|--------|
| `version` | `MUSETALK_REPLICATE_MODEL_VERSION` |
| `input.video` | Resolved reference-loop video URL (§ Input asset resolution, `kind: "video"`) |
| `input.audio` | Resolved voiceover audio URL (`kind: "audio"`) |
| `input.bbox_shift` | `MUSETALK_DEFAULT_PREDICTION_INPUT.bbox_shift` (**0**) |
| `input.cycle` | `MUSETALK_DEFAULT_PREDICTION_INPUT.cycle` (**true** — smooth loop) |

**Do not** send `webhook` in V1 adapter (US-8.4 owns webhook auth if shipped).

**Response handling (mandatory):** Same as US-8.2 — `parseExternalJobId`, `normalizeVideoJobStatusResult`, `sanitizeProviderErrorMessage`, transient `rawOutputUrl` only.

**Replicate status → normalized:** Same mapping as SadTalker (`starting` → `queued`, etc.).

---

## MuseTalk input matrix

Applies to **`resolvedCreateVideoJobInputSchema`** at adapter entry and Phase B orchestrator.

| Visual path | Required asset IDs | Forbidden |
|-------------|-------------------|-----------|
| **`generic_avatar` + reference loop** (policy → `musetalk_low`) | `referenceVideoAssetId` (server-resolved) + `voiceoverAssetId` | `portraitAssetId`, `referenceImageAssetId` on adapter |
| **`own_avatar` / generic still** (policy → `sadtalker_low`) | portrait still + `voiceoverAssetId` | `referenceVideoAssetId` on SadTalker adapter (unchanged — US-8.2) |
| **Any MuseTalk path** | `voiceoverAssetId` **required** | Missing voiceover → reject before Replicate HTTP |
| **Any** | — | Client-supplied `referenceVideoAssetId` on create request |

**MIME after server resolution:**

- Reference loop video: `video/mp4` \| `video/quicktime` (`MUSETALK_VIDEO_MIME_ALLOWLIST`)
- Voiceover audio: `audio/wav` \| `audio/mpeg` \| `audio/mp4` \| `video/mp4` (`MUSETALK_AUDIO_MIME_ALLOWLIST`)

**Orchestrator rule (Phase B):** call `resolveProviderForJob` first; branch on `decision.providerKey`.

---

## Loop asset resolution — `getPrimaryReferenceLoopVideoAssetForClient`

**File (BUILD):** `lib/media/get-primary-reference-loop-video-asset-for-client.ts` (`import "server-only"`)

```ts
export async function getPrimaryReferenceLoopVideoAssetForClient(
  clientId: string,
): Promise<{ assetId: string } | null>;
```

| Step | Rule |
|------|------|
| 1 | Parameterized query on `neuramark_media_assets` |
| 2 | `WHERE client_id = $clientId AND asset_type = 'avatar_reference'` |
| 3 | `AND metadata->>'detectedMime' IN ('video/mp4', 'video/quicktime')` |
| 4 | `ORDER BY created_at ASC LIMIT 1` |
| 5 | Return `{ assetId }` or **`null`** if no row |
| 6 | Invalid / empty `clientId` → **`null`** (fail closed) |

**Orchestrator use (Phase B):** when `providerKey === "musetalk_low"`:

- Require `script.hasReferenceLoop === true` (server-loaded script context).
- Call resolver → if `null`, return **`NOT_FOUND`** or **`VALIDATION_ERROR`** (fail closed).
- Set `referenceVideoAssetId` on **`resolvedCreateVideoJobInput`** from resolver output only.
- INSERT job with `portrait_asset_id = referenceVideoAssetId` (audit overload — § Job row audit).

**Retry (US-8.4):** when failed job `provider_key = musetalk_low`, reuse `portrait_asset_id` from failed row as loop id; re-run policy + budget gates; **never** accept client loop id from retry body.

**Forbidden:** Using client request `referenceVideoAssetId` even when present — field is in **`FORBIDDEN_VIDEO_JOB_AUTHORITY_KEYS`**; create handler rejects before parse side-effects.

---

## Input asset resolution

**File (BUILD):** `lib/media/resolve-media-asset-url-for-provider.ts` (`import "server-only"`)

**Extended signature (frozen):**

```ts
export async function resolveMediaAssetUrlForProvider(params: {
  assetId: string;
  clientId: string;
  kind: ProviderMediaAssetKind; // "video" | "audio" | "portrait"
  ttlSec?: number; // default MUSETALK_INPUT_URL_TTL_SEC / SADTALKER_INPUT_URL_TTL_SEC (300)
}): Promise<string>;
```

| `kind` | MIME allowlist constant |
|--------|-------------------------|
| `video` | `MUSETALK_VIDEO_MIME_ALLOWLIST` |
| `audio` | `MUSETALK_AUDIO_MIME_ALLOWLIST` (same as `SADTALKER_AUDIO_MIME_ALLOWLIST`) |
| `portrait` | `SADTALKER_PORTRAIT_MIME_ALLOWLIST` |

Legacy overload with explicit `allowedMimeTypes: readonly string[]` may remain for SadTalker internals; default path selects allowlist by **`kind`**.

| Step | Rule |
|------|------|
| 1 | `SELECT id, client_id, storage_key, metadata FROM neuramark_media_assets WHERE id = $1 AND client_id = $2` |
| 2 | Missing / wrong tenant → `ProviderAdapterError` — orchestrator maps to 404 |
| 3 | Validate `metadata.detectedMime` ∈ kind allowlist |
| 4 | Return HMAC-signed M1 URL — TTL **300s**; **`Cache-Control: no-store`** on M1 route |
| 5 | **Never** accept client-supplied URL strings |

**Adapter factory injection:**

```ts
export function createMusetalkLowAdapter(params: {
  defaultEstimateCents: number;
  resolveMediaAssetUrl?: (
    assetId: string,
    clientId: string,
    kind: "video" | "audio",
  ) => Promise<string>;
  uploadGeneratedVideo?: (
    args: UploadGeneratedVideoArgs,
  ) => Promise<UploadGeneratedVideoResult>;
  fetchImpl?: typeof fetch;
  initialJobContexts?: Map<ExternalJobId, JobContext>;
}): VideoProviderAdapter;
```

SadTalker factory gains compatible `kind: "portrait" | "audio"` injection (BUILD may wire default impl to shared helper).

---

## `VideoProviderAdapter` implementation (Phase A)

**File:** `lib/providers/video/musetalk-low-adapter.ts`

| Method | Behavior |
|--------|----------|
| `providerKey` | `"musetalk_low"` |
| `videoAssetRole` | `"primary"` |
| `estimateCost` | `{ estimatedCostCents: defaultEstimateCents, currency: "USD", providerKey: "musetalk_low" }` — **no** hardcoded 19 in adapter body |
| `createJob` | Validate input matrix; load token or throw `PROVIDER_CONFIG_MISSING`; resolve video + audio URLs; POST prediction; `parseCreateVideoJobResult` |
| `getJobStatus` | GET prediction; `normalizeVideoJobStatusResult(..., MUSETALK_ALLOWED_OUTPUT_HOSTS)` |
| `fetchAsset` | See § `fetchAsset` storage |

**`createJob` validation (fail-closed):**

```ts
// Required
referenceVideoAssetId + voiceoverAssetId

// Reject
portraitAssetId, referenceImageAssetId
```

**Missing `REPLICATE_API_TOKEN`:** throw `ProviderAdapterError(PROVIDER_CONFIG_MISSING, "Provider is not configured")` before any `fetch`.

---

## `fetchAsset` storage

Reconciles US-8.1 download-and-own with US-3.3 flat storage keys (same as US-8.2).

| Layer | Rule |
|-------|------|
| **Physical `storageKey`** | `{uuid}.mp4` where `uuid = crypto.randomUUID()` — matches `STORAGE_KEY_REGEX` |
| **Logical lineage** | `clientId` + `reelScriptId` from job row via adapter job-context map (US-8.4 poller L1) |
| **Return** | `storedMediaAssetSchema` — no provider CDN URL |
| **`media_assets` INSERT** | US-8.4 poller after terminal complete |

**Download hardening:** Same controls as SadTalker — `MUSETALK_FETCH_TIMEOUT_MS` (120s), `MUSETALK_FETCH_MAX_BYTES` (100MB), `MUSETALK_FETCH_MAX_REDIRECTS` (3), https-only, Content-Type `video/*` / `video/mp4`.

---

## Job row audit semantics (`portrait_asset_id` overload)

No DDL change in US-8.6. Column name is legacy; meaning is **provider-specific**:

| `provider_key` | `portrait_asset_id` stores | `voiceover_asset_id` |
|----------------|---------------------------|----------------------|
| `sadtalker_low` | Portrait still asset id | Voiceover audio asset id |
| `musetalk_low` | Reference-loop **video** asset id | Voiceover audio asset id |

**Operator UI (US-8.4):** DTOs remain provider-agnostic; `resolveProviderDisplayLabel` shows **MuseTalk** for `musetalk_low`. Do **not** label MuseTalk rows as "portrait" in new copy — use generic input-asset diagnostics or provider label only.

**Poller / retry:** Always interpret `portrait_asset_id` using stored **`provider_key`** from job row — never infer from column name alone.

---

## Phase B — Orchestrator unlock

**File:** `lib/video-jobs/create-talking-head-video-job.ts` (`import "server-only"`)

**Changes from US-8.4 Phase A (frozen):**

| Step | Action |
|------|--------|
| 1 | `requireOperator("handler")` + tenant match (unchanged) |
| 2 | Reject **`FORBIDDEN_VIDEO_JOB_AUTHORITY_KEYS`** including **`referenceVideoAssetId`** |
| 3 | Parse `createVideoJobRequestSchema` — **no** `referenceVideoAssetId` field accepted |
| 4 | Load reel script + `hasReferenceLoop` server-side |
| 5 | `resolveProviderForJob(...)` → `providerKey` authority |
| 6 | **Provider guard:** accept **`providerKey ∈ { sadtalker_low, musetalk_low }`** only; else `PROVIDER_UNAVAILABLE` |
| 7a | **`musetalk_low` branch:** reject if `visualMode === "own_avatar"` OR `modalidad === "own_avatar"` → `PROVIDER_UNAVAILABLE` or `VALIDATION_ERROR`; require `hasReferenceLoop`; resolve loop via **`getPrimaryReferenceLoopVideoAssetForClient`**; require `voiceoverAssetId`; build `resolvedInput` with `referenceVideoAssetId` only (no portrait fields) |
| 7b | **`sadtalker_low` branch:** unchanged — portrait still + voiceover; no loop id |
| 8 | `adapter.estimateCost(resolvedInput)` + `assertReelBudgetAllowsEstimatedSpend` |
| 9 | Consent: **`assertActiveAvatarConsentForJobs`** only when `own_avatar` (SadTalker path) |
| 10 | `adapter.createJob(resolvedInput)` |
| 11 | INSERT `neuramark_video_jobs` — MuseTalk: `portrait_asset_id = referenceVideoAssetId`; SadTalker: `portrait_asset_id = portrait still id` |
| 12 | `recordReelSpendEvent` + enqueue poll (US-8.4) |

**Remove:** early `museTalkNotSupported` return on any `referenceVideoAssetId` presence (field is forbidden, not "unsupported").

**Remove:** hard-coded check `providerKey !== DEFAULT_LOW_TIER_PROVIDER_KEYS.talkingHead` — replace with allowlist `{ sadtalker_low, musetalk_low }`.

---

## Registry bootstrap (Phase A)

**File:** `lib/providers/create-provider-registry.ts`

```ts
import { createMusetalkLowAdapter } from "@/lib/providers/video/musetalk-low-adapter";

// Register musetalk_low alongside sadtalker_low (real adapter, not stub)
registry.registerVideo(
  createMusetalkLowAdapter({
    defaultEstimateCents: estimateCentsFromCatalog(catalog, "musetalk_low", 19),
  }),
);
```

| Rule | Detail |
|------|--------|
| Bootstrap catalog | Add `musetalk_low` row to `buildBootstrapCatalog()` with `prefersReferenceLoop: true`, **19¢** `per_run` |
| Estimate | From catalog — no hardcoded override in adapter body |
| Catalog DB | US-X.4 seed authoritative — no migration in US-8.6 |
| Tests | `getVideoAdapter("musetalk_low")` returns real adapter (not stub id prefix) |

---

## ADR-0003 runtime matrix (MuseTalk)

| Method | Runtime | Phase |
|--------|---------|-------|
| `estimateCost` | Vercel | A · B |
| `createJob` | Vercel | B — after orchestrator gates |
| `getJobStatus` | Fly worker / poller | B |
| `fetchAsset` | Fly worker | B — on terminal `completed` |

Phase A: adapter methods callable from unit tests only.

---

## US-3.4 disclosure — non-bypass (SEC)

MuseTalk path is **`generic_avatar`**. Adapter and orchestrator expose **no** flag to skip QA or clear `must_disclose_not_owner`. Downstream Script agent DTO and US-10.x **`generic_avatar_not_owner`** blocking check remain authoritative. VALIDATION.md must document explicit non-bypass evidence.

---

## Fixtures (mock-friendly)

**Phase A adapter test — createJob request (internal):**

```json
{
  "reelScriptId": "11111111-1111-4111-8111-111111111111",
  "clientId": "22222222-2222-4222-8222-222222222222",
  "providerKey": "musetalk_low",
  "providerTier": "low",
  "assetRole": "primary",
  "targetDurationSec": 30,
  "referenceVideoAssetId": "33333333-3333-4333-8333-333333333333",
  "voiceoverAssetId": "44444444-4444-4444-8444-444444444444"
}
```

**Phase B orchestrator create (Operator handler body — no loop id):**

```json
{
  "reelScriptId": "11111111-1111-4111-8111-111111111111",
  "clientId": "22222222-2222-4222-8222-222222222222",
  "targetDurationSec": 30,
  "voiceoverAssetId": "44444444-4444-4444-8444-444444444444"
}
```

**Forbidden create body (must → `FORBIDDEN_FIELDS`):**

```json
{
  "reelScriptId": "11111111-1111-4111-8111-111111111111",
  "clientId": "22222222-2222-4222-8222-222222222222",
  "targetDurationSec": 30,
  "voiceoverAssetId": "44444444-4444-4444-8444-444444444444",
  "referenceVideoAssetId": "99999999-9999-4999-8999-999999999999"
}
```

**Replicate create success (mock):**

```json
{
  "id": "abc123prediction",
  "status": "starting"
}
```

**Normalized create result:**

```json
{
  "externalJobId": "abc123prediction",
  "status": "queued",
  "estimatedCostCents": 19
}
```

---

## Automated tests

### Phase A — `musetalk-low-adapter.test.ts`

| # | Case |
|---|------|
| 1 | Mocked create → processing → completed → `fetchAsset` round-trip |
| 2 | Missing `REPLICATE_API_TOKEN` → `PROVIDER_CONFIG_MISSING` before fetch |
| 3 | Rejects `portraitAssetId` / missing `referenceVideoAssetId` |
| 4 | `validateProviderOutputUrl` rejects non-allowlisted host |
| 5 | Mock Replicate 401 with token → sanitized message contains no `r8_` / `Bearer` |
| 6 | Video MIME rejected when resolving as `audio` kind (resolver test) |
| 7 | Adapter module imports `server-only` |
| 8 | Registry — `getVideoAdapter("musetalk_low")` is real adapter |

### Phase B — orchestrator tests

| # | Case |
|---|------|
| 1 | Policy selects `musetalk_low` → create succeeds with server-resolved loop + voiceover |
| 2 | Client `referenceVideoAssetId` in body → `FORBIDDEN_FIELDS` |
| 3 | `own_avatar` + policy `musetalk_low` → rejected |
| 4 | Policy `musetalk_low` but no video loop asset → `NOT_FOUND` / validation error |
| 5 | Foreign client loop uuid in body does not change resolved input (forbidden before resolution) |
| 6 | Retry MuseTalk job reuses `portrait_asset_id` from failed row |

---

## Out of scope (explicit)

- New FE / i18n (US-8.4 ✅)
- `neuramark_video_jobs` DDL migration
- Operator SadTalker↔MuseTalk override UI (P1)
- US-9.3 TTS synthesis orchestration (consume existing `voiceoverAssetId`)
- Wan / HeyGen adapter bodies
- FFmpeg assembly (US-9.x)
- Live Replicate integration tests in CI
- Catalog seed changes (US-X.4 authoritative)

---

## Changelog

| Date | Change |
|------|--------|
| 2026-08-30 | Initial freeze — Phase A MuseTalk adapter + Phase B orchestrator unlock; resolves SPEC-REVIEW GAPS + SECURITY conditions; Reviewed by FE: N/A |
