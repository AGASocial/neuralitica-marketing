# US-8.3 — Manual video upload fallback

**Priority:** P0  
**Depends on:** US-8.1 ✅ adapter interface + registry · US-8.4 ✅ job table + status UI + spend hooks · US-X.4 ✅ catalog `manual` row · US-7.2 ✅ manual policy exclusion + recommendation footnote · US-7.3 ✅ `manualActualCostCents: 0` · US-3.3 ✅ shared upload validator export · US-3.2 ✅ consent job gate · US-14.5 ✅ `requireOperator()`.  
**Acceptance criteria:** `plan/USER_STORIES.md` § US-8.3 (source of truth — do **not** redefine; do **not** check off in PREP)  
**Implementers:** **media-pipeline-engineer** + **nextjs-backend** + **nextjs-frontend** (`docs/development/AGENT-ROSTER.md` Phase 4).  
**Canonical terms:** **Subida manual** · **proveedor manual** · **Job de generación** · **generated_video** · **download-and-own**. Avoid CONTEXT _Evitar_ list in product-facing copy.

## Out of scope (do not implement here)

- **SadTalker / MuseTalk / Wan / HeyGen** adapter changes — US-8.2 / US-8.5–8.7.
- **New job poller / stale sweeper / webhook** — US-8.4 ✅ (manual jobs skip poller).
- **Duplicate status badge component** — reuse **`OperatorVideoJobSummaryPanel`**.
- **Cliente self-service video upload** — Operator-only.
- **Auto-rank `manual` in policy engine** — US-7.2 ✅ explicit path only.
- **QA override UI / approval shortcuts** — US-10.x; manual must not skip QA (SEC AC).
- **Replace completed API output in-place** — P1 defer unless CONTRACT adds explicit replace.
- **Productized AV scanning** — same deferral as US-3.3.
- **US-9.1 assembly pipeline body** — consumes output downstream only.

## Scope split

| Concern | Owner |
|---------|--------|
| `manual` `VideoProviderAdapter` + registry registration | **US-8.3** BE (media-pipeline-engineer) |
| `uploadManualVideoJob()` sync orchestrator | **US-8.3** BE |
| Extend shared upload validator for `generated_video` + duration probe | **US-8.3** BE |
| `operator_client_id` migration on `neuramark_video_jobs` | **US-8.3** DB |
| Switch `insertGeneratedVideoMediaAsset` to `generated_video` type | **US-8.3** BE |
| Manual upload dialog on `/operator/scripts` Reel detail | **US-8.3** FE |
| Status badges / cost panel / batch job map | **US-8.4** ✅ reuse |
| `neuramark_video_jobs` base DDL | **US-8.4** ✅ |
| Catalog `manual` seed row | **US-X.4** ✅ |
| Spend `manualActualCostCents: 0` | **US-7.3** ✅ (wire in orchestrator) |

## PO decisions (freeze in CONTRACT unless SECURITY / SPEC vetoes)

