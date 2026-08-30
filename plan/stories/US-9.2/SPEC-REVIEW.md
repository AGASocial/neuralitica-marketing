## Spec Review — US-9.2

### Verdict: GAPS

US-9.2 intent — the **System** runs a **second-pass FFmpeg branding pipeline** on the **Fly.io worker** (ADR-0003) over US-9.1 **`assembled_reel`** output: burn-in **texto en pantalla** beats from **`neuramark_reel_scripts.on_screen_text`**, optional **logo** overlay from Cliente-uploaded **`client_logo`** on **Ficha viva**, and **cover frame** JPEG export for manual IG upload; **Cliente** manages logo + default **`assembly_config`** on **`/profile`**; **Operator** applies/re-brands on **`/operator/scripts`** with per-run subtitle/logo toggles; auto-chain after US-9.1 assembly **`completed`** — is **directionally aligned** with SPEC §1 SC-1 (Reels listos sin grabarse, brand-ready for IG), SPEC §3 **Media Assembly Pipeline** (S3.M10: subtítulos/logo/cover — slice deferred from US-9.1 partial closure), SPEC §4 error paths (Operator ve job failed + reintentar), SPEC §5 (ADR-0003 worker split; Vercel orchestrator enqueue only), SPEC §6 (multi-tenant `client_id`; EN/ES; `neuramark_*`; download-and-own `media_assets`; server-only secrets), USER_STORIES § US-9.2 core AC (mobile safe zone, optional logo, cover export, [SEC] upload + subtitle sanitize), frozen upstream **US-9.1** ✅ (`neuramark_assembled_reels`, `output_media_asset_id`, `applyAssemblyJobUpdate`, worker poll seam) · **US-5.1** ✅ (`on_screen_text` newline beats, `target_duration_sec`) · **US-5.2** ✅ (40 chars/line, 8 beats max readability) · **US-2.2** ✅ (Ficha viva `/profile`) · **US-3.3** ✅ (`validateAndPrepareMediaUpload` export for `client_logo`) · **US-14.5** ✅ (`requireOperator()` floor).

**Gaps** sit between USER_STORIES § US-9.2 acceptance criteria / owner-table wording and what must be frozen in **SECURITY.md** / **CONTRACT.md** before BUILD: DDL + branding orchestrator, `buildReelV1BrandingArgs()` filter graph, auto-chain hook on `applyAssemblyJobUpdate` → `completed`, idempotency fingerprint, ASS vs drawtext choice, media serve extension for `client_logo` / `cover_frame` / branded `assembled_reel`, Operator vs Cliente preview/toggle surfaces, and reconciliation of AC “default template if missing” with PO “no placeholder watermark.” Story intent does **not** drift from SPEC; unresolved contract shape is the BUILD gate blocker — not a SPEC veto on direction.

**Upstream dependencies satisfied or frozen:** **US-9.1** ✅ (assembled base + lineage seam documented for US-9.2 second pass) · **US-5.1** ✅ (`on_screen_text` ≤ 500 chars, newlines OK) · **US-5.2** ✅ (beat line bounds) · **US-2.2** ✅ (Ficha edit surface) · **US-3.3** ✅ (shared upload stack — extend, do not fork) · **US-14.5** ✅. **Partial / downstream:** **US-10.1** (QA on branded `output_media_asset_id`) · **US-11.1** (approval preview) · **US-11.3** (cover download in approval/export) · **integrations-engineer** (weekly auto-brand in ciclo — ADR-0001).

---

### Findings

