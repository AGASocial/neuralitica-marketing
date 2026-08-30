Reviewed by FE: pending — 2026-08-29 — awaiting nextjs-frontend signoff before BUILD.

# API Contract — US-8.4 Job status and failure handling UI (closes US-8.2 Phase B)

**Story:** US-8.4  
**Status:** Frozen — 2026-08-29 (pending FE signoff line above)  
**Security:** `plan/stories/US-8.4/SECURITY.md` (APPROVE WITH CONDITIONS — reconciled below)  
**Spec review:** `plan/stories/US-8.4/SPEC-REVIEW.md` (GAPS — resolved by this contract)  
**Extends:** `plan/stories/US-8.2/CONTRACT.md` § Phase B (imported verbatim below — do not contradict)  
**Depends on:** US-8.2 ✅ Phase A SadTalker adapter · US-8.1 ✅ · US-7.1 ✅ budget gate · US-7.2 ✅ policy · US-3.2 ✅ consent · US-3.3 ✅ portrait assets · US-7.3 ✅ spend ledger + `OperatorProductionJobCostDto` · US-14.5 ✅ `requireOperator()`  
**ADR:** `docs/adr/0003-worker-flyio-ffmpeg.md` — Vercel create/retry/enqueue; Fly poll + `fetchAsset` + stale sweep  
**Feature branch:** `feature/US-8.4-video-jobs`  
**Error envelope style:** same class as US-5.1 / US-7.1 (`ok: true` vs `{ ok: false, error: { code, fields?, messageKey? } }`)

**This document is CONTRACT ONLY.** Zod mirrors live in `lib/contracts/video-job.ts` (BUILD stubs committed with this freeze). Extensions to `lib/contracts/reel-script.ts` (`videoJobsByReelScriptId` on week load) are specified here and applied during BUILD.

**Terminology:** **Job de generación** · **Operator** · **Reel** · **Reintentar** · **Política de costo** · **download-and-own**. Technical enums (`queued`, `sadtalker_low`, `parent_job_id`) OK in code/Operator diagnostics. Do **not** use CONTEXT _Evitar_ terms in product-facing strings.

**USER_STORIES surface amendment (binding):** Operator status badges, retry UI, and regeneration count render on **`/operator/scripts`** (slot row + expand row) — **not** a new `/operator/production` route (route does not exist in repo V1). **`OperatorProductionJobCostDto`** (US-7.3) merges into the per-Reel video job DTO on scripts week load. Cliente job status / retry UI is **out of scope** for US-8.4 BUILD.

---

## SPEC-REVIEW blocking gaps closed

| # | Gap | Resolution |
|---|-----|------------|
| 1 | No US-8.4 CONTRACT.md | This document; imports US-8.2 Phase B verbatim |
| 2 | Retry handler API undefined | § `retryVideoJob` + § `overrideVideoJobRetryLimit` |
| 3 | Stale-job timeout not frozen | § Stale-job policy — `VIDEO_JOB_STALE_TIMEOUT_MS` (default **7_200_000** = 120 min) |
| 4 | Fly worker enqueue unspecified | § Poll runtime — status-driven loop + dev `VIDEO_JOB_POLL_MODE=in_process` |
| 5 | Operator production list FE underspecified | § Operator scripts FE — `OperatorVideoJobSummaryDto` batched on `getReelScriptsForWeek`; optional `GET /api/video-jobs/[jobId]` poll |
| 6 | Regeneration count semantics undefined | § Regeneration count — `COUNT(*)` of `primary` jobs per `(client_id, reel_script_id)` |
| 7 | Webhook auth missing | § Webhook (optional) — poll-only V1 BUILD default; signed handler spec if shipped |
| 8 | Retry override audit schema not frozen | § `neuramark_video_job_retry_overrides` DDL |
| 9 | BUILD scope vs Depends OR | § Phased BUILD — Phase A SadTalker only; Phase B US-8.3/8.6 adapters reuse table |
| 10 | SSE vs polling | V1 **interval refresh** on `/operator/scripts` + batch week load; SSE P2 defer |
| 11 | US-8.2 Phase B pre-frozen | Imported verbatim in § US-8.2 Phase B (imported) |

