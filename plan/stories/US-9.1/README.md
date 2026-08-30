# US-9.1 — Assemble final 9:16 Reel

**Status:** PREP (2026-08-30) — story folder + PO decisions frozen; gates **SPEC-REVIEW → SECURITY → CONTRACT** next.

**As a** System, **I want** to combine voice, avatar/B-roll, template, and timing, **so that** output is Instagram-ready vertical video.

Ship **FFmpeg assembly** on the **Fly.io worker** (ADR-0003): Operator-triggered pipeline that resolves **completed primary video** + **script timing** (+ **voiceover asset** for lineage / remux when needed) → **`neuramark_assembled_reels`** row + **`neuramark_media_assets`** (`asset_type = assembled_reel`); **9:16 output**, **duration within target ± tolerance**, **idempotent per script version**. **Phase A** = normalize/mux talking-head and manual-primary paths; **Phase B** = faceless multi-clip B-roll stitch + `editing_hints` (cold open / rewind).

**Canonical acceptance criteria:** [`plan/USER_STORIES.md`](../../USER_STORIES.md) → US-9.1 (source of truth — **do not check off in PREP**).

**This folder:** [`plan/stories/US-9.1/`](./) — `README.md` · `TASKS.md` (gates: `SPEC-REVIEW.md` · `SECURITY.md` · `CONTRACT.md` · `VALIDATION.md` · `QA.md` — create when story enters sprint).

**Branch:** `feature/US-9.1-assemble-reel`

**Depends on:** [US-8.4](../US-8.4/) ✅ job orchestration + completed `output_media_asset_id` · [US-6.1](../US-6.1/) ✅ captions exist for downstream approval package (not assembly input in this story). **Soft:** [US-9.3](../US-9.3/) ✅ voiceover `media_assets` · [US-8.2](../US-8.2/) / [US-8.6](../US-8.6/) / [US-8.3](../US-8.3/) primary video sources · [US-8.5](../../USER_STORIES.md) B-roll adapter (**Phase B** — may be deferred).

**Unblocks:** [US-9.2](../../USER_STORIES.md) subtitles/logo/cover (second-pass FFmpeg on assembled base) · [US-10.1](../../USER_STORIES.md) QA on assembled output · [US-11.1](../../USER_STORIES.md) client approval preview · weekly cycle assembly step (integrations-engineer, ADR-0001).

---

## Scope in

| Area | What US-9.1 BUILD adds |
|------|------------------------|
| **FE** | Assembly status on **`/operator/scripts`** expand row (queued / processing / completed / failed); **Assemble Reel** / **Re-assemble** Operator action; **preview player** for completed assembly via authenticated media serve; EN/ES (`scripts.assembly.*`). |
| **BE** | **`createAssemblyJobForReelScript()`** orchestrator (Operator-only): resolve inputs → INSERT **`neuramark_assembled_reels`** → worker executes FFmpeg → UPDATE status + output asset; **`GET /api/assembly-jobs/[jobId]`** (operator-scoped); extend week batch DTO with `assemblyByReelScriptId`; **`enqueueAssemblyJob`** dev seam mirroring video jobs. |
| **DB** | **`neuramark_assembled_reels`** migration: `reel_script_id`, `status`, `template_id`, input FKs (`primary_video_asset_id`, `voiceover_asset_id`), `output_media_asset_id`, `script_updated_at` (idempotency), `duration_sec`, `failure_reason`, lineage fields. |
| **Worker** | **`lib/assembly/`** FFmpeg module (`spawn` args-array); Fly worker loop **`worker/assembly-jobs.ts`** (or shared worker entry); reads Storage via service-role; writes assembled MP4 to Storage + media row. |
| **Implementers** | **media-pipeline-engineer** (FFmpeg + worker) + **nextjs-backend** (migration, orchestrator, routes, CONTRACT) + **nextjs-frontend** (status + preview UI). **integrations-engineer** only if cron auto-assemble is pulled into BUILD ( **out of scope** — see below). |

