Reviewed by FE: N/A — 2026-08-31 — FE optional B-roll preview strip deferred; no FE AC. Operator primary-filtered job list acceptable for CLOSE.

# API Contract — US-8.5 Wan B-roll adapter (low tier, P0)

**Story:** US-8.5  
**Status:** Frozen — 2026-08-31  
**Security:** `plan/stories/US-8.5/SECURITY.md` (APPROVE WITH CONDITIONS — reconciled below; **12** conditions)  
**Spec review:** `plan/stories/US-8.5/SPEC-REVIEW.md` (GAPS — resolved by freezes below; **10** BUILD blockers)  
**Depends on:** US-8.1 ✅ adapter interface + registry + stub `siliconflow_wan21_turbo` · US-X.4 ✅ catalog seed (active, 21¢ `per_clip`, `SILICONFLOW_API_KEY`) · US-7.2 ✅ policy routes low + `needsBroll` → Wan · US-8.4 ✅ jobs + poller + retry · US-8.2 / 8.6 / 8.7 ✅ adapter patterns · US-7.1 ✅ budget · CosyVoice2 ✅ shared SiliconFlow Bearer auth · Soft: US-5.1 (`broll_beats` / `modalidad`) · US-9.1 Phase A (stitch = US-9.1 Phase B)  
**ADR:** `docs/adr/0003-worker-flyio-ffmpeg.md` — Vercel create/enqueue; Fly poll + `fetchAsset`; **no** FFmpeg stitch in this story  
**Feature branch:** `feature/US-8.5-wan-broll-adapter`

**This document is CONTRACT ONLY.** Zod mirrors live in `lib/contracts/siliconflow-wan21-turbo.ts` and extensions to `lib/contracts/video-job.ts`. **Phase A BUILD** ships the real Wan adapter + registry + mocked-HTTP tests. **Phase B BUILD (same story)** unlocks `createBrollVideoJobs` with `asset_role = broll`, per-clip budget, graceful degrade, poller/retry parity. **No new FE.** **No** catalog activate migration (row already `active = true`). **No** new `neuramark_video_jobs` DDL. Poll-only V1 (no SiliconFlow webhook).

**Terminology:** **provider adapter** · **provider key** · **asset role (`broll`)** · **external job id** · **download-and-own** · **graceful degrade** · **needs_broll** · **Job de generación**. Technical enums (`siliconflow_wan21_turbo`, `queued`, `faceless`) OK in code. Do **not** use CONTEXT _Evitar_ terms in product-facing strings.

**README media checklist amendment (binding):** Physical storage keys are **flat `{uuid}.mp4`** per US-3.3 `STORAGE_KEY_REGEX` and US-8.2 / US-8.6 / US-8.7 CONTRACT — **not** hierarchical `neuramark/{clientId}/{reelScriptId}/{uuid}.mp4`. Logical lineage (`clientId`, `reelScriptId`) lives in the job row and adapter job-context map only.

---

## SPEC-REVIEW blocking gaps closed (10 BUILD blockers)

| # | Gap | Resolution |
|---|-----|------------|
| 1 | Wan I2V vendor API + factory | § SiliconFlow Wan API contract + § Factory signature — model `Wan-AI/Wan2.1-I2V-14B-720P-Turbo`; `POST /v1/video/submit` + `POST /v1/video/status`; `createSiliconflowWan21TurboAdapter` |
| 2 | Reference still + prompt authority | § I2V input matrix + § Reference still resolver + § Server-authored prompt — owned media only; fail closed; client free-text not sole authority |
| 3 | Output host allowlist (SSRF) | `WAN_ALLOWED_OUTPUT_HOSTS` — distinct from Replicate/HeyGen; `validateProviderOutputUrl` at status + fetch |
| 4 | Phase B orchestrator + degrade | § `createBrollVideoJobs` — N `asset_role = broll` jobs; independent of talking-head primary |
| 5 | Poller / retry for `broll` | § Poller + retry parity — unlock primary hardcode; inherit `asset_role` + Wan |
| 6 | Budget per clip vs Reel cumulative | § Cost + budget — 21¢/`per_clip`; `assertReelBudgetAllowsSpend` before each create |
| 7 | Flat `{uuid}.mp4` storage | § `fetchAsset` storage — README hierarchical path amended |
| 8 | Cost 21¢ (fix 10¢ stub) | Registry bootstrap **21**; `estimateCost` = 21 × clipCount |
| 9 | Max clips + ≤5s clamp | Max **8**; duration **clamp** to ≤5s (default 5; min 3) |
| 10 | `provider_key` + env | **`siliconflow_wan21_turbo` only**; **`SILICONFLOW_API_KEY`**; no `wan_broll_low` |
| 11 | Error codes, Zod, tests | § Error codes + § Zod modules + § Automated tests |
| 12 | Phase A vs B; FE N/A | § Phased BUILD acceptance; Reviewed by FE: N/A |