## SECURITY reconciliation (binding)

| Topic | SECURITY condition | **Frozen in this contract** |
|-------|-------------------|----------------------------|
| Status write authority | Poller/webhook only | § `applyVideoJobStatusUpdate` — sole writer |
| Cliente poll GET-only IDOR | `client_id` scope → 404 | § `GET /api/video-jobs/[jobId]` — Operator session; same `(id, client_id)` predicate |
| Forbidden job/retry fields | Reject status/cost/skip flags | § Forbidden request keys |
| Retry gate order | Mirror create | § `retryVideoJob` step table |
| Max retries + override audit | Append-only US-10.2 pattern | § Retry limits + § `neuramark_video_job_retry_overrides` |
| Webhook verify-before-write | Signature + job binding | § Webhook (optional) |
| Stale timeout worker-only | Not client-triggered | § Stale-job policy |
| Operator cost isolation | Cost on Operator DTO only | § `OperatorVideoJobSummaryDto` includes `OperatorProductionJobCostDto`; never on Cliente paths |
| M1 provider-assets route | HMAC + tenant | § Provider-assets read route |
| ADR-0003 | No Vercel long poll | § Poll runtime matrix |

---

## Phased BUILD acceptance

| Phase | Scope | Closes |
|-------|-------|--------|
| **A (US-8.4 BUILD)** | `neuramark_video_jobs` + retry overrides migrations; `createTalkingHeadVideoJob`; poller (Fly module + dev in-process); `applyVideoJobStatusUpdate`; stale sweeper; `GET /api/video-jobs/[jobId]`; M1 provider-assets route; batch `videoJobsByReelScriptId` on week load; `/operator/scripts` badges + retry UI; `retryVideoJob` + `overrideVideoJobRetryLimit` for **`sadtalker_low`** only | US-8.4 AC + US-8.2 Phase B closure |
| **B (downstream)** | US-8.3 manual job shape; US-8.5/8.6/8.7 adapters reuse job table + UI patterns | Adapter-specific retry paths |

**Soft dependency:** US-9.3 voiceover — fixture `voiceoverAssetId` OK for Phase A tests/E2E.

---

## Overview

US-8.4 ships **video job orchestration + Operator status surfaces** for talking-head generation. It **implements** US-8.2 CONTRACT Phase B (DDL, create orchestrator, poller terminal path) and adds retry lineage, stale timeout, override audit, M1 provider-assets route, and `/operator/scripts` FE.

**Surfaces**

| # | Surface | Kind | Consumer |
|---|---------|------|----------|
| 1 | `createTalkingHeadVideoJob` | Server helper | Operator "Generate video" action (future) / retry internals |
| 2 | `retryVideoJob` | Server Action | `/operator/scripts` retry confirm dialog |
| 3 | `overrideVideoJobRetryLimit` | Server Action | `/operator/scripts` max-attempt override dialog |
| 4 | `getVideoJobsForReelScripts` | Server helper | `getReelScriptsForWeek` batch attach |
| 5 | `GET /api/video-jobs/[jobId]` | Route Handler | Optional interval poll from expand row |
| 6 | `GET /api/media/provider-assets/[assetId]` | Route Handler | Replicate input fetch (M1) |
| 7 | `applyVideoJobStatusUpdate` | Server helper | Fly poller + optional webhook |
| 8 | `pollVideoJobUntilTerminal` | Server helper | Dev in-process + Fly worker loop |
| 9 | `markStaleVideoJobsFailed` | Server helper | Fly cron / poller pre-tick |
| 10 | `/operator/scripts` badges + retry UI | FE | Operator slot row + `ReelDetailPanel` expand |

