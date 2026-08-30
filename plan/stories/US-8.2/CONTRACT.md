Reviewed by FE: N/A — 2026-08-29 — BE-only Phase A BUILD; Operator/Cliente status UI deferred to US-8.4.

# API Contract — US-8.2 SadTalker adapter (V1 default talking-head, low tier)

**Story:** US-8.2  
**Status:** Frozen — 2026-08-29  
**Security:** `plan/stories/US-8.2/SECURITY.md` (APPROVE WITH CONDITIONS — reconciled below)  
**Spec review:** `plan/stories/US-8.2/SPEC-REVIEW.md` (GAPS — resolved by phased freeze below)  
**Depends on:** US-8.1 ✅ adapter interface + registry + normalizers · US-X.4 ✅ `sadtalker_low` catalog · US-7.2 ✅ policy routes low talking-head → `sadtalker_low` · US-3.3 ✅ portrait `media_assets` · US-7.1 ✅ budget gate + spend ledger · US-3.2 ✅ consent helper · US-7.3 ✅ `finalizeGenerationCost` async seam  
**ADR:** `docs/adr/0003-worker-flyio-ffmpeg.md` — Vercel create/enqueue; Fly poll + `fetchAsset`  
**Feature branch:** `feature/US-8.2-sadtalker-adapter`

**This document is CONTRACT ONLY.** Zod below is the BUILD sketch for `lib/providers/video/sadtalker-low-adapter.ts`, `lib/contracts/sadtalker-low.ts`, asset URL resolver seam, and registry swap. **Phase A BUILD** ships the real adapter + mocked-HTTP tests only. **Phase B (US-8.4)** ships job DDL, orchestration, poller, and FE status surfaces.

**Terminology:** **provider adapter** · **provider key** · **asset role** · **external job id** · **download-and-own** · **Job de generación**. Technical enums (`sadtalker_low`, `queued`) OK in code/Operator diagnostics. Do **not** use CONTEXT _Evitar_ terms in product-facing strings.

**USER_STORIES owner-table amendment (binding):** US-8.2 **FE = —** in Phase A BUILD. The USER_STORIES FE row (“Job status polling UI / SSE”) is satisfied by **US-8.4**, not US-8.2.

---

## SPEC-REVIEW blocking gaps closed

| # | Gap | Resolution |
|---|-----|------------|
| 1 | `neuramark_video_jobs` DDL not frozen | **Phase B (US-8.4)** — full DDL frozen in § `neuramark_video_jobs` (this contract). **No migration in Phase A BUILD.** |
| 2 | Job-create orchestration undefined | **Phase B** — `createTalkingHeadVideoJob()` frozen in § Job orchestration. **Not wired in Phase A.** |
| 3 | FE scope bleed to US-8.4 | **Phase A FE = —**; status badges / retry / SSE → **US-8.4** only. |
| 4 | Input asset ambiguity vs MuseTalk | § SadTalker input matrix — portrait still + voiceover only; reject video-loop path. |
| 5 | Poller / worker wiring split | Phased: Phase A adapter callable in isolation; Phase B poller on Fly (ADR-0003). |
| 6 | Retry AC owned by US-8.4 | Phase B sets `attempt = 1` on initial create; retry semantics → US-8.4. |
| 7 | US-9.3 soft dependency | Phase A tests use fixture `voiceoverAssetId`; E2E after US-9.3. |
| 8 | Spend ledger sync on complete | Phase B: `recordReelSpendEvent` at create + `finalizeGenerationCost` on terminal complete. |
| 9 | Replicate host allowlist not frozen | `SADTALKER_ALLOWED_OUTPUT_HOSTS` in `lib/contracts/sadtalker-low.ts`. |
| 10 | Registry bootstrap drift | Phase A: register real adapter; prefer `initializeProviderRegistryFromCatalog()` on first orchestration path (Phase B). |
| 11 | Client-scoped status poll underspecified | Phase B: internal read helper + US-8.4 Route Handler; § Status polling DTO. |

## SECURITY reconciliation (binding)

