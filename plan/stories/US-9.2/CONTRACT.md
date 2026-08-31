Reviewed by FE: yes — 2026-08-30 — nextjs-frontend (Phase A).  
**Phase B — Reviewed by FE: yes — 2026-08-31 — nextjs-frontend** (Operator `coverFrameSec` InputNumber + Apply/Re-brand wire).  
**Phase B-M1 — Reviewed by FE: N/A — no FE surface** (PO M1-9; waiver — see § Phase B-M1). Contract frozen / BUILD unblocked without FE signoff.  
**Phase B-M2 — Reviewed by FE: N/A — no FE surface** (PO M2-9; waiver — see § Phase B-M2). Contract frozen / BUILD unblocked without FE signoff.

# API Contract — US-9.2 Add subtitles, logo, and cover

**Story:** US-9.2  
**Status:** Phase A frozen — 2026-08-30 · **Phase B section frozen — 2026-08-31** (Reviewed by FE: **yes — 2026-08-31**) · **Phase B-M1 section frozen — 2026-08-31** (FE Reviewed **N/A** — BUILD unblocked) · **Phase B-M2 section frozen — 2026-08-31** (FE Reviewed **N/A** — BUILD unblocked)  
**Security:** `plan/stories/US-9.2/SECURITY.md` (Phase A + Phase B + **Phase B-M1** APPROVE WITH CONDITIONS — 4 M1 conditions reconciled in § Phase B-M1)  
**Spec review:** `plan/stories/US-9.2/SPEC-REVIEW.md` (Phase A GAPS closed) · `plan/stories/US-9.2/SPEC-REVIEW-PHASE-B.md` (**ALIGNED**) · Phase B-M1: **no SPEC drift** (PO M1-10 — skip full SPEC-REVIEW) · Phase B-M2: **no SPEC drift** (PO M2-10 — skip full SPEC-REVIEW)  
**Phase B prep:** `plan/stories/US-9.2/PHASE-B.md` (PO B1–B15) · **Phase B-M1 prep:** `plan/stories/US-9.2/PHASE-B-M1.md` (PO M1-1…M1-10) · **Phase B-M2 prep:** `plan/stories/US-9.2/PHASE-B-M2.md` (PO M2-1…M2-11)  
**Pattern:** `plan/stories/US-9.1/CONTRACT.md` (extends assembly pipeline; second-pass branding on Fly worker)  
**Depends on:** US-9.1 ✅ assembled base + worker poll seam · US-5.1 ✅ `on_screen_text` + `voiceover_text` · US-5.2 ✅ beat line bounds + `countVoiceoverWords` tokenizer · US-9.3 Phase A ✅ VO audio (timestamps **not** required) · US-2.2 ✅ Ficha viva `/profile` · US-3.3 ✅ `validateAndPrepareMediaUpload` · US-14.5 ✅ `requireOperator()` / `requireActive()`  
**ADR:** `docs/adr/0003-worker-flyio-ffmpeg.md` — Vercel orchestrator INSERT + enqueue; Fly FFmpeg + branding status writes  
**Feature branch (Phase A):** `feature/US-9.2-subtitles-logo-cover` (merged)  
**Feature branch (Phase B):** `feature/US-9.2-phase-b-subtitle-cover` · sprint `US-9.2-B`  
**Feature branch (Phase B-M1):** `feature/US-9.2-b-m1-voiceover-timing-hash` · sprint `US-9.2-B-M1`  
**Feature branch (Phase B-M2):** `feature/US-9.2-b-m2-branding-poll-claim` · sprint `US-9.2-B-M2`  
**Error envelope style:** same class as US-9.1 / US-8.4 (`ok: true` vs `{ ok: false, error: { code, fields?, messageKey? } }`)

**This document is CONTRACT ONLY.** Zod mirrors live in `lib/contracts/branding-job.ts` (BUILD) and extensions to `lib/contracts/media-assets.ts`, `lib/contracts/assembly-job.ts`, `lib/contracts/profile.ts`. Extensions to `lib/assembly/**` and worker modules are specified here and applied during BUILD.

**Terminology:** **Ensamblado** · **Paquete de guion** · **texto en pantalla** · **Ficha viva** · **Reel 9:16** · **download-and-own** · **Operator** · **Cliente**. Technical enums (`client_logo`, `cover_frame`, `branding_status`, `subtitlesEnabled`) OK in code/Operator diagnostics. Do **not** use CONTEXT _Evitar_ terms in product-facing strings. Do **not** expose FFmpeg command strings, `storage_key`, temp paths, or raw `on_screen_text` in UI or API DTOs.

**USER_STORIES surface amendment (binding):** Cliente logo upload + default branding toggles render on **`/profile`** Ficha viva **Marca / Brand** section — **not** Preferencias (`/settings/preferences`). Operator branding status, per-run subtitle/logo toggles, **Apply branding** / **Re-brand**, preview `<video>`, and **Download cover** render on **`/operator/scripts`** assembly panel expand row — **not** a new route. Cliente branded video preview is **out of scope** for US-9.2 BUILD (US-11.1).

**USER_STORIES AC amendment (binding for VALIDATION):** “Logo optional; default template if missing” means **skip logo overlay** when `logo_asset_id` IS NULL or `logoEnabled: false` — **no** Neuralitica placeholder watermark in V1.

---

## SPEC-REVIEW blocking gaps closed

| # | Gap | Resolution |
|---|-----|------------|
| 1 | No US-9.2 CONTRACT.md | This document |
| 2 | FFmpeg branding filter graph not frozen | § `buildReelV1BrandingArgs()` · § `buildAssFromBeats()` · § `extractCoverFrameArgs()` — ASS file + subtitles filter; golden unit tests |
| 3 | Auto-chain seam on US-9.1 completion unset | § `onAssemblyJobCompleted()` hook inside `applyAssemblyJobUpdate` when → `completed` |
| 4 | Media serve allowlist extension unset | § Media serve route — `client_logo`, `cover_frame`, branded `assembled_reel` |
| 5 | USER_STORIES AC “default template if missing” vs PO no watermark | § Phased BUILD — default = no overlay; forbid system watermark |
| 6 | USER_STORIES owner table vs PREP persona split | § Surfaces — Cliente `/profile` defaults only; Operator `/operator/scripts` apply + preview |
| 7 | Branding idempotency + output lineage not frozen | § Idempotency policy · § Migration branding columns · partial unique index |
| 8 | `branding_status = skipped` vs cover-always-export tension | § Branding status — Phase A auto-chain **always** enqueues; cover **always** exported; `skipped` reserved, not emitted in Phase A |
| 9 | Subtitle beat resolver edge cases | § `resolveSubtitleBeats()` · § Subtitle sanitizer |
| 10 | `validateAndPrepareMediaUpload` extension for `client_logo` | § Logo upload · § Migration storage CHECK |
| 11 | S3.M10 partial closure undocumented | § Phased BUILD + VALIDATION note requirement |
| 12 | ASS vs drawtext choice unset | § Subtitle pipeline — ASS + `subtitles` filter; raw drawtext with user strings **forbidden** |

## SECURITY reconciliation (binding)

| Topic | SECURITY condition | **Frozen in this contract** |
|-------|-------------------|----------------------------|
| Branding trigger input | Phase A: `{ assemblyJobId, subtitlesEnabled?, logoEnabled? }` · **Phase B:** optional **`coverFrameSec?`** numeric `0–45` (SECURITY Phase B supersedes Phase A forbid on apply) | § `applyBrandingForAssembly` · § Phase B · § Forbidden request keys |
| Operator gate | `requireOperator("handler")` first on apply/re-brand | § Orchestrator step 1 · § branded video serve |
| Cliente gate | `requireActive("handler")` on logo + defaults | § Logo Server Actions · § `updateAssemblyConfigDefaults` |
| Assembly tenancy | `(assemblyJobId, client_id)` + `status = completed` → 404 | § Orchestrator step 2 |
| Forbidden trigger keys | Reject beat text, asset ids, URLs, fonts | § `findForbiddenBrandingKeys` |
| Subtitle injection | Sanitize → ASS file → path only in argv | § Subtitle sanitizer · § `buildAssFromBeats` |
| FFmpeg spawn | Args array, `shell: false` | § `runBrandingJob` · § `buildReelV1BrandingArgs` |
| Logo upload | US-3.3 shared stack, 2 MiB, magic bytes | § `validateAndPrepareMediaUpload` `client_logo` branch |
| Logo replace | Delete prior own logo row + blob | § `uploadClientLogo` |
| Ficha PATCH smuggling | No `logo_asset_id` / `assembly_config` via PATCH | § Cliente mutations — dedicated Server Actions only |
| SSRF | No HTTP fetch at branding | § Worker Storage SDK only |
| Asset ownership | Verify before enqueue + worker run | § `runBrandingJob` pre-download |
| `storage_key` regex | Validated before I/O | § Migration CHECK · regex constants |
| Branding status authority | Worker modules only | § `applyBrandingJobUpdate` — sole writer |
| Auto-chain | Server profile defaults; not Cliente-callable | § `onAssemblyJobCompleted` |
| Idempotency fingerprint | Server-computed only | § Idempotency policy |
| Stale timeout | Worker-only | § Stale-job policy |
| Worker tenancy | Asset `client_id` === job `client_id` | § `runBrandingJob` |
| Media serve matrix | Type-specific auth | § Media serve route |
| Branded video Cliente serve | **Do not widen** in US-9.2 | § Media serve — Operator only for `assembled_reel` MP4 |
| DTO exposure | No paths, keys, ASS body, argv | § DTOs |
| Sanitizer fail-closed | No silent burn-in of unsanitized text | § Subtitle sanitizer — job **`failed`** on injection residue |
| ADR-0003 | No Vercel FFmpeg | § Poll runtime matrix |

---

## Phased BUILD acceptance

| Phase | Scope | Closes |
|-------|-------|--------|
| **A (US-9.2 BUILD — CLOSED)** | DDL (`logo_asset_id`, `assembly_config`, branding columns, `client_logo` / `cover_frame` enums); logo upload/remove + `updateAssemblyConfigDefaults` on Ficha; branding worker pass (ASS burn-in + logo overlay + cover @ 1s); auto-chain after assembly `completed`; Operator branding panel + toggles; idempotency; `[SEC]` upload + subtitle sanitize; mobile safe-zone typography | USER_STORIES § US-9.2 AC rows (all five remain **[x]**) |
| **B (US-9.2-B — CLOSED)** | **Only:** (1) VO-proportional beat timing from `voiceover_text` word partitions (fallback equal split); (2) Operator per-reel optional **`coverFrameSec`** on manual Apply / Re-brand (Zod `0–45`, seek clamp). **Out of this slice (further defer):** bundled second font weight · preview thumbnail strip · Cliente Ficha `coverFrameSec` UI · TTS/ASR timestamps | Phase A deferred S3.M10 polish only — **no** new USER_STORIES AC checkboxes |
| **B-M1 (US-9.2-B-M1 — CLOSED)** | Worker re-check of **`voiceoverTimingHash`** vs live script VO after subtitle-hash guard, before `mkdtemp` / ASS / spawn. Fail constant + unit test. **No** FE · **No** DB · **No** new USER_STORIES AC | Closes QA-PHASE-B Medium #1 only — see § Phase B-M1 |
| **B-M2 (US-9.2-B-M2 — this amendment)** | Atomic **`queued` → `processing`** claim via conditional UPDATE + RETURNING; **`idempotent: true`** on lost race; **`runBrandingJob`** early return before temp / download / FFmpeg; poll batch **`branding_status = 'queued'`** only. **No** FE · **No** DB · **No** new USER_STORIES AC | Closes QA Phase A Finding 1 + QA-PHASE-B Medium #2 — see § Phase B-M2 |

**VALIDATION note (binding):** Phase A closes USER_STORIES § US-9.2 AC and completes the **subtitles/logo/cover** slice deferred from US-9.1 partial S3.M10 closure. Phase B VALIDATION must re-verify **[SEC]** sanitization + cover bounds on the VO-timing / Operator-override path, and mark the two Phase A deferrals (**VO-synced timing**, **Operator `coverFrameSec`**) **closed**. Remaining S3.M10 elsewhere: weekly auto-brand (ADR-0001), further font/thumbnail polish.