**Forbidden surfaces (BUILD veto):**

- Any Route Handler / Server Action that UPDATEs `neuramark_video_jobs.status` from request JSON.
- Client-supplied `providerKey`, `status`, `outputUrl`, `externalJobId`, cost fields, or skip flags on create/retry.
- Unbounded `getJobStatus` loop inside Vercel Route Handlers.
- Canonical provider CDN URL persisted as job output (use `output_media_asset_id` only).
- Cliente retry or cost fields on shared serializers.

---

## US-8.2 Phase B (imported verbatim)

> **Source:** `plan/stories/US-8.2/CONTRACT.md` § Phase B — frozen 2026-08-29. US-8.4 **implements** these sections without redesign. Changes require dual CONTRACT revision.

### `neuramark_video_jobs` DDL

**Migration file (BUILD):** `supabase/migrations/*_neuramark_video_jobs.sql`

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
| **`output_url`** | **Forbidden** — use `output_media_asset_id` FK after `fetchAsset` |
| `attempt` | `1` on initial create; retry lineage in US-8.4 |
| RLS | Deny-by-default; service-role Node only |

**US-8.4 addition:** `neuramark_set_updated_at` trigger on UPDATE (same pattern as other `neuramark_*` tables).

### `createTalkingHeadVideoJob()`

**File:** `lib/video-jobs/create-talking-head-video-job.ts` (`import "server-only"`)

```ts
export async function createTalkingHeadVideoJob(
  input: CreateVideoJobRequest, // createVideoJobRequestSchema — no providerKey
  options?: { parentJobId?: string; attempt?: number },
): Promise<CreateTalkingHeadVideoJobSuccess>;
```

| Step | Action |
|------|--------|
| 1 | `requireOperator("handler")` + resolve `clientId` from session (must match `input.clientId` or server-loaded script tenant) |
| 2 | Load reel script + `visualMode` server-side |
| 3 | `resolveProviderForJob(...)` → must be `sadtalker_low` for Phase A paths |
| 4 | Reject if `referenceVideoAssetId` set (MuseTalk path) |
| 5 | `adapter.estimateCost(resolvedInput)` + `assertReelBudgetAllowsSpend` |
| 6 | If `visualMode === own_avatar`: `assertActiveAvatarConsentForJobs(clientId)` |
| 7 | Resolve portrait + voiceover asset IDs with ownership |
| 8 | `adapter.createJob(resolvedInput)` |
| 9 | INSERT `neuramark_video_jobs` (`attempt = options?.attempt ?? 1`, `parent_job_id = options?.parentJobId ?? null`, `status = queued`, `estimated_cost_cents`, asset FKs) |
| 10 | `recordReelSpendEvent({ assetRole: "talking_head", estimatedCostCents, ... })` — store returned `spendEventId` on job context for poller |
| 11 | Enqueue poll — § Poll runtime |

**Forbidden on request:** merge `FORBIDDEN_PROVIDER_AUTHORITY_KEYS` + `FORBIDDEN_BUDGET_SPEND_KEYS` + § Forbidden request keys.

**On terminal complete (poller — shared with US-8.2):**

1. `getJobStatus` → if `completed` and `rawOutputUrl`, `fetchAsset` with **`clientId` + `reelScriptId` from job row** (L1 — not adapter instance memory)
2. INSERT `neuramark_media_assets` (generated video row)
3. UPDATE job via `applyVideoJobStatusUpdate`: `status`, `output_media_asset_id`, `actual_cost_cents`
4. `finalizeGenerationCost({ mode: "async_update", spendEventId, actualCostCents from StoredMediaAsset })`
5. Clear `rawOutputUrl` from memory

**On failed:** UPDATE `status`, `failure_reason` (sanitized only) via `applyVideoJobStatusUpdate`.

### Status polling DTO (base)

