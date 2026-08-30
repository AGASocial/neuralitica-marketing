# API Contract — US-8.3 Manual video upload fallback

**Story:** US-8.3  
**Status:** Frozen — 2026-08-30 (pending **Reviewed by FE** before BUILD)  
**Security:** `plan/stories/US-8.3/SECURITY.md` (APPROVE WITH CONDITIONS — reconciled below)  
**Spec review:** `plan/stories/US-8.3/SPEC-REVIEW.md` (GAPS — resolved by this contract)  
**Extends:** `plan/stories/US-8.4/CONTRACT.md` (job row shape, status UI, spend hooks) · `plan/stories/US-3.3/CONTRACT.md` (shared upload validation stack, serve route) · `plan/stories/US-7.3/CONTRACT.md` (`manualActualCostCents: 0`)  
**Depends on:** US-8.1 ✅ adapter interface · US-8.4 ✅ job table + status UI · US-X.4 ✅ catalog `manual` row · US-7.2 ✅ manual policy exclusion · US-7.3 ✅ spend sync_insert · US-3.3 ✅ upload validator export · US-3.2 ✅ consent gate · US-14.5 ✅ `requireOperator()`  
**Feature branch:** `feature/US-8.3-manual-upload`  
**Error envelope style:** same class as US-3.3 / US-8.4 (`ok: true` vs `{ ok: false, error: { code, fields?, messageKey? } }`)

**This document is CONTRACT ONLY.** Zod mirrors live in `lib/contracts/manual-video-upload.ts` and extensions to `lib/contracts/media-assets.ts` / `lib/contracts/video-job.ts` (BUILD stubs committed with this freeze).

**Terminology:** **Subida manual** · **Proveedor manual** · **Job de generación** · **Operator** · **download-and-own** · **Coste cero**. Technical enums (`generated_video`, `manual`, `operator_client_id`) OK in code/Operator diagnostics. Do **not** use CONTEXT _Evitar_ terms in product-facing strings.

---

## SPEC-REVIEW blocking gaps closed

| # | Gap | Resolution |
|---|-----|------------|
| 1 | No US-8.3 CONTRACT.md | This document |
| 2 | `operator_client_id` attribution rule not frozen | § Migration — DB CHECK + app validation |
| 3 | Upload when slot already `completed` undefined | § Slot visibility — V1 **block** when latest primary job is `completed` |
| 4 | `generated_video` serve / ownership rules unset | § Serve route extension |
| 5 | Validator extension shape open | § Shared validator — `assetType` union |
| 6 | Duration probe library not frozen | § Duration probe — **`mp4box`** primary |
| 7 | Budget gate at zero estimate not frozen | § Zero-cost budget rule — skip gate when `estimatedCostCents === 0` |
| 8 | Multipart / body size limit unspecified | § Transport — Server Action FormData + `serverActions.bodySizeLimit` |
| 9 | Orchestrator transaction order not frozen | § `uploadManualVideoJob()` gate order |
| 10 | FE batch map refresh pattern not frozen | § FE upload contract — return `job` DTO + `revalidatePath` |

## SECURITY reconciliation (binding)

| Topic | SECURITY condition | **Frozen in this contract** |
|-------|-------------------|----------------------------|
| Operator gate | `requireOperator('action')` first | § Server Action step 1 |
| Shared validation stack | Extend US-3.3 module; no fork | § Validator extension |
| Forbidden client authority | Reject status/provider/cost/output ids | § Forbidden request keys |
| Sync complete without poller | INSERT terminal `completed`; no client UPDATE | § Orchestrator — no `enqueueVideoJobPoll` |
| Attribution | `operator_client_id` non-null on manual rows | § Migration + job INSERT |
| Tenancy / IDOR | Reel load by id **and** `client_id` | § Orchestrator step 2 |
| Consent vs cost bypass | Consent when `own_avatar`; cost bypass only | § Orchestrator step 4 |
| Budget at cap | Zero estimate never blocks | § Zero-cost budget rule |
| Manual adapter safety | Vendor I/O throws `MANUAL_UPLOAD_SYNC_ONLY` | § `createManualUploadAdapter()` |
| Replace-in-place guard | Block when `completed` API job exists | § Slot visibility |
| Serve `generated_video` | Ownership-checked authenticated route | § Serve route extension |
| No QA skip | Document downstream US-10.1 | § Non-goals |

---

## Overview

