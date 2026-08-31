# US-9.1 Phase B — Faceless B-roll stitch

**Story ID:** **US-9.1** (same story — **not** a new `US-9.x` ID). Sprint label: **`US-9.1-B`**.  
**Status:** PREP (2026-08-31) — US-8.5 CLOSED; Phase A assembly CLOSED.  
**Branch:** `feature/US-9.1-phase-b-broll-stitch`  
**Upstream handoff:** [US-8.5 CONTRACT § US-9.1 Phase B handoff](../US-8.5/CONTRACT.md) — N owned `asset_role = broll` media assets (max **8**).

**As a** System, **I want** to stitch completed Wan B-roll clips (+ voiceover) into a 9:16 assembled Reel for faceless scripts, **so that** faceless production yields Instagram-ready video without blocking on failed clips.

---

## Requirement summary

Phase A ships normalize/mux for talking-head and manual-primary. Phase B unlocks the **faceless** path: consume completed **`asset_role = broll`** outputs from US-8.5, concat via FFmpeg on the Fly worker (`build-broll-concat-args` + runner), mux voiceover when needed, keep Phase A duration/idempotency/SEC floors, and **degrade** to Phase A (or incomplete) when B-roll is missing — never block the Operator on failed Wan jobs.

Canonical AC remain [`plan/USER_STORIES.md`](../../USER_STORIES.md) § US-9.1 (5 Phase A AC already checked). Phase B **does not add new USER_STORIES checkboxes**; it closes the deferred SPEC §3 S3.M10 / US-8.5 “stitched in assembly” handoff. VALIDATION must re-verify the five SEC/duration/idempotency AC against the new FFmpeg path.

---

## Scope in

| Area | Phase B adds |
|------|----------------|
| **BE** | Extend `resolveAssemblyInputs` for **faceless**: resolve up to **8** completed owned `broll` assets (ordered); require voiceover when stitch path has no baked audio; include broll ids in `input_fingerprint`; keep `{ reelScriptId }` trigger. |
| **Worker** | Implement **`lib/assembly/ffmpeg/build-broll-concat-args.ts`** (pure args-array); wire `runAssemblyJob` faceless branch: download clips → concat/normalize → trim/pad to `target_duration_sec ± tolerance` → upload `assembled_reel`. |
| **FE** | **Minimal:** enable Assemble when faceless + ≥1 completed broll (or completed primary for degrade); reuse existing **`OperatorAssemblyPanel`** preview — **no** new stitch preview UI. Optional EN/ES copy if incomplete-message keys change. |
| **DB** | **No new tables** expected. Optional CONTRACT: persist `broll_asset_ids` JSON on assembly row for lineage — only if fingerprint/replay needs it; lean default = fingerprint only. |
| **Implementers** | **media-pipeline-engineer** (FFmpeg concat + worker) + **nextjs-backend** (resolver, fingerprint, CONTRACT amendment). **nextjs-frontend** only for Assemble enablement gate. |

## Scope out

| Topic | Why |
|-------|-----|
| Wan adapter / `createBrollVideoJobs` | US-8.5 ✅ |
| Talking-head B-roll overlays | V1 Phase B = **faceless-only** stitch |
| Full `editing_hints` rewind FX | Still deferred; optional **numeric** `cold_open_notes` lead trim only if CONTRACT freezes a safe integer parse |
| US-9.2 branding / subtitles | Separate story ✅ |
| Weekly auto-assemble | integrations-engineer |
| Live FFmpeg in CI | Mocked spawn + args golden tests |
| New story ID | Same US-9.1 |

---

## PO decisions frozen (2026-08-31) — Phase B

