# US-9.1 — Assemble final 9:16 Reel

**Priority:** P0  
**Depends on:** US-8.4 ✅ · US-6.1 ✅ · US-9.3 ✅ · US-8.2/8.6/8.3 ✅ · **US-8.5 ✅** (Phase B hard — owned `broll` clips). Phase A ✅.  
**Acceptance criteria:** `plan/USER_STORIES.md` § US-9.1 (do **not** redefine; do **not** uncheck Phase A AC in PREP; Phase B re-validates same AC).  
**Implementers (Phase B):** **media-pipeline-engineer** + **nextjs-backend** + thin **nextjs-frontend**.  
**Canonical terms:** **Ensamblado** · **Job de generación** · **Paquete de guion** · **download-and-own** · **Reel 9:16**. Avoid CONTEXT _Evitar_ list in product-facing copy.  
**Phase B doc:** [`PHASE-B.md`](./PHASE-B.md).

## Out of scope (do not implement here)

- **US-9.2** subtitles, logo, cover frame (second FFmpeg pass).
- **US-8.5** Wan adapter / `createBrollVideoJobs` (✅ CLOSED — consume clips only).
- **Talking-head B-roll overlays** · **full rewind FX** · **new story ID**.
- **US-10.1** QA agent · **US-11.x** approval/publish UI.
- **Weekly cycle** auto-assemble cron (integrations-engineer / ADR-0001).
- **Cliente** assemble trigger.
- **Multiple templates** / template admin UI.
- **Assembly spend ledger** lines (US-7.3 Phase B defer unless CONTRACT adds `$0` stub).
- **Live FFmpeg in CI** — unit-test filter builders + mocked spawn; integration smoke manual/post-QA.
- **RBAC** beyond `requireOperator()`.

## Scope split

| Concern | Owner |
|---------|--------|
| `neuramark_assembled_reels` migration | **US-9.1** DB |
| `assembled_reel` media asset type + insert helper | **US-9.1** BE |
| `createAssemblyJobForReelScript()` orchestrator | **US-9.1** BE |
| FFmpeg normalize pipeline (`reel_v1_basic`) | **US-9.1** worker (**media-pipeline-engineer**) |
| Fly worker assembly loop | **US-9.1** worker |
| Dev `in_process` assembly poll seam | **US-9.1** BE |
| `GET /api/assembly-jobs/[jobId]` | **US-9.1** BE |
| `assembleReelForScript` Server Action | **US-9.1** BE |
| Assembly status + preview on `/operator/scripts` | **US-9.1** FE |
| Batch `assemblyByReelScriptId` on week load | **US-9.1** BE |
| Primary video resolution (latest completed primary job) | **US-9.1** BE (reads US-8.4 rows) |
| Voiceover resolution / remux edge case | **US-9.1** BE + worker |
| B-roll multi-clip stitch | **Phase B** (this PREP — US-8.5 ✅) |
| `editing_hints` cold open / rewind FX | Phase B: numeric cold-open only; rewind still out |
| TTS synthesis | **US-9.3** ✅ |
| Video job create/poll | **US-8.4** ✅ |

## PO decisions (freeze in CONTRACT unless SECURITY / SPEC vetoes)