| Severity | Finding | SPEC/ADR reference | Fix |
|----------|---------|-------------------|-----|
| **High** | **No US-9.2 CONTRACT.md.** PO decisions in README/TASKS are detailed but not a frozen API: migration SQL verbatim, `createBrandingJobForAssembly` step order, `applyBrandingForAssembly` return union, `buildReelV1BrandingArgs()` golden graph, worker poll extension, `branding_fingerprint` partial unique index, media serve allowlist, Operator batch DTO fields, and auto-chain hook placement are sketched only. | USER_STORIES US-9.2; README gates; TASKS § Contract-first | Author **US-9.2 CONTRACT.md** after SECURITY; include **Reviewed by FE** line; freeze DDL, orchestrator, forbidden trigger keys, worker env, Phase A acceptance boundary. |
| **High** | **FFmpeg branding filter graph not frozen.** Phase A AC depends on burn-in subtitles (mobile safe zone y 1280–1520), logo overlay (top-right 12% / 48px padding), H.264 + AAC re-encode, cover extract at **`coverFrameSec`**. Open Q1: ASS/`subtitles` filter vs `drawtext` chain — affects SECURITY temp-file policy and unit-test snapshots. | SPEC S3.M10; USER_STORIES AC “readable on mobile safe zone”; README PO #18–19 | CONTRACT: freeze **`buildReelV1BrandingArgs()`** + **`buildAssFromBeats()`** — input paths only in argv; beat text in temp `.ass` only; golden unit tests; **`spawn('ffmpeg', args[], { shell: false })`**. |
| **High** | **Auto-chain seam on US-9.1 completion unset at contract level.** PO #14: orchestrator enqueues branding when assembly → `completed`. US-9.1 CONTRACT owns `applyAssemblyJobUpdate` as sole status writer — branding enqueue must hook there (or single post-complete helper) without forking assembly status semantics or re-running primary FFmpeg. | US-9.1 CONTRACT `applyAssemblyJobUpdate`; ADR-0003; README PO #14 | CONTRACT: freeze **`onAssemblyJobCompleted(assemblyJobId)`** — load client `assembly_config` + script `on_screen_text`; INSERT branding `queued`; **forbid** Vercel FFmpeg; document race with concurrent Operator re-assemble. |
| **High** | **Media serve allowlist extension unset.** Operator preview, Cliente logo thumbnail, and cover download require authenticated serve for **`client_logo`**, **`cover_frame`**, and post-branding **`assembled_reel`**. US-9.1 extended serve for base `assembled_reel`; US-9.2 swaps `output_media_asset_id` to branded key — serve rules must cover lineage + foreign-id **404**. | SPEC §6 server-only assets; USER_STORIES [SEC] download via authenticated route; TASKS media serve | SECURITY + CONTRACT: extend **`GET /api/media/assets/[assetId]`** — ownership (Cliente own logo/cover; Operator + owning Cliente for reels); **no** anonymous serve; **no** `storage_key` in DTO. |
| **Medium** | **USER_STORIES AC “default template if missing” vs PO no watermark.** AC row: “Logo optional; **default template if missing**.” PREP PO #7: when `logo_asset_id` null or `logoEnabled: false` → **skip overlay**, no placeholder watermark. Reasonable read: “default template” = assembled reel **without** logo — not a Neuralitica watermark. Wording ambiguous for BUILD/VALIDATION. | USER_STORIES US-9.2 AC; README PO #7 | CONTRACT phased acceptance: **default = no logo overlay** (transparent); **forbid** system watermark in V1; optional PO amend USER_STORIES AC to “skip logo when none uploaded” when next edited. |
| **Medium** | **USER_STORIES owner table vs PREP persona split.** FE row: “Toggle subtitles on/off **preview**; logo upload in **profile settings**.” PREP: Cliente sets **`assembly_config`** defaults + logo on **`/profile` Ficha viva** (not Preferencias); **Operator-only** apply/re-brand and preview `<video>` for branded output; Cliente live preview deferred to **US-11.1**. BE row: “on-screen text **+ VO**” — PREP V1 uses **equal beat split** from `target_duration_sec` only; **no** VO word-align (Phase B). | USER_STORIES US-9.2 owner table; README PO #5, #13; SPEC S3.M6 texto en pantalla | CONTRACT: freeze surfaces — Cliente `/profile` logo + default toggles only; Operator `/operator/scripts` preview + apply; subtitle timing = `target_duration_sec / beatCount`; VALIDATION documents VO-sync defer (Phase B). |
| **Medium** | **Branding idempotency + output lineage not frozen.** PO #15–17: copy `output_media_asset_id` → `pre_branding_output_media_asset_id`; branded MP4 new key `branded-{uuid}.mp4`; fingerprint = `sha256(pre_branding ‖ branding_config ‖ subtitleSourceHash)`. Unclear: concurrent branding INSERT race, partial unique index DDL, re-brand after `failed`, and whether QA (US-10.1) should key off assembly row id vs output asset id after swap. | USER_STORIES US-9.2 Depends US-9.1; README PO #15–17; US-10.1 `assembled_reel_id` | CONTRACT: freeze partial unique on **completed** fingerprint; `failed` does not block retry; downstream still use **`neuramark_assembled_reels.id`** + latest `output_media_asset_id`. |
| **Medium** | **`branding_status = skipped` vs cover-always-export tension.** PO #16: `skipped` when both subtitles and logo disabled; also “cover always exported in V1 when branding runs.” If auto-chain runs with both disabled, does job still extract cover? Clarify enqueue predicate and `skipped` semantics. | README PO #16; USER_STORIES AC cover export | CONTRACT: freeze — **branding job always runs** after assembly complete in V1 (at minimum cover extract) **or** explicit rule: `skipped` = no FFmpeg when both off **and** cover not required (then cover AC fails). PO lean: **always extract cover** when branding job runs; `skipped` only when Operator explicitly bypasses (if allowed) — freeze one rule. |
| **Medium** | **Subtitle beat resolver edge cases.** Empty/missing `on_screen_text` lines → PO #2: effective `subtitlesEnabled: false`. US-5.1 requires non-empty `on_screen_text` on script row — but whitespace-only or post-trim empty beats possible. US-5.2 max 8 lines / 40 chars — branding must enforce pre-render, not rely on FFmpeg alone. | US-5.1 CONTRACT `onScreenText`; US-5.2 readability; README PO #2, #19 | CONTRACT: freeze **`resolveSubtitleBeats()`** + sanitizer; empty beat list → skip burn-in; cap lines/chars before ASS build; unit tests for injection chars `\`, `{`, `}`, `%`. |
| **Medium** | **`validateAndPrepareMediaUpload` extension for `client_logo`.** US-3.3 CONTRACT exports shared validator for US-9.2 — image-only, 2 MiB, magic bytes, server key, **no consent gate** (unlike avatar reference). Replace-on-upload must delete/revoke prior logo asset consistently. | US-3.3 CONTRACT § shared validator; USER_STORIES [SEC] AC; README PO #20 | CONTRACT: extend validator branch `assetType: 'client_logo'`; freeze MIME allowlist + `logo-{uuid}.{ext}` regex; `uploadClientLogo` replace semantics + `logo_asset_id` FK update. |
| **Low** | **USER_STORIES DB shorthand omits `neuramark_` prefix.** Row lists `business_profiles.logo_asset_id`; canonical table is **`neuramark_business_profiles`**. | SPEC §6; AGENTS.md | Amend USER_STORIES when PO next edits; CONTRACT uses prefixed names exclusively. |
| **Low** | **S3.M10 full module still partially closed after US-9.2 Phase A.** US-9.2 closes subtitles/logo/cover; remaining S3.M10 gaps: US-9.1 Phase B B-roll/`editing_hints`, weekly auto-assemble (ADR-0001), VO-synced subtitle timing (US-9.2 Phase B). Must be explicit in CONTRACT + **VALIDATION.md** — not silent drift. | SPEC S3.M10; US-9.1 VALIDATION partial-closure pattern; README Phase B | CONTRACT Phase A acceptance closes USER_STORIES § US-9.2 AC only; VALIDATION records remaining S3.M10 items. |
| **Info** | **Closes US-9.1 intentional defer.** US-9.1 SPEC-REVIEW + CONTRACT document subtitles/logo/cover → US-9.2; second pass on `output_media_asset_id` without re-generating primary — aligned. | US-9.1 SPEC-REVIEW; US-9.1 CONTRACT downstream | Do not re-run `reel_v1_basic` in US-9.2 BUILD. |
| **Info** | **Vision & hard rules intact.** US-9.2 does not publish without Aprobación (SC-2), does not require human recording, does not conflate Playbook vs Trend, does not introduce Stories IG / multicanal / ads / RBAC UI. Branding is production prep → QA (US-10.1) → Aprobación. | SPEC §1 SC-1–SC-4; CONTEXT | Operator apply is internal production — not publish. |
| **Info** | **Modalidad / Preferencias unchanged.** Logo on **Ficha viva**, not Preferencias de producción visual — correct separation of brand identity vs production allowlist (S3.M4). | SPEC S3.M4; CONTEXT | Changing logo does not silent-regenerate Reels (consistent with S3.M4 preference rule). |
| **Info** | **ADRs respected.** FFmpeg branding on Fly (ADR-0003); Vercel orchestrator enqueue only. No IG publish (ADR-0002). Weekly auto-brand in ciclo out of BUILD (ADR-0001 integrations-engineer). | ADR-0001–0003; README scope out | Do not run branding FFmpeg on Vercel Route Handlers. |
| **Info** | **Downstream handoffs clear.** US-10.1 QA on `neuramark_assembled_reels.id` + branded output; US-11.1 preview; US-11.3 cover + video export. `cover_media_asset_id` seam documented. | USER_STORIES US-10.1 Depends US-9.2; README handoffs | Approval package reads post-branding `output_media_asset_id`. |

