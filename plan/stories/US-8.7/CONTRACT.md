Reviewed by FE: **approved** — 2026-08-31 — nextjs-frontend.

# API Contract — US-8.7 HeyGen adapter (high tier / operator fallback, P1)

**Story:** US-8.7  
**Status:** Frozen — 2026-08-31 (Reviewed by FE)  
**Security:** `plan/stories/US-8.7/SECURITY.md` (APPROVE WITH CONDITIONS — reconciled below; **12** conditions)  
**Spec review:** `plan/stories/US-8.7/SPEC-REVIEW.md` (GAPS — resolved by freezes below)  
**Depends on:** US-8.1 ✅ adapter interface + registry + normalizers + stub `heygen_high` · US-X.4 ✅ catalog seed · US-8.2 ✅ SadTalker pattern · US-8.4 ✅ jobs + poller + retry · US-8.6 ✅ allowlist extension · US-7.2 ✅ tier floor · US-7.1 ✅ budget · US-3.2 ✅ consent · US-3.3 ✅ avatar assets · US-5.1 ✅ reel script  
**ADR:** `docs/adr/0003-worker-flyio-ffmpeg.md` — Vercel create/enqueue; Fly poll + `fetchAsset`  
**Feature branch:** `feature/US-8.7-heygen-adapter`

**This document is CONTRACT ONLY.** Zod mirrors live in `lib/contracts/heygen-high.ts` and extensions to `lib/contracts/video-job.ts` / `lib/contracts/providers.ts`. **Phase A BUILD** ships the real `heygen_high` adapter + registry + mocked-HTTP tests (catalog may stay inactive). **Phase B BUILD (same story)** activates catalog, unlocks orchestrator, Operator fallback + FE. **No** new `neuramark_video_jobs` columns. Poll-only V1 (no HeyGen webhook).

**Terminology:** **provider adapter** · **provider key** · **provider tier** · **operator fallback** · **external job id** · **download-and-own** · **Job de generación**. Technical enums (`heygen_high`, `queued`) OK in code/Operator diagnostics. Do **not** use CONTEXT _Evitar_ terms in product-facing strings.

**README media checklist amendment (binding):** Physical storage keys are **flat `{uuid}.mp4`** per US-3.3 `STORAGE_KEY_REGEX` and US-8.2 / US-8.6 CONTRACT — **not** hierarchical `neuramark/{clientId}/{reelScriptId}/{uuid}.mp4`. Logical lineage (`clientId`, `reelScriptId`) lives in the job row and adapter job-context map only.

---

## SPEC-REVIEW blocking gaps closed

| # | Gap | Resolution |
|---|-----|------------|
| 1 | No US-8.7 CONTRACT.md | This document; freezes `lib/contracts/heygen-high.ts`, v3 body, factory, phased BUILD |
| 2 | Non–Avatar-IV `engine` unresolved | § Engine freeze — `HEYGEN_AVATAR_ENGINE = { type: "avatar_iii" }` on every `type: "avatar"` create; never omit |
| 3 | Avatar input matrix undefined | § HeyGen input matrix — `own_avatar` → image URL; `generic_avatar` → server `avatar_id` |
| 4 | Operator fallback + override audit | § Operator fallback Server Action + `neuramark_video_job_heygen_fallback_overrides` |
| 5 | Orchestrator allowlist unlock | § Phase B — allow `{ sadtalker_low, musetalk_low, heygen_high }` |
| 6 | Output host allowlist | `HEYGEN_ALLOWED_OUTPUT_HOSTS` — distinct from Replicate |
| 7 | Storage key vs `STORAGE_KEY_REGEX` | Flat `{uuid}.mp4` (README amendment above) |
| 8 | AC “per-minute” vs `per_second` | Estimate = `unitCostCents * targetDurationSec`; seed **2**; `approxPerMinuteCents: 120` |
| 9 | Audio vs text on create | Require voiceover → `audio_url`; **no** text-script fallback in V1 |
| 10 | FE dual path (policy high vs action) | § Dual create paths — policy + dedicated Operator action |
| 11 | Retry must not silently upgrade | Retry inherits parent `provider_key`; fallback is separate action |
| 12 | Phase A vs B BUILD split | § Phased BUILD acceptance |

## SECURITY reconciliation (binding — 12 conditions)