| Topic | Decision |
|-------|----------|
| Branch (Phase A) | **`feature/US-9.1-assemble-reel`** (historical) |
| Branch (Phase B) | **`feature/US-9.1-phase-b-broll-stitch`** |
| Template id | **`reel_v1_basic`** (only template in V1) |
| Output resolution | **1080×1920** (9:16) |
| Idempotency | Unique completed assembly per **`(reel_script_id, script_updated_at, input_fingerprint)`**; re-call returns existing row |
| `input_fingerprint` | `sha256(primary_video_asset_id + "\|" + (voiceover_asset_id ?? "") + "\|" + template_id)` hex |
| Duration tolerance | **`NEURAMARK_ASSEMBLY_DURATION_TOLERANCE_SEC`** default **`2`** |
| Phase A modalidades | **`own_avatar`**, **`generic_avatar`**, any with completed **primary** (incl. manual) |
| Phase A faceless | **`ASSEMBLY_INPUTS_INCOMPLETE`** until primary exists (US-8.5 or manual) |
| Talking-head audio | Use **primary MP4 audio track**; remux voiceover only if probe shows no audio |
| Trigger input | **`{ reelScriptId }` only** — forbidden: `templateId`, asset ids, URLs, `clientId` |
| Operator gate | **`requireOperator("handler")`** first on mutate/read routes |
| Stale timeout | **`NEURAMARK_ASSEMBLY_STALE_TIMEOUT_MIN`** default **`30`** |
| Poll mode env | **`ASSEMBLY_JOB_POLL_MODE`** — `fly` (default) \| `in_process` (dev) |
| Worker entry | **`worker/assembly-jobs.ts`** (new) — mirror `worker/video-jobs.ts` |
| FFmpeg invocation | **`spawn('ffmpeg', args[])`** — no shell string |
| Temp workspace | **`/tmp/neuramark-assembly/{assemblyJobId}/`** — cleaned in `finally` |
| Output asset type | **`assembled_reel`** on **`neuramark_media_assets`** |
| Status values | `queued` \| `processing` \| `completed` \| `failed` |
| Implementers | **media-pipeline-engineer** (FFmpeg + worker) + **nextjs-backend** (DDL, orchestrator, API) + **nextjs-frontend** (UI) |

### Phased BUILD checklist

| Phase | Deliverables |
|-------|----------------|
| **A** ✅ | DDL · orchestrator · Phase A FFmpeg graph · worker loop · Operator UI · idempotency · duration AC · SEC guards |
| **B** ✅ CLOSED | Faceless B-roll concat · fingerprint + resolver · degrade · thin FE Assemble gate · optional numeric cold-open · see [`PHASE-B.md`](./PHASE-B.md) |

**Phase B branch:** `feature/US-9.1-phase-b-broll-stitch` · **Depends on:** US-8.5 ✅ · Phase A ✅  
**Phase B freezes:** [`PHASE-B.md`](./PHASE-B.md) B1–B14 (do not contradict in BUILD).

---

## Phase B checklist (CLOSED 2026-08-31)

### Frontend (nextjs-frontend) — Phase B ✅

**Consumer:** `/operator/scripts` assembly panel (existing).

- [x] Enable **Assemble Reel** when server `canAssemble` (faceless stitch or primary/degrade) — dropped primary-only button gate. (**FE BUILD** 2026-08-31)
- [x] **B12 fix:** use null-job readiness companion `canAssemble` for first-time faceless (no prior job / no primary); do not require `hasPrimaryVideo`. (2026-08-31)
- [x] Reuse existing **preview player** for stitched `assembled_reel` — **no** new stitch UI / B-roll strip. (confirmed at FE signoff — no new route)
- [x] EN/ES: `facelessWaitingForClips`, `facelessMissingVoiceover`, `failure.fingerprintMismatch` (signoff)
- [x] No Cliente routes · no FFmpeg / clip-list details in UI. (confirmed at FE signoff)
- [x] **CONTRACT Phase B Reviewed by FE** — approved 2026-08-31

### Backend / API (nextjs-backend) — Phase B ✅

**Concrete consumers:** FE Assemble enablement · worker stitch path · downstream US-9.2/10.1/11.1 (unchanged output shape).

- [x] CONTRACT Phase B amendment: faceless resolve rules, fingerprint shape, error codes, concat seam, fixtures. (`CONTRACT.md` § Phase B — 2026-08-31; Reviewed by FE approved)
- [x] **B12:** week-batch null-job readiness companion via `mapNullJobAssemblyReadinessDto` / `getAssemblyJobsForReelScripts` — `canAssemble` when faceless resolve would succeed (broll+VO) with no assembly row. (2026-08-31)
- [x] Unit tests: first-time faceless `canAssemble=true` (`assembly-readiness.phase-b.test.ts`). (2026-08-31)
- [x] Extend **`resolveAssemblyInputs`** (or sibling): for faceless, load up to **8** completed owned `asset_role = broll` outputs ordered by job **`created_at ASC`**; talking-head path unchanged (ignore broll).
- [x] Zero completed broll → degrade to Phase A primary if present, else `ASSEMBLY_INPUTS_INCOMPLETE`.
- [x] Extend **`input_fingerprint`** with ordered broll asset ids + path tag (`primary` vs `broll_stitch`) — CONTRACT exact string.
- [x] Orchestrator: pass broll asset id list / path into assembly row or worker-readable fields per CONTRACT (lean: fingerprint + nullable `primary_video_asset_id` when stitch-only).
- [x] Unit tests: faceless stitch resolve, degrade, talking-head ignores broll, ownership fail-closed, forbidden keys unchanged.
- [x] **DDL required (CONTRACT Option A):** nullable `primary_video_asset_id` + `broll_asset_ids uuid[]` + `assembly_path_tag` — BUILD migration (clip-set determinism).

