Reviewed by FE: N/A — 2026-08-31 — FE optional B-roll preview strip deferred; no FE AC. Operator primary-filtered job list acceptable for CLOSE.

# API Contract — US-8.8 LTX B-roll adapter (high tier, P1)

**Story:** US-8.8  
**Status:** Frozen — 2026-08-31  
**Security:** `plan/stories/US-8.8/SECURITY.md` (APPROVE WITH CONDITIONS — reconciled below; **13** conditions)  
**Spec review:** `plan/stories/US-8.8/SPEC-REVIEW.md` (ALIGNED — **10** BUILD blockers resolved below)  
**Depends on:** US-8.1 ✅ adapter interface + registry + normalizers · US-X.4 ✅ catalog seed (inactive, 126¢ `per_clip`, `FAL_API_KEY`, `ltx-2.3-pro`) · US-7.2 ✅ policy routes high + `needsBroll` → active high-tier B-roll · US-8.4 ✅ jobs + poller + retry · US-8.5 ✅ `createBrollVideoJobs` + Wan adapter + graceful degrade · US-8.2 / 8.6 / 8.7 ✅ adapter patterns · US-7.1 ✅ budget · Soft: US-5.1 (`broll_beats` / `modalidad`) · US-9.1 Phase B ✅ (stitch consumer)  
**ADR:** `docs/adr/0003-worker-flyio-ffmpeg.md` — Vercel create/enqueue; Fly poll + `fetchAsset`; **no** FFmpeg stitch in this story  
**Feature branch:** `feature/US-8.8-ltx-broll-high`

**This document is CONTRACT ONLY.** Zod mirrors live in `lib/contracts/ltx-broll-high.ts` and extensions to `lib/contracts/video-job.ts`. **Phase A BUILD** ships the real LTX `VideoProviderAdapter` + registry + mocked-HTTP tests (catalog may stay inactive). **Phase B BUILD (same story)** activates catalog, unlocks orchestrator allowlist for high-tier LTX, poller/retry parity tests. **No new FE.** **No** new `neuramark_video_jobs` DDL. Poll-only V1 (no FAL webhook).

**Terminology:** **provider adapter** · **provider key** · **provider tier** · **asset role (`broll`)** · **external job id** · **download-and-own** · **graceful degrade** · **needs_broll** · **Job de generación**. Technical enums (`ltx_broll_high`, `queued`, `faceless`) OK in code. Do **not** use CONTEXT _Evitar_ terms in product-facing strings.

**README media checklist amendment (binding):** Physical storage keys are **flat `{uuid}.mp4`** per US-3.3 `STORAGE_KEY_REGEX` and US-8.2 / US-8.5 / US-8.7 CONTRACT — **not** hierarchical `neuramark/{clientId}/{reelScriptId}/{uuid}.mp4`. Logical lineage (`clientId`, `reelScriptId`) lives in the job row and adapter job-context map only.

---

## SPEC-REVIEW blocking gaps closed (10 BUILD blockers)

| # | Gap | Resolution |
|---|-----|------------|
| 1 | FAL LTX vendor API + factory | § FAL LTX API contract + § Factory signature — model `fal-ai/ltx-2.3/image-to-video`; queue submit + status + result; `createLtxBrollHighAdapter` |
| 2 | Reference still + prompt authority | § I2V input matrix + § Reference still resolver (reuse US-8.5) + § Server-authored prompt — owned media only; fail closed |
| 3 | Output host allowlist (SSRF) | `LTX_ALLOWED_OUTPUT_HOSTS` — distinct from Wan/SiliconFlow/Replicate/HeyGen; `validateProviderOutputUrl` at status + fetch |
| 4 | Phase B orchestrator + degrade | § `createBrollVideoJobs` allowlist unlock — N `asset_role = broll` jobs; independent of talking-head primary |
| 5 | Poller / retry for LTX `broll` | § Poller + retry parity — provider-agnostic poller; retry inherits parent `provider_key` + `broll` |
| 6 | Budget per clip vs Reel cumulative | § Cost + budget — 126¢/`per_clip`; `assertReelBudgetAllowsSpend` before each create |
| 7 | Flat `{uuid}.mp4` storage | § `fetchAsset` storage — README hierarchical path amended |
| 8 | Cost 126¢ (catalog seed) | Registry bootstrap **126**; `estimateCost` = 126 × clipCount |
| 9 | Max clips + duration clamp | Max **8**; orchestrator clamp **3–5s**; adapter maps to FAL minimum enum **6s** (vendor floor) |
| 10 | `provider_key` + env + tier pairing | **`ltx_broll_high` + `high` only**; **`FAL_API_KEY`**; orchestrator allowlist frozen |
| 11 | Error codes, Zod, tests | § Error codes + § Zod modules + § Automated tests |
| 12 | Phase A vs B; FE N/A | § Phased BUILD acceptance; Reviewed by FE: N/A |

---

## SECURITY reconciliation (binding — 13 conditions)

