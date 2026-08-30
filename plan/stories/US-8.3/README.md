# US-8.3 — Manual video upload fallback

**Status:** PREP — story folder active; gates pending (`SECURITY.md` · `CONTRACT.md` · BUILD · VALIDATION · QA).

**As an** Operator, **I want** to upload a video file when API generation fails or is too expensive, **so that** production continues without blocking the client.

Ship **Operator-only manual video upload** on **`/operator/scripts`** Reel detail: extend the **US-3.3 shared upload validation stack** for **`generated_video`** ingest (video MIME magic bytes, size cap, duration probe); register catalog key **`manual`** as a **`VideoProviderAdapter`** with **zero-cost** semantics; **`uploadManualVideoJob()`** orchestrator writes the **same `neuramark_video_jobs` row shape** as API providers but completes **synchronously** (no poller); INSERT **`neuramark_media_assets`** (`asset_type = generated_video`); record spend via **`finalizeGenerationCost({ mode: "sync_insert", manualActualCostCents: 0 })`** (US-7.3 Phase B rule); **reuse US-8.4** `OperatorVideoJobSummaryPanel` status badges, cost DTO, and batch map refresh — add upload affordance only.

**Canonical acceptance criteria:** [`plan/USER_STORIES.md`](../../USER_STORIES.md) → US-8.3 (unchecked until VALIDATION).

**This folder:** [`plan/stories/US-8.3/`](./) — `README.md` · `TASKS.md` (gates: `SECURITY.md` · `CONTRACT.md` · `VALIDATION.md` · `QA.md` — create when story enters sprint).

**Branch:** `feature/US-8.3-manual-upload`

**Depends on:** [US-8.1](../US-8.1/) ✅ `VideoProviderAdapter` · registry · normalizers · [US-8.4](../US-8.4/) ✅ `neuramark_video_jobs` · status UI · spend hooks · [US-X.4](../US-X.4/) ✅ catalog row **`manual`** (`manualFallback: true`, `unitCostCents: 0`) · [US-7.2](../US-7.2/) ✅ manual excluded from auto-rank · recommendation footnote · [US-7.3](../US-7.3/) ✅ `manualActualCostCents: 0` · [US-3.3](../US-3.3/) ✅ `validateAndPrepareMediaUpload` export · [US-3.2](../US-3.2/) ✅ `assertActiveAvatarConsentForJobs` (own_avatar gate) · [US-14.5](../US-14.5/) ✅ `requireOperator()`.

**Unblocks:** Operator production continuity when API adapters fail or budget blocks retry · [US-9.1](../../USER_STORIES.md) assembly (manual raw video as primary input) · [US-8.4](../../USER_STORIES.md) Phase B retry path for manual jobs (optional — CONTRACT) · [US-7.4](../../USER_STORIES.md) roll-up includes manual `$0.00` actual rows.

---

## Scope in

| Area | What US-8.3 BUILD adds |
|------|------------------------|
| **FE** | **Manual upload** affordance on Reel expand-row (`ReelDetailPanel`): PrimeReact dialog + file picker (video only); validation hints (type, max size, max duration); wired to **`uploadManualVideoJob`** Server Action; on success refresh **`videoJobsByReelScriptId`** / expand-row job panel; **reuse** `OperatorVideoJobSummaryPanel` for status/cost (no duplicate badge component); EN/ES under **`scripts.videoJob.manualUpload.*`**. |
| **BE** | **`lib/providers/video/manual-upload-adapter.ts`** — register **`manual`** in registry; **`estimateCost` → 0**; vendor I/O methods documented sync-only (not poller-invoked). **`lib/video-jobs/upload-manual-video-job.ts`** — operator-only orchestrator: gates → validate → storage put → media INSERT → job INSERT (`status: completed`, `provider_key: manual`) → **`finalizeGenerationCost` sync_insert** with **`manualActualCostCents: 0`**. Extend **`validateAndPrepareMediaUpload`** (or sibling **`validateManualGeneratedVideoUpload`**) for **`generated_video`**: video MIME only, magic bytes, size, **duration ≤ policy cap** (probe ships here — US-3.3 defer closed). **`uploadManualVideoJob`** Server Action + optional Route Handler only if CONTRACT requires multipart boundary. Update **`insertGeneratedVideoMediaAsset`** to use **`generated_video`** asset type. |
| **DB** | Reuse **`neuramark_video_jobs`** + **`neuramark_media_assets`**. **Migration (minimal):** nullable **`operator_client_id`** on **`neuramark_video_jobs`** — **required when `provider_key = 'manual'`** (attribution SEC AC). No new tables. |
| **Implementers** | **media-pipeline-engineer** (manual adapter + upload orchestrator + validation extension) + **nextjs-backend** (`CONTRACT.md`, migration, Server Action, tests) + **nextjs-frontend** (upload dialog, i18n) (`docs/development/AGENT-ROSTER.md` Phase 4). |