| Topic | Decision |
|-------|----------|
| Branch | **`feature/US-8.3-manual-upload`** |
| Manual adapter module | **`lib/providers/video/manual-upload-adapter.ts`** (`import "server-only"`) |
| Factory | **`createManualUploadAdapter()`** — `providerKey: manual`, `videoAssetRole: primary` |
| Registry | Register in **`createProviderRegistry`** / **`buildBootstrapCatalog()`** includes `manual` row |
| `estimateCost` | Always **`{ estimatedCostCents: 0, currency: 'USD', providerKey: 'manual' }`** |
| Vendor I/O methods | **`createJob` / `getJobStatus` / `fetchAsset`** throw **`MANUAL_UPLOAD_SYNC_ONLY`** — upload orchestrator owns I/O |
| Orchestrator module | **`lib/video-jobs/upload-manual-video-job.ts`** (`import "server-only"`) |
| Server Action | **`uploadManualVideoJob`** — multipart file + `{ reelScriptId, clientId, parentJobId? }` |
| Auth | **`requireOperator('action')`** — **403** non-operator; **`operator_client_id`** from operator session |
| Client scope | Validate **`reel_script_id`** belongs to **`client_id`** (same as US-8.4 job create) |
| Gate order | Identity → load script → **consent (own_avatar only)** → validate file → storage put → media INSERT → job INSERT completed → spend sync_insert |
| Budget | **`estimatedCostCents: 0`** — must **not** block manual upload when API spend exhausted budget |
| Consent | **`assertActiveAvatarConsentForJobs(clientId)`** when visual mode **`own_avatar`** |
| Job row | `provider_key = manual`, `provider_tier = low`, `asset_role = primary`, `status = completed`, `estimated_cost_cents = 0`, `actual_cost_cents = 0`, `output_media_asset_id` set, `external_job_id = manual-{uuid}` |
| Poller | **Do not** call **`enqueueVideoJobPoll`** for manual jobs |
| Attribution | **`operator_client_id`** non-null on manual rows (migration + validation) |
| Lineage | Optional **`parent_job_id`** when uploading after failed API job; **`attempt`** follows US-8.4 retry rules |
| Validator asset type | **`generated_video`** — video MIME only; extend **`validateAndPrepareMediaUpload`** or export sibling with shared internals |
| Duration | Probe required — reject when **`durationSec > getMaxVideoDurationSec()`** (default 30s) |
| Storage | Reuse **`MediaStorage.put`** + keys outside web root (US-3.3 pattern) |
| Media asset type | **`generated_video`** (enum already seeded in US-8.4 migration) |
| Spend | **`finalizeGenerationCost({ mode: 'sync_insert', manualActualCostCents: 0, actualCostCents: 0, providerKey: 'manual', assetRole: 'talking_head', ... })`** |
| FE placement | **`ReelDetailPanel`** — manual upload control adjacent to **`OperatorVideoJobSummaryPanel`** |
| FE visibility | Show when **no `queued`/`processing`** job for slot; emphasize on **`failed`** / budget-blocked retry |
| i18n | EN + ES **`scripts.videoJob.manualUpload.*`** |
| Implementers | **media-pipeline-engineer** (adapter + orchestrator + validator) + **nextjs-backend** (CONTRACT, migration, action) + **nextjs-frontend** (dialog) |

### Catalog row (US-X.4 seed — do not change in US-8.3)

| Field | Value |
|-------|-------|
| `key` | `manual` |
| `asset_role` | `talking_head` |
| `tier` | `low` |
| `active` | `true` |
| `capabilities` | `{ "manualFallback": true }` |
| `cost_model` | `{ "billingUnit": "per_run", "unitCostCents": 0 }` |

### Orchestrator sketch (CONTRACT freezes exact signatures)

```ts
// lib/video-jobs/upload-manual-video-job.ts
export async function uploadManualVideoJob(input: {
  reelScriptId: string;
  clientId: string;
  file: File | Buffer;
  originalFilename: string;
  parentJobId?: string;
}): Promise<
  | { ok: true; jobId: string; mediaAssetId: string; status: "completed" }
  | { ok: false; error: UploadManualVideoJobError }
>;
```

### Manual adapter sketch

```ts
// lib/providers/video/manual-upload-adapter.ts
export function createManualUploadAdapter(): VideoProviderAdapter {
  return {
    providerKey: "manual",
    videoAssetRole: "primary",
    estimateCost: async () => ({ estimatedCostCents: 0, currency: "USD", providerKey: "manual" }),
    createJob: async () => { throw manualUploadSyncOnlyError(); },
    getJobStatus: async () => { throw manualUploadSyncOnlyError(); },
    fetchAsset: async () => { throw manualUploadSyncOnlyError(); },
  };
}
```

## Carry-forwards / reuse (do not reinvent)