US-8.3 ships **Operator-only manual video upload** on **`/operator/scripts`** Reel expand row. When API **Job de generación** fails or budget blocks retry, the Operator uploads a validated MP4/MOV; the server completes a **`neuramark_video_jobs`** row **synchronously** (`status: completed`, zero cost) and inserts **`neuramark_media_assets`** (`asset_type = generated_video`). Downstream assembly (US-9.1) consumes `output_media_asset_id` like any provider output.

**Surfaces**

| # | Surface | Kind | Consumer |
|---|---------|------|----------|
| 1 | `uploadManualVideoJob` | Server Action | `ReelDetailPanel` manual upload dialog |
| 2 | `uploadManualVideoJob()` | Server helper | Action + tests |
| 3 | `createManualUploadAdapter()` | Provider adapter | Registry / cost previews only |
| 4 | `validateAndPrepareMediaUpload` (extended) | Server helper | Orchestrator; US-9.2 import path |
| 5 | `GET /api/media/assets/[assetId]` (extended) | Route Handler | Operator preview of `generated_video` |
| 6 | `/operator/scripts` upload dialog | FE | `ReelDetailPanel` — adjacent to `OperatorVideoJobSummaryPanel` |

**Forbidden surfaces (BUILD veto):**

- Cliente-callable manual upload Route Handler or Server Action.
- Client-supplied `provider_key`, `status`, `external_job_id`, `output_media_asset_id`, cost fields, or skip flags.
- Client UPDATE of `neuramark_video_jobs.status`.
- **`enqueueVideoJobPoll`** for manual jobs.
- Forked duplicate upload validator module.
- Storage under `public/` or client-controlled `storage_key`.
- QA / approval skip parameters (`skipQa`, `autoApprove`, etc.).

---

## Migration — `operator_client_id`

**Migration file (BUILD):** `supabase/migrations/*_neuramark_video_jobs_operator_client_id.sql`

```sql
ALTER TABLE public.neuramark_video_jobs
  ADD COLUMN operator_client_id uuid REFERENCES public.neuramark_clients(id);

CREATE INDEX neuramark_video_jobs_operator_client_id_idx
  ON public.neuramark_video_jobs (operator_client_id)
  WHERE operator_client_id IS NOT NULL;

ALTER TABLE public.neuramark_video_jobs
  ADD CONSTRAINT neuramark_video_jobs_manual_operator_attribution_chk
  CHECK (
    provider_key <> 'manual'
    OR operator_client_id IS NOT NULL
  );

COMMENT ON COLUMN public.neuramark_video_jobs.operator_client_id IS
  'Operator identity for manual upload jobs (US-8.3). Required when provider_key = manual.';
```

| Rule | Detail |
|------|--------|
| Column | **`operator_client_id uuid REFERENCES neuramark_clients(id)`** — nullable on table |
| Manual rows | **Non-null** enforced by **DB CHECK** + orchestrator validation |
| Source | **`requireOperator()`** session **`clientId`** only — never from request body |
| API rows | **`operator_client_id IS NULL`** for async vendor jobs |
| RLS | Deny-by-default unchanged; service-role Node only |

**TypeScript row extension (BUILD):** add `operatorClientId: string | null` to `VideoJobRow` + select column list.

---

## `createManualUploadAdapter()`

**File:** `lib/providers/video/manual-upload-adapter.ts` (`import "server-only"`)  
**Registry:** register in **`createProviderRegistry`** alongside SadTalker/MuseTalk stubs.

```ts
export const MANUAL_UPLOAD_SYNC_ONLY = "MANUAL_UPLOAD_SYNC_ONLY" as const;

export function createManualUploadAdapter(): VideoProviderAdapter {
  return {
    providerKey: "manual",
    videoAssetRole: "primary",
    estimateCost: async () => ({
      estimatedCostCents: 0,
      currency: "USD",
      providerKey: "manual",
    }),
    createJob: async () => {
      throw new Error(MANUAL_UPLOAD_SYNC_ONLY);
    },
    getJobStatus: async () => {
      throw new Error(MANUAL_UPLOAD_SYNC_ONLY);
    },
    fetchAsset: async () => {
      throw new Error(MANUAL_UPLOAD_SYNC_ONLY);
    },
  };
}
```

| Method | Behavior |
|--------|----------|
| `estimateCost` | Always **`{ estimatedCostCents: 0, currency: 'USD', providerKey: 'manual' }`** |
| `createJob` / `getJobStatus` / `fetchAsset` | Throw **`MANUAL_UPLOAD_SYNC_ONLY`** — orchestrator owns I/O |
| Poller | **Never** invoked for `provider_key = manual` |