| # | SECURITY condition | **Frozen in this contract** |
|---|-------------------|----------------------------|
| 1 | Anti–API-key-leakage | `HEYGEN_API_KEY` in adapter only; `X-Api-Key`; `sanitizeProviderErrorMessage`; closed DTOs |
| 2 | Anti–silent-low-default | Tier floor tests; Phase B `active = true` does **not** change low routing |
| 3 | Anti–silent-fallback | No auto-upgrade; low retry stays low; dedicated Operator action only |
| 4 | Anti–Avatar-IV footgun | Every `type: "avatar"` POST includes `engine: { type: "avatar_iii" }`; omit = BUILD veto; Avatar V forbidden |
| 5 | Anti–fallback-abuse | `requireOperator("handler")` first; eligibility; override audit; Cliente **403** |
| 6 | Anti–provider smuggling | `FORBIDDEN_VIDEO_JOB_AUTHORITY_KEYS` + `FORBIDDEN_PROVIDER_AUTHORITY_KEYS`; server forces `heygen_high` |
| 7 | Anti–SSRF (output) | `HEYGEN_ALLOWED_OUTPUT_HOSTS` + `validateProviderOutputUrl` at status + fetch |
| 8 | Anti–SSRF (input) | Owned media / server `avatar_id` only — no client absolute URLs |
| 9 | Anti–untrusted-response | US-8.1 normalizers; opaque ids; enum status; sanitized errors |
| 10 | Anti–CDN-as-canonical | Download-and-own; `rawOutputUrl` non-persistent; flat `{uuid}.mp4` |
| 11 | Anti–gate-bypass | estimate → budget → consent → create (high + fallback) |
| 12 | Anti–module-leak | `server-only`; HeyGen HTTP under `lib/providers/**`; poll-only V1 |

---

## Phased BUILD acceptance

| Phase | Scope | Closes AC |
|-------|-------|-----------|
| **A** | Real `heygen_high` `VideoProviderAdapter` (HeyGen HTTP); `lib/contracts/heygen-high.ts`; registry replaces stub; `estimateCost` = `per_second × duration`; create/status/fetch + normalizers; mocked-HTTP unit tests; **catalog may stay `active = false`**; **no** orchestrator unlock | Adapter body proof; estimate + Avatar IV footgun tests; partial AC |
| **B** | Migration activate + cost_model 7→2; unlock `isAllowedTalkingHeadProviderKey`; high-tier policy select; Operator fallback Server Action + audit table; FE “Generate with HeyGen” EN/ES + estimate confirm; consent/budget E2E | Full USER_STORIES US-8.7 AC |

**V1 VALIDATION closes** only after **Phase A + Phase B**. Do **not** check USER_STORIES AC after Phase A alone. Soft: US-9.3 — fixture `voiceoverAssetId` OK.

---

## Overview — Phase A (BUILD scope)

Ship the **real HeyGen** `VideoProviderAdapter` for catalog key **`heygen_high`**:

1. **`lib/providers/video/heygen-high-adapter.ts`** — HeyGen v3 Videos API; `import "server-only"`.
2. **Registry** — replace `createHeygenHighStubAdapter` with **`createHeygenHighAdapter`**.
3. **`estimateCost`** — `unitCostCentsPerSecond * targetDurationSec` (server duration).
4. **`createJob` / `getJobStatus` / `fetchAsset`** + US-8.1 normalizers + HeyGen host allowlist.
5. **Tests** — mocked HTTP only in CI.

**Surfaces (Phase A)**

| # | Surface | Kind | New vs reused |
|---|---------|------|---------------|
| 1 | `createHeygenHighAdapter` | Adapter factory | **New** |
| 2 | `lib/contracts/heygen-high.ts` | Frozen constants | **New** |
| 3 | Registry bootstrap | `create-provider-registry.ts` | **Modified** — real HeyGen |
| 4 | `heygen-high-adapter.test.ts` | Unit tests | **New** |
| 5 | Registry / policy tests | Regression | **Modified** |

**Forbidden surfaces (Phase A BUILD veto):**

- Orchestrator accepting `heygen_high` (Phase B only).
- Catalog `active = true` without Phase B migration.
- Client-authoritative `provider_key` / `engine` / `avatar_id` / absolute URLs.
- Live HeyGen calls in CI.
- Hierarchical storage keys in `fetchAsset`.
- Consent/budget checks **inside** adapter `createJob` (orchestrator only — Phase B).
- Omitting `engine` on `type: "avatar"` creates.

---

## Frozen decisions (do not reopen)