---

### TASKS open questions — resolved against SPEC

| Question (README / TASKS) | Resolution | SPEC / ADR basis |
|---------------------------|------------|------------------|
| ASS vs drawtext filter graph? | **ASS/`subtitles` filter preferred** — beat timing in temp `.ass`; SECURITY validates path + sanitized content; no raw text in argv. | S3.M10 subtítulos; SPEC §6 injection containment |
| Auto-chain vs explicit Operator click? | **Auto-chain** after assembly `completed` (SC-1 operability); Operator **Re-brand** for toggle/script changes. | S3.M10 auto en ciclo (partial — full cron ADR-0001); SC-1 |
| `branded-{uuid}.mp4` vs overwrite same key? | **New key** — preserve `pre_branding_output_media_asset_id` lineage. | SPEC §5 download-and-own; US-9.1 output pattern |
| Cliente download cover on approval? | **US-11.3** — 9.2 populates `cover_media_asset_id` + serve route only. | USER_STORIES US-11.3; out of scope US-9.2 FE |
| Subtitle source? | **`on_screen_text`** newline beats only — **no** STT/ASR in V1. | S3.M6 texto en pantalla; CONTEXT **Paquete de guion** |
| Beat timing V1? | **Equal split** `target_duration_sec / beatCount` — VO-weighted Phase B. | S3.M10 timing; US-5.1 `target_duration_sec` |
| Logo surface? | **`/profile` Ficha viva** — not Preferencias. | S3.M3 Ficha viva; USER_STORIES DB row |
| Weekly auto-branding? | **Out of US-9.2 BUILD** — integrations-engineer; auto-chain post-assembly only. | S3.M14; ADR-0001 |
| Soft subtitles? | **Out of scope** — burn-in only for IG single-file upload. | SPEC §1 fuera de alcance edición avanzada; S3.M13 manual export |