| Topic | SECURITY condition | **Frozen in this contract** |
|-------|-------------------|----------------------------|
| API token | Server-only in adapter module | `REPLICATE_API_TOKEN` via `SADTALKER_ENV_KEY_NAME`; missing → `PROVIDER_CONFIG_MISSING` before I/O |
| SSRF output URL | Allowlist + https only | `SADTALKER_ALLOWED_OUTPUT_HOSTS`; `validateProviderOutputUrl` in `getJobStatus` + `fetchAsset` |
| SSRF inputs | Storage ownership, not client URLs | `resolveMediaAssetUrlForProvider`; § Input asset resolution |
| Untrusted JSON | Mandatory normalizers | `normalizeVideoJobStatusResult`; `sanitizeProviderErrorMessage`; `parseExternalJobId` |
| No canonical provider URL | `rawOutputUrl` transient | `StoredMediaAsset.storageKey` only; § `fetchAsset` storage |
| Gates before vendor I/O | Budget + consent | Phase B `createTalkingHeadVideoJob` order — § Job orchestration |
| Poller-only status writes | No client mutation | Phase B; adapter has no status UPDATE |
| IDOR on poll | `client_id` scope → 404 | Phase B Route Handler — § Status polling |
| ADR-0003 | Poll/fetch off Vercel | § Runtime matrix |

---

## Phased BUILD acceptance

| Phase | Story | Scope | Closes AC |
|-------|-------|-------|-----------|
| **A** | **US-8.2 BUILD** | Real `sadtalker_low` `VideoProviderAdapter` (Replicate HTTP); registry swap stub → real; `estimateCost` from catalog `per_run`; normalizers wired; `SADTALKER_ALLOWED_OUTPUT_HOSTS`; mocked-HTTP unit tests; asset URL resolver seam (injectable); `fetchAsset` download-and-own to Storage (no `media_assets` INSERT unless minimal); **no** `neuramark_video_jobs` DDL/writes; **no** Route Handlers / Server Actions; **no** FE | Adapter interface + registry + download-and-own module proof; partial AC — orchestration + UI in Phase B |
| **B** | **US-8.4** (+ US-9.3 E2E) | `neuramark_video_jobs` migration; `createTalkingHeadVideoJob()`; consent + budget gates; `recordReelSpendEvent`; Fly worker poller; `getJobStatus` loop + job UPDATE; `media_assets` INSERT on complete; `finalizeGenerationCost`; Operator status UI / SSE; retry lineage; stale timeout | Full USER_STORIES US-8.2 AC + shared US-8.4 FE row |

Phase A **does not** block on US-9.3 TTS orchestration or US-8.4 poller.

---

## Overview — Phase A (BUILD scope)

Ship the **first real vendor** `VideoProviderAdapter` for catalog key **`sadtalker_low`**:

1. **`lib/providers/video/sadtalker-low-adapter.ts`** — Replicate Predictions API (`create` + `get`); `import "server-only"`.
2. **Registry swap** — `createProviderRegistry()` registers **`createSadtalkerLowAdapter`** instead of stub; **delete** `sadtalker-low-stub-adapter.ts`.
3. **`estimateCost`** — flat **`per_run`** cents from registry bootstrap (`defaultEstimateCents` from catalog — seed **10¢**).
4. **`createJob`** — resolve portrait still + voiceover URLs server-side; POST prediction; return normalized `CreateVideoJobResult`.
5. **`getJobStatus`** — GET prediction; pipe through **`normalizeVideoJobStatusResult(vendor, SADTALKER_ALLOWED_OUTPUT_HOSTS)`**.
6. **`fetchAsset`** — `validateProviderOutputUrl` → hardened download → Storage `put` → **`storedMediaAssetSchema`** (no provider URL in return).
7. **Tests** — mocked HTTP only in CI; registry regression (no `stub-sadtalker_low-` ids).

**Surfaces (Phase A)**