| # | Topic | Freeze |
|---|-------|--------|
| 1 | Provider key | **`heygen_high`** · **`videoAssetRole: primary`** · no `heygen_avatar_iv` catalog key |
| 2 | Vendor | HeyGen REST (`fetch`, no new npm SDK) |
| 3 | Env | **`HEYGEN_API_KEY`** — catalog `env_key_name`; missing → **`PROVIDER_CONFIG_MISSING`** |
| 4 | Auth | **`X-Api-Key: ${token}`** header only |
| 5 | API | Base `https://api.heygen.com`; **`POST /v3/videos`**; **`GET /v3/videos/{id}`** |
| 6 | Engine (avatar) | **`{ "type": "avatar_iii" }`** — never omit on avatar creates; Avatar IV/V never selected |
| 7 | Cost | **`per_second`** · **`unitCostCents: 2`** · estimate = × server `targetDurationSec` |
| 8 | Catalog activate | **Phase B** migration `active = true` + cost_model correction |
| 9 | Low tier | **Never** resolves `heygen_high` (even when active) |
| 10 | Fallback | Operator-only after failed low-tier parent; audited |
| 11 | Storage key | Flat **`{uuid}.mp4`** |
| 12 | Output hosts | **`HEYGEN_ALLOWED_OUTPUT_HOSTS`** (not Replicate) |
| 13 | Audio | Voiceover **`audio_url` required** — no text-script fallback in V1 |
| 14 | Poll | Poll-only V1 — no HeyGen webhook Route Handler |
| 15 | Studio avatar id | Server env **`HEYGEN_DEFAULT_AVATAR_ID`** for generic path |

---

## HeyGen v3 API contract

**Control plane (create + poll only):**

| Constant | Value |
|----------|-------|
| Base URL | `https://api.heygen.com` (`HEYGEN_API_BASE_URL`) |
| Create | `POST /v3/videos` |
| Get | `GET /v3/videos/{video_id}` |
| Auth | `X-Api-Key: ${process.env.HEYGEN_API_KEY}` |

**Do not** send `callback_url` in V1 (poll-only; US-8.4 owns webhook auth if shipped later).

### Engine freeze (Avatar IV footgun)

| Rule | Detail |
|------|--------|
| Avatar creates (`type: "avatar"`) | **Always** include `"engine": { "type": "avatar_iii" }` (`HEYGEN_AVATAR_ENGINE`) |
| Omit `engine` | **BUILD veto** — HeyGen API defaults to Avatar IV |
| `avatar_iv` / `avatar_v` | **Forbidden** in V1 adapter (`HEYGEN_FORBIDDEN_ENGINE_TYPES`) |
| Image creates (`type: "image"`) | HeyGen `CreateVideoFromImage` schema has **no** `engine` field (`additionalProperties: false`). Adapter **must not** send `engine` on image bodies. This is **not** the avatar-omit footgun — different request discriminant. Image path is the vendor photo-animation pipeline (only option for arbitrary portrait URLs). Unit tests assert: (1) avatar bodies always include `engine.type === "avatar_iii"`; (2) image bodies never include `engine`; (3) never post `avatar_v`. |
| AC wording | “Avatar IV never auto-selected” = never omit engine on avatar creates; never select Avatar V; never rely on API default |

### Create body — `generic_avatar` (studio avatar_id)

```json
{
  "type": "avatar",
  "avatar_id": "<HEYGEN_DEFAULT_AVATAR_ID>",
  "audio_url": "<https-signed-voiceover-url>",
  "resolution": "1080p",
  "aspect_ratio": "9:16",
  "output_format": "mp4",
  "engine": { "type": "avatar_iii" }
}
```

### Create body — `own_avatar` (portrait image_url)

```json
{
  "type": "image",
  "image": {
    "type": "url",
    "url": "<https-signed-portrait-url>"
  },
  "audio_url": "<https-signed-voiceover-url>",
  "resolution": "1080p",
  "aspect_ratio": "9:16",
  "output_format": "mp4"
}
```

| Field | Source |
|-------|--------|
| `avatar_id` | Server env `HEYGEN_DEFAULT_AVATAR_ID` / factory `heygenAvatarId` — **never** client |
| `image.url` | `resolveMediaAssetUrlForProvider` portrait HTTPS (owned media) |
| `audio_url` | `resolveMediaAssetUrlForProvider` voiceover HTTPS (owned media) |
| `engine` | Constant on avatar creates only |

**Create success (vendor):**

```json
{
  "data": {
    "video_id": "v_abc123def456",
    "status": "waiting",
    "output_format": "mp4"
  }
}
```

**Normalized create result:**

```json
{
  "externalJobId": "v_abc123def456",
  "status": "queued",
  "estimatedCostCents": 60
}
```

(`estimatedCostCents` example: 30s × 2¢ = 60¢.)

### Status field map

| HeyGen vendor status | Normalized `videoJobStatus` |
|----------------------|-----------------------------|
| `waiting` / `pending` | `queued` |
| `processing` | `processing` |
| `completed` | `completed` |
| `failed` / `error` | `failed` |
| `cancelled` / `canceled` | `cancelled` |