### Worker / FFmpeg (media-pipeline-engineer) — Phase B ✅

- [x] Implement **`lib/assembly/ffmpeg/build-broll-concat-args.ts`** — pure `string[]` from local clip paths + voiceover + target/tolerance (+ optional cold-open seconds); **no** script text in argv.
- [x] Wire **`runAssemblyJob`** faceless/`broll_stitch` branch: download owned clips → concat/normalize 1080×1920 → trim/pad → upload → UPDATE job.
- [x] FFmpeg via existing **`runFfmpeg` / `spawn(..., { shell: false })`** only; temp under assembly workspace; cleanup `finally`.
- [x] Partial clip sets OK; never wait for failed/queued broll jobs.
- [x] Golden tests for concat args; mocked spawn; grep: no `fetch(` / no shell interpolation.
- [x] Optional: safe integer parse of `cold_open_notes` for lead trim only — CONTRACT bounds; skip if unparsable.

### Security (security-architect — Phase B amend)

- [x] Multi-clip ownership / tenancy before each Storage read (`SECURITY.md` Phase B)
- [x] Concat demuxer / filter_complex injection surface (paths only)
- [x] Fingerprint / IDOR parity with Phase A
- [x] No SiliconFlow CDN fetch at assembly time

### Phase B contract-first sequence ✅ CLOSED

1. **product-owner** — Phase B PREP ✅ (`PHASE-B.md` · this checklist · SPRINT-STATE)
2. **spec-guardian** — SPEC-REVIEW amendment (S3.M10 stitch) ✅
3. **security-architect** — SECURITY.md amendment ✅
4. **nextjs-backend** — CONTRACT.md Phase B + **Reviewed by FE** ✅
5. **BUILD** — media-pipeline-engineer ∥ nextjs-backend ∥ thin nextjs-frontend ✅ (`c3a9c19` · `80652c2` · fix `1106420`)
6. **requirements-validator** — VALIDATION-PHASE-B.md ✅ PASS WITH NOTES `6d13f4b` (5/5 + 16/16)
7. **qa-engineer** — QA-PHASE-B.md ✅ APPROVE WITH CONDITIONS `37d0dcb` (0 Critical/High)

---

## Frontend (nextjs-frontend) — Phase A ✅

**Consumer surfaces:** `/operator/scripts` expand row (same pattern as video job panel).

- [x] Extend Reel production panel with **assembly section**: status badge (`queued` / `processing` / `completed` / `failed`), `failure_reason` (sanitized), duration vs target display when completed.
- [x] **Assemble Reel** button — calls `assembleReelForScript({ reelScriptId })`; disabled when primary video job not `completed` (UI convenience — server enforces).
- [x] **Re-assemble** when script `updated_at` or inputs changed — confirm dialog (new assembly run).
- [x] **Preview player** — `<video>` via authenticated assemble output URL (`GET /api/media/assets/[assetId]` or CONTRACT path); loading/error states.
- [x] Poll assembly status: interval refresh or reuse batch map from `getReelScriptsForWeek` — CONTRACT picks one round-trip (mirror video jobs).
- [x] EN/ES keys: **`scripts.assembly.title`**, **`scripts.assembly.status.*`**, **`scripts.assembly.actions.assemble`**, **`scripts.assembly.actions.reassemble`**, **`scripts.assembly.errors.inputsIncomplete`**, **`scripts.assembly.preview`**, **`scripts.assembly.durationTarget`**.
- [x] No Cliente routes · no cost fields · no FFmpeg details in UI.

