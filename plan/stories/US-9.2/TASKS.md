# US-9.2 — Add subtitles, logo, and cover

**Priority:** P0  
**Depends on:** US-9.1 ✅ assembled base · US-2.2 ✅ Ficha viva · US-5.1 ✅ `on_screen_text` + `voiceover_text` · US-3.3 ✅ upload stack · US-14.5 ✅  
**Acceptance criteria:** `plan/USER_STORIES.md` § US-9.2 (source of truth — Phase A AC stay **[x]**; Phase B closes deferred polish only — do **not** uncheck)  
**Implementers:** **media-pipeline-engineer** + **nextjs-backend** + **nextjs-frontend** (`docs/development/AGENT-ROSTER.md` Phase 4). **No content-agents-engineer** · **No integrations-engineer** in default BUILD.  
**Canonical terms:** **Ensamblado** · **Paquete de guion** · **texto en pantalla** · **Ficha viva** · **Reel 9:16** · **download-and-own**. Avoid CONTEXT _Evitar_ list in product-facing copy.  
**Active slice:** none (Phase A/B/B-M1 ✅ CLOSED). Last: **Phase B-M1 CLOSED** — [`PHASE-B-M1.md`](./PHASE-B-M1.md) · branch `feature/US-9.2-b-m1-voiceover-timing-hash` · sprint `US-9.2-B-M1`. Phase B ✅ CLOSED — [`PHASE-B.md`](./PHASE-B.md).

## Out of scope (do not implement here)

- **US-9.1** primary assembly FFmpeg (`reel_v1_basic` normalize) — input consumer only.
- **Soft subtitles** / WebVTT sidecar / player caption tracks.
- **STT / ASR** subtitle generation from voiceover audio.
- **TTS / provider word-level timestamps** — V1 has none; timing = VO word partition only.
- **Custom font upload / second font weight** — further defer (bundled DejaVu Sans Bold only).
- **Preview thumbnail strip** — further defer.
- **Cliente `/profile` coverFrameSec UI** — Operator override only (Phase B).
- **Logo on Preferencias** — Ficha viva only.
- **Cliente branding trigger** — Operator apply/re-brand only; Cliente sets logo + defaults.
- **US-10.1** QA rules · **US-11.x** approval UI · **weekly cron** auto-brand.
- **Live FFmpeg in CI** — args builder snapshots + mocked spawn.
- **RBAC** beyond `requireOperator()` + Cliente own-profile scope.

## Scope split

| Concern | Owner |
|---------|--------|
| `logo_asset_id` + `assembly_config` on `neuramark_business_profiles` | **US-9.2** DB |
| `client_logo` + `cover_frame` media asset types + storage regex | **US-9.2** DB/BE |
| Branding columns on `neuramark_assembled_reels` | **US-9.2** DB |
| Logo upload/delete Server Actions (Cliente) | **US-9.2** BE |
| `updateAssemblyConfigDefaults` Server Action (Cliente) | **US-9.2** BE |
| `applyBrandingForAssembly` Server Action (Operator) | **US-9.2** BE |
| Auto-chain branding after assembly `completed` | **US-9.2** BE |
| Subtitle beat resolver from `on_screen_text` | **US-9.2** BE |
| `buildReelV1BrandingArgs()` + `runBrandingJob()` | **US-9.2** worker (**media-pipeline-engineer**) |
| Worker poll loop extension | **US-9.2** worker |
| Ficha logo + defaults UI (`/profile`) | **US-9.2** FE |
| Operator branding panel (`/operator/scripts`) | **US-9.2** FE |
| Media serve extension (`client_logo`, `cover_frame`, branded reel) | **US-9.2** BE |
| Shared upload validator extension (`client_logo`) | **US-9.2** BE |
| US-9.1 base assembly | **US-9.1** ✅ |

## PO decisions (freeze in CONTRACT unless SECURITY / SPEC vetoes)