| # | Surface | Kind | New vs reused |
|---|---------|------|---------------|
| 1 | `createSadtalkerLowAdapter` | Adapter factory | **New** |
| 2 | `lib/contracts/sadtalker-low.ts` | Frozen constants | **New** |
| 3 | `resolveMediaAssetUrlForProvider` | Server helper | **New** — injectable default |
| 4 | `uploadGeneratedVideoBuffer` | Server helper | **New** — injectable default for `fetchAsset` |
| 5 | Registry bootstrap | `create-provider-registry.ts` | **Modified** — real SadTalker |
| 6 | `sadtalker-low-adapter.test.ts` | Unit tests | **New** |
| 7 | `provider-adapters.test.ts` | Regression | **Modified** |

**Forbidden surfaces (Phase A BUILD veto):**

- `neuramark_video_jobs` CREATE migration or INSERT/UPDATE.
- Route Handlers / Server Actions for job create or status.
- Client Components importing adapter modules.
- Live Replicate calls in CI.
- `getVideoAdapter(requestBody.providerKey)`.
- Persisting `rawOutputUrl` or Replicate CDN URL to DB.
- `fetch(userSuppliedUrl)` without allowlist.
- Consent/budget checks **inside** adapter `createJob` (orchestrator only — Phase B).

---

## Frozen decisions (do not reopen)

| # | Topic | Freeze |
|---|-------|--------|
| 1 | Provider key | **`sadtalker_low`** · **`videoAssetRole: primary`** |
| 2 | Vendor | Replicate REST (`fetch`, no new npm SDK in Phase A) |
| 3 | Env | **`REPLICATE_API_TOKEN`** — catalog `env_key_name` |
| 4 | Model version | **`SADTALKER_REPLICATE_MODEL_VERSION`** constant — not catalog |
| 5 | Cost | **`per_run`** `unitCostCents` from catalog at registry bootstrap — **10¢** at seed |
| 6 | Output hosts | **`SADTALKER_ALLOWED_OUTPUT_HOSTS`** |
| 7 | Storage key | Flat **`{uuid}.mp4`** per US-3.3 `STORAGE_KEY_REGEX` — § `fetchAsset` storage |
| 8 | Stubs retained | `siliconflow_wan21_turbo`, `heygen_high` — unchanged |
| 9 | MuseTalk path | **`referenceVideoAssetId` present → orchestrator must not call SadTalker** |
| 10 | Phase split | Orchestration + DDL + UI → **US-8.4** |

---

## Replicate API contract

**Control plane (create + poll only):**

| Constant | Value |
|----------|-------|
| Base URL | `https://api.replicate.com` (`REPLICATE_API_BASE_URL`) |
| Create | `POST /v1/predictions` |
| Get | `GET /v1/predictions/{id}` |
| Auth | `Authorization: Bearer ${process.env.REPLICATE_API_TOKEN}` header only — never query string |

**Create body (frozen):**

```json
{
  "version": "3aa3dac9353cc4d6bd62a8f95957bd844003b401ca4e4a9b33baa574c549d376",
  "input": {
    "source_image": "<https-url-portrait-still>",
    "driven_audio": "<https-url-voiceover-audio>",
    "preprocess": "full",
    "still": true,
    "enhancer": "gfpgan"
  }
}
```

| Replicate field | Source |
|-----------------|--------|
| `version` | `SADTALKER_REPLICATE_MODEL_VERSION` |
| `input.source_image` | Resolved portrait still URL (see § Input asset resolution) |
| `input.driven_audio` | Resolved voiceover audio URL |
| `input.preprocess` | `SADTALKER_DEFAULT_PREDICTION_INPUT.preprocess` |
| `input.still` | `SADTALKER_DEFAULT_PREDICTION_INPUT.still` |
| `input.enhancer` | `SADTALKER_DEFAULT_PREDICTION_INPUT.enhancer` |

**Do not** send `webhook` in Phase A adapter (US-8.4 owns webhook auth).

**Response handling (mandatory):**

| Replicate field | Handling |
|-----------------|----------|
| `id` | `parseExternalJobId` → `externalJobId` |
| `status` | Map via `normalizeProviderJobStatus` inside `normalizeVideoJobStatusResult` |
| `error` / `logs` | `sanitizeProviderErrorMessage` — **never** persist raw `logs` |
| `output` | First https URL string (or first element if array) → `validateProviderOutputUrl` → transient `rawOutputUrl` |