---

## SECURITY reconciliation (binding — 12 conditions)

| # | SECURITY condition | **Frozen in this contract** |
|---|-------------------|----------------------------|
| 1 | Anti–API-key-leakage | `SILICONFLOW_API_KEY` in Wan adapter only; Bearer; sanitize incl. degrade; closed DTOs |
| 2 | Anti–SSRF (output) | `WAN_ALLOWED_OUTPUT_HOSTS` + `validateProviderOutputUrl` + redirect re-validation |
| 3 | Anti–SSRF (input) | Owned reference still via `resolveMediaAssetUrlForProvider` — no client absolute image URLs |
| 4 | Anti–untrusted-response | US-8.1 normalizers; opaque ids; enum status; sanitized errors |
| 5 | Anti–CDN-as-canonical | Download-and-own; `rawOutputUrl` non-persistent; flat `{uuid}.mp4` |
| 6 | Anti–budget-bypass | Server 21¢/`per_clip`; assert before each clip; max 8 clips |
| 7 | Anti–provider smuggling | `FORBIDDEN_VIDEO_JOB_AUTHORITY_KEYS` incl. prompt/still/cost; policy owns key |
| 8 | Anti–prompt authority | Server-authored prompts from beats/script; client free-text not sole authority |
| 9 | Anti–degrade primary coupling | B-roll failure never fails/cancels/blocks primary |
| 10 | Anti–degrade secret leak | Degrade/failure surfaces use sanitized errors only |
| 11 | Anti–`asset_role` / tenancy | Always `broll` + `client_id`; retry non-promotion; IDOR 404 |
| 12 | Anti–module-leak | `server-only`; Wan HTTP under `lib/providers/**`; poll-only V1 |

---

## Phased BUILD acceptance

| Phase | Scope | Closes AC |
|-------|-------|-----------|
| **A** | Real `siliconflow_wan21_turbo` `VideoProviderAdapter` (SiliconFlow Wan I2V HTTP); `lib/contracts/siliconflow-wan21-turbo.ts`; registry replaces stub; `estimateCost` = **21¢ × clipCount**; create/status/fetch + normalizers + `WAN_ALLOWED_OUTPUT_HOSTS`; duration clamp ≤5s; mocked-HTTP unit tests; **no** B-roll orchestrator | Adapter + cost model + SEC floors; **partial** USER_STORIES |
| **B** | `createBrollVideoJobs`; N jobs `asset_role = broll`; per-clip budget + graceful degrade; poller includes `broll`; retry inherits `broll` + Wan; reference-still resolver; orchestrator tests | Remaining AC (default when needs_broll, degrade, multi-job handoff) — **required for CLOSE** |

**V1 VALIDATION closes** only after **Phase A + Phase B**. Do **not** check USER_STORIES AC after Phase A alone.  
**VALIDATION must note:** AC “may be stitched in assembly” = **produce clips here** / **stitch in US-9.1 Phase B** (handoff — not US-8.5 BUILD).  
**FE:** Preview strip deferred — **Reviewed by FE: N/A**.

---

## Overview — Phase A (BUILD scope)

Ship the **real SiliconFlow Wan2.1 I2V Turbo** `VideoProviderAdapter` for catalog key **`siliconflow_wan21_turbo`**:

1. **`lib/providers/video/siliconflow-wan21-turbo-adapter.ts`** — SiliconFlow Video API; `import "server-only"`.
2. **Registry** — replace `createSiliconflowWan21TurboStubAdapter` with **`createSiliconflowWan21TurboAdapter`**.
3. **`estimateCost`** — catalog **`per_clip` × clipCount** (default clipCount **1** at adapter; orchestrator projects N) = **21¢**/clip.
4. **`createJob` / `getJobStatus` / `fetchAsset`** + US-8.1 normalizers + Wan host allowlist.
5. **Tests** — mocked HTTP only in CI.