| # | SECURITY condition | **Frozen in this contract** |
|---|-------------------|----------------------------|
| 1 | Anti–API-key-leakage | `FAL_API_KEY` in LTX adapter only; `Authorization: Key`; sanitize incl. degrade; closed DTOs |
| 2 | Anti–SSRF (output) | `LTX_ALLOWED_OUTPUT_HOSTS` + `validateProviderOutputUrl` + redirect re-validation |
| 3 | Anti–SSRF (input) | Owned reference still via US-8.5 `getBrollReferenceStillAssetForClient` + `resolveMediaAssetUrlForProvider` — no client absolute image URLs |
| 4 | Anti–untrusted-response | US-8.1 normalizers; opaque ids; enum status; sanitized errors |
| 5 | Anti–CDN-as-canonical | Download-and-own; `rawOutputUrl` non-persistent; flat `{uuid}.mp4` |
| 6 | Anti–budget-bypass | Server 126¢/`per_clip`; assert before each clip; max 8 clips |
| 7 | Anti–provider smuggling | `FORBIDDEN_VIDEO_JOB_AUTHORITY_KEYS` incl. prompt/still/cost/tier; policy + allowlist owns key-tier pairing |
| 8 | Anti–tier-floor bypass | Never `(ltx_broll_high, low)`; policy + orchestrator tests; activation does not change low routing |
| 9 | Anti–prompt authority | Server-authored prompts from beats/script; client free-text not sole authority |
| 10 | Anti–degrade primary coupling | B-roll failure never fails/cancels/blocks primary |
| 11 | Anti–degrade secret leak | Degrade/failure surfaces use sanitized errors only |
| 12 | Anti–`asset_role` / tenancy | Always `broll` + `client_id` + `provider_tier = high`; retry non-promotion; IDOR 404 |
| 13 | Anti–module-leak | `server-only`; LTX HTTP under `lib/providers/**`; poll-only V1 |

---

## Phased BUILD acceptance

| Phase | Scope | Closes AC |
|-------|-------|-----------|
| **A** | Real `ltx_broll_high` `VideoProviderAdapter` (FAL LTX queue HTTP); `lib/contracts/ltx-broll-high.ts`; registry registers adapter when catalog row present; `estimateCost` = **126¢ × clipCount**; create/status/fetch + normalizers + `LTX_ALLOWED_OUTPUT_HOSTS`; duration mapping to FAL enum; mocked-HTTP unit tests; **catalog may stay `active = false`**; **no** orchestrator unlock | Adapter + cost model + SEC floors; **partial** USER_STORIES |
| **B** | Migration activate `ltx_broll_high`; unlock `isAllowedBrollProviderPair` in `createBrollVideoJobs`; `buildLtxBrollPrompt`; per-clip budget + graceful degrade for LTX path; poller/retry parity tests; tier-floor regression | Remaining AC (high-tier default when needs_broll, tier floor, degrade) — **required for CLOSE** |

**V1 VALIDATION closes** only after **Phase A + Phase B**. Do **not** check USER_STORIES AC after Phase A alone.  
**VALIDATION must note:** AC “may be stitched in assembly” = **produce clips here** / **stitch in US-9.1 Phase B** (handoff — US-9.1 ✅ CLOSED; not US-8.8 BUILD).  
**FE:** Preview strip deferred — **Reviewed by FE: N/A**.

---

## Overview — Phase A (BUILD scope)

Ship the **real FAL LTX 2.3 Pro I2V** `VideoProviderAdapter` for catalog key **`ltx_broll_high`**:

1. **`lib/providers/video/ltx-broll-high-adapter.ts`** — FAL queue REST (`fetch`, no new npm SDK); `import "server-only"`.
2. **Registry** — register **`createLtxBrollHighAdapter`** when catalog contains `ltx_broll_high` (row may be inactive).
3. **`estimateCost`** — catalog **`per_clip` × clipCount** (default clipCount **1** at adapter; orchestrator projects N) = **126¢**/clip.
4. **`createJob` / `getJobStatus` / `fetchAsset`** + US-8.1 normalizers + LTX host allowlist.
5. **Tests** — mocked HTTP only in CI.

**Surfaces (Phase A)**

| # | Surface | Kind | New vs reused |
|---|---------|------|---------------|
| 1 | `createLtxBrollHighAdapter` | Adapter factory | **New** |
| 2 | `lib/contracts/ltx-broll-high.ts` | Frozen constants | **New** |
| 3 | Registry bootstrap | `create-provider-registry.ts` | **Modified** — register LTX when row present; estimate **126** |
| 4 | `ltx-broll-high-adapter.test.ts` | Unit tests | **New** |
| 5 | Registry / policy tests | Regression | **Modified** |

**Forbidden surfaces (Phase A BUILD veto):**

- B-roll orchestrator allowlist unlock (Phase B only).
- Catalog `active = true` without Phase B migration.
- Client-authoritative `provider_key` / tier / absolute `image_url` / sole free-form prompt.
- Live FAL calls in CI.
- Hierarchical storage keys in `fetchAsset`.
- Consent/budget checks **inside** adapter `createJob` (orchestrator only — Phase B).
- Writing LTX jobs as `asset_role = primary`.
- Inventing alternate env name (e.g. `LTX_API_KEY`) — **`FAL_API_KEY` only**.
- Reusing `WAN_ALLOWED_OUTPUT_HOSTS` for LTX output fetch.