**Terminal completed:** map `video_url` (prefer over `captioned_video_url`) through `validateProviderOutputUrl(..., HEYGEN_ALLOWED_OUTPUT_HOSTS)` → transient `rawOutputUrl` only.

**Response handling (mandatory):** `parseExternalJobId` / `externalJobIdSchema`; `normalizeVideoJobStatusResult(vendor, HEYGEN_ALLOWED_OUTPUT_HOSTS)`; `sanitizeProviderErrorMessage`; drop unknown fields; never persist raw vendor JSON or CDN URL as canonical.

---

## HeyGen input matrix (server-only)

Applies to **`resolvedCreateVideoJobInputSchema`** at adapter entry and Phase B orchestrator.

| Modalidad / visual path | HeyGen request | Required asset / config | Forbidden |
|-------------------------|----------------|-------------------------|-----------|
| **`own_avatar`** | `type: "image"` + signed portrait URL | `portraitAssetId` + `voiceoverAssetId` | Client `image_url` / `avatar_id` / `engine`; missing voiceover |
| **`generic_avatar`** | `type: "avatar"` + server `avatar_id` + `engine: avatar_iii` | `HEYGEN_DEFAULT_AVATAR_ID` configured + `voiceoverAssetId` | Client `avatar_id`; missing env avatar id → `PROVIDER_CONFIG_MISSING` or `HEYGEN_CONFIG_MISSING` |
| **`faceless` / MuseTalk loop** | N/A — HeyGen not selected for loop-only / faceless in V1 | — | Forcing HeyGen on faceless without talking-head assets |
| **Any HeyGen path** | `audio_url` from voiceover | `voiceoverAssetId` **required** | Text `script` + `voice_id` fallback (out of V1) |
| **Any** | — | — | Client `provider_key`, `tier`, `engine`, Avatar IV flags, cost drivers |

**MIME after server resolution:**

- Portrait: `image/jpeg` \| `image/png` \| `image/webp` (`HEYGEN_PORTRAIT_MIME_ALLOWLIST`)
- Voiceover: `audio/wav` \| `audio/mpeg` \| `audio/mp4` \| `video/mp4` (`HEYGEN_AUDIO_MIME_ALLOWLIST`)

**Inputs never accept client-supplied absolute HTTPS strings** — only owned `media_asset_id` → `resolveMediaAssetUrlForProvider` (TTL **300s**).

---

## Factory signature (Phase A)

**File:** `lib/providers/video/heygen-high-adapter.ts`

```ts
export function createHeygenHighAdapter(params: {
  defaultEstimateCents: number; // fallback when duration missing
  unitCostCentsPerSecond: number; // from catalog (seed 2)
  resolveMediaAssetUrl?: (
    assetId: string,
    clientId: string,
    kind: "portrait" | "audio",
  ) => Promise<string>;
  uploadGeneratedVideo?: (
    args: UploadGeneratedVideoArgs,
  ) => Promise<UploadGeneratedVideoResult>;
  fetchImpl?: typeof fetch;
  /** Server config — process.env.HEYGEN_DEFAULT_AVATAR_ID at registry bootstrap. */
  heygenAvatarId?: string;
  initialJobContexts?: Map<ExternalJobId, JobContext>;
}): VideoProviderAdapter;
```

| Method | Behavior |
|--------|----------|
| `providerKey` | `"heygen_high"` |
| `videoAssetRole` | `"primary"` |
| `estimateCost` | `{ estimatedCostCents: unitCostCentsPerSecond * durationSec, currency: "USD", providerKey: "heygen_high" }` — duration from `targetDurationSec`; if missing use `defaultEstimateCents` |
| `createJob` | Validate matrix; load `HEYGEN_API_KEY` or throw `PROVIDER_CONFIG_MISSING`; resolve URLs; POST v3 with engine rules; return normalized result |
| `getJobStatus` | GET video; `normalizeVideoJobStatusResult(..., HEYGEN_ALLOWED_OUTPUT_HOSTS)` |
| `fetchAsset` | See § `fetchAsset` storage |

**Missing `HEYGEN_API_KEY`:** throw `ProviderAdapterError(PROVIDER_CONFIG_MISSING, "Provider is not configured")` **before** any `fetch`.

---

## `fetchAsset` storage

| Layer | Rule |
|-------|------|
| **Physical `storageKey`** | `{uuid}.mp4` where `uuid = crypto.randomUUID()` — matches `STORAGE_KEY_REGEX` |
| **Logical lineage** | `clientId` + `reelScriptId` from job row via adapter job-context map (US-8.4 poller L1) |
| **Return** | `storedMediaAssetSchema` — no HeyGen CDN URL |
| **`media_assets` INSERT** | US-8.4 poller after terminal complete |