## Scope out

| Story / topic | Why out |
|---------------|---------|
| **API provider bodies** (SadTalker, MuseTalk, Wan, HeyGen) | US-8.2 / US-8.5–8.7 — unchanged. |
| **New status UI / poller** | US-8.4 ✅ — reuse badges, cost panel, batch map. |
| **Cliente upload surfaces** | Operator-only; `requireOperator()` server-side. |
| **Bypass QA / approval** | Manual bypasses **API cost**, not US-10.1 compliance (SEC AC). |
| **Bypass own_avatar consent** | **`assertActiveAvatarConsentForJobs`** still runs when client visual mode is **`own_avatar`**. |
| **Auto-select manual in policy** | US-7.2 ✅ — **`manual`** never auto-ranked; explicit Operator path only. |
| **Assembly / FFmpeg** | US-9.x consumes completed job output like any provider. |
| **Productized virus scanning** | Same residual risk acceptance as US-3.3. |
| **Replace-in-place on completed API jobs** | V1: upload when slot has **no in-flight job**; replacing a **`completed`** API output is P1 defer unless CONTRACT adds explicit replace flow. |

## Canonical terms (CONTEXT)

Use **Subida manual**, **proveedor manual**, **Job de generación**, **download-and-own**, **coste cero**.  
_Evitar:_ client-supplied `provider_key`; treating manual upload as Cliente self-service; skipping QA because upload was manual; persisting raw client filenames as storage paths.

## What prior stories already shipped (do not duplicate)

| Source | Continuity |
|--------|------------|
| US-8.1 | **`VideoProviderAdapter`** four-method contract · registry factory — **no `manual` adapter registered yet** (explicit US-8.1 defer). |
| US-8.4 | **`neuramark_video_jobs` DDL** · **`OperatorVideoJobSummaryPanel`** · **`videoJobsByReelScriptId`** batch · **`GET /api/video-jobs/[jobId]`** · spend at create/complete — manual jobs **reuse row shape**; **skip poller** (sync complete). |
| US-3.3 | **`validateAndPrepareMediaUpload`** pipeline (consent/count/size/magic bytes/key) — **extend** for operator **`generated_video`**, do not fork. |
| US-7.3 | **`manualActualCostCents: 0`** on **`finalizeGenerationCost` sync_insert** · roll-up treats **`actual = 0`** as **`actual`** status. |
| US-7.2 | Catalog **`manual`** row · **`manualFallbackNoteKey`** on recommendation panel · **`resolveProvider(..., { allowManualFallback: true })`** for explicit selection only. |
| `insert-generated-video-media-asset.ts` | Currently inserts **`avatar_reference`** + `generatedVideo: true` metadata hack — **US-8.3 switches to `generated_video` enum** (already in migration). |

**US-8.3 adds the Operator escape hatch** — not a second job system, not a Cliente upload flow, not a policy auto-fallback.

## PO decisions frozen (2026-08-30)

