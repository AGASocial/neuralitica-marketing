## Spec Review — US-9.1

### Verdict: GAPS

US-9.1 intent — the **System** runs **Ensamblado** on the **Fly.io worker** (ADR-0003): Operator-triggered pipeline resolves **completed primary video** (`output_media_asset_id` from US-8.4 / US-8.3 / US-8.6) + **Paquete de guion** timing (`target_duration_sec`, `script_updated_at`, `modalidad`) + optional **voiceover** asset (US-9.3 — lineage / remux edge only on talking-head path) → FFmpeg **`reel_v1_basic`** normalize to **1080×1920** → **`neuramark_assembled_reels`** row + **`neuramark_media_assets`** (`asset_type = assembled_reel`); **idempotent** per **`(reel_script_id, script_updated_at, input_fingerprint)`** — is **directionally aligned** with SPEC §1 SC-1 (Reels without grabarse), SPEC §3 **Media Assembly Pipeline** (S3.M10: FFmpeg args-array, `neuramark_assembled_reels`, download-and-own `media_assets`, CosyVoice2/TTS upstream in US-9.3), SPEC §4 error paths (Operator ve job failed + reintentar), SPEC §5 (ADR-0003 worker split), SPEC §6 (multi-tenant `client_id`; Operator-only production surfaces), USER_STORIES § US-9.1 core AC (9:16, duration tolerance, idempotency, [SEC] FFmpeg + SSRF), frozen upstream **US-8.4** ✅ (primary video jobs + poller), **US-9.3** ✅ (voiceover assets; SadTalker/MuseTalk bake audio into primary MP4), **US-8.3** ✅ (manual primary same shape), **US-5.1** ✅ (`target_duration_sec`, `modalidad`, editing notes metadata), and **ADR-0003** (Vercel enqueue; Fly FFmpeg; Supabase job state).

**Gaps** sit between SPEC S3.M10’s **full** module description (TTS mux + B-roll stitch + `editing_hints` + subtítulos/logo/cover + auto ciclo) and what US-9.1 **Phase A BUILD** commits to ship: normalize/mux talking-head + manual-primary only; **US-9.2** owns subtitles/logo/cover; **Phase B** owns faceless B-roll stitch + cold-open/`editing_hints`; **integrations-engineer** owns weekly auto-assemble (ADR-0001). Story intent does not drift from SPEC; unresolved **US-9.1 CONTRACT.md** shape (DDL, orchestrator, worker poll seam, FFmpeg filter graph, DTOs, media serve, idempotency constraint) is the BUILD gate blocker — not a SPEC conflict on direction.

**Upstream dependencies satisfied or frozen:** **US-8.4** ✅ (`neuramark_video_jobs`, completed `output_media_asset_id`, Fly poll pattern, `VIDEO_JOB_POLL_MODE` dev seam) · **US-9.3** ✅ (`voiceover` `media_assets`; `voiceoverAssetId` handoff) · **US-8.3** ✅ (manual `generated_video` same output shape) · **US-8.2/8.6** ✅ (SadTalker/MuseTalk primary with baked VO) · **US-5.1** ✅ (`target_duration_sec`, `cold_open_notes`, `broll_beats`, `modalidad`) · **US-14.5** ✅ (`requireOperator()` floor) · **US-6.1** ✅ (sequencing — captions not assembly input). **Partial / downstream:** **US-8.5** (Wan B-roll — Phase B stitch consumer) · **US-9.2** (subtitles/logo/cover second pass) · **US-10.1** (QA on `assembled_reels.id`) · **US-11.1** (approval preview).

---

### Findings

