## Validation Report — US-8.3

**Branch:** `feature/US-8.3-manual-upload`  
**Builds validated:** BE `eaa974a` · FE `fc6deca` · HEAD `25e7acb` (docs only after builds)  
**Sources:** `plan/USER_STORIES.md` § US-8.3 · `plan/stories/US-8.3/CONTRACT.md` · `TASKS.md` · `SECURITY.md`

### Verdict: PASS WITH NOTES

US-8.3 manual upload is implemented end-to-end per CONTRACT: Operator-only Server Action, sync orchestrator, shared validator extension (`generated_video` + mp4box duration probe), `operator_client_id` migration, zero-cost spend, FE dialog on `/operator/scripts`, and batch-map refresh. All US-8.3-targeted automated tests pass. One pre-existing US-3.3 delete test fails in the combined media suite (unrelated mock gap — see Notes).

---

### Acceptance Criteria

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Manual upload bypasses cost policy API charges | **PASS** | Orchestrator inserts job with `estimated_cost_cents: 0`, `actual_cost_cents: 0` (`lib/video-jobs/upload-manual-video-job.ts:223–224`); calls `finalizeGenerationCost({ mode: 'sync_insert', estimatedCostCents: 0, manualActualCostCents: 0, ... })` (`upload-manual-video-job.ts:255–266`); does **not** call `assertVideoJobBudgetAllowsSpend`. Manual adapter `estimateCost` returns 0 (`lib/providers/video/manual-upload-adapter.ts`). Test: budget-at-cap success (`upload-manual-video-job.test.ts` — `succeeds at budget cap via zero-cost skip`). |
| Downstream assembly treats manual raw video like provider output | **PASS** | Media INSERT uses `asset_type = generated_video` with `output_media_asset_id` on completed job (`upload-manual-video-job.ts:186–226`). `insertGeneratedVideoMediaAsset` switched from avatar_reference hack to `MEDIA_ASSET_TYPE_GENERATED_VIDEO` (`lib/video-jobs/insert-generated-video-media-asset.ts:45`). Metadata includes `source: 'manual_upload'`, `durationSec`, `detectedMime` (`upload-manual-video-job.ts:188–194`). |
| File type and duration validated | **PASS** | Shared validator extended with `assetType: 'generated_video'` union (`lib/media/upload-validation.ts:287–301`); mp4/quicktime magic bytes + size cap + required duration probe via `probeVideoDurationSec` (`lib/media/probe-video-duration.ts`, `upload-validation.ts:126–132`). Tests: `validateAndPrepareMediaUpload generated_video` accepts mp4, rejects jpeg and over-duration (`upload-manual-video-job.test.ts`). |
| Operator-only: endpoint/action rejects non-operator sessions server-side (403) | **PASS** | Server Action calls `requireOperator('action')` first (`lib/video-jobs/actions/upload-manual-video-job.ts:25–30`); maps to `FORBIDDEN` envelope. Route `/operator/scripts` gated by `operator/layout.tsx` `requireOperator("page")`. Test: non-operator → `FORBIDDEN` (`upload-manual-video-job.test.ts` — Server Action suite). |
| **[SEC] Manual upload applies the same file validation stack as US-3.3** | **PASS** | Single export `validateAndPrepareMediaUpload` in `lib/media/upload-validation.ts` (no fork). Server UUID storage key, magic-byte MIME, `getMaxVideoBytes()` cap, `MediaStorage.put` outside `public/` (`upload-manual-video-job.ts:166–171`). Forbidden client authority keys rejected (`find-forbidden-manual-upload-keys.ts`, action L35–37). |
| **[SEC] Manual uploads restricted to Operator role and recorded with uploader identity** | **PASS** | `operator_client_id` from `requireOperator()` session only (`actions/upload-manual-video-job.ts:70`; orchestrator L226). Migration + DB CHECK (`supabase/migrations/20260830700000_neuramark_video_jobs_operator_client_id.sql`). Test: orchestrator asserts `operator_client_id` on insert (`upload-manual-video-job.test.ts` — `completes sync job with zero cost and operator attribution`). |
| **[SEC] A manual job still goes through QA before approval — bypasses cost, not compliance** | **PASS** | No QA/approval flags set in orchestrator or action. `skipQa`, `autoApprove`, `skipBudgetCheck` in `FORBIDDEN_MANUAL_UPLOAD_AUTHORITY_KEYS` (`lib/contracts/manual-video-upload.ts:51–57`). CONTRACT non-goals document downstream US-10.1 / US-11.x gates (`CONTRACT.md` § Non-goals). |

---

### Convention Compliance