---

## Backend / API (nextjs-backend)

**Concrete consumers:** FE assemble button · FE preview player · FE status badges · downstream US-9.2/10.1/11.1 (assembled reel id + output asset id).

- [x] **`lib/contracts/assembly-job.ts`** (CONTRACT) — request/response Zod schemas, status enum, error codes.
- [x] Migration **`neuramark_assembled_reels`** + enum value **`assembled_reel`** on `neuramark_media_asset_type` (CONTRACT verbatim DDL).
- [x] **`lib/assembly/create-assembly-job-for-reel-script.ts`** — orchestrator:
  - `requireOperator()` → load script row (`target_duration_sec`, `updated_at`, `modalidad`, `client_id`)
  - Resolve latest **completed** primary video job → `primary_video_asset_id`
  - Resolve latest voiceover asset (optional) for fingerprint / remux edge
  - Compute `input_fingerprint` · check idempotency → return existing if completed
  - INSERT assembly row `status = queued` · `template_id = reel_v1_basic`
  - `enqueueAssemblyJob(assemblyJobId)`
- [x] **`lib/assembly/load-assembly-job.ts`** · **`mapOperatorAssemblyJobDto`**
- [x] **`lib/assembly/resolve-assembly-inputs.ts`** — ownership-verified asset load; modalidad gates per Phase A/B
- [x] **`insertAssembledReelMediaAsset()`** — mirror video/voiceover insert pattern
- [x] **`GET /api/assembly-jobs/[jobId]`** — operator + client scope → 404 foreign
- [x] **`assembleReelForScript`** Server Action — thin wrapper over orchestrator
- [x] Extend **`getReelScriptsForWeek`** success DTO with **`assemblyByReelScriptId`** (latest job per script)
- [x] **`findForbiddenAssemblyKeys`** — reject client-supplied asset/template/URL fields
- [x] **`applyAssemblyJobUpdate`** · **`enqueueAssemblyJob`** · **`markStaleAssemblyJobsFailed`**
- [x] Extend **`GET /api/media/assets/[assetId]`** for `assembled_reel` Operator serve
- [x] Unit tests: forbidden keys, config defaults, args builder, spawn contract, grep guards

---

## Database (nextjs-backend)

- [x] Table **`neuramark_assembled_reels`** (CONTRACT freezes columns):
  - `id`, `client_id`, `reel_script_id`, `template_id`, `status`
  - `primary_video_asset_id`, `voiceover_asset_id` (nullable FKs → `neuramark_media_assets`)
  - `output_media_asset_id` (nullable FK)
  - `script_updated_at` (timestamptz — copy from script at enqueue)
  - `input_fingerprint` (text)
  - `target_duration_sec`, `actual_duration_sec` (nullable until complete)
  - `failure_reason` (nullable text, sanitized codes)
  - `created_at`, `updated_at`
- [x] Indexes: `(client_id, reel_script_id)`, `(status, updated_at)` for worker poll
- [x] Unique partial index (CONTRACT): one **completed** row per idempotency triple — or app-level check + documented race handling
- [x] RLS deny-by-default (service-role worker + server helpers only)
- [x] Extend **`neuramark_media_asset_type`**: **`assembled_reel`**
- [x] Storage key pattern: **`neuramark/{clientId}/{reelScriptId}/assembled-{uuid}.mp4`**

---

## Worker / FFmpeg (media-pipeline-engineer)

**Runtime:** Fly.io Docker with FFmpeg (ADR-0003). Vercel never runs FFmpeg.