| Rule | Detail |
|------|--------|
| Scope | `WHERE id = $1 AND client_id = $2` — foreign id → **404** |
| Response base | `persistedVideoJobStatusSchema` + `jobId` + timestamps |
| Forbidden in DTO | `rawOutputUrl`, `external_job_id`, cost fields, vendor JSON, tokens |

US-8.4 extends this for Operator reads — § `GET /api/video-jobs/[jobId]`.

---

## US-8.4-only — `neuramark_video_job_retry_overrides` DDL

**Migration file (BUILD):** same migration or sibling `*_neuramark_video_job_retry_overrides.sql`

```sql
CREATE TABLE public.neuramark_video_job_retry_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.neuramark_clients(id) ON DELETE CASCADE,
  reel_script_id uuid NOT NULL REFERENCES public.neuramark_reel_scripts(id) ON DELETE CASCADE,
  failed_job_id uuid NOT NULL REFERENCES public.neuramark_video_jobs(id) ON DELETE CASCADE,
  operator_client_id uuid NOT NULL REFERENCES public.neuramark_clients(id),
  prior_attempt integer NOT NULL CHECK (prior_attempt >= 1),
  reason text NOT NULL CHECK (char_length(reason) >= 1 AND char_length(reason) <= 500),
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX neuramark_video_job_retry_overrides_reel_idx
  ON public.neuramark_video_job_retry_overrides (client_id, reel_script_id, created_at DESC);
```

| Rule | Detail |
|------|--------|
| Append-only | No UPDATE/DELETE endpoints; `consumed_at` set when override enables **one** subsequent `retryVideoJob` |
| Operator identity | `operator_client_id` from `getCurrentUser()` at INSERT |
| Reason | Required non-empty, max 500 chars |
| Scope | One override row allows **one** retry past max when budget/consent gates still pass |

RLS: deny-by-default; service-role Node only.

---

## `applyVideoJobStatusUpdate` — sole status writer

**File:** `lib/video-jobs/apply-video-job-status-update.ts` (`import "server-only"`)

```ts
export async function applyVideoJobStatusUpdate(input: {
  jobId: string;
  normalizedStatus: VideoJobStatusResult; // from adapter normalizer — includes transient rawOutputUrl
  source: "poller" | "webhook";
}): Promise<ApplyVideoJobStatusUpdateResult>;
```

**Allowed transitions (sticky terminal):**

| From | To |
|------|-----|
| `queued` | `processing`, `failed`, `cancelled` |
| `processing` | `completed`, `failed`, `cancelled` |
| `completed` | *(none — idempotent no-op)* |
| `failed` | *(none — retry creates **new** row)* |
| `cancelled` | *(none)* |

**Behavior:**

1. Load job row (service-role) — reject if missing.
2. If current status is terminal → return `{ ok: true, idempotent: true }` (no downgrade).
3. Validate `normalizedStatus.status` via `persistedVideoJobStatusSchema` rules.
4. On first transition to **`completed`**: require `rawOutputUrl`; call `fetchAsset` with job-row `clientId`, `reelScriptId`; INSERT `neuramark_media_assets`; set `output_media_asset_id`; `finalizeGenerationCost` async_update; guard `output_media_asset_id IS NULL` for at-most-once.
5. On **`failed`** / **`cancelled`**: persist `failure_reason` = `sanitizedErrorMessage` only.
6. UPDATE `status`, `actual_cost_cents` when known, `updated_at`.

**Only invokers:** `pollVideoJobUntilTerminal`, `markStaleVideoJobsFailed`, optional webhook handler. **Zero** browser-callable paths.

---

## Poll runtime — Fly worker vs dev in-process

**Env:**

| Variable | Default | Purpose |
|----------|---------|---------|
| `VIDEO_JOB_POLL_MODE` | `fly` in production | `in_process` \| `fly` |
| `VIDEO_JOB_POLL_INTERVAL_MS` | `5000` | Delay between `getJobStatus` ticks |
| `VIDEO_JOB_STALE_TIMEOUT_MS` | `7200000` (120 min) | Stale sweeper threshold |
| `VIDEO_MAX_RETRIES_PER_REEL` | `3` | Max `attempt` for `asset_role = primary` per `reel_script_id` |