**Replicate status → normalized (via US-8.1 aliases + `starting` → `queued`):**

| Replicate `status` | Normalized |
|--------------------|------------|
| `starting` | `queued` |
| `processing` | `processing` |
| `succeeded` | `completed` |
| `failed` | `failed` |
| `canceled` | `cancelled` |

**Errors:** Catch HTTP/JSON failures → `sanitizeProviderErrorMessage` on body → `ProviderAdapterError` or failed status result — **never** log full response body at info level; **never** echo token.

---

## SadTalker input matrix

Applies to **`resolvedCreateVideoJobInputSchema`** at adapter entry and Phase B orchestrator.

| Visual path | Required asset IDs | Forbidden |
|-------------|-------------------|-----------|
| **Own avatar** (`portraitAssetId` from US-3.3) | `voiceoverAssetId` + `portraitAssetId` | `referenceVideoAssetId` → policy must select MuseTalk (US-8.6), not SadTalker |
| **Generic still** (no reference loop) | `voiceoverAssetId` + (`referenceImageAssetId` **or** `portraitAssetId` if both set prefer `portraitAssetId`) | `referenceVideoAssetId` present |
| **Any** | `voiceoverAssetId` **required** — no silent generate | Missing voiceover → reject before Replicate HTTP |

**MIME after server resolution:**

- Portrait: `image/jpeg` \| `image/png` \| `image/webp` (`SADTALKER_PORTRAIT_MIME_ALLOWLIST`)
- Audio: `audio/wav` \| `audio/mpeg` \| `audio/mp4` \| `video/mp4` (`SADTALKER_AUDIO_MIME_ALLOWLIST`)

**Orchestrator rule (Phase B):** call `resolveProviderForJob` first; invoke SadTalker adapter only when `decision.providerKey === "sadtalker_low"`.

---

## Input asset resolution

**File (BUILD):** `lib/media/resolve-media-asset-url-for-provider.ts` (`import "server-only"`)

```ts
export async function resolveMediaAssetUrlForProvider(params: {
  assetId: string;
  clientId: string;
  allowedMimeTypes: readonly string[];
  ttlSec?: number; // default SADTALKER_INPUT_URL_TTL_SEC (300)
}): Promise<string>;
```

| Step | Rule |
|------|------|
| 1 | `SELECT id, client_id, storage_key, metadata FROM neuramark_media_assets WHERE id = $1 AND client_id = $2` (parameterized) |
| 2 | Missing / wrong tenant → throw `ProviderAdapterError` — orchestrator maps to 404 |
| 3 | Validate detected MIME ∈ `allowedMimeTypes` |
| 4 | Return **absolute https URL** Replicate can GET — **never** accept client-supplied URL strings on job input |
| 5 | Default impl: short-lived HMAC-signed read URL via server Route Handler or Storage presign — TTL **300s** |

**Adapter factory injection:**

```ts
export function createSadtalkerLowAdapter(params: {
  defaultEstimateCents: number;
  resolveMediaAssetUrl?: (
    assetId: string,
    clientId: string,
    kind: "portrait" | "audio",
  ) => Promise<string>;
  uploadGeneratedVideo?: (args: UploadGeneratedVideoArgs) => Promise<UploadGeneratedVideoResult>;
  fetchImpl?: typeof fetch;
}): VideoProviderAdapter;
```

Tests inject mock resolvers returning fixture `https://replicate.delivery/...` URLs.

---

## `VideoProviderAdapter` implementation (Phase A)

**File:** `lib/providers/video/sadtalker-low-adapter.ts`

| Method | Behavior |
|--------|----------|
| `estimateCost` | `{ estimatedCostCents: defaultEstimateCents, currency: "USD", providerKey: "sadtalker_low" }` — **no** hardcoded 10 in adapter body |
| `createJob` | Validate inputs per input matrix; load token or throw `PROVIDER_CONFIG_MISSING`; resolve URLs; POST prediction; `parseCreateVideoJobResult` |
| `getJobStatus` | GET prediction; map to `normalizeVideoJobStatusResult({ status, errorMessage, outputUrl }, SADTALKER_ALLOWED_OUTPUT_HOSTS)` |
| `fetchAsset` | See § `fetchAsset` storage |