**Partial narrative closure:** Phase A subtitle timing uses **equal beat split** from `target_duration_sec` only. Phase B labels timing **VO-proportional beat timing from `voiceover_text`** — **not** TTS lip/word sync, **not** measured audio alignment. VALIDATION must not claim true A/V word sync.

---

## Overview

US-9.2 ships a **second-pass FFmpeg branding pipeline** on US-9.1 **`assembled_reel`** output. After primary assembly **`completed`**, orchestrator auto-chains branding (or Operator triggers **`applyBrandingForAssembly`**). Fly worker downloads owned base MP4 + optional **`client_logo`**, builds sanitized ASS from **`on_screen_text`** beats, burns subtitles + logo overlay, uploads branded MP4 (new storage key), extracts cover JPEG @ **`coverFrameSec`**, UPDATEs assembly row lineage.

**Surfaces**

| # | Surface | Kind | Consumer |
|---|---------|------|----------|
| 1 | `createBrandingJobForAssembly` | Server helper | `applyBrandingForAssembly` · `onAssemblyJobCompleted` auto-chain |
| 2 | `applyBrandingForAssembly` | Server Action | `/operator/scripts` — **Apply branding** / **Re-brand** |
| 3 | `uploadClientLogo` | Server Action | `/profile` Ficha — logo upload |
| 4 | `removeClientLogo` | Server Action | `/profile` Ficha — **Remove logo** |
| 5 | `updateAssemblyConfigDefaults` | Server Action | `/profile` Ficha — default toggles |
| 6 | `getBusinessProfileForClient` (extended) | Server helper | `/profile` — logo preview URL + defaults |
| 7 | `getReelScriptsForWeek` / assembly batch (extended) | Server helper | `/operator/scripts` — branding fields on assembly DTO |
| 8 | `GET /api/media/assets/[assetId]` (extended) | Route Handler | Logo thumbnail, cover download, Operator branded video preview |
| 9 | `onAssemblyJobCompleted` | Server helper | Hook inside `applyAssemblyJobUpdate` when assembly → `completed` |
| 10 | `applyBrandingJobUpdate` | Server helper | Worker + stale sweeper — sole branding status writer |
| 11 | `runBrandingJob` | Server helper | Fly worker + dev in-process |
| 12 | `markStaleBrandingJobsFailed` | Server helper | Fly worker pre-tick |
| 13 | `enqueueBrandingJob` | Server helper | Dev in-process fire-and-forget |
| 14 | `/profile` Brand section | FE | Logo + default toggles |
| 15 | `/operator/scripts` branding panel | FE | Status, toggles, preview, cover download |

**Forbidden surfaces (BUILD veto):**

- Any Route Handler / Server Action that UPDATEs `branding_status`, `output_media_asset_id`, `cover_media_asset_id`, or `pre_branding_output_media_asset_id` from request JSON.
- Client-supplied `onScreenText`, `logoAssetId`, URLs, `brandingConfig`, `brandingFingerprint`, `status`, `force`, `skipIdempotency`, beat timings, VO text, paths, fonts. **Phase B exception:** optional numeric **`coverFrameSec`** on Operator `applyBrandingForAssembly` only (Zod `0–45`) — see § Phase B.
- FFmpeg `spawn` / `exec` on Vercel Route Handlers or Server Actions.
- HTTP(S) `fetch` of asset bytes in `lib/assembly/**` branding path.
- Raw beat text or unsanitized strings in FFmpeg argv or `-drawtext` with interpolated user strings.
- Cliente `applyBrandingForAssembly` or Cliente serve of branded **`assembled_reel` video** in V1.
- Ficha PATCH accepting `logo_asset_id` or `assembly_config`.
- Re-running US-9.1 primary assembly (`reel_v1_basic`) inside branding path.

---

## Migration — business profile + assembly branding + asset types

**Migration file (BUILD):** `supabase/migrations/*_neuramark_branding_us_9_2.sql`

```sql
-- US-9.2: branding columns, client logo, cover frame asset types

ALTER TYPE public.neuramark_media_asset_type ADD VALUE IF NOT EXISTS 'client_logo';
ALTER TYPE public.neuramark_media_asset_type ADD VALUE IF NOT EXISTS 'cover_frame';

-- Ficha viva: client logo FK + default assembly/branding toggles
ALTER TABLE public.neuramark_business_profiles
  ADD COLUMN IF NOT EXISTS logo_asset_id uuid
    REFERENCES public.neuramark_media_assets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assembly_config jsonb DEFAULT NULL;

CREATE INDEX IF NOT EXISTS neuramark_business_profiles_logo_asset_id_idx
  ON public.neuramark_business_profiles (logo_asset_id)
  WHERE logo_asset_id IS NOT NULL;

COMMENT ON COLUMN public.neuramark_business_profiles.logo_asset_id IS
  'US-9.2: single active client_logo media asset FK; set only via uploadClientLogo Server Action.';
COMMENT ON COLUMN public.neuramark_business_profiles.assembly_config IS
  'US-9.2: Cliente default branding toggles JSON — subtitlesEnabled, logoEnabled, coverFrameSec.';

-- Assembly row: branding second-pass state + lineage
ALTER TABLE public.neuramark_assembled_reels
  ADD COLUMN IF NOT EXISTS branding_status text
    CHECK (branding_status IS NULL OR branding_status IN (
      'queued', 'processing', 'completed', 'failed', 'skipped'
    )),
  ADD COLUMN IF NOT EXISTS branding_config jsonb,
  ADD COLUMN IF NOT EXISTS branding_fingerprint text
    CHECK (branding_fingerprint IS NULL OR char_length(branding_fingerprint) = 64),
  ADD COLUMN IF NOT EXISTS pre_branding_output_media_asset_id uuid
    REFERENCES public.neuramark_media_assets(id),
  ADD COLUMN IF NOT EXISTS cover_media_asset_id uuid
    REFERENCES public.neuramark_media_assets(id);

CREATE INDEX IF NOT EXISTS neuramark_assembled_reels_branding_status_updated_idx
  ON public.neuramark_assembled_reels (branding_status, updated_at)
  WHERE branding_status IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS neuramark_assembled_reels_branding_idempotency_completed_uq
  ON public.neuramark_assembled_reels (client_id, id, branding_fingerprint)
  WHERE branding_status = 'completed' AND branding_fingerprint IS NOT NULL;

COMMENT ON COLUMN public.neuramark_assembled_reels.pre_branding_output_media_asset_id IS
  'US-9.2: US-9.1 assembled_reel output before branding swap; set at branding start.';
COMMENT ON COLUMN public.neuramark_assembled_reels.cover_media_asset_id IS
  'US-9.2: cover_frame JPEG extracted from branded output for manual IG upload.';
```

**Extend `neuramark_media_assets.storage_key` CHECK (same migration):**

```sql
ALTER TABLE public.neuramark_media_assets
  DROP CONSTRAINT IF EXISTS neuramark_media_assets_storage_key_relative_chk;

ALTER TABLE public.neuramark_media_assets
  ADD CONSTRAINT neuramark_media_assets_storage_key_relative_chk
  CHECK (
    storage_key !~ '^/' AND
    storage_key !~ '\\' AND
    storage_key !~ '\.\.' AND
    (
      -- US-3.3 / US-8.3 legacy: single UUID + ext at repo root
      storage_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|mp4|mov)$'
      OR
      -- US-9.3 voiceover
      storage_key ~ '^neuramark/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(mp3|wav|m4a)$'
      OR
      -- US-9.1 assembled reel (pre-branding base)
      storage_key ~ '^neuramark/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/assembled-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.mp4$'
      OR
      -- US-9.2 branded reel output
      storage_key ~ '^neuramark/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/branded-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.mp4$'
      OR
      -- US-9.2 client logo
      storage_key ~ '^neuramark/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/logo-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
      OR
      -- US-9.2 cover frame
      storage_key ~ '^neuramark/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/cover-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$'
    )
  );
```

| Column / object | Rule |
|-----------------|------|
| `neuramark_business_profiles.logo_asset_id` | Nullable FK; **one** active logo per client; set only via `uploadClientLogo` |
| `neuramark_business_profiles.assembly_config` | Cliente defaults JSON; NULL → server defaults § `assemblyConfigSchema` |
| `branding_status` | Separate from assembly `status`; null until first branding enqueue |
| `branding_config` | Server snapshot at enqueue — toggles + `subtitleBeatCount` + `subtitleSourceHash` |
| `branding_fingerprint` | Server sha256 hex — idempotency component |
| `pre_branding_output_media_asset_id` | Copy of `output_media_asset_id` at branding **processing** start (before swap) |
| `cover_media_asset_id` | FK to `cover_frame` JPEG — set on branding **`completed`** |
| `output_media_asset_id` | After branding **`completed`**, points to **branded** `assembled_reel` MP4 |
| Downstream QA / approval | Key off **`neuramark_assembled_reels.id`** + latest `output_media_asset_id` |
| RLS | Deny-by-default unchanged; service-role Node + Fly worker only |

**Contract mirror (`lib/contracts/media-assets.ts` BUILD):**

```ts
export const MEDIA_ASSET_TYPE_CLIENT_LOGO = "client_logo" as const;
export const MEDIA_ASSET_TYPE_COVER_FRAME = "cover_frame" as const;

export const CLIENT_LOGO_STORAGE_KEY_REGEX =
  /^neuramark\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/logo-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$/;

export const COVER_FRAME_STORAGE_KEY_REGEX =
  /^neuramark\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/cover-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$/;

export const BRANDED_REEL_STORAGE_KEY_REGEX =
  /^neuramark\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/branded-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.mp4$/;
```

**Output storage key generation (server-only):**

| Asset | Pattern |
|-------|---------|
| Branded MP4 | `neuramark/{clientId}/{reelScriptId}/branded-{uuid}.mp4` |
| Client logo | `neuramark/{clientId}/logo-{uuid}.{ext}` |
| Cover frame | `neuramark/{clientId}/cover-{uuid}.jpg` |

Branded MP4 retains `asset_type = assembled_reel` (same enum as US-9.1 base — lineage distinguished by storage key prefix and `pre_branding_output_media_asset_id`).

---

## Config schemas

**File:** `lib/contracts/branding-job.ts`

```ts
export const assemblyConfigSchema = z
  .object({
    subtitlesEnabled: z.boolean().default(true),
    logoEnabled: z.boolean().default(true),
    coverFrameSec: z.number().min(0).max(45).default(1.0),
  })
  .strict();

export const brandingConfigSnapshotSchema = assemblyConfigSchema.extend({
  subtitleBeatCount: z.number().int().min(0).max(8),
  subtitleSourceHash: z.string().length(64), // lowercase hex sha256
});
```

**Server defaults when `assembly_config` IS NULL:**

```json
{ "subtitlesEnabled": true, "logoEnabled": true, "coverFrameSec": 1.0 }
```

---

## Idempotency policy

**Key pair (per tenant + assembly row):** `(assembly_job_id, branding_fingerprint)`

**Fingerprint (server-only):**

```ts
// Phase A formula — **superseded by Phase B** (§ Phase B — voiceoverTimingHash + fingerprint delta)
branding_fingerprint = sha256(
  preBrandingOutputMediaAssetId + "|" +
  stableStringify(branding_config) + "|" +
  branding_config.subtitleSourceHash
).hex(); // 64 lowercase hex chars
```

**Phase B:** append `|` + `branding_config.voiceoverTimingHash` (see § Phase B). Snapshot gains `voiceoverTimingHash`.

| Scenario | Behavior |
|----------|----------|
| `branding_status = completed` with same fingerprint on same row | Return `{ ok: true, assemblyJobId, brandingStatus: "completed", idempotent: true, outputMediaAssetId, coverMediaAssetId }` — **no** duplicate FFmpeg |
| `queued` / `processing` branding on same row | Return `{ ok: true, idempotent: true, inFlight: true }` — **no** duplicate enqueue |
| Prior branding **`failed`** for same fingerprint | **Allow** re-run — Operator **Re-brand** |
| `on_screen_text` / toggle / logo FK change | New `subtitleSourceHash` or config → new fingerprint → re-brand allowed |
| **Phase B:** VO tokens change | New `voiceoverTimingHash` → new fingerprint → re-brand allowed |
| Partial unique index violation on concurrent complete | Loser treats as idempotent read of winner |