---

## Frozen decisions (do not reopen)

| # | Topic | Freeze |
|---|-------|--------|
| 1 | Provider key | **`ltx_broll_high`** only · **`videoAssetRole: "broll"`** · reject renames |
| 2 | Vendor | FAL queue REST (`fetch`, no `@fal-ai/client` in production adapter) |
| 3 | Env | **`FAL_API_KEY`** — catalog `env_key_name`; missing → **`PROVIDER_CONFIG_MISSING`** |
| 4 | Auth | **`Authorization: Key ${token}`** header only — **not** Bearer |
| 5 | Model ID | **`fal-ai/ltx-2.3/image-to-video`** (`LTX_FAL_MODEL_ID`) — catalog metadata alias `ltx-2.3-pro` |
| 6 | Queue host | **`https://queue.fal.run`** (`LTX_QUEUE_BASE_URL`) — control plane only |
| 7 | Cost | **`per_clip`** · **`unitCostCents: 126`** · estimate = 126 × clipCount (~$1.26/clip) |
| 8 | Catalog activate | **Phase B** migration `active = true` only — cost_model unchanged |
| 9 | Duration (policy) | Orchestrator band **3–5s**; clamp like Wan; default **5s** |
| 10 | Duration (FAL body) | FAL enum **`6` \| `8` \| `10`** only — adapter maps policy ≤5s → **`6`** (vendor minimum) |
| 11 | Max clips | **8** (shared with Wan / `brollBeats` schema max) |
| 12 | Storage key | Flat **`{uuid}.mp4`** |
| 13 | Output hosts | **`LTX_ALLOWED_OUTPUT_HOSTS`** (not Wan/SiliconFlow/Replicate/HeyGen) |
| 14 | Consent | **Not** required for B-roll (not likeness talking-head) |
| 15 | Poll | Poll-only V1 — no FAL webhook Route Handler |
| 16 | Stitch | **Out** — US-9.1 Phase B ✅ (consumer only) |
| 17 | FE | **Defer** preview; Reviewed by FE: N/A |
| 18 | Reel framing | `aspect_ratio: "9:16"` · `resolution: "1080p"` · `fps: 25` · `generate_audio: false` |
| 19 | Tier floor | `provider_tier = low` → **Wan only**; LTX never silent default |

---

## FAL LTX API contract

**Control plane (queue submit + poll only):**

| Constant | Value |
|----------|-------|
| Queue base | `https://queue.fal.run` (`LTX_QUEUE_BASE_URL`) |
| Model path | `fal-ai/ltx-2.3/image-to-video` (`LTX_FAL_MODEL_PATH`) |
| Submit | `POST ${LTX_QUEUE_BASE_URL}/${LTX_FAL_MODEL_PATH}` (`LTX_SUBMIT_URL`) |
| Status | `GET ${LTX_QUEUE_BASE_URL}/${LTX_FAL_MODEL_PATH}/requests/{requestId}/status` (`LTX_STATUS_URL_TEMPLATE`) |
| Result | `GET ${LTX_QUEUE_BASE_URL}/${LTX_FAL_MODEL_PATH}/requests/{requestId}` (`LTX_RESULT_URL_TEMPLATE`) |
| Auth | `Authorization: Key ${process.env.FAL_API_KEY}` |

**Do not** send `webhookUrl` / `callback_url` in V1 (poll-only). **Do not** accept caller-supplied base URL or model path.

### Submit body (I2V — frozen)

```json
{
  "image_url": "<https-signed-owned-still-url>",
  "prompt": "<server-authored-prompt>",
  "duration": 6,
  "resolution": "1080p",
  "aspect_ratio": "9:16",
  "fps": 25,
  "generate_audio": false
}
```

| Field | Source |
|-------|--------|
| `image_url` | `resolveMediaAssetUrlForProvider` HTTPS (owned still) — **never** client absolute URL |
| `prompt` | Server-authored from beat + script (§ Server-authored prompt) |
| `duration` | `mapLtxVendorDurationSec(clampLtxClipDurationSec(orchestratorSec))` — see § Duration mapping |
| `resolution` | `LTX_DEFAULT_RESOLUTION` (`1080p`) |
| `aspect_ratio` | `LTX_DEFAULT_ASPECT_RATIO` (`9:16`) |
| `fps` | `LTX_DEFAULT_FPS` (`25`) |
| `generate_audio` | **`false`** — B-roll has no embedded voiceover; assembly adds TTS (US-9.1) |

Optional vendor fields (`end_image_url`, `negative_prompt`, `seed`) — **omit in V1** unless BUILD proves need; if added later, still server-only.

**Submit success (vendor — queue accepted):**

```json
{
  "request_id": "764cabcf-b745-4b3e-ae38-1200304cf45b",
  "status_url": "https://queue.fal.run/fal-ai/ltx-2.3/image-to-video/requests/764cabcf-b745-4b3e-ae38-1200304cf45b/status",
  "response_url": "https://queue.fal.run/fal-ai/ltx-2.3/image-to-video/requests/764cabcf-b745-4b3e-ae38-1200304cf45b",
  "queue_position": 0
}
```