- Job table + status DTOs: `lib/contracts/video-job.ts`, `lib/video-jobs/map-operator-video-job-dto.ts`.
- Status UI: `components/scripts/OperatorVideoJobSummaryPanel.tsx`, `components/scripts/ScriptsPageView.tsx` (`ReelDetailPanel`).
- Upload stack: `lib/media/upload-validation.ts`, `lib/media/media-config.ts`, `lib/media/storage/`.
- Consent: `lib/visual-preferences/assert-active-avatar-consent-for-jobs.ts`.
- Spend: `lib/cost-policy/finalize-generation-cost.ts`, `lib/cost-policy/record-reel-spend-event.ts`.
- Provider label: `lib/providers/resolve-provider-display-label.ts` (`manual: "Manual upload"`).
- Policy manual exclusion: `lib/providers/provider-adapters.ts` (`allowManualFallback`).
- Security baseline: `plan/SECURITY_BASELINE.md` §3; US-3.3 SECURITY.md shared stack.
- US-8.4 SECURITY: manual jobs must not open client status-write path.
- Design reference: `plan/DESIGN_PROMPTS.md` §7 — manual upload dialog mock.

**Codebase gap (PREP verified):** No `manual` adapter stub in `lib/providers/` — only catalog/policy/display-label wiring. US-8.1 TASKS explicitly deferred **`manual` upload adapter** to US-8.3.

---

## FE checklist

Concrete consumers: **`/operator/scripts`** expand-row **`ReelDetailPanel`** · **`OperatorVideoJobSummaryPanel`** (reuse) · manual upload dialog.

- [x] **Manual upload button** — visible when slot has no in-flight job (`queued`/`processing` absent); primary emphasis when current job is **`failed`** or retry budget-blocked.
- [x] **Upload dialog** — PrimeReact **`Dialog`** + file input / dropzone; accept **`.mp4,.mov`**; show max size + max duration from config copy (not hardcoded bytes in UI).
- [x] **Validation feedback** — surface server error codes (`FILE_TOO_LARGE`, `INVALID_FILE_TYPE`, `DURATION_EXCEEDED`, `OWN_AVATAR_CONSENT_REQUIRED`, etc.) via i18n keys.
- [x] **Submit** — call **`uploadManualVideoJob`** Server Action with `reelScriptId`, `clientId`, file; optional `parentJobId` when replacing failed API path (CONTRACT).
- [x] **Success** — close dialog; refresh expand-row job state (revalidate batch map or optimistic merge **`completed`** job into **`videoJobsByReelScriptId`**).
- [x] **Reuse status UI** — **`OperatorVideoJobSummaryPanel`** shows **`completed`** manual job with provider label **Manual upload** and **`$0.00`** cost — no forked badge component.
- [x] **Loading / pending** — disable submit while upload in flight; show progress if CONTRACT specifies chunked upload (lean: single POST).
- [x] **Operator-only** — no Cliente routes; no upload on shared serializers.
- [x] **i18n** — EN + ES under **`scripts.videoJob.manualUpload.*`** (title, hint, submit, cancel, success toast, errors).
- [x] **No** `external_job_id`, storage keys, or raw paths in UI.

---

## BE checklist

Concrete consumers: FE upload dialog · US-9.1 assembly (output asset id) · US-7.4 roll-up (zero actual).

- [ ] **`createManualUploadAdapter()`** — register **`manual`** in **`createProviderRegistry`**; bootstrap catalog includes **`manual`** row.
- [ ] **`uploadManualVideoJob()`** — full gate order; sync complete; no poller enqueue.
- [ ] **Extend upload validator** — **`generated_video`** asset type: video MIME magic bytes only; size cap; **duration probe**; server UUID storage key; no avatar-reference consent/count gates.
- [ ] **`MediaStorage.put`** — store validated buffer; root outside **`public/`**.
- [ ] **INSERT `neuramark_media_assets`** — `asset_type = generated_video`; metadata per README PO #9.
- [ ] **INSERT `neuramark_video_jobs`** — completed row shape matches API jobs; **`operator_client_id`** set.
- [ ] **Migration** — `operator_client_id uuid REFERENCES neuramark_clients(id)` nullable; app/DB rule: required for **`provider_key = manual`**.
- [ ] **Update `insertGeneratedVideoMediaAsset`** — use **`generated_video`** (remove `avatar_reference` + `generatedVideo` hack).
- [ ] **`finalizeGenerationCost` sync_insert** — `manualActualCostCents: 0`, `actualCostCents: 0`, `providerKey: manual`.
- [ ] **`uploadManualVideoJob` Server Action** — `requireOperator()`; forbidden-field strip; multipart handling per CONTRACT.
- [ ] **Consent gate** — `assertActiveAvatarConsentForJobs` when **`own_avatar`**.
- [ ] **Budget** — manual path with **0 estimate** must succeed even when cumulative API spend at cap (explicit test).
- [ ] **IDOR** — foreign `reelScriptId` / `clientId` mismatch → **404** / validation error (no cross-tenant upload).
- [ ] **[SEC] No client endpoint** sets job `status`, `output_media_asset_id`, or `provider_key`.
- [ ] **[SEC] Attribution** — manual jobs queryable with **`operator_client_id`** for audit.
- [ ] **Tests** — validator (MIME, oversize, duration); orchestrator (gates, row shape, spend 0); operator 403; foreign reel 404; registry **`getVideoAdapter('manual')`**.

