Reviewed by FE: yes — 2026-08-30 — nextjs-frontend.

# API Contract — US-9.2 Add subtitles, logo, and cover

**Story:** US-9.2  
**Status:** Frozen — 2026-08-30 (Reviewed by FE: yes — 2026-08-30 — nextjs-frontend)  
**Security:** `plan/stories/US-9.2/SECURITY.md` (APPROVE WITH CONDITIONS — reconciled below)  
**Spec review:** `plan/stories/US-9.2/SPEC-REVIEW.md` (GAPS — resolved by this contract)  
**Pattern:** `plan/stories/US-9.1/CONTRACT.md` (extends assembly pipeline; second-pass branding on Fly worker)  
**Depends on:** US-9.1 ✅ assembled base + worker poll seam · US-5.1 ✅ `on_screen_text` beats · US-5.2 ✅ beat line bounds · US-2.2 ✅ Ficha viva `/profile` · US-3.3 ✅ `validateAndPrepareMediaUpload` · US-14.5 ✅ `requireOperator()` / `requireActive()`  
**ADR:** `docs/adr/0003-worker-flyio-ffmpeg.md` — Vercel orchestrator INSERT + enqueue; Fly FFmpeg + branding status writes  
**Feature branch:** `feature/US-9.2-subtitles-logo-cover`  
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
| Branding trigger input | `{ assemblyJobId, subtitlesEnabled?, logoEnabled? }` only | § `applyBrandingForAssembly` · § Forbidden request keys |
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
| **A (US-9.2 BUILD — ship first)** | DDL (`logo_asset_id`, `assembly_config`, branding columns, `client_logo` / `cover_frame` enums); logo upload/remove + `updateAssemblyConfigDefaults` on Ficha; branding worker pass (ASS burn-in + logo overlay + cover @ 1s); auto-chain after assembly `completed`; Operator branding panel + toggles; idempotency; `[SEC]` upload + subtitle sanitize; mobile safe-zone typography | USER_STORIES § US-9.2 AC rows |
| **B (follow-up BUILD slice — explicit PO pull-in)** | VO-proportional beat timing from `voiceover_text`; Operator per-reel `coverFrameSec` override on manual apply; bundled second font weight; preview thumbnail strip | SPEC polish — not required for AC closure |

**VALIDATION note (binding):** Phase A closes USER_STORIES § US-9.2 AC and completes the **subtitles/logo/cover** slice deferred from US-9.1 partial S3.M10 closure. **VALIDATION.md** must record remaining S3.M10 items: US-9.1 Phase B B-roll/`editing_hints`, weekly auto-brand (ADR-0001), VO-synced subtitle timing (US-9.2 Phase B).