**Normalized create result:**

```json
{
  "externalJobId": "764cabcf-b745-4b3e-ae38-1200304cf45b",
  "status": "queued",
  "estimatedCostCents": 126
}
```

### Status poll

`GET` status URL with `Authorization: Key` header. Optional `?logs=0` (default — do not persist vendor logs).

### Status field map

| FAL queue `status` | Normalized `videoJobStatus` |
|--------------------|-----------------------------|
| `IN_QUEUE` | `queued` |
| `IN_PROGRESS` | `processing` |
| `COMPLETED` | `completed` |
| `FAILED` | `failed` |
| `CANCELED` / `CANCELLED` | `cancelled` |

**Terminal completed:** `GET` result URL when status is `COMPLETED`; map `video.url` through `validateProviderOutputUrl(..., LTX_ALLOWED_OUTPUT_HOSTS)` → transient `rawOutputUrl` only.  
**Terminal failed:** `sanitizeProviderErrorMessage` on vendor `error` / body — never persist raw FAL JSON or `Key …` material.

**Response handling (mandatory):** `parseExternalJobId` / `externalJobIdSchema`; `normalizeVideoJobStatusResult(vendor, LTX_ALLOWED_OUTPUT_HOSTS)`; `sanitizeProviderErrorMessage`; drop unknown fields; never persist CDN URL as canonical.

### Duration mapping (policy vs vendor)

| Layer | Rule |
|-------|------|
| Orchestrator / policy | `clampLtxClipDurationSec(requested)` — band **3–5s**, default **5s** (mirrors Wan band for AC) |
| Adapter create body | `mapLtxVendorDurationSec(clamped)` — FAL accepts **`6` \| `8` \| `10`** only; map **≤5 → 6**; **6 → 6**; **>6 → 8** (never **10** in V1 B-roll) |
| Billing | Always **`per_clip` 126¢** regardless of vendor duration enum — not per-second FAL pricing in V1 |

**Rationale:** USER_STORIES AC “3–5s cap” is the **product band**; FAL Pro I2V minimum enum is **6s**. Adapter sends vendor minimum; orchestrator metadata stays ≤5s; VALIDATION documents vendor floor.

---

## I2V input matrix (server-only)

Applies to **`resolvedCreateVideoJobInputSchema`** at adapter entry and Phase B orchestrator.

| Path | Required | Forbidden |
|------|----------|-----------|
| **B-roll clip** | Server-resolved `referenceImageAssetId` (still) + server-authored prompt + clamped duration | Client absolute `image_url` / `image` / `sourceUrl`; client free-text as sole prompt; `voiceoverAssetId` not required for LTX; `referenceVideoAssetId` not used |
| **Any** | — | Client `provider_key`, `providerTier`, `tier`, cost drivers, clipCount, duration override as authority |

**MIME after server resolution:**

- Reference still: `image/jpeg` \| `image/png` \| `image/webp` (`LTX_IMAGE_MIME_ALLOWLIST`)

**Inputs never accept client-supplied absolute HTTPS strings** — only owned `media_asset_id` → `resolveMediaAssetUrlForProvider` kind **`image` \| `portrait`** (TTL **300s**).

---

## Reference still resolver (Phase B — reuse US-8.5)

**File (existing):** `lib/media/get-broll-reference-still-asset-for-client.ts` (`import "server-only"`)

**Do not fork.** Same priority chain as US-8.5 CONTRACT:

| Priority (first match wins) | Source |
|-----------------------------|--------|
| 1 | Script-linked / package still or cover still for this Reel |
| 2 | Client profile logo / branding still |
| 3 | Earliest owned uploaded work/cover still |
| — | **null** → fail closed |

**Orchestrator:** if resolver returns `null` → **`BROLL_REFERENCE_STILL_MISSING`** with `messageKey = LTX_REFERENCE_STILL_MISSING_MESSAGE_KEY` (may alias Wan key `scripts.broll.failure.referenceStillMissing`). Do **not** call LTX. Do **not** fail talking-head primary.

---

## Server-authored prompt

| Rule | Detail |
|------|--------|
| Authority | Orchestrator builds prompt from server-loaded `brollBeats[i]` + script hook/body snippets |
| LTX wrapper | `buildLtxBrollPrompt({ beatText })` — prefix `High-polish cinematic B-roll.` + `LTX_PROMPT_BEAT_OPEN` / `LTX_PROMPT_BEAT_CLOSE` |
| Max length | Truncate to `LTX_PROMPT_MAX_CHARS` (2000) |
| Client body | `prompt`, `brollPrompt`, `freeformPrompt`, `negativePrompt` ∈ **`FORBIDDEN_VIDEO_JOB_AUTHORITY_KEYS`** → `FORBIDDEN_FIELDS` |
| Empty beat | When `needsBroll` and beats empty → synthesize one clip from hook/body (clipCount = 1) with server wrap |

**Orchestrator branch (Phase B):**

```ts
const prompt =
  providerKey === LTX_PROVIDER_KEY
    ? buildLtxBrollPrompt({ beatText })
    : buildWanBrollPrompt({ beatText });
```

---