| Check | Status | Evidence |
|-------|--------|----------|
| EN + ES user-facing strings | **PASS** | `messages/en.json` and `messages/es.json` → `scripts.videoJob.manualUpload.*` (title, hint, submit, cancel, success, all error codes). Wired via `app/(app)/operator/scripts/page.tsx:159`. |
| PrimeReact-first UI | **PASS** | `ManualVideoUploadDialog` uses PrimeReact `Dialog`, `Button`, `Message` (`components/scripts/ManualVideoUploadDialog.tsx`). |
| Server Components default; minimal `"use client"` | **PASS** | Page is Server Component; client boundary limited to `ManualVideoUploadDialog.tsx`. Action/orchestrator are server-only. |
| Loading / pending / error / success states | **PASS** | Dialog disables submit while `pending` (`ManualVideoUploadDialog.tsx:149–175, 193`); maps error codes to i18n (`messageForUploadError`); success closes dialog + toast + batch merge (`ScriptsPageView.tsx:862–876`). |
| Auth via Next.js backend; no Supabase in browser | **PASS** | FE calls `uploadManualVideoJob` Server Action only; Supabase access in orchestrator/action server modules. |
| Backend maps to concrete FE consumer | **PASS** | Action consumed by `ManualVideoUploadDialog` on `/operator/scripts` expand row (`ScriptsPageView.tsx:1290–1297`). |
| `neuramark_` DB prefix | **PASS** | Migration `neuramark_video_jobs_operator_client_id` with index + CHECK. |
| CONTRACT frozen shapes | **PASS** | Error codes, forbidden keys, slot guards, gate order, DTO success shape (`OperatorVideoJobSummaryDto`), `revalidatePath('/operator/scripts')` (`actions/upload-manual-video-job.ts:76–78`), body limit 52mb (`next.config.ts:9–11`). |

---

### Tests

Command run:

```bash
npx tsx --test \
  lib/video-jobs/upload-manual-video-job.test.ts \
  lib/providers/video/manual-upload-adapter.test.ts \
  lib/media/media-assets.test.ts \
  lib/video-jobs/video-jobs.test.ts
```

| Suite | Result |
|-------|--------|
| `upload-manual-video-job.test.ts` (validator, orchestrator, action, migration) | **8/8 pass** |
| `manual-upload-adapter.test.ts` + registry | **2/2 pass** |
| `media-assets.test.ts` — US-8.3 (`generated_video` serve) | **pass** |
| `media-assets.test.ts` — US-3.3 (`deleteAvatarReferenceAsset`) | **1 fail** (see Notes) |
| `video-jobs.test.ts` (US-8.4 regression) | **pass** (no regressions) |
| **Combined** | **48/49 pass** |

---

### Gaps (what blocks PASS)

None for US-8.3 acceptance criteria or CONTRACT obligations.

---

### Scope Creep

None identified. Implementation stays within Operator manual upload on `/operator/scripts`: adapter stub, orchestrator, validator extension, migration, serve-route extension for `generated_video`, FE dialog, DTO mapper tweak (`canRetry: false` for manual in `retry-eligibility.ts:131–133`).

---

### Notes (PASS WITH NOTES rationale)

1. **US-3.3 delete test regression in combined run:** `deleteAvatarReferenceAsset` → `deletes own asset from disk + DB` fails because `isAvatarReferenceAssetReferencedByJob` hits the mock Supabase `from()` handler (no `neuramark_video_jobs` stub) and fail-closes to `true` → delete blocked. Not a US-8.3 deliverable; fix belongs to **nextjs-backend** (extend delete test mock with `isAssetReferencedByJob: async () => false` or video_jobs stub). US-8.3-specific media tests (`generated_video` serve) pass.

2. **Serve ownership vs CONTRACT wording:** Route checks `row.client_id !== operator.id` (`app/api/media/assets/[assetId]/route.ts:132–134`). CONTRACT names `$scriptsPageClientId`; V1 operator scripts resolve `clientId = operator.id` in `get-reel-scripts-for-week.ts:63`, so behavior matches current single-context operator flow. Multi-client operator impersonation would need a follow-up serve rule — out of US-8.3 V1 scope.

3. **TASKS gates:** `SECURITY.md` orchestrator gate remains `[ ]` in TASKS.md (process checkbox); security AC above are satisfied in code. PO should check USER_STORIES AC after QA.

---

### Recommended Next Actions

| Action | Owner |
|--------|-------|
| Fix `deleteAvatarReferenceAsset` test mock in `media-assets.test.ts` (stub job-reference gate) | **nextjs-backend** |
| Run **qa-engineer** security + regression pass on `feature/US-8.3-manual-upload` | **qa-engineer** |
| PO check off USER_STORIES § US-8.3 AC after QA CLOSE | **product-owner** |

---

*Validated 2026-08-30 by requirements-validator.*