**No SPEC amendment required** for the resolutions above — they complete the **US-9.1 → US-9.2** intentional S3.M10 split. **Recommended USER_STORIES amendments** (non-blocking): clarify AC “default template if missing” → no system watermark; align FE owner row with Ficha `/profile` + Operator preview; align BE owner row with equal-split timing (VO-sync Phase B).

---

### Terminology violations (CONTEXT)

**None that block** in README/TASKS (uses **Ensamblado**, **Paquete de guion**, **texto en pantalla**, **Ficha viva**, **Reel 9:16**, **download-and-own**, **Cliente**, **Operator**; avoids shell FFmpeg strings and client URLs in product copy).

Product-facing EN/ES for US-9.2 UI must use:

| Prefer | _Evitar_ |
|--------|----------|
| **Ficha viva** / Living profile (EN label ok) | Business Profile (as raw product term without translation) |
| **texto en pantalla** | on-screen text (user-facing ES) |
| **Paquete de guion** | script package |
| **Reel ensamblado** | assembled reel (user-facing ES) |
| **Cliente** | prestador, dueño, usuario final |
| **Operator** | admin, administrador, staff |
| **Marca / Brand** (logo section) | watermark (unless explaining absence) |

Technical enums (`client_logo`, `cover_frame`, `branding_status`, `assembly_config`, `subtitlesEnabled`) OK in code/DB and Operator diagnostics; map to localized labels in FE. Do **not** expose FFmpeg command strings, storage keys, temp paths, or raw `on_screen_text` in Operator trigger payloads.

---

### Blockers for SECURITY / CONTRACT