## Factory signature (Phase A)

**File:** `lib/providers/video/ltx-broll-high-adapter.ts`

```ts
export function createLtxBrollHighAdapter(params: {
  defaultEstimateCents: number; // 126 from catalog bootstrap
  unitCostCentsPerClip?: number; // from catalog; default defaultEstimateCents
  resolveMediaAssetUrl?: (
    assetId: string,
    clientId: string,
    kind: "image" | "portrait",
  ) => Promise<string>;
  uploadGeneratedVideo?: (
    args: UploadGeneratedVideoArgs,
  ) => Promise<UploadGeneratedVideoResult>;
  fetchImpl?: typeof fetch;
  initialJobContexts?: Map<ExternalJobId, JobContext>;
}): VideoProviderAdapter;
```

| Method | Behavior |
|--------|----------|
| `providerKey` | `"ltx_broll_high"` |
| `videoAssetRole` | `"broll"` |
| `estimateCost` | `{ estimatedCostCents: unitCostCentsPerClip * clipCount, currency: "USD", providerKey }` — clipCount from input metadata / default **1** |
| `createJob` | Validate still + prompt + duration; load key or `PROVIDER_CONFIG_MISSING`; resolve `image_url`; POST queue submit; return normalized result |
| `getJobStatus` | GET status; on `COMPLETED` GET result for `video.url`; `normalizeVideoJobStatusResult(..., LTX_ALLOWED_OUTPUT_HOSTS)` |
| `fetchAsset` | See § `fetchAsset` storage |

**Missing `FAL_API_KEY`:** throw `ProviderAdapterError(PROVIDER_CONFIG_MISSING, "Provider is not configured")` **before** any `fetch`.

---

## `fetchAsset` storage

| Layer | Rule |
|-------|------|
| **Physical `storageKey`** | `{uuid}.mp4` where `uuid = crypto.randomUUID()` — matches `STORAGE_KEY_REGEX` |
| **Logical lineage** | `clientId` + `reelScriptId` from job row via adapter job-context map (US-8.4 poller L1) |
| **Return** | `storedMediaAssetSchema` — no FAL CDN URL |
| **`media_assets` INSERT** | US-8.4 poller after terminal complete |

**Download hardening:** `LTX_FETCH_TIMEOUT_MS` (120s), `LTX_FETCH_MAX_BYTES` (100MB), `LTX_FETCH_MAX_REDIRECTS` (3), https-only, Content-Type `video/*` / `video/mp4`; re-validate final URL host after redirects.

---

## `LTX_ALLOWED_OUTPUT_HOSTS`

**File:** `lib/contracts/ltx-broll-high.ts`

```ts
export const LTX_ALLOWED_OUTPUT_HOSTS: readonly string[] = [
  "fal.media",
  "v3.fal.media",
  "v3b.fal.media",
  "storage.googleapis.com",
];
```

Suffix match per `validateProviderOutputUrl`. Reject IP-literal hostnames, `localhost`, `.local`, `169.254.169.254`. **Do not** copy `WAN_ALLOWED_OUTPUT_HOSTS`, `HEYGEN_ALLOWED_OUTPUT_HOSTS`, or Replicate lists. Extend only via CONTRACT revision + security review (e.g. after first live FAL delivery host observation).

**Call sites (mandatory):** `getJobStatus` (when setting `rawOutputUrl`) and `fetchAsset` (before GET).

---

## Cost model + estimate

| Rule | Detail |
|------|--------|
| Catalog | `{ billingUnit: "per_clip", unitCostCents: 126, metadata: { clipDurationSec: 5, model: "ltx-2.3-pro", vendor: "fal", falModelId: LTX_FAL_MODEL_ID } }` |
| Adapter `estimateCost` | `126 × clipCount` (clipCount default 1) |
| Orchestrator projection | N clips → **126 × N** (e.g. 3 → **378**) |
| Registry bootstrap | `estimateCentsFromCatalog(..., "ltx_broll_high", **126**)` |
| Client cost fields | Forbidden |

---

## Phase B — `createBrollVideoJobs` orchestrator unlock

**Name:** `createBrollVideoJobs` (extend — **do not** fork)  
**File (BUILD):** `lib/video-jobs/create-broll-video-jobs.ts` (`import "server-only"`)

### Allowlist (binding — replaces L188–190 Wan-only guard)

**File:** `lib/video-jobs/create-broll-video-jobs.ts` (or `lib/contracts/ltx-broll-high.ts` export)

```ts
import { LTX_PROVIDER_KEY } from "@/lib/contracts/ltx-broll-high";
import { WAN_PROVIDER_KEY } from "@/lib/contracts/siliconflow-wan21-turbo";

export function isAllowedBrollProviderPair(
  providerKey: string,
  providerTier: "low" | "high",
): boolean {
  return (
    (providerKey === WAN_PROVIDER_KEY && providerTier === "low") ||
    (providerKey === LTX_PROVIDER_KEY && providerTier === "high")
  );
}
```