**Surfaces (Phase A)**

| # | Surface | Kind | New vs reused |
|---|---------|------|---------------|
| 1 | `createSiliconflowWan21TurboAdapter` | Adapter factory | **New** |
| 2 | `lib/contracts/siliconflow-wan21-turbo.ts` | Frozen constants | **New** |
| 3 | Registry bootstrap | `create-provider-registry.ts` | **Modified** — real Wan; estimate **21** |
| 4 | `siliconflow-wan21-turbo-adapter.test.ts` | Unit tests | **New** |
| 5 | Registry / policy tests | Regression | **Modified** |

**Forbidden surfaces (Phase A BUILD veto):**

- B-roll orchestrator create path (Phase B only).
- Client-authoritative `provider_key` / absolute `image_url` / sole free-form prompt.
- Live SiliconFlow calls in CI.
- Hierarchical storage keys in `fetchAsset`.
- Consent/budget checks **inside** adapter `createJob` (orchestrator only — Phase B).
- Writing Wan jobs as `asset_role = primary`.
- Keeping stub as production path for `siliconflow_wan21_turbo`.
- Registry bootstrap estimate **10** (stub leftover).

---

## Frozen decisions (do not reopen)

| # | Topic | Freeze |
|---|-------|--------|
| 1 | Provider key | **`siliconflow_wan21_turbo`** only · **`videoAssetRole: "broll"`** · reject `wan_broll_low` |
| 2 | Vendor | SiliconFlow REST (`fetch`, no new npm SDK) |
| 3 | Env | **`SILICONFLOW_API_KEY`** — catalog `env_key_name`; shared with LLM/TTS; missing → **`PROVIDER_CONFIG_MISSING`** |
| 4 | Auth | **`Authorization: Bearer ${token}`** header only |
| 5 | API | Base `https://api.siliconflow.cn`; **`POST /v1/video/submit`**; **`POST /v1/video/status`** |
| 6 | Model | **`Wan-AI/Wan2.1-I2V-14B-720P-Turbo`** (`WAN_MODEL_ID`) |
| 7 | Cost | **`per_clip`** · **`unitCostCents: 21`** · estimate = 21 × clipCount |
| 8 | Catalog | Already **`active = true`** — **no** activate migration |
| 9 | Duration | Policy **3–5s**; hard cap **5s**; **clamp** (not reject); default **5s** |
| 10 | Max clips | **8** (align `brollBeats` schema max) |
| 11 | Storage key | Flat **`{uuid}.mp4`** |
| 12 | Output hosts | **`WAN_ALLOWED_OUTPUT_HOSTS`** (not Replicate/HeyGen) |
| 13 | Consent | **Not** required for B-roll (not likeness talking-head) |
| 14 | Poll | Poll-only V1 — no SiliconFlow webhook Route Handler |
| 15 | Stitch | **Out** — US-9.1 Phase B |
| 16 | FE | **Defer** preview; Reviewed by FE: N/A |
| 17 | Image size | Default **`720x1280`** (9:16 Reel) |

---

## SiliconFlow Wan API contract

**Control plane (create + poll only):**

| Constant | Value |
|----------|-------|
| Base URL | `https://api.siliconflow.cn` (`WAN_API_BASE_URL`) — CosyVoice2 family |
| Create | `POST /v1/video/submit` (`WAN_SUBMIT_URL`) |
| Status | `POST /v1/video/status` (`WAN_STATUS_URL`) — **POST**, not GET |
| Auth | `Authorization: Bearer ${process.env.SILICONFLOW_API_KEY}` |

**Do not** send webhook / callback URL in V1 (poll-only).

### Create body (I2V — frozen)

```json
{
  "model": "Wan-AI/Wan2.1-I2V-14B-720P-Turbo",
  "prompt": "<server-authored-prompt>",
  "image": "<https-signed-owned-still-url>",
  "image_size": "720x1280",
  "duration": 5
}
```