| Item | Blocks? | Guidance |
|------|---------|----------|
| US-9.2 CONTRACT.md (DDL, orchestrator, worker, FFmpeg graph, DTOs) | **Yes — BUILD gate** | Freeze after SECURITY; before media-pipeline + BE + FE BUILD. |
| FFmpeg branding args-array + temp subtitle file policy | **Yes — AC + [SEC]** | Pure builders + unit tests; spawn args only; sanitized ASS content. |
| Auto-chain hook on assembly `completed` | **Yes — orchestration** | Single writer pattern via US-9.1 `applyAssemblyJobUpdate` extension or documented post-hook. |
| Media serve for `client_logo`, `cover_frame`, branded reel | **Yes — preview + [SEC]** | Ownership-checked authenticated serve; IDOR **404**. |
| `validateAndPrepareMediaUpload` `client_logo` branch | **Yes — [SEC] AC** | Extend US-3.3 module — do not fork validation. |
| Branding trigger forbidden keys (`onScreenText`, `logoAssetId`, URLs) | **Yes — [SEC] injection** | `{ assemblyJobId, subtitlesEnabled?, logoEnabled? }` only. |
| Idempotency fingerprint + lineage columns | **Yes — AC correctness** | Partial unique index or transactional idempotency. |
| `branding_status` / cover-when-skipped rule | **No — but freeze before BE** | Avoid AC contradiction on cover export. |
| ASS vs drawtext choice | **No — but freeze in CONTRACT** | SECURITY temp-file rules depend on choice. |
| VO-synced subtitle timing | **No — Phase B** | Equal split closes V1 AC. |
| Weekly auto-branding cron | **No — out of scope** | ADR-0001 integrations-engineer. |
| US-10.1 QA body | **No — downstream** | Consumes branded output. |

**SPEC blockers on intent:** none. **ADR breaches:** none if branding FFmpeg + stale sweep stay on Fly and orchestrator stays on Vercel.

**SECURITY can proceed?** **Yes.** [SEC] AC items (shared upload stack, subtitle sanitize before renderer) and ADR-0003 spawn discipline are specified sufficiently for **security-architect** to author **SECURITY.md** — subtitle injection, logo upload IDOR, path traversal, temp workspace cleanup, and Operator/Cliente gate boundaries.

**CONTRACT blockers (freeze before BUILD):**

1. Migration — `neuramark_business_profiles.logo_asset_id`, `assembly_config`; assembly branding columns; `client_logo` / `cover_frame` enums; storage_key CHECKs; `branding_fingerprint` index.
2. **`createBrandingJobForAssembly`** + **`applyBrandingForAssembly({ assemblyJobId, subtitlesEnabled?, logoEnabled? })`** — Operator-only; script/assembly tenancy; idempotency; enqueue worker.
3. **`onAssemblyJobCompleted`** auto-chain from US-9.1 completion path.
4. **`buildReelV1BrandingArgs()`**, **`buildAssFromBeats()`**, **`extractCoverFrameArgs()`**, **`runBrandingJob()`** — Fly worker; font bundled in Docker image.
5. **`uploadClientLogo`** / **`removeClientLogo`** / **`updateAssemblyConfigDefaults`** — Cliente `requireActive`; replace-on-upload.
6. Subtitle beat resolver + sanitizer module + unit tests.
7. Operator batch DTO extensions (`brandingStatus`, `coverMediaAssetId`, `canApplyBranding`, `canRebrand`) + poll seam.
8. Media serve allowlist extension + FE `/profile` + `/operator/scripts` branding panel contracts.
9. Phase A acceptance closes USER_STORIES § US-9.2 AC; VALIDATION documents remaining S3.M10 partial items (VO-sync, weekly cron brand).

---

### Recommended action

Proceed to **SECURITY.md** (no SPEC veto), then **US-9.2 CONTRACT.md** with the non-negotiable freezes above.

1. **Closes US-9.1 partial S3.M10** — subtitles/logo/cover on assembled base; VALIDATION must record closure of that defer.
2. **Second-pass only** — never re-run US-9.1 primary assembly or regenerate primary video.
3. **`on_screen_text`** sole subtitle source V1 — equal beat timing; no STT.
4. **Logo on Ficha viva** — `client_logo` via shared US-3.3 validator; default = no overlay when missing.
5. **Cover at `coverFrameSec` default 1.0s** on branded output — JPEG `cover_frame` asset.
6. **ADR-0003** — all branding FFmpeg on Fly; Vercel enqueue/status only.
7. **Explicit out of scope:** soft subs, STT, custom fonts, Cliente branding trigger, US-10.1 QA, US-11.x approval UI, weekly cron auto-brand, IG publish, Stories IG, multicanal.

Do not check off USER_STORIES acceptance criteria in this gate.