**Partial narrative closure:** Phase A subtitle timing uses **equal beat split** from `target_duration_sec` only — **not** VO word-align. VALIDATION records this explicitly against USER_STORIES BE owner row wording.

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
- Client-supplied `onScreenText`, `logoAssetId`, `coverFrameSec` (manual trigger), URLs, `brandingConfig`, `brandingFingerprint`, `status`, `force`, `skipIdempotency`.
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
branding_fingerprint = sha256(
  preBrandingOutputMediaAssetId + "|" +
  stableStringify(branding_config) + "|" +
  branding_config.subtitleSourceHash
).hex(); // 64 lowercase hex chars
```

| Scenario | Behavior |
|----------|----------|
| `branding_status = completed` with same fingerprint on same row | Return `{ ok: true, assemblyJobId, brandingStatus: "completed", idempotent: true, outputMediaAssetId, coverMediaAssetId }` — **no** duplicate FFmpeg |
| `queued` / `processing` branding on same row | Return `{ ok: true, idempotent: true, inFlight: true }` — **no** duplicate enqueue |
| Prior branding **`failed`** for same fingerprint | **Allow** re-run — Operator **Re-brand** |
| `on_screen_text` / toggle / logo FK change | New `subtitleSourceHash` or config → new fingerprint → re-brand allowed |
| Partial unique index violation on concurrent complete | Loser treats as idempotent read of winner |

**Client cannot supply:** `brandingFingerprint`, `brandingConfig`, `preBrandingOutputMediaAssetId`, `force`, `skipIdempotency`.

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
| 4 | Load linked script `on_screen_text`, `target_duration_sec` server-side |
| 5 | Resolve client defaults from `neuramark_business_profiles.assembly_config` (or server defaults) |
| 6 | Merge Operator overrides: `subtitlesEnabled ?? defaults.subtitlesEnabled`, `logoEnabled ?? defaults.logoEnabled`; **`coverFrameSec`** always from client defaults snapshot (Phase A — no Operator override) |
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
// Request: { assemblyJobId: uuid, subtitlesEnabled?: boolean, logoEnabled?: boolean } strict
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

```ts
export const FORBIDDEN_BRANDING_AUTHORITY_KEYS = [
  "onScreenText",
  "on_screen_text",
  "logoAssetId",
  "logo_asset_id",
  "coverFrameSec",
  "cover_frame_sec",
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
- **STT / ASR** subtitle generation
- **VO-synced beat timing** (Phase B)
- **Custom font upload** (Phase B)
- **Operator `coverFrameSec` override** on manual apply (Phase B)
- **Cliente** branded video preview (US-11.1)
- **US-10.1** QA agent body · **US-11.x** approval UI
- **Weekly auto-branding cron** (integrations-engineer / ADR-0001)
- **System placeholder watermark** when logo missing
- **Live FFmpeg in CI** — args builder unit tests + mocked spawn only
- **`branding_status = skipped` emission** in Phase A auto-chain

---

## Reviewed by FE

**Reviewed by FE:** yes — 2026-08-30 — nextjs-frontend.

**Verdict:** Accept — DTOs, Server Actions, poll extension, and surface routing are implementable against existing `/profile` and `/operator/scripts` patterns.

**BUILD notes (FE):**

- **Cliente `/profile`:** Add **Marca / Brand** section below interview sections in `LivingProfileView` / new `ProfileBrandingSection` client component — **outside** Ficha edit/save chrome (immediate mutations like `AvatarReferencesSection`). Hidden `<input type="file">` + Button upload; `FormData` → `uploadClientLogo`; `removeClientLogo` with `ConfirmDialog`; `InputSwitch` toggles call `updateAssemblyConfigDefaults` on change. Logo preview via `branding.logoPreviewUrl`. Render only when `result.exists === true`. Do **not** expose `coverFrameSec` in Cliente UI (Phase A — server default only).
- **Operator `/operator/scripts`:** Extend `OperatorAssemblyPanel` (or sibling block in same expand row) with branding status `Tag`, `Checkbox` toggles seeded from `job.brandingConfig ?? { subtitlesEnabled: true, logoEnabled: true }`, **Apply branding** / **Re-brand** via `applyBrandingForAssembly({ assemblyJobId, subtitlesEnabled, logoEnabled })`, Re-brand confirm dialog mirroring `AssemblyReassembleConfirmDialog`. Preview `<video>` src rules per § Batch DTO; pending banner when assembly `completed` and branding null/queued. **Download cover** as link to `/api/media/assets/{coverMediaAssetId}` when set.
- **Poll:** Extend `operatorAssemblyJobStatusDtoSchema` + `mergePolledStatus` in `OperatorAssemblyPanel`; poll while assembly **or** branding in-flight (`queued`/`processing`); reuse `ASSEMBLY_JOB_POLL_INTERVAL_MS_DEFAULT`.
- **Types:** Import from `lib/contracts/profile` (`branding` block), `lib/contracts/assembly-job` (extended DTO), `lib/contracts/branding-job` (`assemblyConfigSchema` for toggle types only).
- **i18n:** `profile.branding.*`, `scripts.branding.*` EN + ES; map `brandingFailureReason` messageKeys (e.g. `scripts.branding.failure.subtitleSanitize`) like assembly failure reasons.
- **Out of scope:** Cliente branded video player; FFmpeg details; storage keys in UI.

**Disputes:** None blocking BUILD.

---

## Changelog

| Date | Change |
|------|--------|
| 2026-08-30 | Initial freeze — branding pipeline DDL, orchestrator, worker seam, ASS/FFmpeg graph, Cliente logo actions, DTOs, media serve; resolves SPEC-REVIEW + SECURITY gaps |