### Production (ADR-0003) — `VIDEO_JOB_POLL_MODE=fly`

```
┌─────────────┐  createTalkingHeadVideoJob / retryVideoJob   ┌──────────────────┐
│ Vercel App  │ ───────────────────────────────────────────► │ neuramark_video  │
│             │  INSERT status=queued                        │ _jobs            │
└─────────────┘                                              └────────┬─────────┘
                                                                      │
                                                                      │ worker loop:
                                                                      │ SELECT … WHERE status IN ('queued','processing')
                                                                      │ ORDER BY updated_at LIMIT N
                                                                      ▼
                                                             ┌──────────────────┐
                                                             │ Fly.io worker    │
                                                             │ pollVideoJobUntil│
                                                             │ Terminal + stale │
                                                             │ markStaleVideo…  │
                                                             └──────────────────┘
```

| Rule | Detail |
|------|--------|
| Enqueue | **No separate queue table in V1** — Fly worker long-polls `neuramark_video_jobs` where `status IN ('queued','processing')` ordered by `updated_at` |
| Create/retry on Vercel | After INSERT, return immediately — **do not** block HTTP on poll loop |
| Worker env | `SUPABASE_SERVICE_ROLE`, provider tokens (`REPLICATE_API_TOKEN`), same secrets as Vercel |
| Stale sweep | `markStaleVideoJobsFailed()` runs each worker tick (or Fly cron) **before** poll tick |

### Dev — `VIDEO_JOB_POLL_MODE=in_process`

| Rule | Detail |
|------|--------|
| Trigger | After successful create/retry INSERT, `void pollVideoJobUntilTerminal(jobId)` — fire-and-forget async in Node |
| Scope | Local / preview only when Fly worker absent |
| Guard | Must **not** run unbounded poll inside Route Handler `await` chain on Vercel serverless |
| VALIDATION | Dev path must pass E2E with mocked Replicate HTTP |

**ADR-0003 runtime matrix (full):**

| Method | Runtime |
|--------|---------|
| `createTalkingHeadVideoJob` / `retryVideoJob` | Vercel |
| `getJobStatus` loop | Fly worker (prod) · dev in-process |
| `fetchAsset` | Fly worker (prod) · dev in-process |
| `markStaleVideoJobsFailed` | Fly worker / cron |
| Optional webhook | Vercel Route Handler → enqueue immediate poll or call `applyVideoJobStatusUpdate` |

---

## Stale-job policy

**File:** `lib/video-jobs/mark-stale-video-jobs-failed.ts` (`import "server-only"`)

```ts
export async function markStaleVideoJobsFailed(): Promise<{ markedCount: number }>;
```

| Rule | Detail |
|------|--------|
| Predicate | `status IN ('queued','processing') AND updated_at < now() - (VIDEO_JOB_STALE_TIMEOUT_MS * interval '1 ms')` |
| Action | `applyVideoJobStatusUpdate` with synthetic failed status + `failure_reason` = i18n key **`scripts.videoJob.failure.staleTimeout`** (stored sanitized message server-side) |
| Authority | Worker/cron only — **not** client-callable |
| FE | Operator badge shows failed; failure reason maps to EN/ES stale copy |

---

## Retry limits and regeneration count

### Max attempts

| Rule | Detail |
|------|--------|
| Config | `VIDEO_MAX_RETRIES_PER_REEL` env (default **3**) |
| Scope | Per `(client_id, reel_script_id)` where `asset_role = 'primary'` |
| Count | **`MAX(attempt)`** among all job rows for that scope (lineage chain included) |
| Block | When `MAX(attempt) >= VIDEO_MAX_RETRIES_PER_REEL` and no consumable override → **`RETRY_LIMIT_EXCEEDED`** |
| Override | § `overrideVideoJobRetryLimit` inserts audit row; next `retryVideoJob` may proceed **once** if budget/consent pass |