| # | Topic | Decision |
|---|-------|----------|
| B1 | **Story identity** | **Phase B of US-9.1** — not a new backlog ID. Sprint `current_story: US-9.1-B`. |
| B2 | **When to stitch** | Stitch **only** when `modalidad === "faceless"` **and** ≥1 completed `video_jobs` with `asset_role = broll` and owned `output_media_asset_id`. **Talking-head** (`own_avatar` / `generic_avatar`) **always** uses Phase A primary path — **ignore** broll assets even if present. |
| B3 | **Clip ordering** | Completed broll jobs for the script ordered by **`created_at ASC`** (US-8.5 creates one job per beat in beat order). Cap **8**. Do **not** parse `brollBeats` text into FFmpeg filters. Align count with `brollBeats.length` for metadata/fingerprint only when beats exist. |
| B4 | **Missing / failed B-roll** | **Never block** assembly on failed/queued broll jobs. Use **only completed** clips. If **zero** completed broll: **degrade** — if a completed **primary** exists (e.g. manual US-8.3), run **Phase A** normalize path; else `ASSEMBLY_INPUTS_INCOMPLETE` + faceless messageKey (Operator: wait for clips or upload primary). Partial clip sets (e.g. 3 of 5) → stitch the available completed subset (no wait-for-all). |
| B5 | **Audio** | Faceless stitch: mux latest owned **`voiceover`** asset (required when concat video has no usable audio). Same remux rules as Phase A manual edge case. |
| B6 | **FFmpeg safety** | **`spawn('ffmpeg', args[], { shell: false })` only** — extend Phase A floors. Concat demuxer / filter_complex built from **server temp paths only**; no `brollBeats`, `cold_open_notes`, or Operator text in argv. |
| B7 | **Ownership** | Every input `media_assets` row must match assembly `client_id` before Storage read (resolver + worker re-check). Foreign → fail without spawn. |
| B8 | **Max clips** | **8** — align US-8.5 `clampWanClipCount` / `brollBeats` schema max. |
| B9 | **Idempotency** | Extend fingerprint: `sha256(primary_or_empty ‖ voiceover ‖ template ‖ sorted_or_ordered_broll_asset_ids ‖ path_tag)` where `path_tag` distinguishes `primary` vs `broll_stitch` (CONTRACT freezes exact string). Unchanged inputs → return existing completed row. |
| B10 | **Duration / template** | Same **`reel_v1_basic`** 1080×1920 + **`NEURAMARK_ASSEMBLY_DURATION_TOLERANCE_SEC`** default **2** after stitch. |
| B11 | **Cold open / editing hints** | **Minimal:** optional lead trim **only** if `cold_open_notes` parses to a safe non-negative integer seconds (CONTRACT regex/bounds). **No** rewind FX / free-text filters in V1 Phase B. |
| B12 | **FE** | **Reuse** existing assembly status + preview player. **Required FE change:** Assemble button enablement for faceless when inputs complete under B2/B4 (today gated on primary only). No Cliente UI; no B-roll strip (still deferred from US-8.5). |
| B13 | **Trigger / SEC** | Unchanged: `{ reelScriptId }` only; `requireOperator("handler")`; no client-supplied asset ids/URLs; Storage service-role only (no assembly-time URL fetch). |
| B14 | **Implementers** | **media-pipeline-engineer** + **nextjs-backend** (+ thin **nextjs-frontend**). CONTRACT Phase B amendment before BUILD. |

---

## Task breakdown (summary)

See [`TASKS.md`](./TASKS.md) § Phase B checklist.

| Layer | Work |
|-------|------|
| **FE** | Faceless Assemble enablement; optional i18n for incomplete keys; reuse preview |
| **BE** | Faceless input resolve; fingerprint; orchestrator modality branch; tests |
| **Worker** | `build-broll-concat-args` + `runAssemblyJob` stitch path; degrade branch |
| **DB** | None required (lean); CONTRACT may add optional lineage column |

---

## Dependencies and sequence

1. **US-8.5** ✅ — produce N `broll` assets  
2. **US-9.1 Phase A** ✅ — assembly table, worker, Operator UI  
3. **This PREP** → **SPEC-REVIEW** (Phase B / S3.M10) → **SECURITY** amend → **CONTRACT** Phase B section + FE Reviewed line → **BUILD** → **VALIDATION** → **QA** → CLOSE Phase B  

**Unblocks:** fuller faceless weekly production; closes US-8.5 stitch handoff; US-9.2/10.1/11.1 already consume assembled output (unchanged).

---

## Gates (Phase B)

- [x] SPEC-REVIEW.md amendment (spec-guardian — S3.M10 B-roll stitch + editing_hints partial)
- [x] SECURITY.md amendment (security-architect — concat injection, multi-asset IDOR, tenancy)
- [x] CONTRACT.md Phase B section (nextjs-backend) — Reviewed by FE **approved** (2026-08-31)
- [ ] BUILD (media-pipeline-engineer ∥ nextjs-backend ∥ thin nextjs-frontend)
- [ ] VALIDATION.md Phase B (requirements-validator)
- [ ] QA.md Phase B (qa-engineer)

**Next after PREP:** spec-guardian **SPEC-REVIEW** (Phase B) → security-architect **SECURITY** amend → nextjs-backend **CONTRACT** Phase B.

---

## Open questions (resolved — PO lean)

| Question | PO default |
|----------|------------|
| New story vs Phase B? | **Phase B of US-9.1** (`US-9.1-B` sprint label). |
| Stitch whenever broll exists? | **No** — faceless only; talking-head ignores broll. |
| Wait for all broll jobs? | **No** — stitch completed subset; zero → degrade. |
| FE stitch preview? | **Reuse** existing assembled preview. |
| Max clips? | **8** (US-8.5). |
| Beat text in FFmpeg? | **Never** — ordering via job `created_at` only. |