**Client cannot supply:** `brandingFingerprint`, `brandingConfig`, `preBrandingOutputMediaAssetId`, `force`, `skipIdempotency`, `voiceoverTimingHash`, `subtitleSourceHash`.

---

## Subtitle beat resolver + sanitizer

**File:** `lib/assembly/subtitle-beats.ts` (`import "server-only"`)

```ts
export function resolveSubtitleBeats(onScreenText: string): string[];

export function sanitizeSubtitleBeats(beats: string[]): {
  ok: true;
  sanitizedBeats: string[];
  subtitleSourceHash: string;
} | {
  ok: false;
  code: "SUBTITLE_SANITIZE_FAILED";
  messageKey: "scripts.branding.failure.subtitleSanitize";
};
```

| Step | Rule |
|------|------|
| 1 | Split `on_screen_text` on `\n` |
| 2 | Trim each line; drop empty lines |
| 3 | Cap at **`REEL_SCRIPT_MAX_BEAT_LINES_TOTAL`** (8) — truncate excess |
| 4 | Per line: cap **`REEL_SCRIPT_MAX_CHARS_PER_BEAT_LINE`** (40) — truncate with ellipsis policy (unit-test frozen) |
| 5 | Strip ASCII control chars (`U+0000–U+001F`, `U+007F`) |
| 6 | ASS escape: `\` → `\\`, `{` → `\{`, `}` → `\}`, `%` → `\%` |
| 7 | Newlines within beat → single space (V1 one line per beat in ASS) |
| 8 | **Fail-closed:** if line still matches dangerous ASS override pattern `/\{[^}]*\\/` after escape → **`SUBTITLE_SANITIZE_FAILED`** |
| 9 | `subtitleSourceHash` = sha256(sanitized beats joined by `\n`) hex |

**Empty beat list:** effective `subtitlesEnabled: false` for burn-in — branding may still run for logo and/or cover.

**Forbidden:** passing raw script text to FFmpeg argv; client-supplied beats at trigger.

---

## `buildAssFromBeats()` — ASS file pipeline

**File:** `lib/assembly/ffmpeg/build-ass-from-beats.ts` (pure — no spawn)

```ts
export function buildAssFromBeats(input: {
  sanitizedBeats: string[];
  targetDurationSec: number;
  outputAssPath: string; // server temp path — written by caller in worker
}): { assContent: string; beatTimings: Array<{ startSec: number; endSec: number }> };
```

**Timing (Phase A — equal split):**

```ts
beatDurationSec = targetDurationSec / sanitizedBeats.length;
// Beat i: [i * beatDurationSec, (i+1) * beatDurationSec), i from 0
// First beat starts at t = 0
```

**Frozen typography constants (1080×1920):**

| Constant | Value |
|----------|-------|
| Font | **DejaVu Sans Bold** (bundled worker path constant) |
| Font size | **48px** at 1080w |
| Alignment | Bottom center (ASS alignment 2) |
| Vertical margin | Baseline between **y = 1280** and **y = 1520** (~67%–79% from top) |
| Max width | **90%** frame width |
| Box | Semi-transparent black **`BorderStyle=3`**, **`BackColour=&H80000000`** (~55% opacity) |
| Text color | White **`PrimaryColour=&H00FFFFFF`** |
| Max lines per beat | **2** (wrap at 40 chars — pre-split server-side) |

Worker writes `assContent` to **`/tmp/neuramark-branding/{assemblyJobId}/subtitles.ass`** before spawn. **Only file path** appears in FFmpeg argv.

---

## `createBrandingJobForAssembly()`

**File:** `lib/assembly/create-branding-job-for-assembly.ts` (`import "server-only"`)

```ts
export async function createBrandingJobForAssembly(input: {
  assemblyJobId: string;
  subtitlesEnabled?: boolean;
  logoEnabled?: boolean;
  source: "auto_chain" | "operator_manual";
}): Promise<CreateBrandingJobForAssemblyResult>;
```

| Step | Action |
|------|--------|
| 1 | If `source = operator_manual`: `requireOperator("handler")` — resolve `clientId`. If `auto_chain`: caller already verified worker/orchestrator context; load job unscoped then verify tenancy |
| 2 | Load assembly `WHERE id = $assemblyJobId AND client_id = $clientId AND status = 'completed'` — missing/incomplete → **`NOT_FOUND`** (404) |
| 3 | Require `output_media_asset_id IS NOT NULL` |
| 4 | Load linked script `on_screen_text`, `target_duration_sec` server-side (**Phase B:** also `voiceover_text`) |
| 5 | Resolve client defaults from `neuramark_business_profiles.assembly_config` (or server defaults) |
| 6 | Merge Operator overrides: `subtitlesEnabled ?? defaults.subtitlesEnabled`, `logoEnabled ?? defaults.logoEnabled`; **`coverFrameSec`**: Phase A = client defaults only; **Phase B** = Operator override when provided on `operator_manual`, else defaults (auto-chain never takes request cover) |
| 7 | `resolveSubtitleBeats` + `sanitizeSubtitleBeats` — on sanitize fail → return error **`SUBTITLE_SANITIZE_FAILED`** (manual) or mark branding **`failed`** (auto-chain — CONTRACT: same error path) |
| 8 | Compute effective burn-in: `subtitlesEnabled && sanitizedBeats.length > 0` |
| 9 | Resolve logo: when `logoEnabled`, read profile `logo_asset_id`; NULL → skip overlay (no error) |
| 10 | Build `branding_config` snapshot + `branding_fingerprint` using current `output_media_asset_id` as pre-branding id |
| 11 | Idempotency check — § Idempotency policy |
| 12 | UPDATE assembly row: `branding_status = queued`, `branding_config`, `branding_fingerprint` (do **not** yet swap `output_media_asset_id`) |
| 13 | `enqueueBrandingJob(assemblyJobId)` |
| 14 | Return `{ ok: true, assemblyJobId, brandingStatus: "queued", idempotent: false }` |

**Thin Server Action wrapper:**

**File:** `lib/assembly/actions/apply-branding-for-assembly.ts` (`"use server"`)

```ts
export async function applyBrandingForAssembly(
  input: ApplyBrandingForAssemblyRequest,
): Promise<ApplyBrandingForAssemblyResult>;
// Phase A: { assemblyJobId, subtitlesEnabled?, logoEnabled? } strict
// Phase B: + optional coverFrameSec? (number 0–45) — see § Phase B — Trigger schema amend
```

Scan raw input with **`findForbiddenBrandingKeys`** before Zod parse → **`FORBIDDEN_FIELDS`**.

---

## `onAssemblyJobCompleted()` — auto-chain hook

**File:** `lib/assembly/on-assembly-job-completed.ts` (`import "server-only"`)

**Invoked from:** `applyAssemblyJobUpdate` immediately after successful transition to assembly **`completed`** (same transaction boundary optional; at minimum same call stack before return).

```ts
export async function onAssemblyJobCompleted(input: {
  assemblyJobId: string;
}): Promise<void>;
```

| Rule | Detail |
|------|--------|
| Trigger | Assembly row just reached `status = completed` with valid `output_media_asset_id` |
| Action | `createBrandingJobForAssembly({ assemblyJobId, source: "auto_chain" })` — **no** Operator gate (internal) |
| Defaults | Server-resolved `assembly_config` from profile — **not** from request |
| Failure | Branding enqueue failure logs + sets `branding_status = failed` — does **not** revert assembly `completed` |
| Re-assemble race | If Operator re-assembles creating **new** assembly row, each row gets independent branding lifecycle |

**Forbidden:** Cliente-callable auto-chain endpoint; Vercel FFmpeg in this hook.

---

## `applyBrandingJobUpdate` — sole branding status writer

**File:** `lib/assembly/apply-branding-job-update.ts` (`import "server-only"`)

```ts
export async function applyBrandingJobUpdate(input: {
  assemblyJobId: string;
  patch: BrandingJobStatusPatch;
  source: "worker" | "stale_sweeper";
}): Promise<ApplyBrandingJobUpdateResult>;
```

**Allowed transitions:**

| From | To |
|------|-----|
| `null` | `queued` (orchestrator only — via direct UPDATE in `createBrandingJobForAssembly` step 12) |
| `queued` | `processing`, `failed` |
| `processing` | `completed`, `failed` |
| `completed` | *(none — idempotent no-op)* |
| `failed` | *(none — re-brand resets via orchestrator UPDATE to `queued`)* |
| `skipped` | *(reserved — not emitted Phase A)* |

**On first transition to `processing`:** set `pre_branding_output_media_asset_id = output_media_asset_id` if not already set.

**On `completed`:** require branded `output_media_asset_id`, `cover_media_asset_id`; swap output FK to branded asset.

**On `failed`:** persist sanitized `failure_reason` (max 2000) — i18n key or code only.

**Only invokers:** `runBrandingJob`, `markStaleBrandingJobsFailed`, `createBrandingJobForAssembly` (queued only). **Zero** browser-callable paths.

---

## Poll runtime — branding worker extension

**Env:**

| Variable | Default | Purpose |
|----------|---------|---------|
| `BRANDING_JOB_POLL_MODE` | inherit `ASSEMBLY_JOB_POLL_MODE` | `in_process` \| `fly` |
| `BRANDING_JOB_POLL_INTERVAL_MS` | `3000` | Delay between branding batch ticks |
| `NEURAMARK_BRANDING_STALE_TIMEOUT_MIN` | `15` | Stale sweeper threshold (minutes) |
| `NEURAMARK_MEDIA_MAX_LOGO_BYTES` | `2097152` | 2 MiB logo cap |

### Production — extend `worker/assembly-jobs.ts` (or `worker/branding-jobs.ts`)

Same Fly loop as US-9.1 with additional claim predicate:

```sql
SELECT … FROM neuramark_assembled_reels
WHERE status = 'completed'
  AND branding_status IN ('queued', 'processing')