1. **Branch:** **`feature/US-8.3-manual-upload`** from `main`.
2. **Entry point:** **`uploadManualVideoJob({ reelScriptId, clientId, file, parentJobId? })`** Server Action — **`requireOperator("action")`**; reject non-operator **403**; **`clientId`** from operator scripts context (server-validated against reel ownership — never trusted from browser alone).
3. **Manual adapter:** **`createManualUploadAdapter()`** in **`lib/providers/video/manual-upload-adapter.ts`**; register **`manual`** in **`createProviderRegistry`** / catalog bootstrap; **`estimateCost` → `{ estimatedCostCents: 0 }`**; **`createJob` / `getJobStatus` / `fetchAsset`** **not used** by upload orchestrator (throw **`MANUAL_UPLOAD_SYNC_ONLY`** if invoked — documents adapter completeness without poller coupling).
4. **Sync complete path:** Manual jobs INSERT with **`status: 'completed'`**, **`estimated_cost_cents: 0`**, **`actual_cost_cents: 0`**, **`output_media_asset_id`** set in same transaction — **no** `enqueueVideoJobPoll`.
5. **`external_job_id`:** Server-generated opaque id **`manual-{uuid}`** — satisfies UNIQUE `(client_id, provider_key, external_job_id)`; never client-supplied.
6. **Budget gate:** **`estimatedCostCents: 0`** — **`assertVideoJobBudgetAllowsSpend`** (or skip when estimate is 0 — CONTRACT picks one; **PO lean:** still call with 0 for audit consistency; must **never block** manual upload solely due to prior API spend exhausting budget).
7. **Consent gate:** When reel **`visualMode === 'own_avatar'`**, run **`assertActiveAvatarConsentForJobs(clientId)`** before accept — manual bypasses **cost**, not consent.
8. **Validation stack:** Extend shared validator for **`assetType: 'generated_video'`** — **video/mp4** and **video/quicktime** only (magic bytes); max bytes **`getMaxVideoBytes()`**; **duration probe required in US-8.3** (default **`getMaxVideoDurationSec()`** = 30s); **no** avatar-reference consent/count gates on this asset type (operator path); reuse storage key generation + **`MediaStorage.put`** pattern from US-3.3.
9. **Media asset:** **`asset_type = 'generated_video'`**; metadata includes **`originalFilename`**, **`detectedMime`**, **`sizeBytes`**, **`durationSec`**, **`source: 'manual_upload'`**.
10. **Job row attribution:** Migration adds **`operator_client_id uuid REFERENCES neuramark_clients(id)`** nullable on **`neuramark_video_jobs`**; **non-null when `provider_key = 'manual'`** (CHECK or app validation — CONTRACT freezes); stores Operator identity from **`requireOperator()`**.
11. **Lineage:** Optional **`parent_job_id`** when uploading after a **failed** API job for the same slot — operator may link; not required for first manual upload on empty slot.
12. **Attempt counter:** **`attempt = 1`** for standalone manual job; if **`parent_job_id`** set, **`attempt = parent.attempt + 1`** (mirror retry lineage semantics).
13. **Spend ledger:** **`finalizeGenerationCost({ mode: 'sync_insert', providerKey: 'manual', assetRole: 'talking_head', actualCostCents: 0, manualActualCostCents: 0, ... })`** — single sync path; no async poller finalize.
14. **FE surface:** **`ReelDetailPanel`** — add manual upload control **above or inside** `OperatorVideoJobSummaryPanel` wrapper; **show** when slot has **no `queued`/`processing`** job; **emphasize** when **`failed`** or retry blocked for budget; dialog copy references zero API cost; after success, panel shows **`completed`** via existing US-8.4 components (**provider label "Manual upload"** already in **`resolveProviderDisplayLabel`**).
15. **Retry UI:** US-8.4 retry button remains for **API failed** jobs; manual upload is **alternate path**, not a retry — both may appear when failed.
16. **Assembly downstream:** Completed manual job **`output_media_asset_id`** is consumed by US-9.1 same as SadTalker output — no special casing in US-8.3 beyond asset type **`generated_video`**.
17. **QA / compliance:** No US-8.3 code skips US-10.1 gates — document in SECURITY.md; manual jobs appear in operator job panel for audit.
18. **Tests:** Validator unit tests (MIME, size, duration); orchestrator tests (operator gate, consent, job row shape, spend 0); IDOR (foreign reel → 404); no live storage in CI (mock **`MediaStorage`**).
19. **Implementers:** **media-pipeline-engineer** + **nextjs-backend** + **nextjs-frontend**; **CONTRACT before BUILD**; FE signoff on upload action + DTO refresh.

---

## Gates (orchestrator)

- [ ] SPEC-REVIEW.md (spec-guardian — cross-cutting vs SPEC §3 upload manual)
- [ ] SECURITY.md (security-architect — operator gate, validation stack, attribution)
- [ ] CONTRACT.md (nextjs-backend — upload action, validator extension, migration, DTOs; **Reviewed by FE** before BUILD)
- [ ] BUILD (media-pipeline-engineer + nextjs-backend + nextjs-frontend)
- [ ] VALIDATION.md (requirements-validator)
- [ ] QA.md (qa-engineer)

**Status:** PREP complete when README + TASKS committed on feature branch. **Next gate:** spec-guardian SPEC-REVIEW → security-architect SECURITY.md → nextjs-backend CONTRACT.md.

---

## Acceptance criteria mapping (PREP — unchecked until VALIDATION)

| USER_STORIES § US-8.3 AC | Planned deliverable |
|--------------------------|---------------------|
| Manual upload bypasses cost policy API charges | `estimated_cost_cents = 0`; no vendor API call; spend sync_insert actual 0 |
| Downstream assembly treats manual raw video like provider output | `output_media_asset_id` + `generated_video` asset; same job terminal shape |
| File type and duration validated | Extended validator + duration probe |
| Operator-only: 403 non-operator | `requireOperator()` on Server Action |
| [SEC] Same validation stack as US-3.3 | Extend `validateAndPrepareMediaUpload` / shared module — magic bytes, size, server key, storage outside web root |
| [SEC] Operator role + uploader identity recorded | `operator_client_id` on manual job rows |
| [SEC] Manual job still goes through QA before approval | No QA bypass in BUILD; SECURITY documents downstream US-10.1 gate |