| Rule | Detail |
|------|--------|
| Replace | Remove `if (providerKey !== WAN_PROVIDER_KEY \|\| providerTier !== "low")` hard reject |
| With | `if (!isAllowedBrollProviderPair(providerKey, providerTier))` → `BROLL_PROVIDER_UNAVAILABLE` |
| Low tier + needsBroll | Policy **must** return `siliconflow_wan21_turbo` + `low` — never LTX even when `ltx_broll_high.active = true` |
| High tier + needsBroll + active | Policy returns `ltx_broll_high` + `high` |
| High tier + inactive (pre-Phase B) | `BROLL_PROVIDER_UNAVAILABLE` |
| Client body | Never supplies `provider_key` / `tier` — `resolveProviderForJob` only |

### Gate order (unchanged from US-8.5 — binding)

| Step | Action |
|------|--------|
| 1 | `requireOperator("handler")` → Cliente **403** (`FORBIDDEN`) |
| 2 | Reject **`FORBIDDEN_VIDEO_JOB_AUTHORITY_KEYS`** → `FORBIDDEN_FIELDS` |
| 3 | Parse `createBrollVideoJobsRequestSchema` (strict) — `{ reelScriptId, clientId }` only |
| 4 | Load reel script package server-side → `needsBroll` + `brollBeats` |
| 5 | If **!needsBroll** → success empty jobs, `skippedNoNeedsBroll: true` |
| 6 | `resolveProviderForJob({ assetRole: "broll", … })` → must match allowlist pair |
| 7 | Resolve reference still via **`getBrollReferenceStillAssetForClient`** — null → `BROLL_REFERENCE_STILL_MISSING` (primary untouched) |
| 8 | Clip count = `clampBrollClipCount(max(1, brollBeats.length))` — max **8** (may re-export `clampWanClipCount` until renamed) |
| 9 | **For each clip i:** `buildLtxBrollPrompt` or `buildWanBrollPrompt` → `adapter.estimateCost` (1 clip) → **`assertReelBudgetAllowsEstimatedSpend`** → on fail: append `skipped` with `BUDGET_EXCEEDED`, **continue** → else `adapter.createJob` → INSERT `neuramark_video_jobs` (`asset_role = broll`, `provider_key` + `provider_tier` from policy, `client_id`, `portrait_asset_id` = reference still id, `attempt = 1`) → spend event → enqueue poll |
| 10 | On clip adapter throw: sanitize log; mark skipped; **never** UPDATE talking-head primary jobs |

**Consent:** **Skip** `assertActiveAvatarConsentForJobs` for B-roll.  
**Talking-head:** `createTalkingHeadVideoJob` **unchanged** — never awaits B-roll; never fails because B-roll failed.

### Trigger matrix

| Condition | LTX B-roll create? |
|-----------|---------------------|
| `provider_tier = high` + `needsBroll` + row active + budget OK | **Yes** (`ltx_broll_high`) |
| `provider_tier = high` + row inactive (pre-Phase B) | **No** (`BROLL_PROVIDER_UNAVAILABLE`) |
| `provider_tier = low` + `needsBroll` | **No LTX** — Wan only (US-8.5 ✅) |
| `provider_tier = low` + active LTX row | **Still no LTX** — tier floor |
| Talking-head primary create | **Independent** |
| B-roll job fails / times out / budget-blocked | Primary **continues** |
| Client body `provider_key` / `prompt` / `image_url` / `tier` | **`FORBIDDEN_FIELDS`** |
| Pair `(ltx_broll_high, low)` | **`BROLL_PROVIDER_UNAVAILABLE`** — even if smuggled |

### Job row audit (`portrait_asset_id` overload)

| `provider_key` | `portrait_asset_id` stores | `voiceover_asset_id` |
|----------------|---------------------------|----------------------|
| `ltx_broll_high` | Reference still image asset id | **null** (LTX I2V has no voiceover input) |
| `siliconflow_wan21_turbo` | Reference still image asset id | **null** |

No DDL. Poller/retry interpret via stored `provider_key`.

---

## Poller + retry parity (Phase B)

### Poller

| Rule | Detail |
|------|--------|
| Query | Include `asset_role IN ('primary', 'broll')` — **no** primary-only filter |
| Provider | Load `provider_key` from job row → `getVideoAdapter(job.providerKey)` — never client |
| LTX rows | Process `ltx_broll_high` `broll` jobs identically to Wan — provider-agnostic |
| Status writes | Poller-only (US-8.4) |
| Tenancy | `(id, client_id)` before adapter call |
| Promotion | **Never** rewrite `asset_role` or switch provider |

### Retry (`retry-video-job.ts` — verify / extend)

| Rule | Detail |
|------|--------|
| Inherit | Parent job `provider_key` + **`asset_role`** (`broll` stays `broll`) |
| LTX parent | Retry calls `createBrollVideoJobs` single-clip path with inherited still — stays `ltx_broll_high` + `high` |
| Wan parent | Unchanged US-8.5 behavior |
| Forbidden | Converting LTX → talking-head / HeyGen / Wan / `primary` on retry |
| Gates | Budget re-check; no consent for B-roll |

---

## Registry bootstrap (Phase A)

**File:** `lib/providers/create-provider-registry.ts`