- [ ] **`lib/assembly/ffmpeg/build-reel-v1-basic-args.ts`** — pure function: local input paths + target duration + tolerance → `string[]` args (unit-tested, no spawn).
- [ ] **`lib/assembly/run-assembly-job.ts`** — load job row → download inputs from Storage to temp dir → probe duration/codecs → build args → spawn → probe output → upload → INSERT media → UPDATE job → cleanup temp.
- [ ] **`lib/assembly/probe-media-streams.ts`** — reuse/extend `probe-video-duration` patterns; detect missing audio stream.
- [ ] **`lib/assembly/mark-stale-assembly-jobs-failed.ts`** — sweeper (worker loop or shared cron hook).
- [ ] **`lib/assembly/enqueue-assembly-job.ts`** — `in_process` fire-and-forget like video jobs.
- [ ] **`worker/assembly-jobs.ts`** — long-poll `queued`/`processing` rows; call `runAssemblyJob`.
- [ ] Phase A filter graph (CONTRACT freezes): scale+crop **1080×1920**, **`libx264`**, **`aac`**, trim/pad to target ± tolerance.
- [ ] Phase B: **`lib/assembly/ffmpeg/build-broll-concat-args.ts`** — implement in Phase B BUILD (see checklist above).
- [ ] Tests: args builder snapshots; mocked spawn; no live FFmpeg in CI.
- [ ] Worker env: Supabase service-role, Storage bucket, **`ASSEMBLY_JOB_POLL_MODE`**, region **`iad`** note in README/deploy docs (out of story code if no fly.toml yet).

---

## Security (security-architect — SECURITY.md gate)

Input for SECURITY.md (not implemented in PREP):

- [ ] FFmpeg command injection surface (args-array, no user text in filters Phase A)
- [ ] Path traversal on temp files / storage keys
- [ ] IDOR on `GET /api/assembly-jobs/[jobId]` and media serve for `assembled_reel`
- [ ] Worker tenancy — job row `client_id` must match all input asset `client_id`
- [ ] SSRF — no HTTP fetch of asset URLs at assembly time
- [ ] Deny client-supplied `primary_video_asset_id` / `voiceover_asset_id` on trigger

---

## Contract-first sequence

1. **product-owner** — this PREP ✅  
2. **spec-guardian** — `SPEC-REVIEW.md` (expect GAPS: US-9.2 split, Phase B editing_hints, URL column naming)  
3. **security-architect** — `SECURITY.md`  
4. **nextjs-backend** — `CONTRACT.md` (DDL, orchestrator steps, worker seam, DTOs, error codes, fixtures)  
5. **nextjs-frontend** — Reviewed by FE line in CONTRACT  
6. **BUILD** — media-pipeline-engineer (worker + FFmpeg) ∥ nextjs-backend (migration, API) ∥ nextjs-frontend (UI)  
7. **requirements-validator** — `VALIDATION.md`  
8. **qa-engineer** — `QA.md`

---

## Carry-forwards / reuse (do not reinvent)

- Video job poll pattern: `lib/video-jobs/enqueue-video-job-poll.ts`, `poll-video-job-until-terminal.ts`, `worker/video-jobs.ts`.
- Media insert: `lib/video-jobs/insert-generated-video-media-asset.ts`, `lib/media/insert-voiceover-media-asset.ts`.
- Duration probe: `lib/media/probe-video-duration.ts`.
- Operator scripts batch maps: `get-video-jobs-for-reel-scripts.ts` pattern for assembly.
- Media serve: `app/api/media/assets/[assetId]/route.ts` — extend allowlist for assembled MP4.
- Auth: `requireOperator()` from US-14.5.

---

## Test plan (BUILD)

| Area | Tests |
|------|-------|
| Args builder | Golden tests for 9:16 crop, trim, pad |
| Orchestrator | Idempotency hit/miss; incomplete inputs; forbidden keys |
| Worker | Mocked spawn + Storage; stale marker |
| FE | Optional: assembly panel states with fixture DTO |
| E2E manual | Operator: completed SadTalker job → Assemble → preview 1080×1920 MP4 |

---

## Downstream contracts to keep stable

| Consumer | Needs |
|----------|-------|
| US-9.2 | `assembled_reels.output_media_asset_id` as FFmpeg input |
| US-10.1 | `assembled_reels.id` |
| US-11.1 | Assembled video serve URL + metadata (duration, 9:16) |
| integrations-engineer | `createAssemblyJobForReelScript` callable from cron (future — same orchestrator) |