ORDER BY updated_at
FOR UPDATE SKIP LOCKED
```

| Rule | Detail |
|------|--------|
| Enqueue | No separate queue table — poll `branding_status` on assembly rows |
| FFmpeg | Fly worker only — **not** Vercel |
| Stale sweep | `markStaleBrandingJobsFailed()` each tick before claim |
| Dev | `enqueueBrandingJob` → `void runBrandingJob(assemblyJobId)` fire-and-forget |

**ADR-0003 runtime matrix:**

| Method | Runtime |
|--------|---------|
| `createBrandingJobForAssembly` / `applyBrandingForAssembly` | Vercel |
| FFmpeg branding `spawn` | Fly worker (prod) · dev in-process |
| `onAssemblyJobCompleted` | Vercel (inside `applyAssemblyJobUpdate`) |
| `applyBrandingJobUpdate` | Worker + stale sweeper |

---

## `runBrandingJob()`

**File:** `lib/assembly/run-branding-job.ts` (`import "server-only"`)

| Step | Action |
|------|--------|
| 1 | Claim: `branding_status` `queued` → `processing` via `applyBrandingJobUpdate` |
| 2 | Re-load job + `branding_config` snapshot |
| 3 | Re-verify `pre_branding` / base asset + optional logo **`client_id === job.client_id`** — mismatch → `failed`, **no** spawn |
| 4 | Temp dir **`/tmp/neuramark-branding/{assemblyJobId}/`** |
| 5 | Download: `base.mp4` (pre-branding output), optional `logo.png`, write `subtitles.ass` via `buildAssFromBeats` when burn-in enabled |
| 6 | `buildReelV1BrandingArgs({ ... })` → `string[]` |
| 7 | `spawn('ffmpeg', args, { shell: false })` — await exit 0 |
| 8 | `extractCoverFrameArgs({ localBrandedPath, coverFrameSec, localCoverPath })` → spawn second FFmpeg call |
| 9 | Upload branded MP4 → `insertBrandedReelMediaAsset()`; cover JPEG → `insertCoverFrameMediaAsset()` |
| 10 | `applyBrandingJobUpdate` → `completed` with new `output_media_asset_id`, `cover_media_asset_id` |
| 11 | `finally`: delete temp tree |

**On failure:** `applyBrandingJobUpdate` → `failed` + sanitized reason.

---

## `buildReelV1BrandingArgs()` — Phase A filter graph

**File:** `lib/assembly/ffmpeg/build-reel-v1-branding-args.ts` (pure)

```ts
export function buildReelV1BrandingArgs(input: {
  localBasePath: string;
  localBrandedPath: string;
  localAssPath?: string;
  localLogoPath?: string;
  burnSubtitles: boolean;
  overlayLogo: boolean;
}): string[];
```

**Filter graph (frozen Phase A):**

1. Input `-i base.mp4`
2. Optional `-i logo.png` when `overlayLogo`
3. Video chain:
   - When `burnSubtitles`: `-vf "subtitles={localAssPath}:fontsdir={BUNDLED_FONT_DIR}"` (path args only)
   - Logo overlay when `overlayLogo`: `-filter_complex` with scaled logo (**max width 12%** ≈ 130px @ 1080w), **top-right**, padding **48px**, preserve aspect, opacity 100%
   - When both off: `-c:v copy` for video stream where possible, then re-mux; **cover extract still runs on output file**
4. Re-encode when filters applied: **libx264** (`-preset veryfast`, `-crf 23`), **aac** copy or re-encode from source
5. Output **1080×1920** preserved from base (no resize in branding pass)

**Phase A forbidden in args:** raw beat strings; `-drawtext` with user text; dynamic font paths from client; URLs.

**Example snapshot (subtitles + logo):**

```json
[
  "-y",
  "-i", "/tmp/neuramark-branding/{jobId}/base.mp4",
  "-i", "/tmp/neuramark-branding/{jobId}/logo.png",
  "-filter_complex",
  "[0:v]subtitles=/tmp/neuramark-branding/{jobId}/subtitles.ass:fontsdir=/opt/neuramark/fonts[vsub];[1:v]scale=130:-1[logo];[vsub][logo]overlay=W-w-48:48[vout]",
  "-map", "[vout]", "-map", "0:a?",
  "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
  "-c:a", "aac", "-b:a", "128k",
  "/tmp/neuramark-branding/{jobId}/branded.mp4"
]
```

Unit tests: golden snapshots for subtitles-only, logo-only, both, neither (cover-only path).

---

## `extractCoverFrameArgs()`

**File:** `lib/assembly/ffmpeg/extract-cover-frame-args.ts` (pure)

```ts
export function extractCoverFrameArgs(input: {
  localBrandedPath: string;
  localCoverPath: string;
  coverFrameSec: number;
}): string[];
```

```json
[
  "-y",
  "-ss", "1.0",
  "-i", "/tmp/neuramark-branding/{jobId}/branded.mp4",
  "-vframes", "1",
  "-q:v", "2",
  "/tmp/neuramark-branding/{jobId}/cover.jpg"
]
```

`-ss` value from **`branding_config.coverFrameSec`** (numeric, pre-validated). Default **1.0**.

**Phase B:** clamp seek via `clampCoverSeekSec` to `[0, max(0, durationSec - 0.05)]` before building args — see § Phase B — Cover seek clamp.

---

## Logo upload / remove — Cliente Server Actions

### `uploadClientLogo`

**File:** `lib/profile/actions/upload-client-logo.ts` (`"use server"`)

| Step | Action |
|------|--------|
| 1 | `requireActive("handler")` |
| 2 | `validateAndPrepareMediaUpload({ assetType: "client_logo", ... })` — § Upload validator extension |
| 3 | If prior `logo_asset_id`: delete prior **own** storage object + media row |
| 4 | INSERT `neuramark_media_assets` (`client_logo`) |
| 5 | UPDATE `neuramark_business_profiles.logo_asset_id` |
| 6 | Return `{ ok: true, logoAssetId, logoPreviewUrl: "/api/media/assets/{uuid}" }` |

### `removeClientLogo`

**File:** `lib/profile/actions/remove-client-logo.ts` (`"use server"`)

| Step | Action |
|------|--------|
| 1 | `requireActive("handler")` |
| 2 | Load profile; verify logo FK ownership |
| 3 | DELETE storage + media row; SET `logo_asset_id = NULL` |

### `updateAssemblyConfigDefaults`

**File:** `lib/profile/actions/update-assembly-config-defaults.ts` (`"use server"`)

```ts
export async function updateAssemblyConfigDefaults(
  input: AssemblyConfigInput, // assemblyConfigSchema
): Promise<UpdateAssemblyConfigDefaultsResult>;
```

| Step | Action |
|------|--------|
| 1 | `requireActive("handler")` |
| 2 | Strict Zod parse — reject unknown keys |
| 3 | UPDATE `neuramark_business_profiles.assembly_config` for server-resolved profile row |

**Forbidden via Ficha PATCH:** `logo_asset_id`, `assembly_config` — US-2.2 allowlist unchanged.

---

## Upload validator extension — `client_logo`

**File:** `lib/media/upload-validation.ts` (extend — **do not fork**)

Add `"client_logo"` to `mediaUploadAssetTypeSchema`.

| Rule | Value |
|------|-------|
| MIME (magic bytes) | `image/jpeg`, `image/png`, `image/webp` only |
| Max size | **2 MiB** (`NEURAMARK_MEDIA_MAX_LOGO_BYTES`) |
| Deny | SVG, GIF, HTML, `text/*`, video signatures |
| Consent gate | **None** (brand mark ≠ likeness) |
| Storage key | `neuramark/{clientId}/logo-{uuid}.{ext}` |
| `existingAssetCount` | Ignored — replace-on-upload enforced at action layer |

---

## Media serve route extension

**File:** `app/api/media/assets/[assetId]/route.ts` (extend)

| `asset_type` | Auth | Ownership |
|--------------|------|-----------|
| `client_logo` | `requireActive("handler")` **or** `requireOperator("handler")` | `row.client_id === session.id` else **404** |
| `cover_frame` | same | same |
| `assembled_reel` (branded or base) | **`requireOperator("handler")` V1** | same — **do not** widen Cliente video serve in US-9.2 |

| Rule | Detail |
|------|--------|
| MIME | From metadata (`image/jpeg`, `image/png`, `image/webp`, `video/mp4`) |
| Headers | `Cache-Control: private, no-store`; sanitized `Content-Disposition` |
| Foreign UUID | **404** uniform envelope |

---

## Batch DTO extensions — Operator scripts week load

**Extend** `operatorAssemblyJobDtoSchema` in `lib/contracts/assembly-job.ts`:

```ts
{
  // ... existing US-9.1 fields ...
  brandingStatus: "queued" | "processing" | "completed" | "failed" | "skipped" | null;
  brandingConfig: {
    subtitlesEnabled: boolean;
    logoEnabled: boolean;
    coverFrameSec: number;
  } | null;
  coverMediaAssetId: string | null;
  preBrandingOutputMediaAssetId: string | null;
  canApplyBranding: boolean;
  canRebrand: boolean;
  brandingFailureReason: string | null;
}
```

**Derived flags:**

| Field | Rule |
|-------|------|
| `canApplyBranding` | assembly `completed` AND branding null or failed AND not in-flight |
| `canRebrand` | branding `completed` or `failed` AND assembly still `completed` AND not in-flight |

**Extend** `getReelScriptsForWeek` batch map — same row as US-9.1 assembly attach.

**FE preview rules:**

| State | Preview `<video>` src |
|-------|----------------------|
| branding `completed` | `/api/media/assets/{outputMediaAssetId}` (branded) |
| assembly `completed`, branding pending/null | `/api/media/assets/{outputMediaAssetId}` (pre-branding) + banner `scripts.branding.preview.pending` |
| branding `processing` | last known asset + processing badge |

**Poll:** Reuse `ASSEMBLY_JOB_POLL_INTERVAL_MS_DEFAULT` (3000 ms) — extend `GET /api/assembly-jobs/[jobId]` response with branding fields **or** poll batch reload (CONTRACT: extend poll DTO — preferred single GET).

---

## Cliente profile DTO extension

**Extend** `businessProfileViewSchema` in `lib/contracts/profile.ts`:

```ts
{
  // ... existing fields ...
  branding: {
    logoAssetId: string | null;
    logoPreviewUrl: string | null; // "/api/media/assets/{uuid}" when set
    assemblyConfig: {
      subtitlesEnabled: boolean;
      logoEnabled: boolean;
      coverFrameSec: number;
    };
  };
}
```

**Extend** `getBusinessProfileForClient` select: `logo_asset_id`, `assembly_config`.

---

## Forbidden request keys

**File:** `lib/assembly/find-forbidden-branding-keys.ts`

**Phase A list (historical).** **Phase B supersedes:** remove `coverFrameSec` / `cover_frame_sec` from forbidden; add VO/timing/path/hash keys — canonical list in § Phase B — Forbidden keys amend.

```ts
// Phase A snapshot — do not implement as-is after Phase B BUILD
export const FORBIDDEN_BRANDING_AUTHORITY_KEYS = [
  "onScreenText",
  "on_screen_text",
  "logoAssetId",
  "logo_asset_id",
  "coverFrameSec", // Phase B: REMOVED from forbidden — allowed as Zod number on apply
  "cover_frame_sec", // Phase B: REMOVED from forbidden
  "coverMediaAssetId",
  "cover_media_asset_id",
  "preBrandingOutputMediaAssetId",
  "pre_branding_output_media_asset_id",
  "brandingConfig",
  "branding_config",
  "brandingFingerprint",
  "branding_fingerprint",
  "brandingStatus",
  "branding_status",
  "clientId",
  "client_id",
  "status",
  "outputMediaAssetId",
  "output_media_asset_id",
  "fontPath",
  "font",
  "beatText",
  "subtitleBeats",
  "subtitle_beats",
  "force",
  "skipIdempotency",
  "skip_idempotency",
  // any http(s) URL keys
  "baseVideoUrl",
  "logoUrl",
  "assetUrl",
] as const;
```

Inherits US-9.1 forbidden keys when scanning nested objects on shared forms.

---

## Error codes

`brandingJobErrorCodeSchema` extends assembly codes:

| Code | When |
|------|------|
| `UNAUTHENTICATED` | No session |
| `FORBIDDEN` | Cliente on `applyBrandingForAssembly` |
| `NOT_FOUND` | Foreign assembly job id (404) |
| `VALIDATION_ERROR` | Zod / field errors |
| `FORBIDDEN_FIELDS` | Rejected authority keys |
| `BRANDING_BASE_INCOMPLETE` | Assembly not `completed` or missing output |
| `SUBTITLE_SANITIZE_FAILED` | Sanitizer fail-closed |
| `LOGO_UPLOAD_INVALID` | Shared validator rejection |
| `INTERNAL_ERROR` | Unexpected |

Logo upload errors reuse `mediaUploadErrorCodeSchema` from US-3.3 where applicable.

---

## Fixtures (mock payloads)

### Apply branding success (new job)

```json
{
  "ok": true,
  "assemblyJobId": "c3d4e5f6-a7b8-9012-cdef-123456789abc",
  "brandingStatus": "queued",
  "idempotent": false
}
```

### Apply branding idempotent (completed)

```json
{
  "ok": true,
  "assemblyJobId": "c3d4e5f6-a7b8-9012-cdef-123456789abc",
  "brandingStatus": "completed",
  "idempotent": true,
  "outputMediaAssetId": "e5f6a7b8-c9d0-1234-ef01-3456789abcde",
  "coverMediaAssetId": "f6a7b8c9-d0e1-2345-f012-456789abcdef"
}
```

### Cliente profile branding section

```json
{
  "exists": true,
  "fields": { "...": "..." },
  "branding": {
    "logoAssetId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "logoPreviewUrl": "/api/media/assets/a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "assemblyConfig": {
      "subtitlesEnabled": true,
      "logoEnabled": true,
      "coverFrameSec": 1.0
    }
  }
}
```

### Operator week batch snippet (branding fields)

```json
{
  "assemblyByReelScriptId": {
    "f47ac10b-58cc-4372-a567-0e02b2c3d479": {
      "jobId": "c3d4e5f6-a7b8-9012-cdef-123456789abc",
      "status": "completed",
      "brandingStatus": "completed",
      "outputMediaAssetId": "e5f6a7b8-c9d0-1234-ef01-3456789abcde",
      "coverMediaAssetId": "f6a7b8c9-d0e1-2345-f012-456789abcdef",
      "brandingConfig": {
        "subtitlesEnabled": true,
        "logoEnabled": true,
        "coverFrameSec": 1.0
      },
      "canApplyBranding": false,
      "canRebrand": true
    }
  }
}
```

### Subtitle sanitize failure

```json
{
  "ok": false,
  "error": {
    "code": "SUBTITLE_SANITIZE_FAILED",
    "messageKey": "scripts.branding.failure.subtitleSanitize"
  }
}
```

---

## Security test matrix (BUILD)

| Test | Expect |
|------|--------|
| Forbidden `logoAssetId` on apply branding | `FORBIDDEN_FIELDS` |
| Forbidden `onScreenText` on apply branding | `FORBIDDEN_FIELDS` |
| Cliente `applyBrandingForAssembly` | `403` |
| Foreign `assemblyJobId` | `404` |
| Logo SVG/HTML upload | rejected |
| Logo > 2 MiB | rejected |
| Sanitizer fixture `{\fs999}` | `SUBTITLE_SANITIZE_FAILED` |
| `buildReelV1BrandingArgs` golden — no raw beat text | pass |
| Mocked spawn receives `string[]`, `shell: false` | pass |
| Foreign `client_logo` / `cover_frame` serve | `404` |
| Cliente branded `assembled_reel` video serve | `403` |
| Cross-tenant worker assets | `failed` without spawn |
| Grep: no `UPDATE … branding_status` outside `lib/assembly/**` | pass |
| Grep: no `fetch(` in branding download path | pass |
| Ficha PATCH with `logo_asset_id` | rejected |

---

## Out of scope (explicit)

- **US-9.1** primary assembly re-run
- **Soft subtitles** / WebVTT sidecar
- **STT / ASR** subtitle generation · **TTS / provider word-level timestamps**
- **Custom / second font weight** / font upload — **further defer** (not US-9.2-B)
- **Preview thumbnail strip** — **further defer** (not US-9.2-B)
- **Cliente `/profile` `coverFrameSec` UI** — Operator override only in Phase B; client default stays Zod **1.0**
- **Cliente** branded video preview (US-11.1)
- **US-10.1** QA agent body · **US-11.x** approval UI
- **Weekly auto-branding cron** (integrations-engineer / ADR-0001)
- **System placeholder watermark** when logo missing
- **Live FFmpeg in CI** — args builder unit tests + mocked spawn only
- **`branding_status = skipped` emission** in Phase A auto-chain
- **New story ID** — Phase B remains **US-9.2** / sprint `US-9.2-B`

**Phase B pulls in (see § Phase B below):** VO word-partition beat timing · Operator optional `coverFrameSec` on Apply / Re-brand.

---

## Reviewed by FE (Phase A)

**Reviewed by FE:** yes — 2026-08-30 — nextjs-frontend.

**Verdict:** Accept — DTOs, Server Actions, poll extension, and surface routing are implementable against existing `/profile` and `/operator/scripts` patterns.

**BUILD notes (FE) — Phase A (shipped):**

- **Cliente `/profile`:** Add **Marca / Brand** section below interview sections in `LivingProfileView` / new `ProfileBrandingSection` client component — **outside** Ficha edit/save chrome (immediate mutations like `AvatarReferencesSection`). Hidden `<input type="file">` + Button upload; `FormData` → `uploadClientLogo`; `removeClientLogo` with `ConfirmDialog`; `InputSwitch` toggles call `updateAssemblyConfigDefaults` on change. Logo preview via `branding.logoPreviewUrl`. Render only when `result.exists === true`. Do **not** expose `coverFrameSec` in Cliente UI (Phase A — server default only; **Phase B still no Cliente cover control**).
- **Operator `/operator/scripts`:** Extend `OperatorAssemblyPanel` (or sibling block in same expand row) with branding status `Tag`, `Checkbox` toggles seeded from `job.brandingConfig ?? { subtitlesEnabled: true, logoEnabled: true }`, **Apply branding** / **Re-brand** via `applyBrandingForAssembly({ assemblyJobId, subtitlesEnabled, logoEnabled })`, Re-brand confirm dialog mirroring `AssemblyReassembleConfirmDialog`. Preview `<video>` src rules per § Batch DTO; pending banner when assembly `completed` and branding null/queued. **Download cover** as link to `/api/media/assets/{coverMediaAssetId}` when set. **Phase B:** add cover `InputNumber` — see § Phase B — FE enablement.
- **Poll:** Extend `operatorAssemblyJobStatusDtoSchema` + `mergePolledStatus` in `OperatorAssemblyPanel`; poll while assembly **or** branding in-flight (`queued`/`processing`); reuse `ASSEMBLY_JOB_POLL_INTERVAL_MS_DEFAULT`.
- **Types:** Import from `lib/contracts/profile` (`branding` block), `lib/contracts/assembly-job` (extended DTO), `lib/contracts/branding-job` (`assemblyConfigSchema` for toggle types only).
- **i18n:** `profile.branding.*`, `scripts.branding.*` EN + ES; map `brandingFailureReason` messageKeys (e.g. `scripts.branding.failure.subtitleSanitize`) like assembly failure reasons.
- **Out of scope:** Cliente branded video player; FFmpeg details; storage keys in UI.

**Disputes:** None blocking Phase A BUILD.

---

# Phase B — VO-proportional beat timing + Operator `coverFrameSec`

**Status:** Frozen — 2026-08-31 (BE authored) · **Reviewed by FE: yes — 2026-08-31**  
**Sprint:** `US-9.2-B` · branch `feature/US-9.2-phase-b-subtitle-cover`  
**Sources:** `PHASE-B.md` (B1–B15) · `SPEC-REVIEW-PHASE-B.md` (ALIGNED) · `SECURITY.md` Phase B (8 conditions)  
**DB:** **None** — reuse `assembly_config` / `branding_config` JSON (`coverFrameSec` already present).  
**Phase A floors:** Remain binding. Phase B **extends**; does not weaken sanitizer, spawn, owned-asset, or Operator-gate rules.

**Acceptance boundary (narrow — binding):** Phase B ships **only** VO word-partition subtitle timing + Operator optional `coverFrameSec`. **Further defer (not US-9.2-B):** second font weight · preview thumbnail strip · Cliente Ficha cover UI · TTS/ASR timestamps.

**Terminology (Phase B):** Prefer **Cover frame / frame second** (i18n) · **texto en pantalla** · Voiceover/VO (timing source). Do **not** claim “lip-sync” or “word-aligned audio” in UI. Do **not** expose VO raw text, ASS body, or FFmpeg argv in DTOs.

---

## Phase B — SECURITY reconciliation (8 conditions)

| # | Condition | Frozen here |
|---|-----------|-------------|
| 1 | Anti–cover-injection: optional `coverFrameSec` numeric Zod `min(0).max(45)`; invalid → `VALIDATION_ERROR`; argv uses number + duration clamp | § Trigger schema · § Cover seek clamp |
| 2 | Anti–VO-in-ASS/argv: `voiceover_text` for word counts only → numeric timings; never ASS Dialogue or argv | § VO timing · § `buildAssFromBeats` |
| 3 | Anti–subtitle-injection: same Phase A sanitizer → ASS temp → path-only; timing path must not bypass | § ASS dialogue source |
| 4 | Anti–client-authority: allow typed cover number only; forbid beat/VO/path/URL/font/snapshot/hash | § Forbidden keys amend |
| 5 | Anti–shell-injection: `spawn` args-array, `shell: false` | Re-assert Phase A |
| 6 | Anti–client-paths/SSRF: server temp + Storage SDK only | Re-assert Phase A |
| 7 | Anti–timing/fingerprint-forgery: server `computeVoProportionalBeatTimings` + `voiceoverTimingHash` in fingerprint | § Timing hash · § Fingerprint delta |
| 8 | Anti–auto-chain cover smuggle: profile defaults only — no request `coverFrameSec` | § Trigger · auto-chain |

---

## Phase B — `computeVoProportionalBeatTimings()` (frozen)

**File (BUILD):** `lib/assembly/compute-vo-proportional-beat-timings.ts` (pure — no I/O)

```ts
export type AssBeatTiming = {
  startSec: number;
  endSec: number;
};

/** Same tokenizer as US-5.2 `countVoiceoverWords`. */
export function tokenizeVoiceoverWords(voiceoverText: string): string[] {
  return voiceoverText.trim().split(/\s+/).filter(Boolean);
}

