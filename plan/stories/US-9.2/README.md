# US-9.2 — Add subtitles, logo, and cover

**Status:** Phase A CLOSED (2026-08-30) — 5/5 AC · CLOSE `92b196a`. **Phase B PREP** (2026-08-31) — VO-synced subtitle timing + per-reel `coverFrameSec`; see [`PHASE-B.md`](./PHASE-B.md). Sprint: **`US-9.2-B`** · branch **`feature/US-9.2-phase-b-subtitle-cover`**.

**As a** System, **I want** burned-in subtitles, client logo overlay, and a cover frame export, **so that** Reels match brand and perform on Instagram.

Ship the **second-pass FFmpeg branding pipeline** (ADR-0003) on top of US-9.1 **`assembled_reel`** output: burn-in **texto en pantalla** beats from the Paquete de guion, optional **logo** overlay from Cliente-uploaded brand asset on **Ficha viva**, and **cover frame** JPEG for manual IG upload. Operator surfaces on **`/operator/scripts`** assembly panel: branding status, subtitle/logo toggles for the **next** branding run, preview player, cover download. Cliente manages logo + default branding preferences on **`/profile`**.

**Canonical acceptance criteria:** [`plan/USER_STORIES.md`](../../USER_STORIES.md) → US-9.2 (do **not** check off in PREP).

**This folder:** [`plan/stories/US-9.2/`](./) — `README.md` · [`PHASE-B.md`](./PHASE-B.md) · `TASKS.md` · Phase A `SPEC-REVIEW.md` · `SECURITY.md` · `CONTRACT.md` · `VALIDATION.md` · `QA.md`.

**Branch (Phase A):** `feature/US-9.2-subtitles-logo-cover` (merged)  
**Branch (Phase B):** `feature/US-9.2-phase-b-subtitle-cover`

**Depends on:** [US-9.1](../US-9.1/) ✅ `assembled_reel` base + `neuramark_assembled_reels.output_media_asset_id` · [US-2.2](../US-2.2/) ✅ Ficha viva edit surface · [US-5.1](../US-5.1/) ✅ `on_screen_text` beats · [US-3.3](../US-3.3/) ✅ shared upload validation stack · [US-14.5](../US-14.5/) ✅ `requireOperator()`.

**Upstream contracts:** [US-9.1 CONTRACT](../US-9.1/CONTRACT.md) (assembly job row, media serve, worker poll seam) · [US-5.1 CONTRACT](../US-5.1/CONTRACT.md) (`on_screen_text` newline beats) · [US-3.3 CONTRACT](../US-3.3/CONTRACT.md) (`validateAndPrepareMediaUpload`).

**Unblocks:** [US-10.1](../../USER_STORIES.md) QA on branded output · [US-11.1](../../USER_STORIES.md) client approval preview + cover handoff · [US-11.3](../../USER_STORIES.md) manual IG export (video + cover).

---

## Scope in

| Area | What US-9.2 BUILD adds |
|------|------------------------|
| **FE (Cliente)** | Logo upload + remove on **`/profile`** (Ficha viva section); default branding toggles (`subtitlesEnabled`, `logoEnabled`); EN/ES (`profile.branding.*`). |
| **FE (Operator)** | Extend **`/operator/scripts`** assembly panel: branding status badge; subtitle/logo checkboxes (next-run config); **Apply branding** / **Re-brand** action; preview `<video>` for branded output; **Download cover** when ready; EN/ES (`scripts.branding.*`). |
| **BE** | **`applyBrandingForAssembly({ assemblyJobId, subtitlesEnabled?, logoEnabled? })`** Server Action (Operator); Cliente **`uploadClientLogo`** / **`removeClientLogo`** / **`updateAssemblyConfigDefaults`** Server Actions; resolve subtitle beats from `on_screen_text`; extend assembly orchestrator to **auto-chain** branding after US-9.1 `completed`; idempotency fingerprint includes branding config; extend media serve for `client_logo` + `cover_frame` asset types. |
| **DB** | **`neuramark_business_profiles.logo_asset_id`** FK · **`assembly_config` jsonb** (client defaults) · extend **`neuramark_assembled_reels`**: `branding_status`, `branding_config` jsonb snapshot, `cover_media_asset_id`, `pre_branding_output_media_asset_id` · new enum values **`client_logo`**, **`cover_frame`** on `neuramark_media_assets`. |
| **Worker** | **`buildReelV1BrandingArgs()`** second-pass FFmpeg on Fly (`spawn` args-array): burn-in drawtext/subtitles filter from sanitized beat file; logo overlay (top-right safe zone); cover frame extract at configured second → JPEG upload; updates `output_media_asset_id` to branded MP4 while preserving pre-branding lineage. |
| **Implementers** | **media-pipeline-engineer** (FFmpeg branding pass + worker) + **nextjs-backend** (DDL, orchestrator, actions, serve route) + **nextjs-frontend** (Ficha logo UI + Operator branding panel). |