Catalog row (US-X.4 seed — do not change): `key: manual`, `unitCostCents: 0`, `capabilities.manualFallback: true`.

---

## Shared validator extension — `generated_video`

**File:** `lib/media/upload-validation.ts` (`import "server-only"`) — **extend existing export; do not fork.**

**Contract union:**

```ts
export type MediaUploadAssetType = "avatar_reference" | "generated_video";
```

| Step | `avatar_reference` | `generated_video` (US-8.3) |
|------|-------------------|----------------------------|
| Consent / count | `hasActiveAvatarConsent` + max count | **Skip** (Operator path) |
| Size | image/video class caps | **`getMaxVideoBytes()`** only |
| Magic bytes | jpeg/png/webp/mp4/mov | **mp4 + quicktime only** |
| Duration | optional (US-3.3) | **Required** — ≤ **`getMaxVideoDurationSec()`** (default **30s**) |
| Key + put | UUID + `MediaStorage.put` | **Same** |

**Duration probe (frozen library):**

| Rule | Detail |
|------|--------|
| Library | **`mp4box`** (`import mp4box from 'mp4box'`) — pure JS, Vercel-safe; no client-controlled shell |
| Input | Validated buffer after magic-byte detect, before `MediaStorage.put` |
| Failure | Probe error or over cap → **`VIDEO_TOO_LONG`** (maps to `scripts.videoJob.manualUpload.errors.durationExceeded`) |
| Metadata | Persist **`durationSec`** (rounded down to 2 decimals max) on media row |

**Extended input shape:**

```ts
validateAndPrepareMediaUpload(input: {
  userId: string;
  assetType: MediaUploadAssetType;
  file: File | Buffer;
  originalFilename: string;
  existingAssetCount: number; // ignored when assetType = generated_video
  afterValidate?: AfterValidateHook;
}): Promise<ValidateMediaUploadResult>;
```

For **`generated_video`**, caller passes **`userId`** = reel owner's `client_id` (tenancy context only — consent gates skipped). Operator auth is enforced **before** validator invoke on upload path.

---

## Zero-cost budget rule

| Rule | Detail |
|------|--------|
| Estimate | Manual path always **`estimatedCostCents: 0`** |
| Gate | When **`estimatedCostCents === 0`**, **skip** `assertVideoJobBudgetAllowsSpend` entirely — dedicated branch before any budget logic |
| Rationale | Prior API spend at **`max_cost_cents`** cap must **not** block manual upload |
| Ledger | **`finalizeGenerationCost({ mode: 'sync_insert', manualActualCostCents: 0, actualCostCents: 0, estimatedCostCents: 0, ... })`** |
| Test | Integration: cumulative spend at cap + manual upload → **success** |

**Never** call budget gate with non-zero estimate on manual path. **Never** block zero-cost upload because `wouldExceedBudget(cumulative, 0, max)` would fail when cumulative already exceeds max (edge case — skip avoids entirely).

---

## Slot visibility (V1 upload guards)

Per **`reel_script_id`**, consider latest **primary** job by `created_at DESC`:

| Latest job status | Manual upload button |
|-------------------|---------------------|
| *(none)* | **Show** — normal emphasis |
| `queued` / `processing` | **Hide** — `SLOT_JOB_IN_FLIGHT` if forced |
| `failed` / `cancelled` | **Show** — primary emphasis; optional `parentJobId` = failed job id |
| `completed` | **Hide** — `SLOT_COMPLETED_JOB_EXISTS` (V1 replace deferred P1) |

FE derives visibility from `videoJobsByReelScriptId[scriptId]?.status` — no separate preview action in V1.

---

## `uploadManualVideoJob()` orchestrator

**File:** `lib/video-jobs/upload-manual-video-job.ts` (`import "server-only"`)

```ts
export async function uploadManualVideoJob(input: {
  reelScriptId: string;
  clientId: string;
  operatorClientId: string;
  file: File | Buffer;
  originalFilename: string;
  parentJobId?: string;
}): Promise<UploadManualVideoJobResult>;
```