export function computeVoProportionalBeatTimings(params: {
  beatCount: number;
  targetDurationSec: number;
  voiceoverText: string;
}): AssBeatTiming[];
```

### Algorithm (binding)

1. **`tokens`** = `tokenizeVoiceoverWords(voiceoverText)` (whitespace split after trim; empty segments dropped).
2. **Fallback equal split** when `tokens.length === 0` **OR** `beatCount <= 0` **OR** `targetDurationSec <= 0`:
   - If `beatCount <= 0`: return `[]`.
   - Else: Phase A equal split — `duration = targetDurationSec / beatCount`; beat *i* → `{ startSec: i * duration, endSec: (i + 1) * duration }` for `i ∈ [0, beatCount)`; **last `endSec` forced to `targetDurationSec`** (float drift).
3. **Contiguous partition** of `tokens` into `beatCount` buckets:
   - `base = Math.floor(tokens.length / beatCount)`
   - `remainder = tokens.length % beatCount`
   - Bucket *i* length = `base + (i < remainder ? 1 : 0)` (remainder spread to **leading** buckets)
   - Buckets are contiguous slices in token order (no reordering).
4. **Duration:** `duration_i = (bucket_i.length / tokens.length) * targetDurationSec`.
5. **Cumulative:** `start_0 = 0`; `end_i = start_i + duration_i`; `start_{i+1} = end_i`. **Force `end_{beatCount-1} = targetDurationSec`**.
6. Empty buckets (length 0) still produce a timing interval of **0** duration at the cumulative cursor (caller may skip empty **on-screen** beats before burn-in — empty sanitized beat list still skips ASS entirely per Phase A).

### Explicit outs

- **No** TTS / CosyVoice / ElevenLabs word timestamps  
- **No** ASR from VO audio  
- **No** client-supplied `beatTimings` / cue lists  
- **No** separate cue-list schema  

**Label for VALIDATION / UI:** **VO-proportional beat timing from `voiceover_text`** — script-word proxy, not A/V alignment.

---

## Phase B — `voiceoverTimingHash` + fingerprint delta

**File (BUILD):** same module as timing helper (or `lib/assembly/branding-fingerprint.ts`)

### Hash input (frozen)

```ts
voiceoverTimingHash = sha256(
  tokenizeVoiceoverWords(voiceoverText).join("\n")
).hex(); // 64 lowercase hex
```

| Case | Input to sha256 |
|------|-----------------|
| VO with tokens | Tokens joined by `\n` (token text as returned by tokenizer — no lowercasing) |
| Empty VO / zero tokens | sha256 of empty string `""` → stable empty hash |

**Semantics:** Hash of the **normalized VO token list** (not partition lengths alone). Changing VO whitespace that does not change tokens → same hash. Changing any token → new hash → new fingerprint.

`subtitleSourceHash` remains sha256 of sanitized **on_screen** beats joined by `\n` (Phase A unchanged).

### Snapshot field

Extend `brandingConfigSnapshotSchema`:

```ts
export const brandingConfigSnapshotSchema = assemblyConfigSchema.extend({
  subtitleBeatCount: z.number().int().min(0).max(8),
  subtitleSourceHash: z.string().length(64),
  voiceoverTimingHash: z.string().length(64), // Phase B — server-only
});
```

DTO may continue to expose only `{ subtitlesEnabled, logoEnabled, coverFrameSec }` to FE — **do not** expose `voiceoverTimingHash` / `subtitleSourceHash` in Operator panel DTO (server fingerprint internals).

### Fingerprint formula (Phase B supersedes Phase A string)

```ts
branding_fingerprint = sha256(
  preBrandingOutputMediaAssetId + "|" +
  stableStringify(branding_config) + "|" +
  branding_config.subtitleSourceHash + "|" +
  branding_config.voiceoverTimingHash
).hex();
```

| Change | Effect |
|--------|--------|
| On-screen beats change | New `subtitleSourceHash` → new fingerprint |
| VO tokens change (same on-screen) | New `voiceoverTimingHash` → new fingerprint → re-brand allowed |
| Operator `coverFrameSec` / toggles | New `branding_config` via `stableStringify` → new fingerprint |
| Client supplies hash / fingerprint | **Forbidden** → `FORBIDDEN_FIELDS` |

---

## Phase B — ASS dialogue source (re-assert)

| Input | Role |
|-------|------|
| Sanitized **`on_screen_text`** beats | **Sole** ASS Dialogue text |
| **`voiceover_text`** | Word **counts / partition** for numeric `AssBeatTiming[]` only |
| Client beat text / VO / timings | **Forbidden** on apply |

Pipeline unchanged: sanitize → `buildAssFromBeats` → temp `.ass` → **path-only** in argv. Timing math is numeric-only.

---

## Phase B — `buildAssFromBeats()` signature delta

**File:** `lib/assembly/ffmpeg/build-ass-from-beats.ts` (extend)

```ts
export function buildAssFromBeats(input: {
  sanitizedBeats: string[];
  targetDurationSec: number;
  outputAssPath: string;
  /** Phase B: when omitted or empty, equal-split (Phase A). When present, length must equal sanitizedBeats.length. */
  beatTimings?: AssBeatTiming[];
}): { assContent: string; beatTimings: AssBeatTiming[] };
```

| Rule | Detail |
|------|--------|
| Explicit timings provided | Use them for Dialogue start/end; **do not** re-tokenize VO inside ASS builder |
| Missing / invalid length | Fall back to Phase A equal split from `targetDurationSec` / `sanitizedBeats.length` |
| Dialogue text | `sanitizedBeats[i]` only — never VO substrings |
| Typography | Phase A constants unchanged (DejaVu Sans Bold, 48px, etc.) |

**Caller (worker / orchestrator):** load `voiceover_text` with script; `timings = computeVoProportionalBeatTimings({ beatCount: sanitizedBeats.length, targetDurationSec, voiceoverText })`; pass into `buildAssFromBeats`.

---

## Phase B — Trigger schema amend (`applyBrandingForAssembly`)

**Thin Server Action** — request shape (strict Zod):

```ts
export const applyBrandingForAssemblyRequestSchema = z
  .object({
    assemblyJobId: z.string().uuid(),
    subtitlesEnabled: z.boolean().optional(),
    logoEnabled: z.boolean().optional(),
    coverFrameSec: z
      .number({ error: "VALIDATION_ERROR" })
      .finite()
      .min(0)
      .max(45)
      .optional(),
  })
  .strict();