**Missing `REPLICATE_API_TOKEN`:** throw `ProviderAdapterError(PROVIDER_CONFIG_MISSING, "Provider is not configured")` before any `fetch`.

---

## `fetchAsset` storage

Reconciles US-8.1 hierarchical path intent with US-3.3 flat `storage_key` constraint.

| Layer | Rule |
|-------|------|
| **Physical `storageKey`** | `{uuid}.mp4` where `uuid = crypto.randomUUID()` — matches `STORAGE_KEY_REGEX` and `neuramark_media_assets` CHECK |
| **Logical lineage** | `clientId` + `reelScriptId` from `createJob` input held in orchestrator memory / Phase B job row — **not** encoded in storage key path |
| **MediaStorage.put** | `getMediaStorage().put(storageKey, buffer, { contentType: "video/mp4", sizeBytes })` |
| **Return** | `storedMediaAssetSchema`: `{ storageKey, mimeType: "video/mp4", sizeBytes, actualCostCents }` |
| **`actualCostCents`** | Default `defaultEstimateCents` when Replicate omits billing metadata (US-7.3 handoff) |
| **`media_assets` INSERT** | **Phase B orchestrator** after `fetchAsset` — Phase A adapter returns `StoredMediaAsset` only |
| **Forbidden** | Provider CDN URL in return; `storageKey` derived from `external_job_id` |

**Download hardening (`fetchAsset`):**

| Control | Value |
|---------|-------|
| Allowlist | `validateProviderOutputUrl(url, SADTALKER_ALLOWED_OUTPUT_HOSTS)` before GET |
| Timeout | `SADTALKER_FETCH_TIMEOUT_MS` (120s) |
| Max bytes | `SADTALKER_FETCH_MAX_BYTES` (100MB) — abort if exceeded |
| Redirects | Max `SADTALKER_FETCH_MAX_REDIRECTS` (3); re-validate final URL host |
| Content-Type | Accept `video/*` or `video/mp4` |
| Schemes | Reject `file://` and non-https |

**Injectable upload helper:**

```ts
export type UploadGeneratedVideoArgs = {
  clientId: string;
  reelScriptId: string;
  buffer: Buffer;
  mimeType: string;
};

export type UploadGeneratedVideoResult = {
  storageKey: string;
  sizeBytes: number;
};
```

Default: `lib/media/upload-generated-video-buffer.ts` — generates flat `{uuid}.mp4` key + `MediaStorage.put`.

---

## `SADTALKER_ALLOWED_OUTPUT_HOSTS`

**File:** `lib/contracts/sadtalker-low.ts` (exported constant)

```ts
export const SADTALKER_ALLOWED_OUTPUT_HOSTS: readonly string[] = [
  "replicate.delivery",
  "pbxt.replicate.delivery",
  "replicateusercontent.com",
];
```

Suffix match per `validateProviderOutputUrl` (host === entry or `*.entry`). Reject IP-literal hostnames, `localhost`, `.local`. Extend only via CONTRACT revision + optional catalog `capabilities.allowedOutputHosts` mirror migration.

**Call sites (mandatory):** `getJobStatus` (when setting `rawOutputUrl`) and `fetchAsset` (before GET).

---

## Registry bootstrap (Phase A)

**File:** `lib/providers/create-provider-registry.ts`

```ts
import { createSadtalkerLowAdapter } from "@/lib/providers/video/sadtalker-low-adapter";

// In createStubAdapterForKey / createProviderRegistry:
case DEFAULT_LOW_TIER_PROVIDER_KEYS.talkingHead:
  return createSadtalkerLowAdapter({ defaultEstimateCents });
```