## Scope out

| Story / topic | Why out |
|---------------|---------|
| **US-9.2** subtitles, logo, cover frame | Separate second-pass story on assembled base. |
| **US-8.5** Wan B-roll adapter body | Phase B assembly stitch; not required for Phase A AC. |
| **US-10.1** QA agent | Downstream consumer of `assembled_reel_id`. |
| **US-11.x** approval / publish | Downstream; assembly output is input. |
| **Weekly cycle auto-assemble** | integrations-engineer (ADR-0001) — Operator manual trigger first. |
| **Cliente** assemble controls | Operator-only trigger in V1. |
| **Multiple template picker UI** | V1 single frozen template `reel_v1_basic`. |
| **Preview vs final dual renditions** | V1 one output asset; preview = same file via media serve. |
| **Assembly cost spend rows** | US-7.3 Phase B — V1 assembly `$0` catalog row or omit spend (CONTRACT). |
| **RBAC beyond `requireOperator()`** | Minimal role flag only. |

## Canonical terms (CONTEXT)

Use **Ensamblado**, **Job de generación**, **Paquete de guion**, **Modalidad de producción**, **download-and-own**, **Reel 9:16**.  
_Evitar:_ shell FFmpeg strings; client-supplied asset URLs; long-lived third-party URLs as canonical output.

## What prior stories already shipped (do not duplicate)

| Source | Continuity |
|--------|------------|
| US-8.4 | **`neuramark_video_jobs`** + poller; completed primary → **`output_media_asset_id`** (`generated_video`). |
| US-8.3 | Manual upload completes job synchronously — same **`output_media_asset_id`** shape. |
| US-9.3 | **`voiceover`** `media_assets`; SadTalker/MuseTalk already bake audio into primary MP4 — assembly **uses video audio track** on talking-head path; voiceover FK stored for lineage/idempotency. |
| US-5.1 | **`target_duration_sec`**, `cold_open_notes`, `editing_notes`, `broll_beats`, `modalidad` on **`neuramark_reel_scripts`**. |
| US-8.4 worker | **`worker/video-jobs.ts`** + **`VIDEO_JOB_POLL_MODE`** — assembly mirrors **`ASSEMBLY_JOB_POLL_MODE`**. |
| ADR-0003 | Vercel enqueues; Fly runs FFmpeg; Supabase holds job state. |
| SECURITY_BASELINE | FFmpeg args-array only; validated `media_assets` paths; no assembly-time URL fetch. |

**US-9.1 adds the first `neuramark_assembled_reels` pipeline** — not video provider adapters or TTS.

---

## Phased BUILD (PO)

| Phase | Scope | Closes |
|-------|-------|--------|
| **A (US-9.1 BUILD — ship first)** | DDL + orchestrator + worker FFmpeg **normalize path**: completed **primary** video → scale/center-crop **1080×1920** → trim/pad to **`target_duration_sec ± tolerance`** → store **`assembled_reel`** asset. Supports **`modalidad ∈ {own_avatar, generic_avatar}`** and **manual/API primary**. Operator UI + status poll. Idempotency on **`(reel_script_id, script_updated_at, input_fingerprint)`**. Template **`reel_v1_basic`** only. | US-9.1 AC: 9:16, duration tolerance, idempotency, `[SEC]` FFmpeg + SSRF guards |
| **B (same story or follow-up BUILD slice — after US-8.5 or explicit PO pull-in)** | **Faceless** path: stitch **multiple `asset_role = broll`** clips + voiceover mux; apply **`cold_open_notes` / `editing_notes`** from script (cold open trim, simple concat — not full rewind FX). Graceful skip when B-roll jobs failed (primary-only degrade). | SPEC §3 S3.M10 partial: `editing_hints` + B-roll; USER_STORIES US-8.5 AC “stitched in assembly” |

**VALIDATION note (binding):** If Phase B is deferred at BUILD time, **`VALIDATION.md`** must document **partial SPEC S3.M10 closure** (no B-roll stitch, no editing_hints FX) — same pattern as US-9.3 ElevenLabs defer.