```

| Field | Rule |
|-------|------|
| `coverFrameSec` | Optional **number** only; `0–45` inclusive; reject NaN / Infinity / non-number → **`VALIDATION_ERROR`** (field `coverFrameSec`) — **no** enqueue |
| Manual merge | When `source = operator_manual` and `coverFrameSec` provided → snapshot uses Operator value; else client `assembly_config.coverFrameSec` (default **1.0**) |
| Auto-chain | **`createBrandingJobForAssembly({ …, source: "auto_chain" })`** — **never** accepts request `coverFrameSec`; always profile / server defaults |
| Gate | **`requireOperator("handler")` first** (unchanged) |

**Orchestrator signature delta:**

```ts
export async function createBrandingJobForAssembly(input: {
  assemblyJobId: string;
  subtitlesEnabled?: boolean;
  logoEnabled?: boolean;
  coverFrameSec?: number; // operator_manual only — ignored/absent on auto_chain
  source: "auto_chain" | "operator_manual";
}): Promise<CreateBrandingJobForAssemblyResult>;
```

Step 4 (load script): also load **`voiceover_text`** with `on_screen_text` + `target_duration_sec` from owned linked `neuramark_reel_scripts` row.

Step 6 (merge): Phase B — `coverFrameSec` from Operator override when provided on manual path; else defaults.

Step 10: include `voiceoverTimingHash` in snapshot + fingerprint.

---

## Phase B — Cover seek clamp

**File:** `lib/assembly/ffmpeg/extract-cover-frame-args.ts` (extend) + worker caller

```ts
export function clampCoverSeekSec(input: {
  coverFrameSec: number;
  durationSec: number;
}): number {
  const maxSeek = Math.max(0, input.durationSec - 0.05);
  return Math.min(Math.max(0, input.coverFrameSec), maxSeek);
}
```

| Rule | Detail |
|------|--------|
| Snapshot value | Zod-validated `branding_config.coverFrameSec` (number) |
| `durationSec` preference | **Measured** branded file duration when available; else `target_duration_sec` from script |
| Clamp window | **`[0, max(0, durationSec - 0.05)]`** |
| Argv | `-ss` stringified from **clamped number** only — never raw request string |

```ts
extractCoverFrameArgs({
  localBrandedPath,
  localCoverPath,
  coverFrameSec: clampCoverSeekSec({ coverFrameSec: snapshot.coverFrameSec, durationSec }),
});
```

---

## Phase B — Forbidden keys amend

**File:** `lib/assembly/find-forbidden-branding-keys.ts`

**Remove from forbidden (Phase B allow as typed Zod number on apply):**

- `coverFrameSec`
- `cover_frame_sec`

**Still forbidden (Phase A retained + Phase B additions):**

```ts
export const FORBIDDEN_BRANDING_AUTHORITY_KEYS = [
  "onScreenText",
  "on_screen_text",
  "voiceoverText",
  "voiceover_text",
  "beatTimings",
  "beat_timings",
  "subtitleBeats",
  "subtitle_beats",
  "logoAssetId",
  "logo_asset_id",
  "coverMediaAssetId",
  "cover_media_asset_id",
  "preBrandingOutputMediaAssetId",
  "pre_branding_output_media_asset_id",
  "brandingConfig",
  "branding_config",
  "assemblyConfig",
  "assembly_config",
  "brandingFingerprint",
  "branding_fingerprint",
  "brandingStatus",
  "branding_status",
  "voiceoverTimingHash",
  "voiceover_timing_hash",
  "subtitleSourceHash",
  "subtitle_source_hash",
  "clientId",
  "client_id",
  "status",
  "outputMediaAssetId",
  "output_media_asset_id",
  "fontPath",
  "font",
  "beatText",
  "force",
  "skipIdempotency",
  "skip_idempotency",
  // paths / argv authority
  "tempPath",
  "assPath",
  "ffmpegArgs",
  "localBasePath",
  "storageKey",
  "storage_key",
  // any http(s) URL keys
  "baseVideoUrl",
  "logoUrl",
  "assetUrl",
] as const;
```

Scan raw input with **`findForbiddenBrandingKeys`** **before** Zod parse → **`FORBIDDEN_FIELDS`**.

---

## Phase B — Zod / contract mirror deltas

| Export / file | Change |
|---------------|--------|
| `applyBrandingForAssemblyRequestSchema` (`lib/contracts/branding-job.ts`) | Add optional `coverFrameSec: z.number().finite().min(0).max(45)` |
| `brandingConfigSnapshotSchema` | Add `voiceoverTimingHash: z.string().length(64)` |
| `assemblyConfigSchema` | Unchanged (`coverFrameSec` already `0–45`) |
| Operator DTO `brandingConfig` | Still `{ subtitlesEnabled, logoEnabled, coverFrameSec }` only — seed FE InputNumber |
| `AssBeatTiming` type | Exported from contracts or assembly pure module for FE-unrelated worker tests |

---

## Phase B — Error codes (additive)

| Code | When |
|------|------|
| `VALIDATION_ERROR` | `coverFrameSec` non-number / NaN / &lt;0 / &gt;45; field map `{ coverFrameSec: "…" }` |
| `FORBIDDEN_FIELDS` | VO / beat timings / paths / hashes / snapshot JSON / removed-key regressions |
| *(unchanged)* | `SUBTITLE_SANITIZE_FAILED`, `FORBIDDEN`, `NOT_FOUND`, … |

No new error code required for equal-split fallback (silent, expected).

---

## Phase B — FE enablement (Operator only)

**Surface:** `/operator/scripts` — existing branding section in `OperatorAssemblyPanel`.

| Element | Rule |
|---------|------|
| Control | PrimeReact **`InputNumber`** — seconds, **step 0.1**, min **0**, max **45** |
| Seed | `job.brandingConfig?.coverFrameSec` ?? client default from profile batch if exposed ?? **1.0** |
| Wire | `applyBrandingForAssembly({ assemblyJobId, subtitlesEnabled, logoEnabled, coverFrameSec })` on Apply / Re-brand |
| Busy | Disable while branding in-flight / panel busy (same as toggles) |
| i18n | EN/ES **`scripts.branding.coverFrame*`** (label, hint, validation) — not raw key as sole copy |
| Continuity | **Do not** rebuild subtitle/logo toggles |
| Out | **No** Cliente Ficha cover control · **No** thumbnail strip · **No** second font UI |

**Reviewed by FE: yes — 2026-08-31 — nextjs-frontend.**

---

## Phase B — Fixtures

### Apply with cover override

```json
{
  "assemblyJobId": "c3d4e5f6-a7b8-9012-cdef-123456789abc",
  "subtitlesEnabled": true,
  "logoEnabled": true,
  "coverFrameSec": 2.5
}
```

### Validation — cover out of range

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "fields": { "coverFrameSec": "scripts.branding.coverFrame.invalid" }
  }
}
```

### Forbidden — VO text on apply

```json
{
  "ok": false,
  "error": {
    "code": "FORBIDDEN_FIELDS",
    "fields": { "voiceoverText": "forbidden" }
  }
}
```

### Timing helper example (unit)

- `voiceoverText = "one two three four five six"`, `beatCount = 3`, `targetDurationSec = 30`
- Tokens = 6; buckets = [2, 2, 2]; durations = [10, 10, 10]
- Timings = `[{0,10},{10,20},{20,30}]`

---

## Phase B — Test files (BUILD)

| File | Covers |
|------|--------|
| `lib/assembly/compute-vo-proportional-beat-timings.test.ts` | Partition math; remainder spread; empty VO → equal split; `beatCount === 0` → `[]`; last end === target; hash stability |
| `lib/assembly/ffmpeg/build-ass-from-beats.test.ts` (extend) | Explicit timings in Dialogue timestamps; VO fixture string **absent** from `assContent`; equal-split fallback |
| `lib/assembly/ffmpeg/extract-cover-frame-args.test.ts` (extend) | Clamp to `duration − 0.05`; `-ss` numeric only |
| `lib/assembly/find-forbidden-branding-keys.test.ts` (extend) | `coverFrameSec` **not** forbidden; `voiceoverText` / `beatTimings` / `voiceoverTimingHash` / paths **forbidden** |
| `lib/assembly/branding-fingerprint.test.ts` (or create) | Same on-screen + changed VO tokens → new fingerprint; same VO → sticky |
| `lib/assembly/actions/apply-branding-for-assembly.test.ts` (extend) | `coverFrameSec: -1` / `46` / `"1;rm"` → `VALIDATION_ERROR` or Zod fail; valid merge into snapshot; Cliente 403 |

---

## Phase B — Security test matrix (additive)

| Test | Expect |
|------|--------|
| `coverFrameSec` string / filter metacharacters | Rejected (not number) |
| `coverFrameSec: -1` or `46` | `VALIDATION_ERROR` — no enqueue |
| Valid `coverFrameSec` in bounds | Accepted; appears as **number** in cover `-ss` only |
| VO injection fixture in `voiceover_text` | **Not** in ASS Dialogue or branding/cover argv |
| On-screen ASS metacharacter fixture | Still sanitized / `SUBTITLE_SANITIZE_FAILED` |
| Forbidden `voiceoverText` / `beatTimings` / `fontPath` / `brandingConfig` / path keys | `FORBIDDEN_FIELDS` |
| Mocked spawn | `string[]`, `shell: false` |
| Cliente `applyBrandingForAssembly` | `403` |
| Fingerprint: VO token change, same on-screen | New fingerprint |
| Auto-chain | Ignores any smuggled request cover (no request body) |