## Scope out

| Story / topic | Why out |
|---------------|---------|
| **US-9.1** base normalize/mux FFmpeg | Input only — do not re-run primary assembly. |
| **Soft subtitles / separate subtitle track** | IG Reels V1 = manual upload of single MP4; burn-in only. |
| **STT / transcription from VO audio** | Subtitle source = **`on_screen_text`** beats (US-5.1), not ASR. |
| **VO word-aligned subtitle timing** | Phase B — V1 uses equal beat duration split. |
| **Custom font upload / font picker** | Phase B — V1 bundled worker font only. |
| **Logo on Preferencias** | Brand identity lives on **Ficha viva** (`/profile`), not Preferencias de producción visual. |
| **Cliente Operator branding trigger** | Operator-only apply/re-brand; Cliente sets defaults + logo only. |
| **US-10.1** QA agent body | Downstream consumer of branded output. |
| **US-11.x** approval UI | Downstream; 9.2 exposes DTO + cover asset id seam only. |
| **Weekly auto-branding cron** | integrations-engineer — manual/auto-chain after assembly job first. |
| **Multiple logo positions / animation** | V1 fixed top-right template placement. |
| **Live FFmpeg in CI** | Args builder unit tests + mocked spawn (US-9.1 pattern). |

## Canonical terms (CONTEXT)

Use **Ensamblado**, **Paquete de guion**, **texto en pantalla**, **Ficha viva**, **Reel 9:16**, **download-and-own**, **Operator**, **Cliente**.  
_Evitar:_ shell FFmpeg strings; client-supplied asset URLs; soft subs; STT; Business Profile (UI: Living profile / Ficha viva).

## What prior stories already shipped (do not duplicate)

| Source | Continuity |
|--------|------------|
| US-9.1 | `neuramark_assembled_reels` · `assembled_reel` MP4 at `output_media_asset_id` · Operator assembly panel · `ASSEMBLY_JOB_POLL_MODE` · `spawn` args-array Phase A (no drawtext). |
| US-5.1 | `on_screen_text` on `neuramark_reel_scripts` — newline-delimited beat lines (max 500 chars total; US-5.2 readability warns per line). |
| US-5.2 | Beat split = newline-separated lines; `REEL_SCRIPT_MAX_CHARS_PER_BEAT_LINE = 40`; `REEL_SCRIPT_MAX_BEAT_LINES_TOTAL = 8`. |
| US-3.3 | `validateAndPrepareMediaUpload` in `lib/media/upload-validation.ts` — extend for `client_logo` (image-only, no consent gate). |
| US-2.2 | `/profile` Ficha viva edit — add logo section; do not reopen seven-key PATCH allowlist for Preferencias keys. |
| US-9.1 SECURITY | US-9.2 owns drawtext/subtitle injection controls; maintain `spawn` args-array, no shell string. |

**US-9.2 adds branding second pass + logo persistence + cover export** — not primary assembly, not TTS, not QA.

---

## Phased BUILD (PO)

| Phase | Scope | Closes |
|-------|-------|--------|
| **A (US-9.2 BUILD — ship first)** | DDL · logo upload on Ficha · client `assembly_config` defaults · branding worker pass (burn-in + logo overlay + cover @ 1s) · auto-chain after assembly complete · Operator branding panel + toggles · idempotency · `[SEC]` upload + subtitle sanitize · mobile safe-zone typography constants | USER_STORIES § US-9.2 AC rows |
| **B (US-9.2-B — PREP 2026-08-31)** | VO-proportional beat timing (words-per-beat from `voiceover_text`); Operator per-reel `coverFrameSec` override. **Out this slice:** second font weight, preview thumbnail strip | Closes Phase A deferred polish; Phase A AC stay checked — see [`PHASE-B.md`](./PHASE-B.md) |

**VALIDATION note (binding):** Phase A closed US-9.2 AC and the **subtitles/logo/cover** slice deferred from US-9.1 partial S3.M10. Phase B closes VO timing + Operator `coverFrameSec` only; re-verify **[SEC]** on the new path.

---

## Upstream / downstream handoffs