---

## Upstream / downstream handoffs

| Direction | Artifact | Rule |
|-----------|----------|------|
| **From US-8.4 / US-8.3 / US-8.6** | `output_media_asset_id` on latest completed **`asset_role = primary`** job for `reel_script_id` | Required for Phase A assemble; foreign/missing → `ASSEMBLY_INPUTS_INCOMPLETE` |
| **From US-9.3** | Latest **`voiceover`** asset for script (optional FK on assembly row) | Talking-head: audio already in primary MP4; remux only when primary has **no audio stream** (manual edge case) |
| **From US-5.1** | `target_duration_sec`, `updated_at`, `modalidad`, notes | Duration target + idempotency key |
| **To US-9.2** | `assembled_reel` **`output_media_asset_id`** | Second-pass burn-in; do not re-generate primary |
| **To US-10.1** | `neuramark_assembled_reels.id` | QA report FK |
| **To US-11.1** | Signed media serve URL for assembled MP4 | Approval preview player |

---

## PO decisions frozen (2026-08-30)

| # | Topic | Decision |
|---|-------|----------|
| 1 | **Runtime** | FFmpeg on **Fly worker** only (ADR-0003). Vercel: orchestrator INSERT + enqueue; **`ASSEMBLY_JOB_POLL_MODE=in_process`** dev seam like video jobs. |
| 2 | **Template V1** | Single template id **`reel_v1_basic`**: center-crop scale primary to **1080×1920**, H.264 + AAC, no subtitles/logo (US-9.2). |
| 3 | **Idempotency key** | **`(reel_script_id, script_updated_at, input_fingerprint)`** where `input_fingerprint = sha256(primary_video_asset_id ‖ voiceover_asset_id ‖ template_id)` (hex). Re-assemble with unchanged inputs → return existing **completed** row (200), no duplicate FFmpeg. Script regenerate (`updated_at` bump) → new assembly allowed. |
| 4 | **Duration tolerance** | **`NEURAMARK_ASSEMBLY_DURATION_TOLERANCE_SEC`** default **`2`**. Output duration must satisfy **`abs(actual - target) <= tolerance`**. Trim primary with `-t`; pad with **`tpad`** / **`apad`** only when shorter — CONTRACT freezes filter graph. |
| 5 | **Talking-head path** | **`modalidad ∈ {own_avatar, generic_avatar}`**: require completed primary video job; **canonical audio = primary video stream** (SadTalker/MuseTalk already muxed VO). Store **`voiceover_asset_id`** from latest script-linked voiceover when present for fingerprint only. |
| 6 | **Manual-primary path** | **`provider_key = manual`** (US-8.3): same normalize pipeline. If probe finds **no audio stream**, mux latest **`voiceover`** asset. |
| 7 | **Faceless path** | **Phase B.** Phase A: **`modalidad = faceless`** without completed primary → **`ASSEMBLY_INPUTS_INCOMPLETE`** with messageKey pointing Operator to manual upload (US-8.3) or wait for US-8.5. Do not block talking-head slots. |
| 8 | **B-roll stitch** | **Phase B** after US-8.5 (or manual multiple uploads P1). Phase A ignores **`broll_beats`** except persist on assembly metadata for downstream. |
| 9 | **Editing hints** | **Phase B** minimal: **`cold_open_notes`** → optional lead trim seconds from script (default off in Phase A). Full playbook **`editing_hints`** rewind FX deferred. |
| 10 | **Output storage** | **`neuramark_media_assets`** new type **`assembled_reel`**; **`neuramark_assembled_reels.output_media_asset_id`** FK — **no** `preview_url` / `final_url` columns (download-and-own storage keys). |
| 11 | **Trigger** | Operator Server Action **`assembleReelForScript({ reelScriptId })`** on **`/operator/scripts`** — **`requireOperator("handler")`**; input **`{ reelScriptId }` only**. |
| 12 | **Status read** | **`GET /api/assembly-jobs/[jobId]`** — operator session + `client_id` scope → foreign **404**; DTO subset (no FFmpeg command, no storage paths). |
| 13 | **Stale timeout** | **`NEURAMARK_ASSEMBLY_STALE_TIMEOUT_MIN`** default **`30`** (FFmpeg shorter than provider polls). |
| 14 | **SEC FFmpeg** | **`spawn('ffmpeg', args[])`** only; temp files under **`/tmp/neuramark-assembly/{jobId}/`**; inputs resolved from **`media_assets.storage_key`** after ownership check; subtitle/text **not** in Phase A filters. |
| 15 | **SEC SSRF** | Worker reads Storage via Supabase service-role — **never** `fetch(clientUrl)` at assembly time. |
| 16 | **US-6.1 dependency** | Sequencing only — captions not assembly inputs; approval package joins later (US-11.1). |
| 17 | **Implementers** | **media-pipeline-engineer** + **nextjs-backend** + **nextjs-frontend**; CONTRACT before BUILD. |