---

## Phase B — Acceptance mapping (for validator)

Same USER_STORIES § US-9.2 AC (do **not** uncheck Phase A; **no** new checkboxes):

| Deferred item (Phase A) | Phase B proof |
|-------------------------|---------------|
| VO-synced subtitle timing | `computeVoProportionalBeatTimings` + ASS timings; equal fallback; VALIDATION labels proxy not lip-sync |
| Operator per-reel `coverFrameSec` | InputNumber → apply schema → snapshot → clamp seek |
| `[SEC]` subtitle sanitize | Re-verify on VO-timing path — VO never in ASS/argv |

---

## Phase B — Reviewed by FE

**Reviewed by FE: yes — 2026-08-31 — nextjs-frontend.**

**Verdict:** **approved** — Phase B FE enablement is implementable against existing `/operator/scripts` `OperatorAssemblyPanel` branding section (Phase A toggles, Apply / Re-brand, poll, cover download). No contract disputes.

**Sign-off checklist for FE:**

- [x] Operator `InputNumber` seed + Apply/Re-brand wire matches § Phase B — FE enablement
- [x] Optional `coverFrameSec` on `applyBrandingForAssembly` request shape accepted
- [x] i18n keys `scripts.branding.coverFrame*` (EN/ES) — no lip-sync copy
- [x] No Cliente cover control; no thumbnail strip; toggles reused

**BUILD constraints (FE):**

| # | Constraint |
|---|------------|
| 1 | Add PrimeReact **`InputNumber`** in `OperatorAssemblyPanel` branding block (next to existing subtitle/logo `Checkbox`es) — `min={0}` `max={45}` `step={0.1}`; seed `job.brandingConfig?.coverFrameSec ?? 1.0`; disable when `panelBusy \|\| brandingInFlight`. |
| 2 | Pass **`coverFrameSec` only as optional `number`** on `applyBrandingForAssembly({ assemblyJobId, subtitlesEnabled, logoEnabled, coverFrameSec })` for Apply **and** Re-brand — never string / FormData text; omit only if leaving server default (prefer always pass current InputNumber value when in range). |
| 3 | Extend `onRequestRebrand` / rebrand confirm path to include `coverFrameSec` (today: `(assemblyJobId, subtitlesEnabled, logoEnabled)` only). |
| 4 | i18n EN+ES: `scripts.branding.coverFrame.label`, `scripts.branding.coverFrame.help`, `scripts.branding.coverFrame.invalid` — cover-frame / seconds language only; **no** lip-sync / word-aligned-audio claims. Extend `OperatorBrandingCopy`. |
| 5 | **Do not** touch Cliente `/profile` Brand section for cover; **do not** add thumbnail strip; **do not** rebuild subtitle/logo toggles. |
| 6 | **BE prerequisite (coordinate):** BUILD must extend `applyBrandingForAssemblyRequestSchema` with optional `coverFrameSec` **and** remove `coverFrameSec` / `cover_frame_sec` from `FORBIDDEN_BRANDING_AUTHORITY_KEYS` (Phase A still forbids them in `lib/contracts/branding-job.ts`) before FE can ship the wire — FE panel DTO already exposes `brandingConfig.coverFrameSec` for seed. |

**Disputes:** None blocking Phase B BUILD.

---

# Phase B-M1 — Worker `voiceoverTimingHash` re-check

**Status:** Frozen — 2026-08-31 (BE authored) · **Reviewed by FE: N/A — no FE surface** (PO M1-9 waiver) · **BUILD unblocked** (no FE signoff required)  
**Sprint:** `US-9.2-B-M1` · branch `feature/US-9.2-b-m1-voiceover-timing-hash`  
**Sources:** `PHASE-B-M1.md` (M1-1…M1-10) · `SECURITY.md` Phase B-M1 (4 conditions) · QA-PHASE-B Medium #1  
**DB:** **None.**  
**FE:** **None** — Operator panel may keep generic failed status; optional i18n for the new key later.  
**Phase A/B floors:** Remain binding. This section **amends** `runBrandingJob` only — does **not** rewrite Phase A/B sections above.

**Acceptance boundary (narrow — binding):** Close fingerprint integrity gap — worker re-verifies snapshot `voiceoverTimingHash` against live script VO before VO-proportional ASS timings / spawn. **Do not** add or uncheck USER_STORIES § US-9.2 AC. **Do not** change hash formula, fingerprint shape, or apply schema.

---

## Phase B-M1 — SECURITY reconciliation (4 conditions)

| # | Condition | Frozen here |
|---|-----------|-------------|
| 1 | Guard after live VO load + `subtitleSourceHash` check, **before** `mkdtemp` / ASS / spawn | § Worker step |
| 2 | Reuse `computeVoiceoverTimingHash(voiceoverText)`; mismatch → `failBrandingJob` + sanitized key; **zero** spawn | § Fail constant · § Worker step |
| 3 | Enforce only when snapshot hash is **64-char hex**; empty/missing → **skip**; malformed non-empty → **not** skip | § Legacy / enforce predicate |
| 4 | No new client authority; VO still never ASS Dialogue / argv; fail reason = i18n code only | § Out of scope · § Fail constant |

---

## Phase B-M1 — Fail constant (frozen string)

**File (BUILD):** `lib/branding/run-branding-job.ts` (parallel to `BRANDING_FAILURE_SUBTITLE_HASH`)

```ts
export const BRANDING_FAILURE_SUBTITLE_HASH =
  "scripts.branding.failure.subtitleHashMismatch" as const; // existing — unchanged

export const BRANDING_FAILURE_VOICEOVER_TIMING_HASH =
  "scripts.branding.failure.voiceoverTimingHashMismatch" as const;
```

| Export | `messageKey` / `failure_reason` value (exact) |
|--------|-----------------------------------------------|
| `BRANDING_FAILURE_VOICEOVER_TIMING_HASH` | **`scripts.branding.failure.voiceoverTimingHashMismatch`** |

**Rules:** Persist via `failBrandingJob` → `applyBrandingJobUpdate` as sanitized reason only. **Forbidden** in DTO / production logs: live VO text, hash digests, argv, `storage_key`.

---

## Phase B-M1 — Legacy / enforce predicate (frozen)

Evaluate against the **`voiceoverTimingHash` field as stored in `branding_config` JSON** (or the worker’s equivalent raw snapshot field **before** any soft-default that invents a hash for missing Phase A rows):

| Snapshot `voiceoverTimingHash` | Behavior |
|--------------------------------|----------|
| Absent, `null`, or `""` | **Skip** VO-hash re-check (Phase A legacy rows never stored the hash) |
| Exactly **64 lowercase hex** (`/^[0-9a-f]{64}$/`) | **Enforce** — recompute and compare |
| Non-empty malformed (wrong length, non-hex, uppercase-only mix that fails the regex) | **Fail** job with `BRANDING_FAILURE_CONFIG` — **no** spawn; **do not** soft-skip (SECURITY M1 condition 3) |

**Empty VO (M1-7):** When hash is present (64-char hex), still enforce — `computeVoiceoverTimingHash("")` is deterministic (`sha256("")`); mismatch still fails.

**BUILD note (binding):** Live `parseBrandingConfig` soft-defaults a missing field to `sha256("")` for Zod/fingerprint continuity. That soft-default **must not** cause false enforcement on Phase A rows. Guard must use raw-field presence (or equivalent: treat “was missing before soft-default” as skip). Soft-default empty-VO hash for a **present** Phase B empty-VO snapshot remains enforceable.

---

## Phase B-M1 — Worker step (`runBrandingJob` amend)

**File (BUILD):** `lib/branding/run-branding-job.ts`  
**Compare API (reuse — do not fork):** `computeVoiceoverTimingHash(voiceoverText)` from `lib/assembly/compute-vo-proportional-beat-timings.ts` (same input as enqueue — Phase B hash formula unchanged).

**Placement (binding — same early-fail window as subtitle hash):**

Inside the burn-in / script-load path, **after** successful sanitize + existing:

```ts
if (sanitized.subtitleSourceHash !== config.subtitleSourceHash) {
  await failBrandingJob(activeJob.id, BRANDING_FAILURE_SUBTITLE_HASH);
  return;
}
```

…and **before** `mkdtemp` / ASS write / `computeVoProportionalBeatTimings` / FFmpeg `spawn`:

```ts
// Pseudocode — exact helper name free at BUILD
const snapshotHash = /* raw branding_config.voiceoverTimingHash */;
if (isPresent64LowerHex(snapshotHash)) {
  const liveHash = computeVoiceoverTimingHash(voiceoverText);
  if (liveHash !== snapshotHash) {
    await failBrandingJob(activeJob.id, BRANDING_FAILURE_VOICEOVER_TIMING_HASH);
    return;
  }
} else if (isNonEmptyMalformed(snapshotHash)) {
  await failBrandingJob(activeJob.id, BRANDING_FAILURE_CONFIG);
  return;
}
// else empty/missing → skip
```

| Rule | Detail |
|------|--------|
| When burn-in off | No VO timings path → guard naturally not required (no proportional ASS from VO) |
| Match | Continue to proportional timings / temp / spawn unchanged |
| Mismatch | `branding_status = failed`, reason = `BRANDING_FAILURE_VOICEOVER_TIMING_HASH`, **zero** FFmpeg invocations |
| VO in ASS/argv | Unchanged — VO counts-only; never Dialogue / argv |

**No** new apply/trigger fields. `voiceoverTimingHash` remains **`FORBIDDEN_FIELDS`** (Phase B list unchanged).

---

## Phase B-M1 — Unit test fixture requirement (BUILD)

**File (BUILD):** `lib/branding/run-branding-job.test.ts` (extend)

| Fixture | Expect |
|---------|--------|
| Live `voiceoverText` mutated so `computeVoiceoverTimingHash(live) !==` snapshot 64-hex `voiceoverTimingHash` (subtitle hash still matches) | Job **`failed`**; `failure_reason === BRANDING_FAILURE_VOICEOVER_TIMING_HASH`; **FFmpeg runner / spawn never called** |
| Matching hash (happy path) | Proceeds past guard (existing path may cover) |
| Empty/missing snapshot hash (legacy) | Guard skipped — does not false-fail solely for missing Phase A field |

---

## Phase B-M1 — Reviewed by FE

**Reviewed by FE: N/A — no FE surface** (PO M1-9).

**Waiver:** Phase B-M1 adds worker integrity guard + sanitized fail code only. No DTO, Server Action, or UI change. FE signoff **not required**. Contract frozen; **BUILD unblocked**.

---

# Phase B-M2 — Atomic branding claim + queued-only poll

**Status:** Frozen — 2026-08-31 (BE authored) · **Reviewed by FE: N/A — no FE surface** (PO M2-9 waiver) · **BUILD unblocked** (no FE signoff required)  
**Sprint:** `US-9.2-B-M2` · branch `feature/US-9.2-b-m2-branding-poll-claim`  
**Sources:** `PHASE-B-M2.md` (M2-1…M2-11) · `SECURITY.md` Phase B-M2 (lean amend — worker claim AC) · QA Phase A Finding 1 · QA-PHASE-B Medium #2  
**DB:** **None** — claim via conditional UPDATE on existing `neuramark_assembled_reels` row (optional SQL RPC at implementer discretion; not required).  
**FE:** **None** — Operator panel unchanged; stale-`processing` → `failed` path already surfaced.  
**Phase A/B/M1 floors:** Remain binding. This section **amends** `applyBrandingJobUpdate`, `pollQueuedBrandingJobsBatch`, and `runBrandingJob` step 1 — does **not** rewrite hash formula, fingerprint, apply schema, or VO-hash guard.

**Acceptance boundary (narrow — binding):** Close branding poll claim race — exactly one worker may proceed from `queued` to FFmpeg per row; concurrent Fly replicas or dev in-process + poll overlap exit silently on lost claim. **Do not** add or uncheck USER_STORIES § US-9.2 AC. **Do not** bundle US-9.1 assembly poll claim (separate backlog).