**Download hardening:** `HEYGEN_FETCH_TIMEOUT_MS` (120s), `HEYGEN_FETCH_MAX_BYTES` (100MB), `HEYGEN_FETCH_MAX_REDIRECTS` (3), https-only, Content-Type `video/*` / `video/mp4`; re-validate final URL host after redirects.

---

## Cost model + catalog (Phase B migration)

**AC satisfaction:** USER_STORIES “per-minute ~$1/min” is satisfied by catalog **`billingUnit: "per_second"`** with **`unitCostCents: 2`** (≈ **120¢/min**). No `per_minute` enum.

**Migration (Phase B only):**

```sql
-- Correct US-X.4 seed unitCostCents 7 → 2 (~$1.20/min standard; prior 7¢/s ≈ $4.20/min misaligned with AC).
UPDATE public.neuramark_provider_catalog
SET
  active = true,
  cost_model = '{
    "billingUnit": "per_second",
    "unitCostCents": 2,
    "metadata": {
      "plan": "standard",
      "vendor": "heygen",
      "approxPerMinuteCents": 120
    }
  }'::jsonb
WHERE key = 'heygen_high';
```

**Bootstrap parity:** `buildBootstrapCatalog()` heygen row → `active: true` (Phase B), `unitCostCents: 2`, metadata as above. Phase A may keep bootstrap inactive for isolated adapter tests if registry still registers the real adapter.

**Estimate drivers:** server `targetDurationSec` from reel script package only — **never** client cost fields.

**Example fixture:** 30s × 2¢ = **60¢**.

---

## Dual create paths (Phase B)

| Path | When | Entry | `provider_key` authority |
|------|------|-------|--------------------------|
| **1. Policy high-tier** | `provider_tier = high` ∧ catalog `heygen_high.active` | Existing `createTalkingHeadVideoJob()` after allowlist unlock | `resolveProviderForJob` → `heygen_high` |
| **2. Operator action** | FE “Generate with HeyGen” when eligible | **`createHeygenTalkingHeadVideoJob`** Server Action | Server forces `heygen_high` |
| **2a. High-tier via action** | Eligibility = high tier + active (Operator convenience) | Same action; `usedOperatorFallback: false` | Force heygen (same as policy) |
| **2b. Fallback** | Latest talking-head job **`failed`** ∧ `provider_key ∈ { sadtalker_low, musetalk_low }` | Same action; INSERT override audit; `usedOperatorFallback: true` | Force heygen |

**Not a path:** Silent auto-create after low failure; client `provider_key`; low-tier `createTalkingHeadVideoJob` resolving heygen.

**Retry (US-8.4):** inherits parent `provider_key` only. Low-tier retry stays low. HeyGen retry stays `heygen_high`. Retry is **not** the fallback action.

---

## Operator fallback — eligibility + audit

### Eligibility (server-authoritative)

```
eligible_fallback =
  latest primary talking-head job for reel_script_id
  WHERE status = 'failed'
    AND provider_key IN ('sadtalker_low', 'musetalk_low')
```

Also allow when status = `failed` after max retries exhausted (same failed row). Client-supplied parent id is **ignored** unless server re-verifies ownership + eligibility.

**High-tier eligibility (action path):** effective cost policy `provider_tier = high` AND catalog row active — no failed parent required.

**Ineligible →** error code **`HEYGEN_FALLBACK_INELIGIBLE`** (or `PROVIDER_UNAVAILABLE` for high-tier inactive).

### Server Action (Phase B)

**Name:** `createHeygenTalkingHeadVideoJob`  
**File (BUILD):** `lib/video-jobs/create-heygen-talking-head-video-job.ts` (`import "server-only"`)  
**FE consumer:** Operator Reel / script detail “Generate with HeyGen” confirm dialog.

```ts
// Boundary Zod: createHeygenTalkingHeadVideoJobRequestSchema (lib/contracts/video-job.ts)
{
  reelScriptId: uuid,
  clientId: uuid,
  targetDurationSec: 1..120,
  voiceoverAssetId?: uuid,
  portraitAssetId?: uuid,
  confirmEstimateCents: number // presentation confirm; server re-estimates
}
```

**Gate order (binding):**