| Step | Action |
|------|--------|
| 1 | Caller already ran **`requireOperator('action')`** — pass **`operatorClientId`** from session |
| 2 | Load **`neuramark_reel_scripts`** `WHERE id = $reelScriptId AND client_id = $clientId` — missing → **`NOT_FOUND`** (404 envelope) |
| 3 | Load latest primary job for slot — if status **`queued`/`processing`** → **`SLOT_JOB_IN_FLIGHT`**; if **`completed`** → **`SLOT_COMPLETED_JOB_EXISTS`** |
| 4 | If reel **`visualMode === 'own_avatar'`** → **`assertActiveAvatarConsentForJobs(clientId)`** — fail → **`CONSENT_REVOKED`** |
| 5 | If **`parentJobId`** set: load parent `WHERE id = $1 AND reel_script_id = $reelScriptId AND client_id = $clientId` — must be terminal **`failed`** or **`cancelled`**; else **`VALIDATION_ERROR`** |
| 6 | **`validateAndPrepareMediaUpload({ assetType: 'generated_video', ... })`** |
| 7 | **`MediaStorage.put(storageKey, buffer)`** — outside `public/` |
| 8 | INSERT **`neuramark_media_assets`**: `asset_type = generated_video`, metadata `{ originalFilename, detectedMime, sizeBytes, durationSec, source: 'manual_upload' }` |
| 9 | **`external_job_id = 'manual-' || uuid`** — server-generated only |
| 10 | INSERT **`neuramark_video_jobs`**: `provider_key = manual`, `provider_tier = low`, `asset_role = primary`, `status = completed`, `estimated_cost_cents = 0`, `actual_cost_cents = 0`, `output_media_asset_id`, `operator_client_id`, `parent_job_id`, `attempt = parent ? parent.attempt + 1 : 1` |
| 11 | **`finalizeGenerationCost({ mode: 'sync_insert', providerKey: 'manual', assetRole: 'talking_head', jobKind: 'talking_head_generate', estimatedCostCents: 0, manualActualCostCents: 0, operatorClientId, durationSec, clientId, reelScriptId })`** → `spendEventId` |
| 12 | UPDATE job row **`spend_event_id`** |
| 13 | Map **`OperatorVideoJobSummaryDto`** via `mapOperatorVideoJobSummaryDto` — return success |

**Transaction / rollback:**

| Failure point | Action |
|---------------|--------|
| DB INSERT fails after storage put | Best-effort **`MediaStorage.delete(storageKey)`**; return **`INTERNAL_ERROR`** |
| Duplicate concurrent upload | Second writer hits slot guard (step 3) or UNIQUE constraint — return domain error |

**Never:** **`enqueueVideoJobPoll`**. **Never:** client UPDATE of job status.

**Also update (BUILD):** `insertGeneratedVideoMediaAsset` → use **`generated_video`** enum (remove `avatar_reference` + `generatedVideo` metadata hack).

---

## `uploadManualVideoJob` Server Action

**File:** `lib/video-jobs/actions/upload-manual-video-job.ts` — `"use server"`  
**Consumer:** `ReelDetailPanel` manual upload dialog (`/operator/scripts`)

### Transport

| Rule | Detail |
|------|--------|
| Primary | **Server Action** + **`FormData`** (mirrors US-3.3 avatar upload) |
| Fields | `reelScriptId`, `clientId`, `file`, optional `parentJobId` |
| Body limit | **`next.config`** `serverActions.bodySizeLimit` ≥ **`getMaxVideoBytes()`** + overhead (document **52mb** default BUILD target) |
| Fallback | If deployment cannot raise limit, add **`POST /api/operator/manual-video-upload`** Route Handler with identical gates — out of V1 BUILD unless needed |

### Gate order (action)

| Step | Action |
|------|--------|
| 1 | **`requireOperator('action')`** — non-operator → **403** `FORBIDDEN`; capture `operatorClientId` |
| 2 | Parse FormData — reject **`FORBIDDEN_MANUAL_UPLOAD_AUTHORITY_KEYS`** → **`FORBIDDEN_FIELDS`** |
| 3 | Validate `reelScriptId`, `clientId` (uuid), optional `parentJobId` (uuid) via Zod |
| 4 | Require `file` instanceof `File` with size > 0 — else **`MISSING_FILE`** |
| 5 | Delegate to **`uploadManualVideoJob()`** orchestrator |
| 6 | On success: **`revalidatePath('/operator/scripts')`** + return `{ ok: true, jobId, mediaAssetId, status: 'completed', job: OperatorVideoJobSummaryDto }` |

### Request schema (non-file fields)

```ts
{
  reelScriptId: string;   // uuid
  clientId: string;       // uuid — must match reel ownership (server re-validates)
  parentJobId?: string;   // uuid — optional lineage from failed job
}
```