---

## Phase B-M2 — SECURITY reconciliation (lean)

| # | Condition | Frozen here |
|---|-----------|-------------|
| 1 | Claim is **worker-only** — no new client authority, endpoints, or DTO fields | § Out of scope · § Claim mechanism |
| 2 | Integrity / spend control — prevents duplicate FFmpeg and orphaned `branded-*` / `cover-*` assets | § Runner gate · § Poll batch |
| 3 | Lost claim returns **`idempotent: true`** — **no throw**; loser must not download or spawn | § Applier contract |
| 4 | Stale `processing` remains worker-only via `markStaleBrandingJobsFailed` — no mid-`processing` auto-resume from poll | § Poll batch · § Stale policy |

---

## Phase B-M2 — Claim mechanism (frozen)

**File (BUILD):** `lib/branding/apply-branding-job-update.ts` (extend existing applier)

**Intent (mirror US-9.1 CONTRACT § Poll runtime):** Per-job atomic claim via conditional UPDATE — not batch `FOR UPDATE SKIP LOCKED` on SELECT (Supabase JS has no first-class SKIP LOCKED; per-row UPDATE is the correctness gate).

**SQL semantics (binding):**

```sql
UPDATE neuramark_assembled_reels
SET
  branding_status = 'processing',
  updated_at = now(),
  pre_branding_output_media_asset_id = COALESCE(
    pre_branding_output_media_asset_id,
    output_media_asset_id
  )
WHERE
  id = $assemblyJobId
  AND status = 'completed'
  AND branding_status = 'queued'
RETURNING id;
```

**Supabase JS equivalent (binding behavior, not module name):**

```ts
const { data, error } = await supabase
  .from("neuramark_assembled_reels")
  .update({
    branding_status: "processing",
    updated_at: new Date().toISOString(),
  pre_branding_output_media_asset_id: /* copy output when not yet set — M2-7 */,
  })
  .eq("id", assemblyJobId)
  .eq("status", "completed")
  .eq("branding_status", "queued")
  .select("id");

// data.length === 0 ⇒ lost race (another worker claimed first)
```

| Rule | Detail |
|------|--------|
| Predicate | **`status = 'completed'`** AND **`branding_status = 'queued'`** — only `queued` rows are claimable |
| Side effect | On successful claim, set `pre_branding_output_media_asset_id = output_media_asset_id` when not yet set (existing M1/M2-7 behavior — unchanged) |
| Zero rows | Lost race — **do not throw**; return idempotent success (§ Applier contract) |
| Optional RPC | Implementer may use raw SQL / RPC instead of Supabase `.update().select()` — PO requires M2-2…M2-5 behavior, not a specific module |

---

## Phase B-M2 — `applyBrandingJobUpdate` amend (processing claim)

**File (BUILD):** `lib/branding/apply-branding-job-update.ts`

**Amends** § `applyBrandingJobUpdate` — sole branding status writer (Phase A). Terminal / illegal transitions keep existing idempotent behavior.

### `processing` claim patch — rows-affected contract

When `patch.brandingStatus === "processing"`:

| Outcome | Return shape |
|---------|--------------|
| UPDATE matches **≥ 1 row** | `{ ok: true, jobId, brandingStatus: "processing", idempotent: false }` |
| UPDATE matches **0 rows** (lost race — peer claimed, row already `processing` / terminal, or assembly no longer `completed`) | `{ ok: true, jobId, brandingStatus: <current from re-load or null>, idempotent: true }` — **do not throw** |
| Supabase / DB error | Throw (unchanged) |

**Binding fix:** Today’s implementation issues conditional `.eq("branding_status", currentStatus)` but **does not** inspect rows affected and always returns `idempotent: false` on no error. BUILD **must** use `.select("id")` (or equivalent RETURNING) and treat **zero returned rows** as lost claim.

**Other patches (`completed`, `failed`):** Unchanged — still require prior `processing` (or allowed transition); terminal no-op remains `idempotent: true`.

**Only invokers:** Unchanged — `runBrandingJob`, `markStaleBrandingJobsFailed`, orchestrator `writeBrandingQueuedState` (`queued` only).

---

## Phase B-M2 — Poll batch amend (`queued`-only)

**File (BUILD):** `lib/branding/poll-branding-jobs.ts`

**Amends** § Poll runtime — branding worker extension (Phase A). Supersedes the illustrative `FOR UPDATE SKIP LOCKED` SELECT on `branding_status IN ('queued', 'processing')`.

### `pollQueuedBrandingJobsBatch` predicate (frozen)

```ts
// Candidate set — queued ONLY
.from(BRANDING_JOBS_TABLE)
.select("id")
.eq("status", "completed")
.eq("branding_status", "queued")   // NOT .in(["queued", "processing"])
.order("updated_at", { ascending: true })
.limit(limit);
```

| Rule | Detail |
|------|--------|
| Candidate set | **`branding_status = 'queued'`** only — drop `processing` from poll `.in(...)` |
| Stuck `processing` | Owned by **`markStaleBrandingJobsFailed()`** each tick **before** batch SELECT — stale → `failed` → Operator **Re-brand** |
| No mid-`processing` resume | Poll must **not** re-enter `runBrandingJob` for rows already `processing` (avoids double FFmpeg without lease columns) |
| Per-row claim | Correctness gate is **`runBrandingJob` → `applyBrandingJobUpdate` processing claim** (§ Claim mechanism), not SELECT locking |
| Dev overlap | `enqueueBrandingJob` fire-and-forget + Fly poll on same row: atomic claim ensures **one** FFmpeg winner; loser exits silently (optional debug/info log) |

**Stale sweep (re-assert):** `markStaleBrandingJobsFailed()` runs each tick before poll — unchanged threshold `NEURAMARK_BRANDING_STALE_TIMEOUT_MIN` (default 15).

---

## Phase B-M2 — `runBrandingJob` step 1 amend (runner gate)

**File (BUILD):** `lib/branding/run-branding-job.ts`

**Amends** § `runBrandingJob()` step 1 and placement **before** Phase B-M1 VO-hash guard / `mkdtemp` / download / spawn.

### Step sequence (binding)

| Step | Action |
|------|--------|
| 0 | Load job; if missing or terminal `branding_status` → **return** |
| 0b | If assembly `status !== 'completed'` → `failBrandingJob` + **return** (unchanged) |
| **1a** | If `branding_status === 'processing'` **at entry** (before claim attempt) → **return immediately** — another worker owns the row; **no** resume-from-poll |
| **1b** | If `branding_status === 'queued'` → `applyBrandingJobUpdate({ patch: { brandingStatus: "processing" }, source: "worker" })` |
| **1c** | If claim result `idempotent === true` → **return immediately** — lost race; **zero** `mkdtemp`, Storage download, or FFmpeg spawn |
| 2+ | Re-load job + `branding_config`; continue existing path (tenancy, subtitle hash, VO-hash guard per § Phase B-M1, temp dir, download, spawn, complete) |

```ts
// Pseudocode — exact helper structure free at BUILD
const job = await loadBrandingJobByIdUnscoped(assemblyJobId);
if (!job || isTerminalBrandingStatus(job.brandingStatus)) return;
if (job.status !== "completed") { await failBrandingJob(...); return; }

if (job.brandingStatus === "processing") {
  return; // peer worker — no resume
}

if (job.brandingStatus === "queued") {
  const claim = await applyBrandingJobUpdate({
    assemblyJobId: job.id,
    patch: { brandingStatus: "processing" },
    source: "worker",
  });
  if (claim.idempotent) {
    return; // lost race — silent exit
  }
}

// ... existing M1 guards, mkdtemp, download, spawn ...
```

| Rule | Detail |
|------|--------|
| Lost claim | **Silent exit** — optional `console.debug` / info log; **no** `failed` status (not an error — expected concurrency) |
| Winner | Exactly one worker proceeds to FFmpeg for a given `queued` → `processing` transition |
| M1 guards | VO-hash / subtitle-hash re-checks remain **after** successful claim, **before** `mkdtemp` (unchanged) |

---

## Phase B-M2 — Unit test fixture requirement (BUILD)

**File (BUILD):** `lib/branding/run-branding-job.test.ts` (extend)

| Fixture | Expect |
|---------|--------|
| Simulated lost claim — `applyBrandingJobUpdate` returns `{ idempotent: true }` for `processing` patch | **`runBrandingJob` returns** without `mkdtemp`, Storage download, or FFmpeg spawn |
| Simulated entry with `branding_status === 'processing'` before claim | **Return** without spawn (peer owns row) |
| Happy path — claim returns `{ idempotent: false, brandingStatus: "processing" }` | Proceeds to existing success path (may be covered by prior tests) |
| Optional concurrent-claim integration / double-call | Exactly **one** spawn winner per row |

**File (BUILD):** `lib/branding/apply-branding-job-update.test.ts` (extend or create)

| Fixture | Expect |
|---------|--------|
| `processing` patch when row already `processing` / not `queued` | `{ ok: true, idempotent: true }` — zero rows updated |
| `processing` patch when row `queued` + assembly `completed` | `{ ok: true, idempotent: false, brandingStatus: "processing" }`; `pre_branding_output_media_asset_id` set when absent |

---

## Phase B-M2 — Out of scope (explicit)

| Topic | Why |
|-------|-----|
| US-9.1 assembly poll claim | Same pattern — **separate** story / sprint (M2-11) |
| Batch `FOR UPDATE SKIP LOCKED` on poll SELECT | Optional implementer choice; per-job UPDATE is the PO-required gate |
| Mid-`processing` auto-resume from poll | Stale sweeper → `failed` → Operator re-brand |
| New USER_STORIES AC / unchecking Phase A/B/M1 AC | Out |
| Hash formula / fingerprint / VO-timing guards | Closed M1 — untouched |
| New endpoints / DTOs / FE | M2-8 / M2-9 |

---

## Phase B-M2 — Acceptance mapping (for validator)

Same USER_STORIES § US-9.2 AC (do **not** uncheck Phase A/B/M1; **no** new checkboxes):

| QA finding | Phase B-M2 proof |
|------------|------------------|
| QA Phase A Finding 1 (poll claim race) | Lost claim → **zero** FFmpeg; winner completes happy path |
| QA-PHASE-B Medium #2 (carry-forward) | Poll `queued`-only; atomic claim; `idempotent` skip on 0 rows |
| Stale sweeper regression | Stuck `processing` still → `failed`; queued-only poll does not starve legitimate work |

---

## Phase B-M2 — Reviewed by FE

**Reviewed by FE: N/A — no FE surface** (PO M2-9).

**Waiver:** Phase B-M2 hardens worker claim + poll predicate only. No DTO, Server Action, Route Handler, or UI change. FE signoff **not required**. Contract frozen; **BUILD unblocked**.

---

## Changelog

| Date | Change |
|------|--------|
| 2026-08-31 | **Phase B-M2 freeze** — atomic `queued`→`processing` claim via conditional UPDATE + RETURNING; `idempotent: true` on lost race; `runBrandingJob` early return before temp/download/spawn; poll `queued`-only; FE Reviewed N/A; BUILD unblocked |
| 2026-08-31 | **Phase B-M1 freeze** — worker `voiceoverTimingHash` re-check after subtitle-hash guard; fail key `scripts.branding.failure.voiceoverTimingHashMismatch`; legacy empty/missing skip; FE Reviewed N/A; BUILD unblocked |
| 2026-08-31 | **Phase B FE sign-off** — approved; BUILD constraints for Operator InputNumber + optional `coverFrameSec` wire + i18n; BUILD unblocked |
| 2026-08-31 | **Phase B freeze** — VO word-partition timings + `voiceoverTimingHash` fingerprint; optional Operator `coverFrameSec` on apply; seek clamp; forbidden-keys amend; narrow scope (no second font / thumbnail) |
| 2026-08-30 | Initial freeze — branding pipeline DDL, orchestrator, worker seam, ASS/FFmpeg graph, Cliente logo actions, DTOs, media serve; resolves SPEC-REVIEW + SECURITY gaps |