```ts
import { createLtxBrollHighAdapter } from "@/lib/providers/video/ltx-broll-high-adapter";

if (catalogKeys.has("ltx_broll_high")) {
  registry.registerVideo(
    createLtxBrollHighAdapter({
      defaultEstimateCents: estimateCentsFromCatalog(
        catalog,
        "ltx_broll_high",
        126,
      ),
      unitCostCentsPerClip: /* from catalog cost_model.unitCostCents */,
    }),
  );
}
```

| Rule | Detail |
|------|--------|
| Register | When catalog **row exists** — regardless of `active` (policy filters inactive at resolve time) |
| Production | No stub for `ltx_broll_high` — ship real adapter directly |
| Bootstrap | `unitCostCents: 126` |
| Tests | `getVideoAdapter("ltx_broll_high")` returns real adapter when row present |

---

## Catalog activate migration (Phase B only)

**File (BUILD):** `supabase/migrations/20260831100000_neuramark_ltx_broll_high_activate.sql`

```sql
-- US-8.8 Phase B: Activate ltx_broll_high for high-tier B-roll routing.
-- cost_model unchanged (126¢ per_clip per US-X.4 seed).

UPDATE public.neuramark_provider_catalog
SET active = true
WHERE key = 'ltx_broll_high';
```

| Rule | Detail |
|------|--------|
| Scope | **`active = true` only** — no cost_model change |
| Idempotent | `WHERE key = 'ltx_broll_high'` |
| No new tables | Unlike US-8.7 HeyGen — no Operator fallback audit table |
| Post-migrate | Policy `resolveProvider(..., { tier: "high", assetRole: "broll", needsBroll: true })` → `ltx_broll_high` |

---

## ADR-0003 runtime matrix

| Method | Runtime | Phase |
|--------|---------|-------|
| `estimateCost` | Vercel | A · B |
| `createJob` | Vercel | B — after orchestrator gates |
| `getJobStatus` | Fly worker / poller | B |
| `fetchAsset` | Fly worker | B — on terminal `completed` |

Phase A: adapter methods callable from unit tests only. **No** Vercel long poll. **No** FFmpeg in adapter.

---

## Error codes

| Code | When |
|------|------|
| `PROVIDER_CONFIG_MISSING` | Missing `FAL_API_KEY` (adapter) |
| `BROLL_REFERENCE_STILL_MISSING` | No owned reference still for I2V |
| `BROLL_NOT_NEEDED` | Optional — prefer success `skippedNoNeedsBroll: true` |
| `BROLL_PROVIDER_UNAVAILABLE` | Policy did not select allowed pair / adapter missing / inactive LTX pre-Phase B |
| `FORBIDDEN` / `UNAUTHENTICATED` | Non-operator / no session |
| `FORBIDDEN_FIELDS` | Client provider/tier/prompt/still/cost authority keys |
| `BUDGET_EXCEEDED` | Per-clip budget gate fails (that clip skipped; primary untouched) |
| `PROVIDER_UNAVAILABLE` | Catalog / registry gap |
| `VALIDATION_ERROR` | Schema / MIME / duration / prompt build failure |
| `NOT_FOUND` | Reel / asset / job tenant miss |
| `INTERNAL_ERROR` | Unexpected |

Reuse `videoJobMutationErrorSchema` envelope. B-roll codes already in `videoJobErrorCodeSchema` from US-8.5.

---

## Zod / contract modules (mirrors)

| Module | Contents |
|--------|----------|
| `lib/contracts/ltx-broll-high.ts` | Env key, queue URLs, model id/path, duration helpers, hosts, MIME, cost constants, status map, prompt delimiters, `isAllowedBrollProviderPair`, `buildLtxBrollPrompt` export optional (or orchestrator-local) |
| `lib/contracts/video-job.ts` | No new request schemas — reuse `createBrollVideoJobs*` from US-8.5 |

---

## US-9.1 Phase B handoff (binding)

US-8.8 **produces** N owned `asset_role = broll` media assets (download-and-own).  
**US-9.1 Phase B** ✅ consumes those assets for multi-clip stitch.  
Assembly **must not** fetch FAL CDN URLs. Missing B-roll → skip that clip (graceful degrade at assembly).  
Do **not** implement FFmpeg stitch in US-8.8. VALIDATION.md must record this handoff.

---

## Fixtures (mock-friendly)

**Phase A adapter createJob input (internal resolved):**

```json
{
  "reelScriptId": "11111111-1111-4111-8111-111111111111",
  "clientId": "22222222-2222-4222-8222-222222222222",
  "providerKey": "ltx_broll_high",
  "providerTier": "high",
  "assetRole": "broll",
  "targetDurationSec": 5,
  "referenceImageAssetId": "33333333-3333-4333-8333-333333333333",
  "prompt": "High-polish cinematic B-roll. <<BEAT>>Storefront morning light<</BEAT>>"
}
```

**Phase B orchestrator body:**

```json
{
  "reelScriptId": "11111111-1111-4111-8111-111111111111",
  "clientId": "22222222-2222-4222-8222-222222222222"
}
```

**Forbidden body (→ `FORBIDDEN_FIELDS`):**