---

## Forbidden request keys (manual upload)

Merge and reject with **`FORBIDDEN_FIELDS`**:

- All **`FORBIDDEN_PROVIDER_AUTHORITY_KEYS`** (`lib/contracts/provider-decisions.ts`)
- All **`FORBIDDEN_BUDGET_SPEND_KEYS`** (`lib/contracts/cost-policy.ts`)
- All **`FORBIDDEN_VIDEO_JOB_AUTHORITY_KEYS`** (`lib/contracts/video-job.ts`)
- **`FORBIDDEN_MANUAL_UPLOAD_AUTHORITY_KEYS`** (`lib/contracts/manual-video-upload.ts`):
  - `status`, `outputUrl`, `output_url`, `outputMediaAssetId`, `output_media_asset_id`
  - `providerKey`, `provider_key`, `externalJobId`, `external_job_id`
  - `estimatedCostCents`, `actualCostCents`, `estimated_cost_cents`, `actual_cost_cents`
  - `operatorClientId`, `operator_client_id`
  - `storageKey`, `storage_key`, `assetType`, `asset_type`, `metadata`
  - `skipConsentCheck`, `skipBudgetCheck`, `skipQa`, `autoApprove`, `confirmReplace`
  - `attempt`, `spendEventId`, `spend_event_id`

---

## Error codes

`uploadManualVideoJobErrorCodeSchema` (extends shared upload codes where applicable):

| Code | When | HTTP-ish |
|------|------|----------|
| `UNAUTHENTICATED` | No session | 401 |
| `FORBIDDEN` | Non-operator | 403 |
| `NOT_FOUND` | Foreign / mismatched reel + client | 404 |
| `VALIDATION_ERROR` | Zod / invalid parentJobId | 400 |
| `FORBIDDEN_FIELDS` | Authority keys in FormData | 400 |
| `MISSING_FILE` | No file / empty file | 400 |
| `INVALID_FILE_TYPE` | Magic bytes fail | 400 |
| `FILE_TOO_LARGE` | Over **`getMaxVideoBytes()`** | 400 |
| `VIDEO_TOO_LONG` | Duration probe over cap | 400 |
| `CONSENT_REVOKED` | `own_avatar` without active consent | 403 |
| `SLOT_JOB_IN_FLIGHT` | `queued`/`processing` job exists | 409 |
| `SLOT_COMPLETED_JOB_EXISTS` | `completed` job blocks V1 replace | 409 |
| `INTERNAL_ERROR` | Unexpected / storage failure | 500 |

**i18n prefix:** `scripts.videoJob.manualUpload.errors.*` (EN + ES).

---

## Serve route extension — `generated_video`

**File:** `app/api/media/assets/[assetId]/route.ts` (extend US-3.3 handler)

| `asset_type` | Auth | Ownership |
|--------------|------|-----------|
| `avatar_reference` | **`requireActive('handler')`** | `asset.client_id = session.clientId` |
| **`generated_video`** | **`requireOperator('handler')`** | `asset.client_id = $scriptsPageClientId` from Operator session context |

| Rule | Detail |
|------|--------|
| Cliente access | **Denied** for `generated_video` in V1 — Operator production asset |
| Response | Stream via `MediaStorage.get`; correct `Content-Type` from metadata `detectedMime` |
| Headers | **`Cache-Control: private, no-store`** |
| Foreign/missing | **404** uniform envelope |
| DTOs | Never expose `storage_key` — preview via `/api/media/assets/{id}` only |

US-9.1 assembly reads storage via **service-role** server helpers — not this Route Handler.

---

## FE upload contract — `ReelDetailPanel`

**Files:** `components/scripts/ScriptsPageView.tsx` (`ReelDetailPanel`), new `ManualVideoUploadDialog` client boundary.

### Placement

Manual upload control **above** `OperatorVideoJobSummaryPanel` inside expand row — same `ReelDetailPanel` block as US-8.4 job panel.

### Visibility

| Condition | UI |
|-----------|-----|
| No job or terminal non-completed | Show **Subida manual** button |
| `failed` / `cancelled` or retry budget-blocked | **Primary** button emphasis |
| `queued` / `processing` | Hide button |
| `completed` | Hide button (V1 — no replace) |

### Dialog