| Rule | Detail |
|------|--------|
| Estimate | `estimateCentsFromCatalog(catalog, "sadtalker_low", fallback)` — seed **10** |
| Catalog load | Phase A: `buildBootstrapCatalog()` offline OK for tests; Phase B first job path should call `initializeProviderRegistryFromCatalog()` |
| Delete | `sadtalker-low-stub-adapter.ts` — no production stub path |
| Grep | `replicate.com` allowed only under `lib/providers/**` |

---

## ADR-0003 runtime matrix (SadTalker)

| Method | Runtime | Phase |
|--------|---------|-------|
| `estimateCost` | Vercel | A (callable) · B (preview gate) |
| `createJob` | Vercel | B — after gates in `createTalkingHeadVideoJob` |
| `getJobStatus` | Fly worker / poller | B — **not** unbounded Vercel Route Handler loop |
| `fetchAsset` | Fly worker | B — on terminal `completed` |

Phase A: adapter methods callable from unit tests and future orchestrator; **no** production poller wiring.

```
┌─────────────┐  createTalkingHeadVideoJob   ┌──────────────────┐
│ Vercel App  │ ───────────────────────────► │ neuramark_video  │
│             │  (Phase B — US-8.4)          │ _jobs            │
└─────────────┘                                └────────┬─────────┘
                                                          │ enqueue
                                                          ▼
                                                 ┌──────────────────┐
                                                 │ Fly.io worker    │
                                                 │ getJobStatus     │
                                                 │ fetchAsset       │
                                                 └──────────────────┘
```

---

## Phase B — `neuramark_video_jobs` DDL (US-8.4 owns migration)

**Not applied in Phase A BUILD.** Frozen shape for US-8.4 migration authoring.

```sql
CREATE TABLE public.neuramark_video_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.neuramark_clients(id) ON DELETE CASCADE,
  reel_script_id uuid NOT NULL REFERENCES public.neuramark_reel_scripts(id) ON DELETE CASCADE,
  provider_key text NOT NULL,
  provider_tier public.neuramark_provider_tier NOT NULL,
  asset_role text NOT NULL CHECK (asset_role IN ('primary', 'broll')),
  external_job_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')),
  estimated_cost_cents integer NOT NULL CHECK (estimated_cost_cents >= 0),
  actual_cost_cents integer CHECK (actual_cost_cents IS NULL OR actual_cost_cents >= 0),
  failure_reason text CHECK (failure_reason IS NULL OR char_length(failure_reason) <= 2000),
  portrait_asset_id uuid REFERENCES public.neuramark_media_assets(id),
  voiceover_asset_id uuid REFERENCES public.neuramark_media_assets(id),
  output_media_asset_id uuid REFERENCES public.neuramark_media_assets(id),
  parent_job_id uuid REFERENCES public.neuramark_video_jobs(id),
  attempt integer NOT NULL DEFAULT 1 CHECK (attempt >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT neuramark_video_jobs_external_id_unique
    UNIQUE (client_id, provider_key, external_job_id)
);

CREATE INDEX neuramark_video_jobs_client_reel_idx
  ON public.neuramark_video_jobs (client_id, reel_script_id);

CREATE INDEX neuramark_video_jobs_status_updated_idx
  ON public.neuramark_video_jobs (status, updated_at);
```

| Column | Rule |
|--------|------|
| `client_id` | **NOT NULL** — every read/write filters tenant |
| `provider_key` | Server-written from `resolveProviderForJob` only |
| `external_job_id` | `externalJobIdSchema` — opaque |
| `failure_reason` | `sanitizedErrorMessage` only |
| **`output_url`** | **Forbidden as canonical Replicate CDN URL** — use `output_media_asset_id` FK after `fetchAsset` |
| `attempt` | `1` on initial create (US-8.2/8.4); retry lineage US-8.4 |
| RLS | Deny-by-default; service-role Node only (US-X.4 pattern) |

---

## Phase B — `createTalkingHeadVideoJob()` (US-8.4)

**File:** `lib/video-jobs/create-talking-head-video-job.ts` (`import "server-only"`)

**Not implemented in Phase A.**

```ts
export async function createTalkingHeadVideoJob(
  input: CreateVideoJobRequest, // createVideoJobRequestSchema — no providerKey
): Promise<{ jobId: string; status: VideoJobStatus; estimatedCostCents: number }>;
```