```json
{
  "reelScriptId": "11111111-1111-4111-8111-111111111111",
  "clientId": "22222222-2222-4222-8222-222222222222",
  "provider_key": "ltx_broll_high",
  "providerTier": "high",
  "prompt": "attacker freeform",
  "image_url": "https://169.254.169.254/latest/meta-data/"
}
```

**FAL queue submit success (mock):**

```json
{
  "request_id": "ltx_mock_request_001",
  "status_url": "https://queue.fal.run/fal-ai/ltx-2.3/image-to-video/requests/ltx_mock_request_001/status",
  "response_url": "https://queue.fal.run/fal-ai/ltx-2.3/image-to-video/requests/ltx_mock_request_001",
  "queue_position": 0
}
```

**FAL status completed (mock):**

```json
{
  "status": "COMPLETED",
  "request_id": "ltx_mock_request_001"
}
```

**FAL result (mock):**

```json
{
  "video": {
    "content_type": "video/mp4",
    "file_name": "ltx_clip_001.mp4",
    "url": "https://v3b.fal.media/files/b/mock/ltx_clip_001.mp4"
  }
}
```

**Normalized create:** `{ "externalJobId": "ltx_mock_request_001", "status": "queued", "estimatedCostCents": 126 }`  
**Estimate:** 1 clip = **126**; 3 clips = **378**.

---

## Automated tests

### Phase A — `lib/providers/video/ltx-broll-high-adapter.test.ts`

| # | Case |
|---|------|
| 1 | Mocked create → processing → completed → `fetchAsset` round-trip |
| 2 | Missing `FAL_API_KEY` → `PROVIDER_CONFIG_MISSING` before fetch |
| 3 | Estimate: 1 clip = **126¢**; clipCount 3 = **378¢** when projected |
| 4 | Orchestrator duration 5 → FAL body `duration: 6` (vendor floor) |
| 5 | `validateProviderOutputUrl` rejects non-allowlisted / metadata IP hosts |
| 6 | Mock FAL error with `Key`/key material → sanitized output has no key substring |
| 7 | Adapter module imports `server-only` |
| 8 | Registry — `getVideoAdapter("ltx_broll_high")` when catalog row present |
| 9 | Submit uses `Authorization: Key` (not Bearer); status GET + result GET on completed |
| 10 | Create body includes `aspect_ratio: 9:16`, `generate_audio: false` |

### Phase B — orchestrator / degrade / retry / tier-floor tests

| # | Case |
|---|------|
| 1 | `provider_tier=high` + `needsBroll` + active → creates LTX jobs `asset_role = broll` |
| 2 | `provider_tier=low` + `needsBroll` + active LTX row → **Wan only**, never `ltx_broll_high` |
| 3 | `isAllowedBrollProviderPair` rejects `(ltx_broll_high, low)` |
| 4 | No `needsBroll` → `skippedNoNeedsBroll: true`, zero jobs |
| 5 | N beats → N jobs (capped at 8) |
| 6 | Client `provider_key` / `prompt` / `image_url` / `tier` → `FORBIDDEN_FIELDS` |
| 7 | Budget spy called before **each** clip `createJob` at **126¢** |
| 8 | Over-budget B-roll does **not** mark primary failed |
| 9 | LTX adapter throw / status `failed` leaves primary successful |
| 10 | INSERT persists `asset_role = broll` + `client_id` + `provider_key = ltx_broll_high` + `provider_tier = high` |
| 11 | Non-operator → **403** |
| 12 | Missing reference still → `BROLL_REFERENCE_STILL_MISSING`; primary untouched |
| 13 | Retry LTX B-roll parent stays `broll` + `ltx_broll_high` (no Wan/primary hardcode) |
| 14 | Degrade path sanitized errors contain no `Key …` substring |
| 15 | Pre-activate (inactive row) high tier → `BROLL_PROVIDER_UNAVAILABLE` |

---

## Out of scope (explicit)

- US-9.1 Phase B FFmpeg multi-clip stitch (✅ CLOSED — consumer only)
- Optional FE B-roll preview strip / Operator B-roll list UX
- Low-tier Wan adapter/orchestrator behavior change beyond shared allowlist
- Operator LTX fallback UI (policy-driven — unlike US-8.7 HeyGen)
- HeyGen / ElevenLabs high-tier adapters
- Inventing alternate catalog key or env name
- Talking-head path changes that couple primary to B-roll
- Live FAL CI tests
- New `neuramark_video_jobs` DDL
- FAL webhook Route Handler
- Avatar consent gate for B-roll
- Per-second FAL billing in estimate (catalog `per_clip` is authority)
- Stories / multicanal / ads / RBAC UI

---

## Changelog

| Date | Change |
|------|--------|
| 2026-08-31 | Initial freeze — Phase A LTX FAL adapter + Phase B activate/orchestrator unlock; resolves SPEC-REVIEW 10 BUILD blockers + SECURITY 13 conditions; Zod mirrors in `ltx-broll-high.ts`; FAL queue endpoints + `LTX_ALLOWED_OUTPUT_HOSTS` + `Authorization: Key`; orchestrator allowlist `{ wan+low, ltx+high }`; estimate **126¢**; duration vendor floor mapping; **Reviewed by FE: N/A** |