| Element | Rule |
|---------|------|
| Component | PrimeReact **`Dialog`** + file input |
| Accept | `.mp4,.mov` |
| Hints | Max size + max duration from config copy — **not** hardcoded bytes |
| Submit | **`uploadManualVideoJob`** FormData action |
| `parentJobId` | Pass failed `jobId` when dialog opened from failed panel context |
| Pending | Disable submit while in flight |
| Success | Close dialog; merge returned **`job`** into local `videoJobsByReelScriptId[scriptId]`; toast via `scripts.videoJob.manualUpload.success` |
| Errors | Map `error.code` → i18n keys under `scripts.videoJob.manualUpload.errors.*` |

### Reuse (no fork)

| Component | Rule |
|-----------|------|
| `OperatorVideoJobSummaryPanel` | Shows **`completed`** manual job — provider label **Manual upload** / **Subida manual**; cost **`$0.00`** |
| Status badges | Existing US-8.4 slot row `Tag` — no duplicate badge component |
| Retry button | **`canRetry: false`** when `provider_key = manual` (mapper BUILD change) |

### i18n keys (EN + ES)

- `scripts.videoJob.manualUpload.title`
- `scripts.videoJob.manualUpload.hint`
- `scripts.videoJob.manualUpload.submit`
- `scripts.videoJob.manualUpload.cancel`
- `scripts.videoJob.manualUpload.success`
- `scripts.videoJob.manualUpload.errors.*` (per error code)

---

## DTO refresh

**Success response:**

```ts
{
  ok: true;
  jobId: string;
  mediaAssetId: string;
  status: "completed";
  job: OperatorVideoJobSummaryDto; // for optimistic expand-row merge
}
```

**Batch map:** On navigation refresh, `getReelScriptsForWeek` → `videoJobsByReelScriptId` returns latest job (manual **`completed`** row). **`revalidatePath('/operator/scripts')`** on action success ensures server render consistency.

**Manual job cost DTO:** `estimatedCostCents: 0`, `actualCostCents: 0`, `costStatus: 'actual'` per US-7.3 manual rule.

---

## Fixtures (mock payloads)

### Upload success

```json
{
  "ok": true,
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "mediaAssetId": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
  "status": "completed",
  "job": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "reelScriptId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "status": "completed",
    "attempt": 2,
    "regenerationCount": 2,
    "failureReason": null,
    "canRetry": false,
    "retryBlockedReasonKey": null,
    "cost": {
      "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "reelScriptId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "estimatedCostCents": 0,
      "actualCostCents": 0,
      "costStatus": "actual"
    },
    "createdAt": "2026-08-30T15:00:00.000Z",
    "updatedAt": "2026-08-30T15:00:00.000Z"
  }
}
```

### Budget-at-cap success (orchestrator integration)

Given cumulative API spend = `max_cost_cents`, manual upload with parent failed job → same success shape; spend row `actual_cost_cents = 0`.

### Slot blocked — completed

```json
{
  "ok": false,
  "error": {
    "code": "SLOT_COMPLETED_JOB_EXISTS",
    "messageKey": "scripts.videoJob.manualUpload.errors.slotCompletedJobExists"
  }
}
```

### Validation — duration exceeded

```json
{
  "ok": false,
  "error": {
    "code": "VIDEO_TOO_LONG",
    "messageKey": "scripts.videoJob.manualUpload.errors.durationExceeded"
  }
}
```

### Forbidden fields

```json
{
  "ok": false,
  "error": {
    "code": "FORBIDDEN_FIELDS",
    "messageKey": "scripts.videoJob.manualUpload.errors.forbiddenFields"
  }
}
```

---

## Non-goals (explicit)

- Cliente self-service video upload
- Replace-in-place on **`completed`** API output (P1 defer)
- API adapter body changes (US-8.2 / US-8.5–8.7)
- New poller / status badge component
- QA / approval bypass (US-10.1 / US-11.x remain downstream)
- Productized AV scanning
- US-9.1 assembly pipeline body
- `POST` upload Route Handler unless body limit blocks Server Action

**Residual malware risk:** V1 relies on magic bytes + size + video-only allowlist — same US-3.3 acceptance. Optional `afterValidate` hook only.

---

## Reviewed by FE

*(Pending — nextjs-frontend signoff required before BUILD.)*

---

## Changelog

| Date | Change |
|------|--------|
| 2026-08-30 | Initial freeze — manual upload action, validator extension, migration, sync orchestrator, serve rules, FE ReelDetailPanel contract; resolves SPEC-REVIEW + SECURITY gaps |