1. `requireOperator("handler")` first → Cliente **403** (`FORBIDDEN`)
2. Reject `FORBIDDEN_VIDEO_JOB_AUTHORITY_KEYS` / provider authority keys → `FORBIDDEN_FIELDS`
3. Parse request schema (strict)
4. Determine eligibility path (`high_tier` \| `operator_fallback`) — else `HEYGEN_FALLBACK_INELIGIBLE`
5. Force `providerKey = heygen_high`, `providerTier = high` server-side
6. Resolve portrait / avatar_id / voiceover per input matrix
7. `adapter.estimateCost` — compare/ignore client `confirmEstimateCents` as non-authoritative
8. `assertReelBudgetAllowsEstimatedSpend`
9. `assertActiveAvatarConsentForJobs` when `own_avatar`
10. `adapter.createJob`
11. INSERT `neuramark_video_jobs` (`provider_key = heygen_high`, `provider_tier = high`, `parent_job_id` when fallback)
12. If fallback: INSERT **`neuramark_video_job_heygen_fallback_overrides`**
13. `logProviderDecision` with rationale `operator_heygen_fallback` or `cheapest_active_high_tier`
14. `recordReelSpendEvent` + enqueue poll (US-8.4)

**Preview action:** `previewHeygenTalkingHeadEstimate` — Operator-only; returns estimate + `eligibilityPath` for confirm dialog (no vendor create).

### Override audit table (Phase B migration)

```sql
CREATE TABLE public.neuramark_video_job_heygen_fallback_overrides (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id             uuid NOT NULL,
  reel_script_id        uuid NOT NULL,
  parent_job_id         uuid NOT NULL REFERENCES public.neuramark_video_jobs(id),
  new_job_id            uuid NULL REFERENCES public.neuramark_video_jobs(id),
  operator_client_id    uuid NOT NULL,
  rationale_key         text NOT NULL DEFAULT 'operator_heygen_fallback'
                        CHECK (rationale_key = 'operator_heygen_fallback'),
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX neuramark_video_job_heygen_fallback_overrides_reel_idx
  ON public.neuramark_video_job_heygen_fallback_overrides
  (client_id, reel_script_id, created_at DESC);

ALTER TABLE public.neuramark_video_job_heygen_fallback_overrides ENABLE ROW LEVEL SECURITY;
-- deny-by-default (no policies); service-role Node only
```

No UPDATE/DELETE endpoints. Pattern mirrors `neuramark_video_job_retry_overrides` (US-8.4).

---

## Phase B — Orchestrator allowlist unlock

**File:** `lib/video-jobs/create-talking-head-video-job.ts`

```ts
function isAllowedTalkingHeadProviderKey(providerKey: string): boolean {
  return (
    providerKey === "sadtalker_low" ||
    providerKey === "musetalk_low" ||
    providerKey === "heygen_high"
  );
}
```

| Rule | Detail |
|------|--------|
| High tier + active | `resolveProviderForJob` may return `heygen_high`; create succeeds with full gates |
| Low tier + active | **Never** returns `heygen_high` — US-7.2 tier floor unchanged |
| Fallback | Only via `createHeygenTalkingHeadVideoJob` — not this function’s policy path |
| Job row | `provider_key = heygen_high`, `provider_tier = high` |
| `portrait_asset_id` | own_avatar: portrait still id; generic: **null** (studio avatar from env — not a media asset id) |

**Job row audit note:** For generic HeyGen, `portrait_asset_id` may be null; store nothing client-influenced. Do **not** invent a FK to HeyGen avatar ids in Postgres.

---

## Registry bootstrap (Phase A)

**File:** `lib/providers/create-provider-registry.ts`

```ts
import { createHeygenHighAdapter } from "@/lib/providers/video/heygen-high-adapter";

// Replace createHeygenHighStubAdapter — register real adapter for heygen_high
registry.registerVideo(
  createHeygenHighAdapter({
    defaultEstimateCents: /* catalog-derived fallback */,
    unitCostCentsPerSecond: /* from catalog cost_model.unitCostCents */,
    heygenAvatarId: process.env.HEYGEN_DEFAULT_AVATAR_ID,
  }),
);
```

| Rule | Detail |
|------|--------|
| Production | Stub **not** used for `heygen_high` |
| Tests | May keep stub factory for unrelated suites if needed; registry smoke asserts real adapter |
| Estimate wiring | `per_second` → duration-aware; bootstrap default **2** after Phase B (Phase A may still read catalog 7 until migration — adapter uses injected `unitCostCentsPerSecond`) |

---

## ADR-0003 runtime matrix

| Method | Runtime | Phase |
|--------|---------|-------|
| `estimateCost` | Vercel | A · B |
| `createJob` | Vercel | B — after orchestrator / fallback gates |
| `getJobStatus` | Fly worker / poller | B |
| `fetchAsset` | Fly worker | B — on terminal `completed` |

Phase A: adapter methods callable from unit tests only. **No** Vercel long poll.

---

## Error codes