### Regeneration count (Operator UI)

| Field | Definition |
|-------|------------|
| `regenerationCount` | `COUNT(*)` of `neuramark_video_jobs` rows for `(client_id, reel_script_id, asset_role = 'primary')` |
| `attempt` | `attempt` column on the **latest** job row (by `created_at DESC`) for that Reel + role |
| FE | Expand row shows both — margin risk visibility per USER_STORIES AC |

---

## `retryVideoJob` Server Action

**File:** `lib/video-jobs/actions/retry-video-job.ts`  
**Consumer:** `/operator/scripts` retry confirm dialog

```ts
export async function retryVideoJob(
  input: RetryVideoJobRequest,
): Promise<RetryVideoJobResult>;
```

**Request:** `retryVideoJobRequestSchema`

```ts
{
  failedJobId: string;       // uuid
  confirmRetry: true;        // literal true required
  confirmEstimateCents: number; // must match server preview within CONTRACT tolerance (0) — UI convenience check
}
```

| Step | Action |
|------|--------|
| 1 | `requireOperator("handler")` |
| 2 | Load failed job `WHERE id = $1 AND client_id = $2` — missing → **404** |
| 3 | Verify terminal `failed` or stale-failed (`failure_reason` stale key OK) |
| 4 | Enforce max attempts unless valid unconsumed override exists for `(reel_script_id, failed_job_id)` |
| 5 | If override consumed path: mark override `consumed_at` |
| 6 | `resolveProviderForJob` — same policy as create; never client `providerKey` |
| 7 | `adapter.estimateCost` |
| 8 | **`assertReelBudgetAllowsSpend`** with fresh estimate |
| 9 | If `own_avatar`: **`assertActiveAvatarConsentForJobs(clientId)`** |
| 10 | Reuse asset FKs from failed job row server-side — **not** client-supplied swap |
| 11 | `adapter.createJob` |
| 12 | INSERT new row: `parent_job_id = failedJobId`, `attempt = parent.attempt + 1` |
| 13 | `recordReelSpendEvent` |
| 14 | Enqueue poll — § Poll runtime |
| 15 | Return `{ ok: true, jobId, status, estimatedCostCents, attempt }` |

**Never:** UPDATE parent row status. **Never:** accept `skipBudgetCheck`, `skipRetryLimit`, or status fields.

**Preview estimate (for confirm dialog):** Server Action `previewRetryVideoJobEstimate({ failedJobId })` — Operator-only; returns `{ estimatedCostCents, canRetry, retryBlockedReasonKey? }` — UI disable is non-authoritative.

---

## `overrideVideoJobRetryLimit` Server Action

**File:** `lib/video-jobs/actions/override-video-job-retry-limit.ts`  
**Consumer:** `/operator/scripts` max-attempt override dialog

```ts
export async function overrideVideoJobRetryLimit(
  input: OverrideVideoJobRetryLimitRequest,
): Promise<OverrideVideoJobRetryLimitResult>;
```

**Request:**

```ts
{ failedJobId: string; reason: string } // reason 1–500 chars, trimmed non-empty
```

| Step | Action |
|------|--------|
| 1 | `requireOperator("handler")` |
| 2 | Load failed job scoped by tenant |
| 3 | Validate reason |
| 4 | INSERT `neuramark_video_job_retry_overrides` with `prior_attempt = job.attempt`, `consumed_at = null` |
| 5 | Return `{ ok: true, overrideId }` |

Effect: enables **one** subsequent `retryVideoJob` past max when budget/consent still pass. Distinct from US-7.1 budget override.

---

## `GET /api/video-jobs/[jobId]`

**File:** `app/api/video-jobs/[jobId]/route.ts`  
**Method:** **GET only** — no POST/PUT/PATCH/DELETE  
**Consumer:** Optional interval poll from `/operator/scripts` expand row