| Direction | Artifact | Rule |
|-----------|----------|------|
| **From US-9.1** | `neuramark_assembled_reels.id` + `output_media_asset_id` (`assembled_reel`) where `status = completed` | Branding input — never re-generate primary video |
| **From US-5.1** | `on_screen_text`, `voiceover_text` (Phase B timing), `target_duration_sec`, `reel_script_id` | Subtitle beat source + VO word partition + timing denominator |
| **From US-2.2 / profile** | `logo_asset_id`, `assembly_config` defaults | Logo overlay + default toggles |
| **From US-3.3** | `validateAndPrepareMediaUpload` | Logo upload validation stack |
| **To US-9.1 row** | Updates `output_media_asset_id` → branded MP4; sets `pre_branding_output_media_asset_id`; `cover_media_asset_id` | Downstream QA/approval use branded output |
| **To US-10.1** | Branded `output_media_asset_id` + `neuramark_assembled_reels.id` | QA on final visible Reel |
| **To US-11.1 / US-11.3** | Branded video serve URL + `cover_media_asset_id` download | Approval preview + manual IG post |

---

## PO decisions frozen (2026-08-30)

| # | Topic | Decision |
|---|-------|----------|
| 1 | **Runtime** | Second-pass FFmpeg on **Fly worker** only (ADR-0003). Vercel orchestrator enqueues; extend **`worker/assembly-jobs.ts`** (or sibling **`worker/branding-jobs.ts`**) — same poll seam pattern as US-9.1. |
| 2 | **Subtitle source** | **`neuramark_reel_scripts.on_screen_text`** only — split on `\n` into beat lines (reuse US-5.2 newline model). **No** STT/ASR from voiceover audio in V1. Empty/missing beats → branding runs with **`subtitlesEnabled: false`** effective (skip burn-in). |
| 3 | **Burn-in vs soft subs** | **Burn-in only V1** — hardcoded into output MP4 via FFmpeg **`subtitles`** filter (ASS/SRT temp file) or sanitized **`drawtext`** chain. No separate subtitle track. Rationale: IG manual upload expects single file; SPEC S3.M10 “subtítulos” = visible on export. |
| 4 | **Beat timing V1** | **Equal duration split:** `beatDurationSec = target_duration_sec / beatCount`. Beat *i* visible `[i * beatDurationSec, (i+1) * beatDurationSec)`. First beat starts at **t = 0**. **Phase B:** VO-proportional — see [`PHASE-B.md`](./PHASE-B.md) B3–B5. |
| 5 | **Logo upload surface** | **`/profile` (Ficha viva)** — new **Marca / Brand** section. **Not** Preferencias (`/settings/preferences`). Rationale: brand identity aligns with business profile (US-2.2); USER_STORIES DB row `business_profiles.logo_asset_id` maps to **`neuramark_business_profiles.logo_asset_id`**. |
| 6 | **Logo asset type** | **`client_logo`** on `neuramark_media_assets` — single active logo per client (replace-on-upload). Storage key pattern: `neuramark/{clientId}/logo-{uuid}.{ext}` (CONTRACT freezes regex). |
| 7 | **Logo optional** | When **`logo_asset_id` IS NULL** or **`logoEnabled: false`**, skip overlay — **default template** = no logo (transparent). No placeholder watermark in V1. |
| 8 | **Logo placement** | **Top-right** safe zone: max width **12%** of frame (**~130px** at 1080w), padding **48px** from top/right edges, preserve aspect ratio, opacity **100%**. |
| 9 | **Cover frame timing** | Default **`coverFrameSec: 1.0`** — extract frame at **1 second** into **branded** output (post overlay). Client default in `assembly_config`. **Phase B:** Operator per-reel override — see [`PHASE-B.md`](./PHASE-B.md) B7–B11. |
| 10 | **Cover asset** | **`cover_frame`** asset type — JPEG (**`.jpg`**) from FFmpeg `-ss` + `-vframes 1`; stored download-and-own; exposed via authenticated media serve + Operator **Download cover** button. |
| 11 | **`assembly_config` shape (client defaults on Ficha)** | JSON on **`neuramark_business_profiles.assembly_config`**: `{ "subtitlesEnabled": true, "logoEnabled": true, "coverFrameSec": 1.0 }`. Zod strict; defaults when column NULL = all true + 1.0s. Cliente edits via **`updateAssemblyConfigDefaults`** Server Action on `/profile`. |
| 12 | **`branding_config` snapshot (per assembly row)** | JSON on **`neuramark_assembled_reels.branding_config`**: same keys as `assembly_config` plus server **`subtitleBeatCount`**, **`subtitleSourceHash`** (sha256 of sanitized beats — idempotency). Copied from client defaults at enqueue; Operator toggles on apply/re-brand override **`subtitlesEnabled` / `logoEnabled`** for that run only. |
| 13 | **Operator vs Cliente toggles** | **Cliente:** logo file + default `assembly_config` on Ficha. **Operator:** per-reel **`subtitlesEnabled` / `logoEnabled`** checkboxes on assembly panel — affect **next branding run** only (not live CSS on burned video). Preview player shows last **completed** branded file. |
| 14 | **Trigger** | **Auto-chain:** when US-9.1 assembly → `completed`, orchestrator enqueues branding job with client defaults. **Manual:** Operator **`applyBrandingForAssembly({ assemblyJobId, subtitlesEnabled?, logoEnabled? })`** — re-run when base exists; **`requireOperator("handler")`**. Input forbidden: asset ids, URLs, beat text, font options. |
| 15 | **Output lineage** | Before branding completes, copy current `output_media_asset_id` → **`pre_branding_output_media_asset_id`**. On success, set **`output_media_asset_id`** to new branded MP4 (same `assembled_reel` asset type, new storage key `branded-{uuid}.mp4`). Downstream consumers unchanged (still read `output_media_asset_id`). |
| 16 | **Branding status** | **`branding_status`**: `null` \| `queued` \| `processing` \| `completed` \| `failed` \| `skipped`. **`skipped`** when both subtitles and logo disabled and no cover required — rare; still extract cover unless Operator disables (cover always exported in V1 when branding runs). |
| 17 | **Idempotency** | Branding fingerprint = `sha256(pre_branding_asset_id ‖ branding_config_json ‖ subtitleSourceHash)` — completed branding with same fingerprint returns existing row (no duplicate FFmpeg). Script `on_screen_text` change → new hash → re-brand allowed. |
| 18 | **Mobile safe zone typography** | Frame **1080×1920**. Subtitle block: **lower third**, text baseline between **y = 1280** and **y = 1520** (~67%–79% from top), **≥ 220px** clear of bottom edge (IG UI safe zone). Font: **DejaVu Sans Bold** bundled on worker (**48px** at 1080w scale). **Centered** horizontal; max **90%** frame width; **2 lines max** per beat (wrap at 40 chars/line per US-5.2); semi-transparent black box **`box=1:boxcolor=black@0.55:boxborderw=12`**. White text **`fontcolor=white`**. |
| 19 | **Subtitle sanitization** | Server builds ASS/SRT from beats — escape `\`, `{`, `}`, `%`, newlines; strip control chars; max beat length enforced pre-render; **no** raw script text in FFmpeg argv — temp subtitle file path only (**[SEC]**). |
| 20 | **Logo upload validation** | Extend shared stack: **`assetType: 'client_logo'`** — image/jpeg, image/png, image/webp only; max **2 MiB**; magic bytes; server UUID key; ownership serve route (**[SEC]** AC). |
| 21 | **Media serve** | Extend **`GET /api/media/assets/[assetId]`** for **`client_logo`**, **`cover_frame`**, branded **`assembled_reel`** — Operator + owning Cliente; foreign id **404**. |
| 22 | **Implementers** | **media-pipeline-engineer** + **nextjs-backend** + **nextjs-frontend**; CONTRACT before BUILD. |

---

## Gates (orchestrator)

### Phase A — CLOSED
- [x] SPEC-REVIEW.md · SECURITY.md · CONTRACT.md · BUILD · VALIDATION.md · QA.md · AC checked

### Phase B — active
- [x] PREP — [`PHASE-B.md`](./PHASE-B.md) + TASKS Phase B checklist
- [ ] SPEC-REVIEW.md amendment (spec-guardian)
- [ ] SECURITY.md amendment (security-architect — numeric `coverFrameSec` on trigger; VO never in argv)
- [ ] CONTRACT.md Phase B section + **Reviewed by FE** (nextjs-backend → nextjs-frontend)
- [ ] BUILD (media-pipeline-engineer + nextjs-backend + nextjs-frontend)
- [ ] VALIDATION.md Phase B
- [ ] QA.md Phase B

**Next gate:** spec-guardian SPEC-REVIEW (Phase B) → security-architect SECURITY amend → nextjs-backend CONTRACT Phase B.

---

## Open questions (for SECURITY / CONTRACT — not PO blockers)

| # | Question | PO lean |
|---|----------|---------|
| 1 | ASS vs drawtext filter graph | Prefer **ASS/subtitles filter** with temp `.ass` file — easier multi-beat timing; SECURITY validates temp path + sanitized content. |
| 2 | Auto-chain vs explicit Operator click | **Auto-chain** after assembly complete (better SC-1 operability); Operator **Re-brand** for toggle changes. |
| 3 | `branded-{uuid}.mp4` vs overwrite same storage key | **New key** — preserves `pre_branding_output_media_asset_id` lineage. |
| 4 | Cliente download cover on approval | **US-11.3** — 9.2 only ensures `cover_media_asset_id` populated and serve route works. |