| Code | When |
|------|------|
| `PROVIDER_CONFIG_MISSING` | Missing `HEYGEN_API_KEY` (adapter) |
| `HEYGEN_CONFIG_MISSING` | Missing `HEYGEN_DEFAULT_AVATAR_ID` on generic path (orchestrator/action) |
| `HEYGEN_FALLBACK_INELIGIBLE` | Operator action but neither high-tier nor failed-low parent |
| `FORBIDDEN` / `UNAUTHENTICATED` | Non-operator / no session |
| `FORBIDDEN_FIELDS` | Client provider/engine/avatar/cost authority keys |
| `BUDGET_EXCEEDED` | Budget gate fails |
| `CONSENT_REVOKED` | Consent gate fails (`own_avatar`) |
| `PROVIDER_UNAVAILABLE` | Catalog inactive / adapter missing when expected |
| `VALIDATION_ERROR` | Schema / MIME / missing voiceover |
| `NOT_FOUND` | Reel / asset / job tenant miss |
| `INTERNAL_ERROR` | Unexpected |

Reuse existing `videoJobMutationErrorSchema` envelope.

---

## Zod / contract modules (mirrors)

| Module | Contents |
|--------|----------|
| `lib/contracts/heygen-high.ts` | Env key, API base/paths, engine, hosts, MIME, cost constants, status map |
| `lib/contracts/video-job.ts` | HeyGen request/success/preview schemas; fallback override row; extended forbidden keys + error codes |
| `lib/contracts/providers.ts` | `providerRationaleKeySchema` += `operator_heygen_fallback` |

---

## FE contract (Phase B) — Reviewed by FE required

**Consumer:** Operator Reel / script detail (US-8.4 surfaces).

| Concern | Freeze |
|---------|--------|
| Control | “Generate with HeyGen” — Operator-only; hide for Cliente |
| Visibility | Show when `eligibilityPath ∈ { high_tier, operator_fallback }` from preview |
| Confirm | Dialog shows server estimate (`previewHeygenTalkingHeadEstimate`) before submit |
| i18n | EN + ES under `scripts.heygen.*` (label, confirm, errors, disabled reasons) |
| Components | PrimeReact; no client `provider_key` / tier / engine fields |
| After success | Existing US-8.4 status badges / poll (provider-agnostic) |
| States | Loading / error / ineligible covered |

**FE signoff:** approved at top of this file (2026-08-31 — nextjs-frontend).

### Reviewed by FE — BUILD constraints (non-blocking)

**Verdict:** approved. Phase B Operator surface is feasible against existing US-8.4 `/operator/scripts` patterns.

| Concern | FE BUILD constraint |
|---------|---------------------|
| Host | Mount on `/operator/scripts` expand row (`ScriptsPageView` / `ReelDetailPanel`) alongside `OperatorVideoJobSummaryPanel` — not a new route. |
| Confirm UI | Mirror `VideoJobRetryConfirmDialog`: PrimeReact `Dialog` + preview load + estimate display + confirm/cancel (not `confirmDialog()`). |
| Preview → submit | Call `previewHeygenTalkingHeadEstimate` before enable confirm; submit `createHeygenTalkingHeadVideoJob` with `confirmEstimateCents` from preview only. Never send `provider_key` / `engine` / `tier` / absolute URLs. |
| Visibility | Drive show/enable from preview `eligibilityPath ∈ { high_tier, operator_fallback }` (call preview on expand or on open). Do **not** invent client-side eligibility from `provider_key` alone. Hide entirely for Cliente (Operator layout already gates page). |
| Request fields | `reelScriptId`, `clientId`, `targetDurationSec` from existing week-load / script package context; optional `voiceoverAssetId` / `portraitAssetId` when already known — server re-resolves matrix. |
| i18n | New keys under **`scripts.heygen.*`** (label, confirm title/body, loading, estimated, blocked/ineligible reasons, errors for `HEYGEN_FALLBACK_INELIGIBLE` · `HEYGEN_CONFIG_MISSING` · `BUDGET_EXCEEDED` · `CONSENT_REVOKED` · `PROVIDER_UNAVAILABLE` · `FORBIDDEN` · `VALIDATION_ERROR` · `INTERNAL_ERROR`) — EN + ES. Reuse `scripts.videoJob.status.*` badges after create. |
| Error mapping | Reuse `videoJobMutationErrorSchema` envelope + `messageForErrorCode` pattern from retry dialog; map new HeyGen codes + optional `blockedReasonKey` / `messageKey`. |
| Post-success | Refresh / overlay job via existing US-8.4 poll + status tags — provider-agnostic. |
| States | Loading (preview), error (preview/submit), ineligible (`eligible: false`), pending (submit) — all covered by Dialog pattern. |

No CONTRACT blockers. Soft preference only: if BE later attaches HeyGen eligibility on week-load DTO, FE may use it to avoid an extra preview round-trip for button visibility — not required for V1.

---

## Fixtures (mock-friendly)