---

## Gates (orchestrator)

- [ ] SPEC-REVIEW.md (spec-guardian — cross-cutting vs SPEC §3 S3.M10; expect **GAPS** for US-9.2 split + Phase B editing_hints)
- [ ] SECURITY.md (security-architect — FFmpeg injection, path traversal, IDOR, worker tenancy)
- [ ] CONTRACT.md (nextjs-backend — DDL, orchestrator, worker seam, DTOs; **Reviewed by FE** before BUILD)
- [ ] BUILD (media-pipeline-engineer + nextjs-backend + nextjs-frontend)
- [ ] VALIDATION.md (requirements-validator)
- [ ] QA.md (qa-engineer — ADR-0003 worker path)

**Next after PREP:** spec-guardian **SPEC-REVIEW** → security-architect **SECURITY** → nextjs-backend **CONTRACT**.

---

## Acceptance criteria mapping (USER_STORIES § US-9.1)

| AC | US-9.1 deliverable |
|----|-------------------|
| Output aspect ratio 9:16 | FFmpeg **`reel_v1_basic`** → **1080×1920** |
| Duration within script target ± tolerance | Trim/pad vs **`target_duration_sec`**; env tolerance |
| Pipeline idempotent per script version | Idempotency key + return existing completed row |
| [SEC] FFmpeg args-array; validated owned assets; no injectable text | Worker spawn + ownership-verified storage keys; Phase A no drawtext |
| [SEC] No arbitrary URL fetch at assembly | Storage service-role read only |

---

## Open questions resolved (PO lean)

| Question | PO default |
|----------|------------|
| Which template in V1? | **`reel_v1_basic`** only — no FE picker. |
| Idempotency key shape? | **`reel_script_id` + `script_updated_at` + `input_fingerprint`**. |
| Duration tolerance? | **±2 s** default, env-configurable. |
| Talking-head vs faceless? | Phase A: **talking-head + manual primary**; faceless **Phase B** (blocked without primary). |
| B-roll required? | **Optional Phase B**; US-8.5 not a hard dependency for Phase A ship. |
| Audio source when primary has VO baked in? | Use **primary video audio**; voiceover asset for fingerprint/edge remux only. |
| Preview vs final URL? | **Single output asset**; serve via existing media Route Handler. |

## SPEC / spec-guardian watchlist (not PO blockers for PREP)

| Item | Notes |
|------|-------|
| SPEC S3.M10 bundles subtitles/logo with assembly | **Split across US-9.1 + US-9.2** — SPEC-REVIEW should record intentional partial closure per story. |
| SPEC `preview_url` / `final_url` shorthand | Replaced by **`output_media_asset_id`** + Storage (consistent with video jobs). |
| SPEC auto-assemble in weekly cycle | **US-14.x / integrations-engineer** — out of US-9.1 BUILD. |
| `editing_hints` cold open / rewind | **Phase B** — document gap if deferred. |