| Topic | Decision |
|-------|----------|
| Branch (Phase A) | **`feature/US-9.2-subtitles-logo-cover`** (merged) |
| Branch (Phase B) | **`feature/US-9.2-phase-b-subtitle-cover`** (merged) |
| Branch (Phase B-M1) | **`feature/US-9.2-b-m1-voiceover-timing-hash`** |
| Subtitle source | **`on_screen_text`** newline beats from linked `reel_script_id` — no STT |
| Subtitle mode V1 | **Burn-in only** — FFmpeg subtitles/ASS or drawtext on output MP4 |
| Beat timing V1 | Equal split (Phase A ✅). **Phase B:** VO word-partition — see PHASE-B.md |
| Logo surface | **`/profile` Ficha viva** — not Preferencias |
| Logo column | **`neuramark_business_profiles.logo_asset_id`** → `client_logo` media row |
| Logo optional | Skip overlay when null or `logoEnabled: false`; no watermark template |
| Logo placement | Top-right; max 12% frame width; 48px padding |
| Cover timing | Default **`coverFrameSec: 1.0`** on branded output |
| Cover asset | **`cover_frame`** JPEG; `cover_media_asset_id` on assembly row |
| Client defaults JSON | **`assembly_config`**: `{ subtitlesEnabled, logoEnabled, coverFrameSec }` |
| Per-job snapshot | **`branding_config`** on assembly row + idempotency hash |
| Operator toggles | **`subtitlesEnabled` / `logoEnabled`** for next branding run — not CSS overlay |
| Trigger | Auto-chain post-assembly + Operator **`applyBrandingForAssembly({ assemblyJobId, … })`** |
| Trigger input (Phase A) | **`{ assemblyJobId, subtitlesEnabled?, logoEnabled? }`** — Phase B adds optional **`coverFrameSec?`** (numeric bounds only) |
| Output lineage | **`pre_branding_output_media_asset_id`** before swap; branded MP4 → `output_media_asset_id` |
| Branding status | `null` \| `queued` \| `processing` \| `completed` \| `failed` \| `skipped` |
| Typography | DejaVu Sans Bold 48px; lower-third y 1280–1520; 90% width; 2 lines/beat; black@0.55 box |
| Subtitle sanitize | Escape injection chars; temp subtitle file — no raw text in argv (**[SEC]**) |
| Logo upload | Shared validator; image MIME magic bytes; 2 MiB max; server key (**[SEC]**) |
| Operator gate | **`requireOperator("handler")`** on apply/re-brand + Operator serve paths |
| Cliente gate | **`requireActive("handler")`** on logo + assembly_config mutations |
| FFmpeg | **`spawn('ffmpeg', args[], { shell: false })`** — media-pipeline-engineer |
| Temp workspace | **`/tmp/neuramark-branding/{assemblyJobId}/`** — cleaned in `finally` |
| Implementers | **media-pipeline-engineer** + **nextjs-backend** + **nextjs-frontend** |

### `assembly_config` / `branding_config` JSON sketch (CONTRACT freezes Zod)

```ts
export const assemblyConfigSchema = z
  .object({
    subtitlesEnabled: z.boolean().default(true),
    logoEnabled: z.boolean().default(true),
    coverFrameSec: z.number().min(0).max(45).default(1.0),
  })
  .strict();

// branding_config extends with server fields at enqueue:
type BrandingConfigSnapshot = z.infer<typeof assemblyConfigSchema> & {
  subtitleBeatCount: number;
  subtitleSourceHash: string; // sha256 hex of normalized beat lines
};
```

### Branding idempotency fingerprint (CONTRACT freezes)

```ts
// brandingFingerprint = sha256(
//   pre_branding_output_media_asset_id + "|" +
//   stableStringify(branding_config) + "|" +
//   subtitleSourceHash
// )
```

### Subtitle beat resolver sketch (CONTRACT freezes)

```ts
function resolveSubtitleBeats(onScreenText: string): string[] {
  return onScreenText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
// beatDurationSec = target_duration_sec / beats.length
// Phase B: VO-proportional durations via computeVoProportionalBeatTimings()
```

### Phased BUILD checklist