| Step | Action |
|------|--------|
| 1 | `getCurrentUser()` / `requireActive` — resolve `clientId` server-side |
| 2 | Load reel script + `visualMode` server-side |
| 3 | `resolveProviderForJob(...)` → must be `sadtalker_low` for this story's paths |
| 4 | Reject if `referenceVideoAssetId` set (MuseTalk path) |
| 5 | `adapter.estimateCost(resolvedInput)` + `assertReelBudgetAllowsSpend` |
| 6 | If `visualMode === own_avatar`: `assertActiveAvatarConsentForJobs(clientId)` |
| 7 | Resolve portrait + voiceover asset IDs with ownership |
| 8 | `adapter.createJob(resolvedInput)` |
| 9 | INSERT `neuramark_video_jobs` (`attempt = 1`, `estimated_cost_cents`, asset FKs) |
| 10 | `recordReelSpendEvent({ assetRole: "talking_head", estimatedCostCents, ... })` |
| 11 | Enqueue worker poll message (ADR-0003) |

**Forbidden on request:** `providerKey`, `status`, `outputUrl`, `externalJobId` — cross-ref `FORBIDDEN_PROVIDER_AUTHORITY_KEYS`.

**On terminal complete (poller — US-8.4):**

1. `getJobStatus` → if `completed` and `rawOutputUrl`, `fetchAsset`
2. INSERT `neuramark_media_assets` (generated video row)
3. UPDATE job `status`, `output_media_asset_id`, `actual_cost_cents`
4. `finalizeGenerationCost({ mode: "async_update", actualCostCents from StoredMediaAsset })`
5. Clear `rawOutputUrl` from memory

**On failed:** UPDATE `status`, `failure_reason` (sanitized only).

---

## Phase B — Status polling DTO (US-8.4 FE)

**Route Handler (GET only):** e.g. `GET /api/video-jobs/[jobId]` — exact path frozen in US-8.4 CONTRACT.

| Rule | Detail |
|------|--------|
| Auth | Session required |
| Scope | `WHERE id = $1 AND client_id = $2` — foreign id → **404** |
| Response | `persistedVideoJobStatusSchema` subset + `jobId` + timestamps |
| Forbidden in DTO | `rawOutputUrl`, `external_job_id`, cost fields, vendor JSON, tokens |

US-8.2 may export internal **`getVideoJobStatusForClient(jobId, clientId)`** for US-8.4 to wrap — not a standalone FE deliverable.

---

## Automated tests (Phase A)

**File:** `lib/providers/video/sadtalker-low-adapter.test.ts`

| # | Case |
|---|------|
| 1 | Mocked create → processing → completed → `fetchAsset` round-trip |
| 2 | Missing `REPLICATE_API_TOKEN` → `PROVIDER_CONFIG_MISSING` before fetch |
| 3 | `validateProviderOutputUrl` rejects `https://evil.com/x` |
| 4 | Metadata IP URL rejected |
| 5 | Mock Replicate 401 body with `Bearer r8_…` → sanitized message contains no token |
| 6 | `externalJobIdSchema` rejects path chars in prediction id handling |
| 7 | Adapter module imports `server-only` |
| 8 | `provider-adapters.test.ts` — no `stub-sadtalker_low-` prefix on `externalJobId` |

**No network in CI** — inject `fetchImpl`.

---

## Out of scope (explicit)

- US-8.4 poller, webhooks, stale timeout, retry UI, Operator production list
- MuseTalk / Wan / HeyGen adapter bodies (stubs unchanged)
- TTS synthesis orchestration (US-9.3) — adapter consumes `voiceoverAssetId`
- FFmpeg assembly (US-9.x)
- Manual upload (US-8.3)
- Catalog seed changes
- Client-visible cost fields

---

## Changelog

| Date | Change |
|------|--------|
| 2026-08-29 | Initial freeze — Phase A adapter BUILD + Phase B orchestration/DDL deferred to US-8.4; reconciles SPEC-REVIEW + SECURITY |