| Severity | Finding | SPEC/ADR reference | Fix |
|----------|---------|-------------------|-----|
| **High** | **No US-9.1 CONTRACT.md.** PO decisions in README/TASKS are detailed but not a frozen API: migration SQL, orchestrator step order, error codes, `OperatorAssemblyJobDto`, FFmpeg filter graph for `reel_v1_basic`, worker poll loop, idempotency race handling, and media serve extension are sketched only. | USER_STORIES US-9.1; README gates; TASKS § Contract-first sequence | Author **US-9.1 CONTRACT.md** before BUILD; include **Reviewed by FE** line; freeze DDL verbatim, orchestrator return union, forbidden trigger keys, worker env, and Phase A acceptance boundary. |
| **High** | **Fly worker poll / enqueue seam unspecified at contract level.** ADR-0003 + README PO #1 mirror US-8.4 (`ASSEMBLY_JOB_POLL_MODE`, `worker/assembly-jobs.ts`) but no frozen queue contract: poll query, status transitions, stale sweeper hook, or shared vs separate worker entry. BUILD cannot wire create → FFmpeg without this. | ADR-0003; US-8.4 CONTRACT poll pattern; TASKS worker section | CONTRACT: freeze minimal V1 seam — **`neuramark_assembled_reels.status IN ('queued','processing')`** long-poll on Fly **`worker/assembly-jobs.ts`**; **`enqueueAssemblyJob`** with `in_process` dev fire-and-forget (mirror `enqueue-video-job-poll.ts`); **forbid** FFmpeg spawn on Vercel Route Handlers. |
| **High** | **FFmpeg filter graph not frozen.** Phase A AC depends on scale/center-crop **1080×1920**, trim/pad to **`target_duration_sec ± NEURAMARK_ASSEMBLY_DURATION_TOLERANCE_SEC`** (default **2**), H.264 + AAC. PO lean defers exact `-vf`/`-filter_complex` to CONTRACT — args builder exists in TASKS but no golden graph. | SPEC S3.M10; USER_STORIES US-9.1 AC (9:16, duration); README PO #4 | CONTRACT: freeze **`buildReelV1BasicArgs()`** output — input paths, target duration, tolerance → `string[]`; document trim (`-t`) vs pad (`tpad`/`apad`) rules; unit-test snapshots; **no** drawtext/subtitles in Phase A. |
| **High** | **`assembled_reel` media serve allowlist unset.** Operator preview + downstream US-9.2/10.1/11.1 require authenticated serve of output MP4. US-8.3 SPEC-REVIEW flagged same gap for `generated_video`; US-9.1 adds new **`asset_type = assembled_reel`**. Without freeze, preview player and worker upload path may diverge. | SPEC §6 server-only assets; US-8.3 SPEC-REVIEW serve finding; TASKS carry-forward `app/api/media/assets/[assetId]/route.ts` | SECURITY + CONTRACT: extend media serve Route Handler — **`assembled_reel`** + **`generated_video`** ownership check (Operator + owning `client_id` service paths); **no** anonymous serve; **no** storage key in DTO. |
| **Medium** | **S3.M10 partial closure — intentional story split.** SPEC bundles TTS mux, visual stitch, `editing_hints`, subtítulos/logo/cover, and auto ciclo in one module line. US-9.1 Phase A ships normalize-only; US-9.2 owns burn-in; Phase B owns B-roll + cold open; cron auto-assemble deferred. Must be explicit in CONTRACT phased acceptance + **VALIDATION.md** — not silent SPEC drift. | SPEC S3.M10; README phased BUILD; US-9.3 VALIDATION partial-closure pattern | CONTRACT **Phase A acceptance**: closes USER_STORIES § US-9.1 AC rows only. **VALIDATION** documents partial S3.M10: no subtitles/logo (US-9.2), no B-roll stitch / full `editing_hints` (Phase B), no weekly auto-assemble (ADR-0001). **No SPEC amendment required** if VALIDATION records gap — optional PO note in USER_STORIES owner table when edited. |
| **Medium** | **Story persona vs Phase A scope.** USER_STORIES narrative: “combine **voice**, avatar/**B-roll**, template, and timing.” Phase A combines **primary video** (VO often pre-baked) + **timing** only; **`modalidad = faceless`** without primary → **`ASSEMBLY_INPUTS_INCOMPLETE`** until US-8.5/manual. Phased acceptance required — not a veto on Phase A ship. | USER_STORIES US-9.1 As a/I want; README PO #7–8; SPEC S3.M4 modalidad por slot | CONTRACT phased BUILD: **Phase A** = talking-head + manual-primary normalize; **Phase B** = faceless multi-clip + `broll_beats` + minimal `cold_open_notes`. Phase A does **not** close full narrative sentence — VALIDATION note required. |
| **Medium** | **Orchestrator tenancy + trigger input not frozen.** PO: **`assembleReelForScript({ reelScriptId })` only** — forbidden asset/template/URL/`clientId`. Must mirror US-8.4/US-9.3: **`requireOperator("handler")`**, load script row, resolve `client_id` from script, resolve primary job + assets server-side. | SPEC §6 multi-tenant; US-9.3 CONTRACT tenancy; TASKS forbidden keys | CONTRACT: freeze **`createAssemblyJobForReelScript({ reelScriptId })`** step table; **`findForbiddenAssemblyKeys`**; foreign script → `SCRIPT_NOT_FOUND`; incomplete inputs → **`ASSEMBLY_INPUTS_INCOMPLETE`** with `messageKey`. |
| **Medium** | **Idempotency unique constraint vs re-assemble UX.** PO: return existing **completed** row when **`(reel_script_id, script_updated_at, input_fingerprint)`** unchanged; allow new run when script `updated_at` bumps. Unclear: concurrent duplicate INSERT race, partial index DDL, and FE “Re-assemble” confirm when fingerprint changed but prior job **`failed`**. | USER_STORIES US-9.1 AC idempotency; README PO #3; TASKS unique partial index note | CONTRACT: freeze partial unique index on **completed** triple **or** documented transactional check; **`failed`** / **`processing`** rows do not block retry; re-assemble after script edit creates new row; concurrent duplicate → one winner + idempotent return for loser. |
| **Medium** | **Voice / TTS mux semantics need CONTRACT clarity.** SPEC S3.M10 lists “TTS + visual + timing.” US-9.1 Phase A: talking-head path uses **primary MP4 audio track** (SadTalker/MuseTalk already muxed US-9.3 VO); remux **`voiceover`** asset only when probe finds **no audio stream** (manual edge). **`voiceover_asset_id`** FK for fingerprint/lineage — not always second input. Aligns with US-9.3 handoff; must be frozen so BUILD does not double-mux or skip manual audio. | SPEC S3.M10; US-9.3 README downstream; README PO #5–6 | CONTRACT: **`resolveAssemblyInputs()`** probe rules — `hasAudioStream(primary)` → skip voiceover mux; else require latest script-linked **`voiceover`** asset; store both FKs on assembly row. |
| **Low** | **USER_STORIES DB row uses shorthand inconsistent with SPEC.** Row lists **`assembled_reels`** with **`preview_url`**, **`final_url`**; canonical table is **`neuramark_assembled_reels`**; download-and-own pattern uses **`output_media_asset_id`** (consistent with US-8.4 video jobs). | SPEC S3.M10 `neuramark_assembled_reels`; SPEC §6 `neuramark_*`; USER_STORIES US-9.1 DB row | Amend USER_STORIES DB row when PO next edits; CONTRACT uses prefixed table + **`output_media_asset_id`** exclusively — **no** `preview_url`/`final_url` columns. |
| **Low** | **Assembly spend ledger deferred.** SPEC S3.M8 silent on assembly cost; PO defers US-7.3 spend rows (optional `$0` stub). Acceptable V1 — document in CONTRACT so cost roll-up does not expect assembly lines. | US-7.3 Phase B; README scope out | CONTRACT: Phase A **no** `neuramark_reel_spend_events` for assembly unless PO adds `$0` catalog stub — explicit out of scope. |
| **Info** | **Vision & hard rules intact.** US-9.1 does not publish without Aprobación (SC-2), does not require human recording, does not conflate Playbook vs Trend, does not introduce Stories/multicanal/ads/RBAC UI or Cliente assemble controls. | SPEC §1 SC-1–SC-4; CONTEXT | Assembly is Operator production prep → QA (US-10.1) → Aprobación — not publish. |
| **Info** | **Modalidad / preferencias unchanged.** Phase A serves **`own_avatar`** / **`generic_avatar`** + manual primary; faceless blocked until primary exists — does not collapse allowlist + per-slot modalidad rule (S3.M4). | SPEC S3.M4; CONTEXT **Modalidad de producción** | Strategy-assigned `modalidad` gates input resolution — not client-supplied at assemble trigger. |
| **Info** | **ADRs respected.** Vercel orchestrator INSERT + enqueue only; FFmpeg on Fly (ADR-0003). No IG publish (ADR-0002). Weekly auto-assemble out of BUILD (ADR-0001 integrations-engineer). TTS synthesis stays US-9.3 on Vercel — not reimplemented here. | ADR-0001–0003; README scope out | Do not enqueue assembly on cron in US-9.1 BUILD. |
| **Info** | **Downstream handoffs clear.** US-9.2 consumes **`output_media_asset_id`**; US-10.1 consumes **`neuramark_assembled_reels.id`**; US-11.1 preview via media serve. **`broll_beats`** persisted on metadata in Phase A for Phase B — TASKS correctly defers stitch. | USER_STORIES US-9.2 Depends; README handoffs | Do not regenerate primary in US-9.2 — second pass on assembled base only. |
| **Info** | **Reuse path explicit.** TASKS carry-forwards US-8.4 poll/enqueue, media insert helpers, duration probe, batch map pattern — avoids duplicate job infrastructure. | US-8.4 CONTRACT; TASKS § Carry-forwards | CONTRACT references US-8.4 worker patterns by anchor; assembly is parallel job domain, not extension of `neuramark_video_jobs`. |

---

### TASKS open questions — resolved against SPEC

| Question (README / TASKS / watchlist) | Resolution | SPEC / ADR basis |
|---------------------------------------|------------|------------------|
| Which template in V1? | **`reel_v1_basic`** only — no FE picker. | S3.M10 template concept; V1 single frozen template acceptable under “no edición avanzada propietaria” (§1 fuera de alcance) |
| Idempotency key shape? | **`(reel_script_id, script_updated_at, input_fingerprint)`** where fingerprint = `sha256(primary ‖ voiceover? ‖ template_id)`. | USER_STORIES US-9.1 AC “per script version”; SPEC implied versioned assembly |
| Duration tolerance? | **`NEURAMARK_ASSEMBLY_DURATION_TOLERANCE_SEC`** default **±2 s**; env-configurable. | USER_STORIES AC “configurable tolerance”; script `target_duration_sec` from US-5.1 |
| Talking-head vs faceless? | **Phase A:** `own_avatar` / `generic_avatar` + any completed primary (incl. manual). **`faceless`** without primary → **`ASSEMBLY_INPUTS_INCOMPLETE`**. **Phase B:** B-roll stitch after US-8.5. | S3.M4 modalidad por slot; S3.M10 B-roll/editing deferred to Phase B; US-8.5 AC “stitched in assembly” |
| B-roll required for Phase A ship? | **No** — optional Phase B; US-8.5 not hard dependency for Phase A AC closure. | SPEC S3.M10 partial; phased BUILD binding per README |
| Audio source when primary has VO baked? | **Primary MP4 audio track** canonical; **`voiceover_asset_id`** for fingerprint + remux when probe shows no audio. | S3.M10 “TTS + visual” satisfied upstream (US-9.3 + video adapters); assembly mux edge only |
| Preview vs final URL? | **Single `assembled_reel` output asset**; serve via authenticated media Route Handler — **no** `preview_url`/`final_url` DB columns. | SPEC §5 download-and-own; US-8.4 `output_media_asset_id` precedent |
| SPEC bundles subtitles/logo with assembly? | **Split US-9.1 + US-9.2** — intentional; VALIDATION records partial S3.M10. | S3.M10 module line; USER_STORIES US-9.2 Depends on US-9.1 |
| SPEC auto-assemble in weekly cycle? | **Out of US-9.1 BUILD** — integrations-engineer / US-14.x; Operator manual trigger first. | S3.M14 ciclo semanal; ADR-0001 |
| `editing_hints` cold open / rewind? | **Phase B** minimal cold-open trim from `cold_open_notes`; full playbook rewind FX deferred. | S3.M10 editing_hints; Trend/Playbook consume path intact in metadata |
| FFmpeg on Vercel? | **Forbidden** — Fly worker only. | ADR-0003; SPEC §5 |
| Cliente assemble trigger? | **Out of scope** — Operator-only V1. | SPEC §2 Operator vs Cliente responsibilities |
| Stale assembly timeout? | **`NEURAMARK_ASSEMBLY_STALE_TIMEOUT_MIN`** default **30** (shorter than video provider polls). | SPEC §4 error paths; ADR-0003 worker sweeper pattern |

**No SPEC amendment required** for the resolutions above — they are consistent with S3.M10 when read as a **phased story split** (US-9.1 / US-9.2 / Phase B / cron). **Recommended USER_STORIES amendment** (non-blocking): update US-9.1 DB owner row to **`neuramark_assembled_reels`** + **`output_media_asset_id`**; add phased note under owner table when PO next edits.

---

### Terminology violations (CONTEXT)

**None that block** in README/TASKS (uses **Ensamblado**, **Reel 9:16**, **Paquete de guion**, **Modalidad de producción**, **download-and-own**, **Operator**; avoids shell FFmpeg strings and client URLs in product copy).

Product-facing EN/ES for US-9.1 UI must use:

| Prefer | _Evitar_ |
|--------|----------|
| **Ensamblado** / **Reel ensamblado** | assembled reel (user-facing ES); media asset (generic) |
| **Job de generación** (for upstream video) | generation job |
| **Operator** | admin, administrador, staff |
| **Paquete de guion** | script package |
| **Modalidad de producción** | production mode, slot visual type |
| **Video sin rostro** / **B-roll** | faceless (user-facing ES; enum `faceless` OK in code) |
| **Reel** | piece, content item (generic) |

Technical enums (`assembled_reel`, `reel_v1_basic`, `queued`, `processing`, `input_fingerprint`, `ASSEMBLY_INPUTS_INCOMPLETE`) OK in code/DB and Operator diagnostics; map to localized labels in FE. Do **not** expose FFmpeg command strings, storage keys, or temp paths in UI or API DTOs.

---

### Blockers for SECURITY / CONTRACT

| Item | Blocks? | Guidance |
|------|---------|----------|
| US-9.1 CONTRACT.md (DDL, orchestrator, worker, FFmpeg graph, DTOs) | **Yes — BUILD gate** | Freeze before media-pipeline + BE + FE BUILD. |
| Fly worker poll seam + `ASSEMBLY_JOB_POLL_MODE` | **Yes — ADR-0003** | Mirror US-8.4; no Vercel FFmpeg. |
| FFmpeg args-array filter graph (`reel_v1_basic`) | **Yes — AC + [SEC]** | Pure builder + unit tests; spawn args only. |
| Media serve for `assembled_reel` (+ confirm `generated_video`) | **Yes — preview + downstream** | SECURITY + CONTRACT ownership extension. |
| Orchestrator tenancy + forbidden trigger keys | **Yes — [SEC] multi-tenant** | `{ reelScriptId }` only; script-owned `client_id`. |
| Idempotency constraint + failed-job retry semantics | **Yes — AC** | Partial unique index or transactional idempotency. |
| Input resolution / probe / remux rules | **Yes — correctness** | Primary audio canonical; voiceover edge documented. |
| Phased acceptance (Phase A vs S3.M10 full module) | **No — but freeze in CONTRACT + VALIDATION** | Document partial closure explicitly. |
| US-8.5 B-roll stitch | **No — Phase B** | Phase A ship does not require Wan adapter. |
| Weekly auto-assemble | **No — out of scope** | ADR-0001 integrations-engineer. |
| US-9.2 subtitles/logo | **No — downstream** | Explicit US-9.1 scope out. |
| Assembly spend rows | **No — deferred** | Optional `$0` stub only if PO pulls in. |

**SPEC blockers on intent:** none. **ADR breaches:** none if FFmpeg + stale sweep stay on Fly and orchestrator stays on Vercel.

---

### Recommended action

Proceed to **SECURITY.md** then **US-9.1 CONTRACT.md** with these **non-negotiable freezes**:

1. **`neuramark_assembled_reels` migration** — columns per TASKS; **`assembled_reel`** enum; RLS deny-by-default; storage key pattern `neuramark/{clientId}/{reelScriptId}/assembled-{uuid}.mp4`.
2. **`createAssemblyJobForReelScript({ reelScriptId })`** — Operator-only; script-row tenancy; resolve primary + optional voiceover; idempotency check; INSERT `queued`; **`enqueueAssemblyJob`**.
3. **`buildReelV1BasicArgs()` + `runAssemblyJob()`** — Phase A filter graph frozen; **`spawn('ffmpeg', args[])`**; temp dir `/tmp/neuramark-assembly/{jobId}/`; probe output duration vs tolerance.
4. **Fly worker `worker/assembly-jobs.ts`** — status-driven poll; **`markStaleAssemblyJobsFailed`**; service-role Storage read/write; region **`iad`** (SPEC §6).
5. **`OperatorAssemblyJobDto` + `GET /api/assembly-jobs/[jobId]`** — sanitized subset; foreign **404**; batch **`assemblyByReelScriptId`** on week load.
6. **Media serve allowlist** — **`assembled_reel`** ownership-checked authenticated serve (extend US-3.3 / existing route).
7. **Phased BUILD acceptance** — Phase A closes USER_STORIES § US-9.1 AC; VALIDATION documents partial S3.M10 (US-9.2 subtitles/logo, Phase B B-roll/`editing_hints`, cron auto-assemble).
8. **Explicit out of scope:** US-9.2 burn-in, US-10.1 QA body, US-11.x approval, Cliente assemble, weekly cron, IG publish, Stories IG, multicanal, assembly spend ledger (unless `$0` stub).

Do not check off USER_STORIES acceptance criteria in this gate.