| Phase | Deliverables |
|-------|----------------|
| **A** ✅ | DDL · logo upload Ficha · assembly_config defaults · branding worker · auto-chain · Operator panel · cover export · idempotency · SEC guards · mobile safe-zone AC |
| **B** ✅ CLOSED | VO-proportional timing from `voiceover_text` · Operator per-reel `coverFrameSec` override · SEC re-verify. **Out residual:** second font · thumbnail strip · Cliente cover UI |
| **B-M1** ✅ CLOSED | Worker `voiceoverTimingHash` re-check before VO-proportional timings (QA-PHASE-B Medium #1). FE/DB none. media `1b2a8e7` · BE `00df642` · docs `8c4e8da` |

### Phase B PO freezes (binding — full table in PHASE-B.md)

| Topic | Decision |
|-------|----------|
| Story ID | **US-9.2-B** (same story Phase B) |
| Timing source | Contiguous **word partition** of `voiceover_text` → durations; text still sanitized `on_screen_text` |
| Timing fallback | Equal split when VO empty / zero words |
| Not used | TTS timestamps · ASR · client cue lists |
| `coverFrameSec` store | Existing `assembly_config` + `branding_config` — **no new column** |
| Operator UI | **InputNumber** on branding panel; optional on `applyBrandingForAssembly` |
| Bounds | Zod **`min(0).max(45)`** + seek clamp to duration − 0.05s |
| Sanitization | Unchanged **[SEC]** — VO never in ASS dialogue / argv |
| FE toggles | Subtitle/logo **already exist**; add cover picker only |

---

## Phase B checklist (CLOSED 2026-08-31)

### Frontend (nextjs-frontend) — Phase B ✅

**Surface:** `/operator/scripts` — extend existing `OperatorAssemblyPanel` branding section.

- [x] **Cover frame `InputNumber`** (seconds, step **0.1**, min 0, max 45) next to subtitle/logo toggles; seed from `job.brandingConfig.coverFrameSec` else client default else **1.0**.
- [x] Wire **Apply branding** / **Re-brand** to pass optional **`coverFrameSec`** (with existing `subtitlesEnabled` / `logoEnabled`).
- [x] Disable control while branding in-flight / panel busy (same as toggles).
- [x] EN/ES under **`scripts.branding.coverFrame*`** (label, hint, validation).
- [x] **Do not** rebuild subtitle/logo toggles (Phase A ✅). **No** Cliente Ficha cover control. **No** thumbnail strip.
- [x] **CONTRACT Phase B Reviewed by FE** — approved 2026-08-31

### Backend / API (nextjs-backend) — Phase B ✅

**Concrete consumers:** Operator branding panel · Fly branding worker · auto-chain (defaults only).

- [x] Load **`voiceover_text`** with script beats in branding job load path (`load-branding-job` / create branding job).
- [x] **`computeVoProportionalBeatTimings({ beatCount, targetDurationSec, voiceoverText })`** pure helper — contiguous word partition; fallback equal split; unit tests.
- [x] Extend **`buildAssFromBeats`** (or caller) to accept explicit `beatTimings[]`; keep equal-split as default/fallback.
- [x] Amend **`applyBrandingForAssemblyRequestSchema`**: optional **`coverFrameSec: z.number().min(0).max(45)`**; merge into snapshot (override defaults when provided).
- [x] Remove **`coverFrameSec` / `cover_frame_sec`** from apply forbidden authority keys (SECURITY amend); keep other forbidden keys.
- [x] Auto-chain: still use client **`assembly_config.coverFrameSec`** only (no Operator override).
- [x] Fingerprint: include **`voiceoverTimingHash`** so VO text changes invalidate idempotency (CONTRACT freezes exact input).
- [x] Unit tests: partition math, fallback, cover override merge, forbidden keys, fingerprint VO change.

### Worker / media pipeline (media-pipeline-engineer) — Phase B ✅

- [x] Branding run uses VO-proportional timings when VO present; equal fallback otherwise.
- [x] Cover extract: clamp **`coverFrameSec`** to **`[0, max(0, durationSec - 0.05)]`** (measured branded duration preferred).
- [x] Golden tests: proportional ASS Dialogue timestamps; clamp seek args; sanitizer regression fixtures unchanged.
- [x] **spawn args-array only** — no VO / beat strings in argv.

### Database — Phase B ✅

- [x] **None** — reuse `assembly_config` / `branding_config` JSON.

---

## Phase B-M1 checklist (CLOSED 2026-08-31)

**Source:** [`PHASE-B-M1.md`](./PHASE-B-M1.md) · QA-PHASE-B Medium #1 CLOSED.  
**Evidence:** VALIDATION PASS WITH NOTES · QA APPROVE · media `1b2a8e7` · BE `00df642` · docs `8c4e8da`.

### Frontend (nextjs-frontend) — Phase B-M1 ✅

- [x] **None** — no UI; optional later i18n for fail key (generic failed OK).

### Backend / API (nextjs-backend) — Phase B-M1 ✅

**Concrete consumers:** Fly branding worker unit tests · Operator failed-status display (existing).

- [x] **CONTRACT.md amend** — worker step: after VO load / subtitle-hash guard, compare `computeVoiceoverTimingHash(voiceoverText)` to `config.voiceoverTimingHash`; freeze fail code string; note changelog.
- [x] Export **`BRANDING_FAILURE_VOICEOVER_TIMING_HASH`** = `scripts.branding.failure.voiceoverTimingHashMismatch` (parallel to `BRANDING_FAILURE_SUBTITLE_HASH` in `lib/branding/run-branding-job.ts`).
- [x] Unit test: VO text mutated vs snapshot hash → job **`failed`**, reason = fail key, **FFmpeg runner never called**. *(media-pipeline owns `run-branding-job.test.ts` with the worker guard — avoid duplicate.)*
- [x] Unit test: matching hash still proceeds (no false fail) — can share existing happy-path fixture. *(media-pipeline.)*

### Worker / media pipeline (media-pipeline-engineer) — Phase B-M1 ✅

- [x] In `runBrandingJob` (subtitle/VO path): after `subtitleSourceHash` check and **before** `mkdtemp` / ASS / spawn — if `config.voiceoverTimingHash.length === 64`, recompute hash from live `voiceoverText`; mismatch → `failBrandingJob` + return.
- [x] Legacy empty hash → **skip** re-check (M1-6).
- [x] Reuse `computeVoiceoverTimingHash` — do not fork formula.
- [x] **spawn args-array only** — no VO strings in argv (unchanged).

### Database — Phase B-M1 ✅

- [x] **None.**

---

## Frontend (nextjs-frontend) — Phase A (CLOSED)

**Cliente surface:** `/profile` — extend Ficha viva with **Brand / Marca** section.

- [x] Logo upload control (PrimeReact `FileUpload` or hidden input + button): format/size hints (PNG/JPG/WebP, max 2 MiB); preview thumbnail when logo exists; **Remove logo** with confirm.
- [x] Default branding toggles: **Subtitles on Reels** / **Show logo on Reels** (`InputSwitch`); persisted via `updateAssemblyConfigDefaults`.
- [x] Loading, empty (no logo), error, success states; disabled while upload in flight.
- [x] EN/ES under **`profile.branding.*`** (logo label, upload, remove, toggles, errors).

**Operator surface:** `/operator/scripts` expand row — extend US-9.1 assembly panel.

- [x] Branding status badge (`queued` / `processing` / `completed` / `failed` / `skipped`).
- [x] Checkboxes: **Include subtitles** / **Include logo** — seed from last `branding_config` or client defaults; used on next **Apply branding** / **Re-brand**.
- [x] **Apply branding** button when assembly `completed` and branding not in-flight; **Re-brand** when branding `completed`/`failed` (confirm dialog — mirror Re-assemble pattern).
- [x] Preview `<video>` plays branded `output_media_asset_id` when branding `completed` (fallback to pre-branding with banner if branding pending — CONTRACT freezes).
- [x] **Download cover** link when `cover_media_asset_id` present — authenticated serve route.
- [x] Poll branding status (reuse assembly poll interval pattern or combined DTO field).
- [x] EN/ES under **`scripts.branding.*`**.

**Out of scope FE:** Cliente assemble/branding trigger; FFmpeg details; storage keys in UI.

---

## Backend / API (nextjs-backend)

**Concrete consumers:** Ficha logo section · Operator assembly/branding panel · media serve route · Fly worker.

- [x] Migration: `neuramark_business_profiles.logo_asset_id`, `assembly_config jsonb`; assembly row branding columns; enum values `client_logo`, `cover_frame`; storage_key CHECK extensions.
- [x] Extend `lib/contracts/media-assets.ts`: asset types, upload union, storage regexes (`logo-`, `cover-`, `branded-` patterns).
- [x] Extend `validateAndPrepareMediaUpload` for **`client_logo`** (image-only, 2 MiB, no consent gate).
- [x] **`uploadClientLogo`** / **`removeClientLogo`** Server Actions — `requireActive`; replace prior logo asset; update `logo_asset_id`.
- [x] **`updateAssemblyConfigDefaults`** Server Action — `requireActive`; strict Zod; write `assembly_config`.
- [x] **`applyBrandingForAssembly`** Server Action — `requireOperator`; validate assembly row tenancy + `status = completed` base; merge toggles into `branding_config`; enqueue worker.
- [x] **`createBrandingJobForAssembly`** orchestrator — called from auto-chain + manual action; idempotency check; set `branding_status = queued`.
- [x] Subtitle beat resolver + sanitizer module (`lib/branding/sanitize-subtitle-beats.ts` + `resolve-subtitle-beats.ts`).
- [x] Extend `getReelScriptsForWeek` / assembly batch DTO: `brandingStatus`, `brandingConfig`, `coverMediaAssetId`, `canApplyBranding`, `canRebrand`.
- [x] Extend **`GET /api/media/assets/[assetId]`** for new asset types + Cliente ownership where appropriate.
- [x] Auto-chain hook in assembly completion path (`applyAssemblyJobUpdate` when → `completed`).
- [x] Forbidden keys helper for branding actions (no `onScreenText`, `logoAssetId`, `storageKey`, etc.).
- [x] Unit tests: beat resolver, sanitizer, fingerprint, forbidden keys, idempotency, logo upload validation.

**Out of scope BE:** QA agent · approval package serializer (US-11.1) · cron.

---

## Database (nextjs-backend)

- [x] **`neuramark_business_profiles`**: nullable **`logo_asset_id uuid`** FK → `neuramark_media_assets(id)` ON DELETE SET NULL; **`assembly_config jsonb`** DEFAULT NULL.
- [x] **`neuramark_media_assets.asset_type`**: add **`client_logo`**, **`cover_frame`**.
- [x] **`neuramark_assembled_reels`**: **`branding_status text`** CHECK; **`branding_config jsonb`**; **`cover_media_asset_id uuid`** FK; **`pre_branding_output_media_asset_id uuid`** FK; optional **`branding_fingerprint text`** for idempotency index.
- [x] Storage key CHECK: logo, cover, branded MP4 patterns (CONTRACT verbatim SQL).
- [x] RLS deny-by-default unchanged; service-role Node + Fly worker only.
- [x] Partial unique index on completed branding fingerprint (CONTRACT freezes).

---

## Worker / media pipeline (media-pipeline-engineer)

**Concrete consumers:** `createBrandingJobForAssembly` enqueue · Fly poll loop · `applyBrandingForAssembly` status reads.

- [ ] **`buildReelV1BrandingArgs()`** pure function: input paths (base MP4, optional logo PNG, subtitle ASS path), filter graph for burn-in + overlay + encode H.264/AAC; golden unit tests.
- [ ] **`buildAssFromBeats()`** — sanitized beats → temp `.ass` with equal timing; no user strings in argv.
- [ ] **`extractCoverFrameArgs()`** — `-ss coverFrameSec -vframes 1` JPEG output.
- [ ] **`runBrandingJob(assemblyJobId)`** — download owned assets; spawn FFmpeg; upload branded MP4 + cover JPEG; INSERT media rows; UPDATE assembly row (`output_media_asset_id`, `cover_media_asset_id`, `pre_branding_output_media_asset_id`, `branding_status`).
- [ ] Extend worker loop (assembly or branding module): claim queued branding jobs; stale timeout env (CONTRACT default e.g. **`NEURAMARK_BRANDING_STALE_TIMEOUT_MIN=15`**).
- [ ] Tenancy re-check: all asset `client_id` === job `client_id` before download.
- [ ] **`spawn` only** — no shell; temp dir cleanup in `finally`.
- [ ] Bundled font path on Docker image for drawtext/ASS (document in worker Dockerfile).

---

## Agent routing summary

### Phase A (CLOSED)
| Agent | Owns |
|-------|------|
| **media-pipeline-engineer** | Branding FFmpeg pass, ASS, cover extract, worker |
| **nextjs-backend** | DDL, orchestrator, Server Actions, serve |
| **nextjs-frontend** | Ficha logo + Operator branding panel |

### Phase B ✅ CLOSED
| Agent | Owns |
|-------|------|
| **media-pipeline-engineer** | VO-proportional ASS timings; cover seek clamp; golden tests ✅ |
| **nextjs-backend** | VO load; timing helper; apply schema `coverFrameSec?`; fingerprint; forbidden-keys amend; CONTRACT Phase B ✅ |
| **nextjs-frontend** | Operator cover `InputNumber` + i18n; wire Apply/Re-brand ✅ |
| **spec-guardian** | SPEC-REVIEW Phase B amendment ✅ |
| **security-architect** | SECURITY amend (numeric cover on trigger; VO never in argv) ✅ |

### Phase B-M1 ✅ CLOSED
| Agent | Owns |
|-------|------|
| **media-pipeline-engineer** | Worker VO-hash re-check before proportional timings / spawn ✅ `1b2a8e7` |
| **nextjs-backend** | CONTRACT amend (fail code + worker step); fail constant; mismatch unit tests ✅ `00df642` |
| **nextjs-frontend** | None |
| **security-architect** | SECURITY lean amend (integrity re-check AC) ✅ |
| **spec-guardian** | Skip (M1-10 — no SPEC drift) |

---

## Carry-forwards / reuse (do not reinvent)

- Assembly panel: `components/scripts/ScriptsPageView.tsx` — US-9.1 assembly section pattern.
- Worker: `worker/assembly-jobs.ts`, `lib/assembly/` — extend, do not fork US-9.1 Phase A graph.
- Upload: `lib/media/upload-validation.ts`, `lib/media/storage/`.
- Profile page: `app/(app)/profile/` — US-2.2 edit patterns.
- Beat model: `lib/reel-scripts/compute-script-readability.ts` newline split.
- Readability constants: `lib/contracts/reel-script-readability.ts` (40 chars/line, 8 beats max).
- Media serve: `app/api/media/assets/[assetId]/route.ts`.
- Operator gate: `requireOperator()` · Cliente: `requireActive()`.
- Poll pattern: US-9.1 `GET /api/assembly-jobs/[jobId]` — extend DTO or sibling branding poll (CONTRACT freezes).

---

## Gate checklist (orchestrator)

### Phase A — CLOSED
- [x] PREP · SPEC-REVIEW · SECURITY · CONTRACT · BUILD · VALIDATION · QA · AC checked in USER_STORIES

### Phase B — ✅ CLOSED 2026-08-31
- [x] PREP — [`PHASE-B.md`](./PHASE-B.md) + this TASKS Phase B checklist
- [x] SPEC-REVIEW.md amendment (spec-guardian)
- [x] SECURITY.md amendment (security-architect)
- [x] CONTRACT.md Phase B + Reviewed by FE (nextjs-backend → nextjs-frontend) — FE approved 2026-08-31
- [x] BUILD (media-pipeline-engineer ∥ nextjs-backend ∥ nextjs-frontend) — BE `95419c1` · FE `8f365bf`
- [x] VALIDATION-PHASE-B.md — PASS WITH NOTES `6db2cba` (2/2 deferred; 44/44); Phase A AC stay [x]
- [x] QA-PHASE-B.md — APPROVE WITH CONDITIONS `02bfa3b` (0 Critical/High)
- [x] PO CLOSE Phase B note in USER_STORIES / SPRINT-STATE

### Phase B-M1 — ✅ CLOSED 2026-08-31
- [x] PREP — [`PHASE-B-M1.md`](./PHASE-B-M1.md) + this TASKS Phase B-M1 checklist
- [x] SECURITY.md lean amend (security-architect)
- [x] CONTRACT.md amend (nextjs-backend — worker step + fail code; FE Reviewed waive/N/A)
- [x] BUILD (media-pipeline-engineer ∥ nextjs-backend) — media `1b2a8e7` · BE `00df642`
- [x] VALIDATION lean — PASS WITH NOTES
- [x] QA lean — APPROVE (Medium #1 CLOSED; M2 poll race still open / out of scope)
- [x] PO CLOSE M1
- [x] Do **not** check/uncheck USER_STORIES § US-9.2 AC

---

## Phase B-M2 — Branding poll claim race — ✅ CLOSED 2026-08-31

**Sprint:** `US-9.2-B-M2` · **Branch:** `feature/US-9.2-b-m2-branding-poll-claim` · **PREP:** [`PHASE-B-M2.md`](./PHASE-B-M2.md)

**Closes:** QA Phase A Finding 1 · QA-PHASE-B Medium #2. **No** USER_STORIES AC changes.

### Backend / worker (nextjs-backend + media-pipeline-engineer)

- [x] **`applyBrandingJobUpdate`** — on `queued` → `processing` claim, inspect UPDATE rows affected / `RETURNING`; **0 rows** → `{ idempotent: true }` (M2-3).
- [x] **`runBrandingJob`** — if claim returns `idempotent: true`, or row already `processing` at entry → return **before** `mkdtemp` / download / FFmpeg (M2-4).
- [x] **`pollQueuedBrandingJobsBatch`** — candidate filter **`branding_status = 'queued'`** only; drop `processing` from poll batch (M2-5).
- [x] **Unit test** — simulated lost claim / concurrent claim → **zero** `runFfmpeg` / spawn invocations; winner path unchanged (`run-branding-job.test.ts` Phase B-M2).
- [x] **CONTRACT amend** — § Poll runtime + `runBrandingJob` step 1: atomic claim semantics, idempotent skip, `queued`-only poll predicate (**nextjs-backend** — `3ccc42b`).

### Frontend

- [x] **None** (M2-9).

### Database

- [x] **None** — conditional UPDATE on existing `neuramark_assembled_reels` row.

### Security

- [x] **SECURITY.md lean amend** — branding worker claim AC (mirror US-9.1 `[SEC] Worker job claim`; security-architect — `3ccc42b`).

---

## Agent routing summary (Phase B-M2)

| Agent | Owns |
|-------|------|
| **media-pipeline-engineer** | `poll-branding-jobs.ts`, `runBrandingJob` early-return gate ✅ |
| **nextjs-backend** | `applyBrandingJobUpdate` rows-affected; CONTRACT amend; unit tests |
| **nextjs-frontend** | None |
| **security-architect** | SECURITY lean amend (worker claim) |

---

## Gate checklist — Phase B-M2 — ✅ CLOSED 2026-08-31

- [x] PREP — [`PHASE-B-M2.md`](./PHASE-B-M2.md) + this checklist + README note
- [x] SECURITY.md lean amend (security-architect — `3ccc42b`)
- [x] CONTRACT.md amend (nextjs-backend — atomic claim; FE Reviewed N/A — `3ccc42b`)
- [x] BUILD (media-pipeline-engineer ∥ nextjs-backend) — `29352f4`
- [x] VALIDATION lean — PASS WITH NOTES (`VALIDATION-PHASE-B-M2.md`; 11/11 tests)
- [x] QA lean — APPROVE (0 findings; QA Phase A Medium #1 + QA-PHASE-B Medium #2 CLOSED)
- [x] PO CLOSE M2
- [x] Do **not** check/uncheck USER_STORIES § US-9.2 AC