| Rule | Detail |
|------|--------|
| Auth | `requireOperator("handler")` first |
| Scope | Load job `WHERE id = $1 AND client_id = $2` — `clientId` from operator session context (scripts page client) |
| Foreign/missing | **404** generic envelope |
| Response | `operatorVideoJobStatusDtoSchema` |

**DTO:** `operatorVideoJobStatusDtoSchema` = `persistedVideoJobStatusSchema` fields + `jobId`, `reelScriptId`, `attempt`, `regenerationCount`, `failureReason` (nullable sanitized), `createdAt`, `updatedAt`, `canRetry`, `retryBlockedReasonKey?` — **no** `external_job_id`, `rawOutputUrl`, `provider_key`, cost cents.

**Note:** Cliente GET poll deferred — same IDOR rule applies when Cliente surfaces land later.

---

## Provider-assets read route (M1)

**File:** `app/api/media/provider-assets/[assetId]/route.ts`  
**Method:** GET  
**Consumer:** Replicate `createJob` input fetch via `resolveMediaAssetUrlForProvider`

| Query param | Rule |
|-------------|------|
| `client` | uuid — must match asset row |
| `exp` | unix seconds — reject if expired |
| `sig` | HMAC-SHA256 hex of `{assetId}:{clientId}:{exp}` with `NEURAMARK_PROVIDER_ASSET_URL_SECRET` (fallback service-role per US-8.2 seam) |

| Step | Action |
|------|--------|
| 1 | Validate sig constant-time |
| 2 | Validate `exp` |
| 3 | Load asset `WHERE id = $1 AND client_id = $2` |
| 4 | Stream bytes from Storage — correct `Content-Type` |
| 5 | No session cookie required (vendor fetch) |

**Errors:** invalid sig → **401**; expired → **401**; wrong tenant → **404**.

---

## Batch video jobs on scripts week load

**File:** `lib/video-jobs/get-video-jobs-for-reel-scripts.ts`  
**Called from:** `getReelScriptsForWeek` after `requireOperator`

**Extend** `getReelScriptsForWeekSuccessSchema`:

```ts
videoJobsByReelScriptId: operatorVideoJobsByReelMapSchema; // Record<reelScriptId, OperatorVideoJobSummaryDto | null>
```

**Selection rule per `reelScriptId`:** latest job row by `created_at DESC` for `(client_id, reel_script_id, asset_role = 'primary')`; attach `regenerationCount` + merged **`operatorProductionJobCostDtoSchema`** (US-7.3) when spend row exists.

**FE (`/operator/scripts`):**

| Element | Source |
|---------|--------|
| Slot row status badge | `videoJobsByReelScriptId[scriptId]?.status` |
| Expand row panel | full `OperatorVideoJobSummaryDto` |
| Retry button | `canRetry` + confirm via `previewRetryVideoJobEstimate` |
| Poll refresh | Optional 5s GET `/api/video-jobs/[jobId]` when status `queued`/`processing` — or manual navigation refresh |

**i18n:** `scripts.videoJob.*` — status labels, failure, retry, stale, override (EN + ES).

---

## Webhook (optional — poll-only V1 default)

**V1 BUILD default:** Poll-only satisfies poller-authority AC; webhook Route Handler **optional** if timeboxed.

If shipped:

**File:** `app/api/webhooks/video/[providerKey]/route.ts`  
**Method:** POST

| Step | Action |
|------|--------|
| 1 | Read raw body |
| 2 | Verify `Replicate-Signature` HMAC with `REPLICATE_WEBHOOK_SECRET` — constant-time |
| 3 | Reject unsigned → **401**, log metadata, **no** DB write |
| 4 | Extract `external_job_id` from payload |
| 5 | Lookup `WHERE external_job_id = $1 AND provider_key = $2` (route param) |
| 6 | No match → reject + log, **no** write |
| 7 | Prefer **wakeup**: trigger immediate `pollVideoJobUntilTerminal(jobId)` rather than trusting body status alone |
| 8 | If applying directly: `getJobStatus` refresh → `applyVideoJobStatusUpdate` |