**Phase A adapter createJob input (internal resolved):**

```json
{
  "reelScriptId": "11111111-1111-4111-8111-111111111111",
  "clientId": "22222222-2222-4222-8222-222222222222",
  "providerKey": "heygen_high",
  "providerTier": "high",
  "assetRole": "primary",
  "targetDurationSec": 30,
  "portraitAssetId": "33333333-3333-4333-8333-333333333333",
  "voiceoverAssetId": "44444444-4444-4444-8444-444444444444"
}
```

**Phase B Operator action body:**

```json
{
  "reelScriptId": "11111111-1111-4111-8111-111111111111",
  "clientId": "22222222-2222-4222-8222-222222222222",
  "targetDurationSec": 30,
  "voiceoverAssetId": "44444444-4444-4444-8444-444444444444",
  "portraitAssetId": "33333333-3333-4333-8333-333333333333",
  "confirmEstimateCents": 60
}
```

**Forbidden body (→ `FORBIDDEN_FIELDS`):**

```json
{
  "reelScriptId": "11111111-1111-4111-8111-111111111111",
  "clientId": "22222222-2222-4222-8222-222222222222",
  "targetDurationSec": 30,
  "provider_key": "heygen_high",
  "engine": { "type": "avatar_iv" },
  "confirmEstimateCents": 60
}
```

**HeyGen create success (mock):**

```json
{
  "data": {
    "video_id": "v_mock_heygen_001",
    "status": "waiting"
  }
}
```

**HeyGen completed status (mock):**

```json
{
  "data": {
    "id": "v_mock_heygen_001",
    "status": "completed",
    "video_url": "https://files.heygen.com/video/v_mock_heygen_001.mp4",
    "duration": 30.0
  }
}
```

**Estimate:** 30 × 2 = **60** cents.

---

## Automated tests

### Phase A — `lib/providers/video/heygen-high-adapter.test.ts`

| # | Case |
|---|------|
| 1 | Mocked create → processing → completed → `fetchAsset` round-trip |
| 2 | Missing `HEYGEN_API_KEY` → `PROVIDER_CONFIG_MISSING` before fetch |
| 3 | Estimate: 30s × 2¢ = 60¢ |
| 4 | Avatar create body includes `engine.type === "avatar_iii"` (never omitted) |
| 5 | Image create body has no `engine` field |
| 6 | Never posts `avatar_iv` / `avatar_v` |
| 7 | `validateProviderOutputUrl` rejects non-allowlisted / metadata IP hosts |
| 8 | Mock HeyGen error with key material → sanitized output has no key substring |
| 9 | Adapter module imports `server-only` |
| 10 | Registry — `getVideoAdapter("heygen_high")` is real (no stub id prefix) |

### Phase B — orchestrator / fallback tests

| # | Case |
|---|------|
| 1 | `provider_tier=low` + active heygen → never `heygen_high` |
| 2 | `provider_tier=high` + active → policy selects `heygen_high` |
| 3 | Operator fallback + failed low parent → create HeyGen + audit row |
| 4 | Cliente fallback → **403** |
| 5 | Fallback without failed low parent (and not high tier) → `HEYGEN_FALLBACK_INELIGIBLE` |
| 6 | Budget + consent spies called before `createJob` on HeyGen path |
| 7 | Client `provider_key` → `FORBIDDEN_FIELDS` |
| 8 | Low-tier retry stays on low provider (no silent HeyGen) |
| 9 | HeyGen retry stays on `heygen_high` |
| 10 | Allowlist includes `heygen_high` after unlock |

---

## Out of scope (explicit)

- Avatar IV / Avatar V catalog keys or UI toggles
- Silent low→high upgrade / auto-fallback
- Client-callable HeyGen create / provider override fields
- Wan / LTX / ElevenLabs high-tier adapters
- New `neuramark_video_jobs` columns / new poller
- Live HeyGen CI tests
- Per-client HeyGen avatar marketplace / picker UI
- Text script + `voice_id` create fallback
- HeyGen webhook Route Handler
- FFmpeg assembly (US-9.x)
- Stories / multicanal / ads / RBAC UI

---

## Changelog

| Date | Change |
|------|--------|
| 2026-08-31 | Initial freeze — Phase A HeyGen adapter + Phase B activate/orchestrator/fallback/FE; resolves SPEC-REVIEW High gaps + SECURITY 12 conditions; Zod mirrors in `heygen-high.ts` + `video-job.ts` + `providers.ts`; **Reviewed by FE: pending** |
| 2026-08-31 | **Reviewed by FE: approved** — nextjs-frontend; Phase B Operator surface feasible vs US-8.4 retry Dialog pattern; BUILD constraints recorded under § FE contract |
