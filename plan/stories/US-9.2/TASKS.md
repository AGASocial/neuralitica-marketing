# US-9.2 — Add subtitles, logo, and cover

**Priority:** P0  
**Depends on:** US-9.1 ✅ assembled base · US-2.2 ✅ Ficha viva · US-5.1 ✅ `on_screen_text` · US-3.3 ✅ upload stack · US-14.5 ✅  
**Acceptance criteria:** `plan/USER_STORIES.md` § US-9.2 (source of truth — do **not** redefine; do **not** check off in PREP)  
**Implementers:** **media-pipeline-engineer** + **nextjs-backend** + **nextjs-frontend** (`docs/development/AGENT-ROSTER.md` Phase 4). **No content-agents-engineer** · **No integrations-engineer** in default BUILD.  
**Canonical terms:** **Ensamblado** · **Paquete de guion** · **texto en pantalla** · **Ficha viva** · **Reel 9:16** · **download-and-own**. Avoid CONTEXT _Evitar_ list in product-facing copy.

## Out of scope (do not implement here)

- **US-9.1** primary assembly FFmpeg (`reel_v1_basic` normalize) — input consumer only.
- **Soft subtitles** / WebVTT sidecar / player caption tracks.
- **STT / ASR** subtitle generation from voiceover audio.
- **VO-synced beat timing** — Phase B.
- **Custom font upload** — Phase B (V1 bundled DejaVu Sans Bold on worker).
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
| Branch | **`feature/US-9.2-subtitles-logo-cover`** |
| Subtitle source | **`on_screen_text`** newline beats from linked `reel_script_id` — no STT |
| Subtitle mode V1 | **Burn-in only** — FFmpeg subtitles/ASS or drawtext on output MP4 |
| Beat timing V1 | Equal split: `target_duration_sec / beatCount` per beat |
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
| Trigger input | **`{ assemblyJobId, subtitlesEnabled?, logoEnabled? }` only** — forbidden: beat text, asset ids, URLs, fonts |
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
// Phase B: optional VO-weighted durations
```

### Phased BUILD checklist

| Phase | Deliverables |
|-------|----------------|
| **A** | DDL · logo upload Ficha · assembly_config defaults · branding worker · auto-chain · Operator panel · cover export · idempotency · SEC guards · mobile safe-zone AC |
| **B** | VO-weighted timing · per-reel coverFrameSec Operator override · extra font weight |

---

## Frontend (nextjs-frontend)

**Cliente surface:** `/profile` — extend Ficha viva with **Brand / Marca** section.

- [ ] Logo upload control (PrimeReact `FileUpload` or hidden input + button): format/size hints (PNG/JPG/WebP, max 2 MiB); preview thumbnail when logo exists; **Remove logo** with confirm.
- [ ] Default branding toggles: **Subtitles on Reels** / **Show logo on Reels** (`InputSwitch`); persisted via `updateAssemblyConfigDefaults`.
- [ ] Loading, empty (no logo), error, success states; disabled while upload in flight.
- [ ] EN/ES under **`profile.branding.*`** (logo label, upload, remove, toggles, errors).

**Operator surface:** `/operator/scripts` expand row — extend US-9.1 assembly panel.

- [ ] Branding status badge (`queued` / `processing` / `completed` / `failed` / `skipped`).
- [ ] Checkboxes: **Include subtitles** / **Include logo** — seed from last `branding_config` or client defaults; used on next **Apply branding** / **Re-brand**.
- [ ] **Apply branding** button when assembly `completed` and branding not in-flight; **Re-brand** when branding `completed`/`failed` (confirm dialog — mirror Re-assemble pattern).
- [ ] Preview `<video>` plays branded `output_media_asset_id` when branding `completed` (fallback to pre-branding with banner if branding pending — CONTRACT freezes).
- [ ] **Download cover** link when `cover_media_asset_id` present — authenticated serve route.
- [ ] Poll branding status (reuse assembly poll interval pattern or combined DTO field).
- [ ] EN/ES under **`scripts.branding.*`**.

**Out of scope FE:** Cliente assemble/branding trigger; FFmpeg details; storage keys in UI.

---

## Backend / API (nextjs-backend)

**Concrete consumers:** Ficha logo section · Operator assembly/branding panel · media serve route · Fly worker.

- [ ] Migration: `neuramark_business_profiles.logo_asset_id`, `assembly_config jsonb`; assembly row branding columns; enum values `client_logo`, `cover_frame`; storage_key CHECK extensions.
- [ ] Extend `lib/contracts/media-assets.ts`: asset types, upload union, storage regexes (`logo-`, `cover-`, `branded-` patterns).
- [ ] Extend `validateAndPrepareMediaUpload` for **`client_logo`** (image-only, 2 MiB, no consent gate).
- [ ] **`uploadClientLogo`** / **`removeClientLogo`** Server Actions — `requireActive`; replace prior logo asset; update `logo_asset_id`.
- [ ] **`updateAssemblyConfigDefaults`** Server Action — `requireActive`; strict Zod; write `assembly_config`.
- [ ] **`applyBrandingForAssembly`** Server Action — `requireOperator`; validate assembly row tenancy + `status = completed` base; merge toggles into `branding_config`; enqueue worker.
- [ ] **`createBrandingJobForAssembly`** orchestrator — called from auto-chain + manual action; idempotency check; set `branding_status = queued`.
- [ ] Subtitle beat resolver + sanitizer module (`lib/assembly/subtitle-beats.ts` or equivalent).
- [ ] Extend `getReelScriptsForWeek` / assembly batch DTO: `brandingStatus`, `brandingConfig`, `coverMediaAssetId`, `canApplyBranding`, `canRebrand`.
- [ ] Extend **`GET /api/media/assets/[assetId]`** for new asset types + Cliente ownership where appropriate.
- [ ] Auto-chain hook in assembly completion path (`applyAssemblyJobUpdate` when → `completed`).
- [ ] Forbidden keys helper for branding actions (no `onScreenText`, `logoAssetId`, `storageKey`, etc.).
- [ ] Unit tests: beat resolver, sanitizer, fingerprint, forbidden keys, idempotency, logo upload validation.

**Out of scope BE:** QA agent · approval package serializer (US-11.1) · cron.

---

## Database (nextjs-backend)

- [ ] **`neuramark_business_profiles`**: nullable **`logo_asset_id uuid`** FK → `neuramark_media_assets(id)` ON DELETE SET NULL; **`assembly_config jsonb`** DEFAULT NULL.
- [ ] **`neuramark_media_assets.asset_type`**: add **`client_logo`**, **`cover_frame`**.
- [ ] **`neuramark_assembled_reels`**: **`branding_status text`** CHECK; **`branding_config jsonb`**; **`cover_media_asset_id uuid`** FK; **`pre_branding_output_media_asset_id uuid`** FK; optional **`branding_fingerprint text`** for idempotency index.
- [ ] Storage key CHECK: logo, cover, branded MP4 patterns (CONTRACT verbatim SQL).
- [ ] RLS deny-by-default unchanged; service-role Node + Fly worker only.
- [ ] Partial unique index on completed branding fingerprint (CONTRACT freezes).

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

| Agent | Owns |
|-------|------|
| **media-pipeline-engineer** | `buildReelV1BrandingArgs`, ASS builder, cover extract, `runBrandingJob`, worker poll, Dockerfile font |
| **nextjs-backend** | Migration, contracts, orchestrator, Server Actions, serve route, auto-chain, tests |
| **nextjs-frontend** | `/profile` logo + defaults UI, `/operator/scripts` branding panel, i18n |
| **security-architect** | Next gate: `SECURITY.md` — subtitle injection, upload, IDOR |
| **spec-guardian** | Next gate: `SPEC-REVIEW.md` — closes S3.M10 subtitles/logo/cover defer |
| **nextjs-backend** | After SECURITY: `CONTRACT.md` |
| **nextjs-frontend** | FE signoff line in CONTRACT before BUILD |

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

- [x] PREP — README + TASKS (this file)
- [ ] SPEC-REVIEW.md (spec-guardian)
- [ ] SECURITY.md (security-architect)
- [ ] CONTRACT.md + Reviewed by FE (nextjs-backend → nextjs-frontend)
- [ ] BUILD
- [ ] VALIDATION.md (requirements-validator)
- [ ] QA.md (qa-engineer)
- [ ] PO check AC in `plan/USER_STORIES.md` (only after VALIDATION + QA CLOSE)