Poller remains source of truth on race with webhook.

---

## Forbidden request keys (create + retry)

Merge and reject with **`FORBIDDEN_FIELDS`**:

- All `FORBIDDEN_PROVIDER_AUTHORITY_KEYS` (`lib/contracts/provider-decisions.ts`)
- All `FORBIDDEN_BUDGET_SPEND_KEYS` (`lib/contracts/cost-policy.ts`)
- `status`, `outputUrl`, `output_url`, `externalJobId`, `external_job_id`
- `progressPercent`, `failureReason`, `failure_reason`, `outputMediaAssetId`
- `skipBudgetCheck`, `skipRetryLimit`, `overrideRetryLimit`, `skip_retry_limit`
- `confirmRetry` unless strictly `true` on retry body

---

## Error codes

`videoJobErrorCodeSchema`:

| Code | When |
|------|------|
| `UNAUTHENTICATED` | No session |
| `FORBIDDEN` | Non-operator on mutation/list |
| `NOT_FOUND` | Foreign job id (404) |
| `VALIDATION_ERROR` | Zod / field errors |
| `FORBIDDEN_FIELDS` | Rejected authority keys |
| `BUDGET_EXCEEDED` | `assertReelBudgetAllowsSpend` failed |
| `CONSENT_REVOKED` | `assertActiveAvatarConsentForJobs` failed |
| `RETRY_LIMIT_EXCEEDED` | Max attempts without override |
| `JOB_NOT_RETRYABLE` | Parent not terminal failed |
| `PROVIDER_UNAVAILABLE` | Adapter/config missing |
| `INTERNAL_ERROR` | Unexpected |

---

## Fixtures (mock payloads)

### Create success

```json
{
  "ok": true,
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "queued",
  "estimatedCostCents": 10
}
```

### Operator week batch snippet

```json
{
  "videoJobsByReelScriptId": {
    "f47ac10b-58cc-4372-a567-0e02b2c3d479": {
      "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "reelScriptId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "status": "processing",
      "attempt": 1,
      "regenerationCount": 1,
      "failureReason": null,
      "canRetry": false,
      "cost": {
        "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "reelScriptId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
        "estimatedCostCents": 10,
        "actualCostCents": null,
        "costStatus": "pending"
      },
      "createdAt": "2026-08-29T12:00:00.000Z",
      "updatedAt": "2026-08-29T12:01:00.000Z"
    }
  }
}
```

### GET `/api/video-jobs/[jobId]`

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "reelScriptId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "status": "failed",
  "attempt": 2,
  "regenerationCount": 2,
  "failureReason": "Provider timed out",
  "canRetry": true,
  "retryBlockedReasonKey": null,
  "createdAt": "2026-08-29T12:00:00.000Z",
  "updatedAt": "2026-08-29T12:05:00.000Z"
}
```

### Retry blocked (budget)

```json
{
  "ok": false,
  "error": {
    "code": "BUDGET_EXCEEDED",
    "messageKey": "scripts.videoJob.retry.budgetExceeded"
  }
}
```

---

## Out of scope (explicit)

- US-8.2 Phase A adapter body (already shipped)
- US-8.3 manual upload · US-8.5/8.6/8.7 adapter bodies (Phase B reuse)
- US-9.1 FFmpeg assembly · US-9.3 TTS orchestration body
- `/operator/production` route
- Cliente job status / retry UI
- SSE (P2)
- RBAC beyond `requireOperator()`

---

## Changelog

| Date | Change |
|------|--------|
| 2026-08-29 | Initial freeze — US-8.4 orchestration + Operator `/operator/scripts` surfaces; imports US-8.2 Phase B; resolves SPEC-REVIEW + SECURITY gaps |