---

## DB checklist

All objects keep `neuramark_` prefix.

- [ ] **ALTER `neuramark_video_jobs`** — add **`operator_client_id uuid REFERENCES neuramark_clients(id)`** (nullable; manual rows non-null).
- [ ] **Reuse `neuramark_media_assets`** — `generated_video` enum value (already in US-8.4 migration).
- [ ] **No new tables** — job + media reuse only.
- [ ] **RLS** — deny-by-default unchanged; service-role Node only.
- [ ] **No catalog seed change** — `manual` row from US-X.4.

---

## Gates (orchestrator)

- [x] SPEC-REVIEW.md (spec-guardian) — **GAPS** (intent aligned; CONTRACT/SECURITY freezes required)
- [ ] SECURITY.md (security-architect)
- [x] CONTRACT.md authored (nextjs-backend — upload action, validator, migration, DTO refresh; **Reviewed by FE** before BUILD)
- [ ] BUILD (media-pipeline-engineer + nextjs-backend + nextjs-frontend)
- [ ] VALIDATION.md (requirements-validator)
- [ ] QA.md (qa-engineer)

**Status:** PREP — TASKS ready for spec-guardian + security-architect. **Do not check USER_STORIES AC until VALIDATION PASS.**

---

## Open questions (for SPEC / SECURITY / CONTRACT)

1. **Validator module shape?** **PO lean:** extend **`validateAndPrepareMediaUpload`** with `assetType: 'generated_video' | 'avatar_reference'` union — shared pipeline, branch consent/count only for avatar_reference.
2. **Duration probe library?** **PO lean:** **`mp4box`** or **`ffprobe`** shell — CONTRACT freezes; must run server-side on buffer/path before persist.
3. **Replace completed API output?** **PO lean:** **P1 defer** — V1 upload only when no in-flight job; failed/null/completed-with-operator-intent handled case-by-case in CONTRACT (default: block upload when **`completed`** unless explicit replace flag P1).
4. **`parent_job_id` on manual after failure?** **PO lean:** **optional** — FE passes failed `jobId` when dialog opened from failed panel; orchestrator validates same `reel_script_id`.
5. **Multipart size limit on Vercel?** **PO lean:** enforce **`getMaxVideoBytes()`** (50 MiB default) in validator before persist; document Route Handler body limit in CONTRACT if action uses Route Handler proxy.
6. **Batch map refresh?** **PO lean:** **`revalidatePath('/operator/scripts')`** or return updated **`OperatorVideoJobSummaryDto`** from action — mirror retry success pattern from US-8.4.
7. **Manual job retry via US-8.4?** **PO lean:** **no** — retry button hidden for **`provider_key = manual`** (`canRetry: false` in mapper); new manual upload is the escape hatch.
8. **Generated video serve route?** **PO lean:** reuse existing authenticated media serve Route Handler from US-3.3 — extend ownership rules for **`generated_video`** operator/client scope per SECURITY.

No SPEC amendment assumed in PREP: US-8.3 implements SPEC §3 “upload manual (bypass costo)” and USER_STORIES Sprint 4 scope.