| Field | Source |
|-------|--------|
| `model` | `WAN_MODEL_ID` constant — never client |
| `prompt` | Server-authored from beat + script (§ Server-authored prompt) |
| `image` | `resolveMediaAssetUrlForProvider` HTTPS (owned still) — **never** client absolute URL |
| `image_size` | `WAN_DEFAULT_IMAGE_SIZE` (`720x1280`) unless script/policy supplies an allowlisted size |
| `duration` | Clamped clip duration seconds (3–5, default 5) |

Optional vendor fields (`negative_prompt`, `seed`) — **omit in V1** unless BUILD proves need; if added later, still server-only.

**Create success (vendor):**

```json
{
  "requestId": "c13b5dd0-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

**Normalized create result:**

```json
{
  "externalJobId": "c13b5dd0-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "status": "queued",
  "estimatedCostCents": 21
}
```

### Status poll body

```json
{
  "requestId": "<externalJobId>"
}
```

### Status field map

| SiliconFlow `status` | Normalized `videoJobStatus` |
|----------------------|-----------------------------|
| `InQueue` | `queued` |
| `InProgress` | `processing` |
| `Succeed` | `completed` |
| `Failed` | `failed` |

**Terminal completed:** map `results.videos[0].url` through `validateProviderOutputUrl(..., WAN_ALLOWED_OUTPUT_HOSTS)` → transient `rawOutputUrl` only.  
**Terminal failed:** `sanitizeProviderErrorMessage` on `reason` / body — never persist raw vendor JSON or Bearer material.

**Response handling (mandatory):** `parseExternalJobId` / `externalJobIdSchema`; `normalizeVideoJobStatusResult(vendor, WAN_ALLOWED_OUTPUT_HOSTS)`; `sanitizeProviderErrorMessage`; drop unknown fields; never persist CDN URL as canonical.

---

## I2V input matrix (server-only)

Applies to **`resolvedCreateVideoJobInputSchema`** at adapter entry and Phase B orchestrator.

| Path | Required | Forbidden |
|------|----------|-----------|
| **B-roll clip** | Server-resolved `referenceImageAssetId` (still) + server-authored prompt + clamped duration | Client absolute `image` / `image_url` / `sourceUrl`; client free-text as sole prompt; `voiceoverAssetId` not required for Wan; `portraitAssetId` / `referenceVideoAssetId` not used as Wan inputs |
| **Any** | — | Client `provider_key`, tier, cost drivers, clipCount, duration override as authority |

**MIME after server resolution:**

- Reference still: `image/jpeg` \| `image/png` \| `image/webp` (`WAN_IMAGE_MIME_ALLOWLIST`)

**Inputs never accept client-supplied absolute HTTPS strings** — only owned `media_asset_id` → `resolveMediaAssetUrlForProvider` kind **`image` \| `portrait`** (TTL **300s**).

---

## Reference still resolver (Phase B)

**File (BUILD):** `lib/media/get-broll-reference-still-asset-for-client.ts` (`import "server-only"`)

```ts
export async function getBrollReferenceStillAssetForClient(
  clientId: string,
  reelScriptId: string,
): Promise<{ assetId: string } | null>;
```

| Priority (first match wins) | Source |
|-----------------------------|--------|
| 1 | Script-linked / package still or cover still for this Reel (if present as owned `media_assets` row) |
| 2 | Client profile logo / branding still (owned image MIME) |
| 3 | Earliest owned uploaded work/cover still (`asset_type` allowlist frozen in BUILD to match US-3.x / US-9.2 image rows) |
| — | **null** → fail closed |

**Orchestrator:** if resolver returns `null` → **`BROLL_REFERENCE_STILL_MISSING`** with `messageKey = WAN_REFERENCE_STILL_MISSING_MESSAGE_KEY`. Do **not** call Wan. Do **not** fail talking-head primary. Operator may use US-8.3 manual primary as alternate path.

**Forbidden:** Posting client-supplied `image_url` / metadata IP / unsigned absolute URLs to SiliconFlow.

---

## Server-authored prompt

| Rule | Detail |
|------|--------|
| Authority | Orchestrator builds prompt from server-loaded `brollBeats[i]` + script hook/body snippets |
| Untrusted data | Beat / script text wrapped in `WAN_PROMPT_BEAT_OPEN` / `WAN_PROMPT_BEAT_CLOSE` |
| Max length | Truncate to `WAN_PROMPT_MAX_CHARS` (2000) |
| Client body | `prompt`, `brollPrompt`, `freeformPrompt`, `negativePrompt` ∈ **`FORBIDDEN_VIDEO_JOB_AUTHORITY_KEYS`** → `FORBIDDEN_FIELDS` |
| Empty beat | When `needsBroll` and beats empty → synthesize one clip from hook/body (clipCount = 1) with server wrap |

---

## Factory signature (Phase A)

**File:** `lib/providers/video/siliconflow-wan21-turbo-adapter.ts`

```ts
export function createSiliconflowWan21TurboAdapter(params: {
  defaultEstimateCents: number; // 21 from catalog bootstrap
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
| `providerKey` | `"siliconflow_wan21_turbo"` |
| `videoAssetRole` | `"broll"` |
| `estimateCost` | `{ estimatedCostCents: unitCostCentsPerClip * clipCount, currency: "USD", providerKey }` — clipCount from input metadata / default **1**; **no** hardcoded 10 in adapter body |
| `createJob` | Validate still + prompt + clamp duration; load key or `PROVIDER_CONFIG_MISSING`; resolve image URL; POST submit; return normalized result |
| `getJobStatus` | POST status; `normalizeVideoJobStatusResult(..., WAN_ALLOWED_OUTPUT_HOSTS)` |
| `fetchAsset` | See § `fetchAsset` storage |

**Missing `SILICONFLOW_API_KEY`:** throw `ProviderAdapterError(PROVIDER_CONFIG_MISSING, "Provider is not configured")` **before** any `fetch`.

**Duration:** `clampWanClipDurationSec(requested)` — values >5 → 5; <3 → 3; missing → 5. Log/metadata may note clamp; do not reject.

---

## `fetchAsset` storage

| Layer | Rule |
|-------|------|
| **Physical `storageKey`** | `{uuid}.mp4` where `uuid = crypto.randomUUID()` — matches `STORAGE_KEY_REGEX` |
| **Logical lineage** | `clientId` + `reelScriptId` from job row via adapter job-context map (US-8.4 poller L1) |
| **Return** | `storedMediaAssetSchema` — no SiliconFlow CDN URL |
| **`media_assets` INSERT** | US-8.4 poller after terminal complete |

**Download hardening:** `WAN_FETCH_TIMEOUT_MS` (120s), `WAN_FETCH_MAX_BYTES` (100MB), `WAN_FETCH_MAX_REDIRECTS` (3), https-only, Content-Type `video/*` / `video/mp4`; re-validate final URL host after redirects.

---

## `WAN_ALLOWED_OUTPUT_HOSTS`

**File:** `lib/contracts/siliconflow-wan21-turbo.ts`

```ts
export const WAN_ALLOWED_OUTPUT_HOSTS: readonly string[] = [
  "sc-maas.oss-cn-shanghai.aliyuncs.com",
  "sc-maas.oss-cn-beijing.aliyuncs.com",
  "sf-maas-prod.oss-cn-shanghai.aliyuncs.com",
  "sf-maas-sgp-ap-southeast-1.oss-ap-southeast-1.aliyuncs.com",
];
```

Suffix match per `validateProviderOutputUrl`. Reject IP-literal hostnames, `localhost`, `.local`. **Do not** copy Replicate/HeyGen lists. Extend only via CONTRACT revision + security review (e.g. after first live SiliconFlow delivery host observation).

**Call sites (mandatory):** `getJobStatus` (when setting `rawOutputUrl`) and `fetchAsset` (before GET).

---

## Cost model + estimate

| Rule | Detail |
|------|--------|
| Catalog | `{ billingUnit: "per_clip", unitCostCents: 21, metadata: { clipDurationSec: 5, model: "wan2.1-i2v-turbo", vendor: "siliconflow", siliconflowModelId: WAN_MODEL_ID } }` |
| Adapter `estimateCost` | `21 × clipCount` (clipCount default 1) |
| Orchestrator projection | N clips → **21 × N** (e.g. 3 → **63**) |
| Registry bootstrap | `estimateCentsFromCatalog(..., "siliconflow_wan21_turbo", **21**)` — **kill 10¢ stub leftover** |
| Client cost fields | Forbidden |

---

## Phase B — `createBrollVideoJobs`

**Name:** `createBrollVideoJobs`  
**File (BUILD):** `lib/video-jobs/create-broll-video-jobs.ts` (`import "server-only"`)  
**FE consumer:** **None in this story** (deferred preview). Callable from Operator Server Action / future thin UX; tests drive Phase B.

```ts
export async function createBrollVideoJobs(
  rawInput: unknown,
): Promise<CreateBrollVideoJobsResult>;
```

**Request (Zod):** `createBrollVideoJobsRequestSchema` — `{ reelScriptId, clientId }` only.  
**Success:** `createBrollVideoJobsSuccessSchema` — `{ ok, jobs[], skipped[], createdCount, skippedCount, skippedNoNeedsBroll }`.

### Gate order (binding)

| Step | Action |
|------|--------|
| 1 | `requireOperator("handler")` → Cliente **403** (`FORBIDDEN`) |
| 2 | Reject **`FORBIDDEN_VIDEO_JOB_AUTHORITY_KEYS`** (incl. prompt / still / provider / cost / clipCount) → `FORBIDDEN_FIELDS` |
| 3 | Parse `createBrollVideoJobsRequestSchema` (strict) |
| 4 | Load reel script package server-side → `needsBroll` + `brollBeats` |
| 5 | If **!needsBroll** → success with empty jobs, `skippedNoNeedsBroll: true` (not an error) |
| 6 | `resolveProviderForJob({ assetRole: "broll", … })` → must be `siliconflow_wan21_turbo` when low + needsBroll; else `BROLL_PROVIDER_UNAVAILABLE` / `PROVIDER_UNAVAILABLE` |
| 7 | Resolve reference still via **`getBrollReferenceStillAssetForClient`** — null → `BROLL_REFERENCE_STILL_MISSING` (do not touch primary) |
| 8 | Clip count = `clampWanClipCount(max(1, brollBeats.length))` — max **8** |
| 9 | **For each clip i:** build server prompt → `adapter.estimateCost` (1 clip) → **`assertReelBudgetAllowsSpend`** → on fail: append `skipped` with `BUDGET_EXCEEDED`, **continue** (do not abort remaining or primary) → else `adapter.createJob` → INSERT `neuramark_video_jobs` (`asset_role = broll`, `provider_key = siliconflow_wan21_turbo`, `provider_tier = low`, `client_id`, `portrait_asset_id` = reference still id for audit, `attempt = 1`) → spend event → enqueue poll |
| 10 | On clip adapter throw: mark that create as skipped/`failed` row if inserted; **never** UPDATE talking-head primary jobs |

**Consent:** **Skip** `assertActiveAvatarConsentForJobs` for B-roll.  
**Talking-head:** `createTalkingHeadVideoJob` **unchanged** — never awaits B-roll; never fails because B-roll failed.

### Trigger matrix

| Condition | Wan B-roll create? |
|-----------|---------------------|
| `provider_tier = low` + `needsBroll` + budget OK | **Yes** |
| `provider_tier = low` + no needsBroll | **No** (`skippedNoNeedsBroll`) |
| `provider_tier = high` / `ltx_broll_high` | **No** (out of scope) |
| Talking-head primary create | **Independent** |
| B-roll job fails / times out / budget-blocked | Primary **continues** |
| Client body `provider_key` / prompt / image URL | **`FORBIDDEN_FIELDS`** |

### Job row audit (`portrait_asset_id` overload)

| `provider_key` | `portrait_asset_id` stores | `voiceover_asset_id` |
|----------------|---------------------------|----------------------|
| `siliconflow_wan21_turbo` | Reference still image asset id | **null** (Wan I2V has no voiceover input) |

No DDL. Poller/retry interpret via stored `provider_key`.

---

## Poller + retry parity (Phase B)

### Poller

| Rule | Detail |
|------|--------|
| Query | Include `asset_role IN ('primary', 'broll')` — **no** primary-only filter that drops B-roll |
| Provider | Load `provider_key` from job row → `getVideoAdapter(job.providerKey)` — never client |
| Status writes | Poller-only (US-8.4) |
| Tenancy | `(id, client_id)` before adapter call |
| Promotion | **Never** rewrite `asset_role` or switch provider |

### Retry (`retry-video-job.ts` unlock)

**Today (US-8.4):** hardcodes `assetRole: "primary"` and `needsBroll: false` — **breaks** B-roll retry.

**US-8.5 Phase B freeze:**

| Rule | Detail |
|------|--------|
| Inherit | Parent job `provider_key` + **`asset_role`** (`broll` stays `broll`) |
| Policy context | When parent `asset_role = broll`: pass `needsBroll: true`, `assetRole: "broll"` (policy role), rebuild production context from script |
| Create path | B-roll retry calls **`createBrollVideoJobs`-compatible** single-clip recreate **or** shared internal helper that INSERTs `asset_role = broll` — **never** `createTalkingHeadVideoJob` for Wan parents |
| Forbidden | Converting Wan → talking-head / HeyGen / `primary` on retry |
| Gates | Budget re-check; no consent for B-roll |

---

## Registry bootstrap (Phase A)

**File:** `lib/providers/create-provider-registry.ts`

```ts
import { createSiliconflowWan21TurboAdapter } from "@/lib/providers/video/siliconflow-wan21-turbo-adapter";

registry.registerVideo(
  createSiliconflowWan21TurboAdapter({
    defaultEstimateCents: estimateCentsFromCatalog(
      catalog,
      "siliconflow_wan21_turbo",
      21,
    ),
    unitCostCentsPerClip: /* from catalog cost_model.unitCostCents */,
  }),
);
```

| Rule | Detail |
|------|--------|
| Production | Stub **not** used for `siliconflow_wan21_turbo` |
| Delete path | Prefer delete or stop importing `siliconflow-wan21-turbo-stub-adapter.ts` from production registry |
| Bootstrap | `unitCostCents: 21` — not 10 |
| Tests | `getVideoAdapter("siliconflow_wan21_turbo")` real (no `stub-siliconflow_wan21_turbo-` id prefix) |

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
| `PROVIDER_CONFIG_MISSING` | Missing `SILICONFLOW_API_KEY` (adapter) |
| `BROLL_REFERENCE_STILL_MISSING` | No owned reference still for I2V |
| `BROLL_NOT_NEEDED` | Optional explicit skip error path — prefer success `skippedNoNeedsBroll: true` |
| `BROLL_PROVIDER_UNAVAILABLE` | Policy did not select Wan / adapter missing when needsBroll |
| `FORBIDDEN` / `UNAUTHENTICATED` | Non-operator / no session |
| `FORBIDDEN_FIELDS` | Client provider/prompt/still/cost/clip authority keys |
| `BUDGET_EXCEEDED` | Per-clip budget gate fails (that clip skipped; primary untouched) |
| `PROVIDER_UNAVAILABLE` | Catalog / registry gap |
| `VALIDATION_ERROR` | Schema / MIME / duration / prompt build failure |
| `NOT_FOUND` | Reel / asset / job tenant miss |
| `INTERNAL_ERROR` | Unexpected |

Reuse `videoJobMutationErrorSchema` envelope. Extend `videoJobErrorCodeSchema` with B-roll codes (Zod mirror).

---

## Zod / contract modules (mirrors)

| Module | Contents |
|--------|----------|
| `lib/contracts/siliconflow-wan21-turbo.ts` | Env key, API base/paths, model id, duration clamp helpers, hosts, MIME, cost constants, status map, prompt delimiters |
| `lib/contracts/video-job.ts` | `createBrollVideoJobs*` / preview schemas; B-roll error codes; extended `FORBIDDEN_VIDEO_JOB_AUTHORITY_KEYS` |

---

## US-9.1 Phase B handoff (binding)

US-8.5 **produces** N owned `asset_role = broll` media assets (download-and-own).  
**US-9.1 Phase B** consumes those assets for multi-clip stitch / `build-broll-concat-args`.  
Assembly **must not** fetch SiliconFlow CDN URLs. Missing B-roll → skip that clip (graceful degrade at assembly).  
Do **not** implement FFmpeg stitch in US-8.5. VALIDATION.md must record this handoff.

---

## Fixtures (mock-friendly)

**Phase A adapter createJob input (internal resolved):**

```json
{
  "reelScriptId": "11111111-1111-4111-8111-111111111111",
  "clientId": "22222222-2222-4222-8222-222222222222",
  "providerKey": "siliconflow_wan21_turbo",
  "providerTier": "low",
  "assetRole": "broll",
  "targetDurationSec": 5,
  "referenceImageAssetId": "33333333-3333-4333-8333-333333333333",
  "prompt": "Cinematic B-roll. <<BEAT>>Storefront morning light<</BEAT>>"
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
  "provider_key": "siliconflow_wan21_turbo",
  "prompt": "attacker freeform",
  "image_url": "https://169.254.169.254/latest/meta-data/"
}
```

**SiliconFlow submit success (mock):**

```json
{
  "requestId": "wan_mock_request_001"
}
```

**SiliconFlow completed status (mock):**

```json
{
  "status": "Succeed",
  "reason": "",
  "results": {
    "videos": [
      {
        "url": "https://sc-maas.oss-cn-shanghai.aliyuncs.com/mock/wan_clip_001.mp4"
      }
    ],
    "timings": { "inference": 12.5 },
    "seed": 42
  }
}
```

**Normalized create:** `{ "externalJobId": "wan_mock_request_001", "status": "queued", "estimatedCostCents": 21 }`  
**Estimate:** 1 clip = **21**; 3 clips = **63**.

---

## Automated tests

### Phase A — `lib/providers/video/siliconflow-wan21-turbo-adapter.test.ts`

| # | Case |
|---|------|
| 1 | Mocked create → processing → completed → `fetchAsset` round-trip |
| 2 | Missing `SILICONFLOW_API_KEY` → `PROVIDER_CONFIG_MISSING` before fetch |
| 3 | Estimate: 1 clip = **21¢**; adapter clipCount 3 = **63¢** when projected |
| 4 | Duration 12 → clamped to **5**; duration 1 → clamped to **3** |
| 5 | `validateProviderOutputUrl` rejects non-allowlisted / metadata IP hosts |
| 6 | Mock SiliconFlow error with Bearer/key → sanitized output has no key substring |
| 7 | Adapter module imports `server-only` |
| 8 | Registry — `getVideoAdapter("siliconflow_wan21_turbo")` is real (no stub id prefix) |
| 9 | Submit body uses `WAN_MODEL_ID` + Bearer auth; status uses POST + `requestId` |

### Phase B — orchestrator / degrade / retry tests

| # | Case |
|---|------|
| 1 | `provider_tier=low` + `needsBroll` → creates Wan jobs `asset_role = broll` |
| 2 | No `needsBroll` → `skippedNoNeedsBroll: true`, zero jobs |
| 3 | N beats → N jobs (capped at 8) |
| 4 | Client `provider_key` / `prompt` / `image_url` → `FORBIDDEN_FIELDS` |
| 5 | Budget spy called before **each** clip `createJob` |
| 6 | Over-budget B-roll does **not** mark primary failed |
| 7 | B-roll adapter throw / status `failed` leaves primary successful |
| 8 | INSERT persists `asset_role = broll` + `client_id` |
| 9 | Non-operator → **403** |
| 10 | Missing reference still → `BROLL_REFERENCE_STILL_MISSING`; primary untouched |
| 11 | Retry B-roll parent stays `broll` + `siliconflow_wan21_turbo` (no primary hardcode) |
| 12 | Degrade path sanitized errors contain no key / Bearer substring |

---

## Out of scope (explicit)

- US-9.1 Phase B FFmpeg multi-clip stitch / `build-broll-concat-args`
- Optional FE B-roll preview strip / Operator B-roll list UX
- High-tier `ltx_broll_high`
- Inventing `wan_broll_low` catalog key
- Catalog activate migration (already active)
- Talking-head path changes that couple primary to B-roll
- Live SiliconFlow CI tests
- New `neuramark_video_jobs` DDL
- SiliconFlow Wan webhook Route Handler
- Avatar consent gate for B-roll
- Stories / multicanal / ads / RBAC UI

---

## Changelog

| Date | Change |
|------|--------|
| 2026-08-31 | Initial freeze — Phase A Wan adapter + Phase B B-roll orchestrator/degrade/poller-retry; resolves SPEC-REVIEW 10 BUILD blockers + SECURITY 12 conditions; Zod mirrors in `siliconflow-wan21-turbo.ts` + `video-job.ts`; storage flat `{uuid}.mp4`; estimate **21¢**; **Reviewed by FE: N/A** |
