## Spec Review — US-9.1 Phase B (faceless B-roll stitch)

### Verdict: GAPS

Phase B PREP — stitch completed owned **`asset_role = broll`** clips (+ voiceover) into a **9:16** **Reel ensamblado** on the **Fly.io worker** for **`modalidad === faceless`**, with degrade / never-block-on-failed-Wan, Phase A SEC/duration/idempotency floors, and no new story ID — is **directionally aligned** with:

- **SPEC §1 SC-1** (Reels without grabarse — unlocks **Video sin rostro** / B-roll path)
- **SPEC §3 S3.M10** Media Assembly Pipeline (FFmpeg args-array → `neuramark_assembled_reels`; solo `media_assets` propios; visual stitch)
- **SPEC §3 S3.M4** (preferencias = allowlist; **modalidad por slot** gates path — talking-head ignores broll)
- **SPEC §4** error paths (Operator retry / incomplete; generation failures do not silently block)
- **SPEC §5 / ADR-0003** (FFmpeg on Fly; Vercel enqueue only)
- **US-8.5 CONTRACT § US-9.1 Phase B handoff** (consume N owned broll assets; no SiliconFlow CDN at assembly; stitch not in US-8.5)
- **Phase A SPEC-REVIEW / VALIDATION** deferred rows for faceless stitch + `editing_hints`
- **USER_STORIES § US-9.1** (same 5 AC re-validated on stitch path; no new checkboxes)

**Gaps** remain between full S3.M10 (`editing_hints` cold open **+ rewind**, subtítulos/logo/cover, auto ciclo) and what Phase B commits: **concat stitch + optional numeric cold-open trim only**. US-9.2 already owns burn-in; rewind FX and weekly auto-assemble stay deferred. **No SPEC amendment required** if CONTRACT + VALIDATION Phase B record the residual S3.M10 gap explicitly.

**SPEC blockers on intent:** none. **ADR breaches:** none if FFmpeg stays on Fly and assemble trigger stays Operator/`{ reelScriptId }` only. **BUILD process blockers:** CONTRACT Phase B amendment + SECURITY amendment (see below).

---

### Checklist (spec-guardian)

| Check | Result |
|-------|--------|
| **Vision & SC-1..SC-4** | **Pass.** Supports SC-1 faceless production; does not publish (SC-2); no human recording; Operator production prep → QA → Aprobación unchanged. |
| **Roles** | **Pass.** System assembles; Operator triggers/preview; Cliente still no assemble controls (V1). |
| **Modalidades visuales** | **Pass (B2).** Stitch **only** `faceless` + ≥1 completed owned broll; `own_avatar` / `generic_avatar` always Phase A primary — preferencias allowlist + per-slot modalidad intact. |
| **Playbook vs Trend** | **Pass.** Does not conflate; optional cold-open trim from script `cold_open_notes` only — does not invent trend/playbook filters in argv. Full playbook/trend `editing_hints` rewind still deferred. |
| **ADR-0001** | **Pass.** Weekly auto-assemble still out (integrations-engineer). |
| **ADR-0002** | **Pass.** No IG publish path. |
| **ADR-0003** | **Pass.** `build-broll-concat-args` + `runAssemblyJob` on Fly; spawn args-array; no Vercel FFmpeg. |
| **NFR** | **Pass if CONTRACT freezes.** `neuramark_*` (no new tables lean); server-only secrets; multi-tenant `client_id` ownership re-check; EN/ES only if new `messageKey`s. |
| **Out of scope** | **Pass.** No Stories IG, multicanal, ads, RBAC UI, Wan adapter body, talking-head overlays, Cliente assemble. |

---

### Findings

| Severity | Finding | SPEC/ADR reference | Fix |
|----------|---------|-------------------|-----|
| **High** | **No CONTRACT Phase B section yet.** Phase A CONTRACT freezes primary normalize only; Phase B resolver rules, fingerprint + `path_tag`, concat args builder signature, degrade codes, worker clip-list source, cold-open parse bounds, and FE enablement signal are PREP-only (PHASE-B.md B1–B14). BUILD cannot wire stitch without freeze. | USER_STORIES US-9.1; PHASE-B.md gates; existing CONTRACT § Phase B stub | Author **CONTRACT.md Phase B** amendment before BUILD; **Reviewed by FE**; freeze exact fingerprint string, error `messageKey`s, and `buildBrollConcatArgs()` inputs → `string[]`. |
| **High** | **SECURITY.md Phase B amendment missing.** Multi-clip Storage reads, concat demuxer / `filter_complex` injection surface, and tenancy per clip are new attack surface vs Phase A single-primary path. | SPEC §6; USER_STORIES US-9.1 [SEC]; US-8.5 handoff “no CDN fetch” | SECURITY amend: ownership check **every** broll + voiceover asset vs assembly `client_id`; argv = server temp paths only; **no** `brollBeats` / notes / Operator text in FFmpeg; no assembly-time URL fetch. |
| **High** | **Worker clip-set vs fingerprint race not frozen.** Lean PREP prefers fingerprint-only (no `broll_asset_ids` column). If worker **re-resolves** completed broll jobs at run time, a late-completing Wan job can change the ordered set after enqueue → fingerprint skew / non-idempotent FFmpeg / wrong stitch. | USER_STORIES AC idempotency; PHASE-B B3/B9; US-8.5 handoff | CONTRACT **must** freeze one: (A) persist ordered broll asset ids on assembly row at enqueue (replay = those ids), **or** (B) worker re-resolve then **abort/fail** if recomputed fingerprint ≠ row fingerprint (no silent re-stitch). Lean default alone is insufficient. |
| **Medium** | **S3.M10 still partial after Phase B — intentional.** Phase B closes **B-roll stitch** handoff from US-8.5 / Phase A VALIDATION. Remaining: full **rewind FX** / free-text `editing_hints`; weekly **auto-assemble** (ADR-0001). Subtitles/logo/cover already US-9.2 ✅. | SPEC S3.M10; Phase A VALIDATION § Phase B deferrals; PHASE-B B11 / scope out | CONTRACT Phase B acceptance + **VALIDATION Phase B** document residual gap: stitch closed; rewind FX still deferred; no SPEC amendment if recorded. |
| **Medium** | **Cold-open trim is numeric-only — narrower than SPEC wording.** S3.M10 cites “cold open + rewind” from formato/tendencia `editing_hints`. B11: optional lead trim **only** if `cold_open_notes` parses to safe non-negative integer seconds; unparsable → skip; **no** rewind. Acceptable V1 if VALIDATION names residual. | SPEC S3.M10; Trend/Playbook editing_hints; PHASE-B B11 | CONTRACT: freeze regex/bounds (e.g. `^\d{1,2}$`, max ≤ target); never pass raw notes string into argv. |
| **Medium** | **Faceless voiceover requirement must match Phase A remux semantics.** B5: mux latest owned voiceover when concat has no usable audio. Unclear if voiceover is **always required** for faceless stitch (typical VO path) or only when probe finds no audio — double-mux / silent-video risk. | SPEC S3.M10 “TTS + visual”; US-9.3 handoff; Phase A CONTRACT audio table | CONTRACT Phase B audio table: faceless stitch → require script-linked **voiceover** when concat video lacks audio; store `voiceover_asset_id` on fingerprint; fail `ASSEMBLY_INPUTS_INCOMPLETE` + faceless messageKey if missing when required. |
| **Medium** | **FE Assemble gate must not invent client-side asset ids.** B12: enable Assemble for faceless when inputs complete (broll subset or primary degrade). Today gated on primary only. Server remains source of truth. | SPEC §6 multi-tenant; PHASE-B B12/B13 | CONTRACT: batch DTO / incomplete flags for faceless readiness; FE enablement only; trigger still `{ reelScriptId }` only. |
| **Low** | **USER_STORIES DB row still shorthand.** `assembled_reels` + `preview_url`/`final_url` vs canonical `neuramark_assembled_reels` + `output_media_asset_id` (Phase A Low finding still open). | SPEC S3.M10; SPEC §6 `neuramark_*` | Amend USER_STORIES when PO next edits — non-blocking. |
| **Low** | **Optional lineage column.** PREP allows optional `broll_asset_ids` JSON — only if needed for fingerprint/replay (see High race finding). Prefer persist ordered ids if that unblocks High. | PHASE-B scope DB | CONTRACT chooses lean+re-resolve-with-check **or** nullable JSON/array column — no speculative DDL without race fix. |
| **Info** | **US-8.5 handoff honored.** Consume completed owned broll only; max **8**; skip failed/queued; no Wan adapter / CDN in assembly. | US-8.5 CONTRACT § handoff; PHASE-B B4/B8 | Do not call SiliconFlow from assembly worker. |
| **Info** | **Clip order = job `created_at ASC`.** Aligns US-8.5 one-job-per-beat creation order; beat text never in FFmpeg — correct [SEC] and CONTEXT. | PHASE-B B3/B6; USER_STORIES [SEC] | CONTRACT golden tests: order fixture; argv excludes beat strings. |
| **Info** | **Degrade path aligns SPEC error paths + US-8.5 graceful degrade.** Zero completed broll → Phase A primary if present else incomplete; partial subset stitches — never wait-for-all / never block Operator on Wan failure. | SPEC §4; US-8.5 AC degrade; PHASE-B B4 | CONTRACT error codes + FE messageKeys for waiting-for-clips vs missing-primary. |
| **Info** | **Same story identity (B1).** Sprint `US-9.1-B`; no new backlog ID — correct. | USER_STORIES US-9.1 phased note | Do not invent US-9.x for stitch. |
| **Info** | **Downstream unchanged.** US-9.2 / US-10.1 / US-11.1 still consume `assembled_reel` output / assembly id — stitch must not change output asset type or serve contract. | Phase A handoffs | Output remains `asset_type = assembled_reel`. |
| **Info** | **Phase A High BUILD blockers are closed.** CONTRACT/SECURITY/worker/FFmpeg graph/media serve exist for Phase A; Phase B amends, does not restart. | US-9.1 SPEC-REVIEW Phase A | Amend in place; do not fork parallel assembly domain. |

---

### TASKS / PHASE-B open questions — resolved against SPEC

| Question | Resolution | SPEC / ADR basis |
|----------|------------|------------------|
| New story vs Phase B? | **Phase B of US-9.1** (`US-9.1-B`). | USER_STORIES phased note; S3.M10 single module |
| Stitch whenever broll exists? | **No** — `faceless` only; talking-head ignores broll. | S3.M4 modalidad por slot |
| Wait for all broll jobs? | **No** — completed subset; zero → degrade. | SPEC §4; US-8.5 graceful degrade |
| Max clips? | **8** (US-8.5 `clampWanClipCount` / `brollBeats` max). | US-8.5 CONTRACT |
| Beat text in FFmpeg? | **Never** — order via `created_at` only. | USER_STORIES [SEC]; SECURITY_BASELINE |
| FE stitch preview? | **Reuse** assembled preview — no B-roll strip. | S3.M10 Cliente/Operator preview; US-8.5 FE deferred |
| Cold open / rewind? | Numeric cold-open trim optional; **rewind FX deferred**. | S3.M10 partial; PHASE-B B11 |
| Auto-assemble in ciclo? | **Out** — ADR-0001 / integrations-engineer. | S3.M14; ADR-0001 |
| FFmpeg on Vercel? | **Forbidden.** | ADR-0003 |
| Cliente assemble? | **Out** — Operator-only V1. | SPEC §2 |
| Consume SiliconFlow URLs? | **Forbidden** — owned Storage only. | US-8.5 handoff; USER_STORIES [SEC] SSRF |
| Fingerprint extension? | Include ordered broll asset ids + `path_tag` (`primary` vs `broll_stitch`) — CONTRACT exact string. | USER_STORIES AC idempotency; PHASE-B B9 |

**No SPEC amendment required** for the resolutions above — Phase B is the planned S3.M10 stitch closure after US-8.5. **Recommended VALIDATION note:** Phase B closes faceless B-roll stitch + optional numeric cold-open; residual S3.M10 = rewind FX + weekly auto-assemble.

---

### Terminology violations (CONTEXT)

**None that block** in PHASE-B.md / README / TASKS for technical PREP (enums `faceless`, `broll`, `broll_stitch` OK in code).

Product-facing EN/ES for Phase B incomplete / waiting copy **must** prefer:

| Prefer | _Evitar_ |
|--------|----------|
| **Video sin rostro** / **B-roll / sin presencia** | faceless (user-facing ES; enum OK) |
| **Ensamblado** / **Reel ensamblado** | assembled reel (user-facing ES) |
| **Modalidad de producción** | production mode, slot visual type |
| **Operator** | admin, administrador, staff |
| **Paquete de guion** | script package |
| **Job de generación** (upstream Wan/broll) | generation job |
| **download-and-own** (tech docs OK) | long-lived third-party CDN URLs as product concept |

Do **not** expose FFmpeg argv, concat demuxer lists, storage keys, temp paths, or SiliconFlow URLs in UI/DTOs.

---

### Blockers for SECURITY / CONTRACT / BUILD

| Item | Blocks? | Guidance |
|------|---------|----------|
| CONTRACT.md **Phase B** section (resolve, fingerprint+path_tag, concat seam, degrade, audio, cold-open bounds, FE readiness) | **Yes — BUILD gate** | Freeze before media-pipeline ∥ BE ∥ thin FE. |
| SECURITY.md Phase B amend (multi-clip IDOR, concat injection, tenancy) | **Yes — BUILD gate sequence** | After this SPEC-REVIEW; before/with CONTRACT. |
| Worker clip-set ↔ fingerprint determinism (persist ids **or** re-resolve+mismatch fail) | **Yes — AC idempotency** | Must be in CONTRACT — not left as lean ambiguity. |
| `build-broll-concat-args` golden graph + spawn floors | **Yes — AC + [SEC]** | Pure builder; shell false; temp paths only. |
| Faceless Assemble enablement signal (batch/DTO) | **Yes — thin FE** | Server-authoritative; no client asset ids. |
| Residual S3.M10 rewind FX / auto-assemble | **No — document** | VALIDATION Phase B residual gap. |
| US-9.2 burn-in / Wan adapter / talking-head overlays | **No — out of scope** | Explicit Phase B scope out. |
| New DDL | **No — unless race fix needs `broll_asset_ids`** | Prefer only if High race fix chooses persist. |

**SPEC blockers on intent:** none. Proceed SECURITY → CONTRACT Phase B → BUILD.

---

### Recommended action

1. **security-architect** — amend `SECURITY.md` for multi-clip ownership, concat argv injection, fingerprint/IDOR parity, no CDN fetch.
2. **nextjs-backend** — amend `CONTRACT.md` Phase B with non-negotiable freezes:
   - Faceless resolve: ≤8 completed owned broll by `created_at ASC`; talking-head ignore broll; zero → primary degrade or `ASSEMBLY_INPUTS_INCOMPLETE`.
   - Fingerprint: `sha256(… ‖ ordered_broll_ids ‖ path_tag)` exact delimiter/`path_tag` strings.
   - **Clip-set determinism** (persist ordered ids **or** re-resolve + fingerprint mismatch fail).
   - Faceless audio / voiceover rules table.
   - `buildBrollConcatArgs()` inputs → `string[]`; optional cold-open integer bounds.
   - Error codes + `messageKey`s; FE readiness fields; **Reviewed by FE**.
3. **BUILD** — media-pipeline-engineer (`build-broll-concat-args` + worker branch) ∥ nextjs-backend (resolver/fingerprint/tests) ∥ thin nextjs-frontend (Assemble enablement).
4. **VALIDATION Phase B** — re-verify five USER_STORIES AC on stitch path; close Phase A VALIDATION stitch deferral; record residual rewind FX + auto-assemble.

Do **not** uncheck Phase A AC; do **not** add new USER_STORIES checkboxes; do **not** amend SPEC for this phased split.

---

### Phase A cross-reference

Prior review: [`SPEC-REVIEW.md`](./SPEC-REVIEW.md) (Phase A verdict **GAPS** — BUILD blockers since closed). This document is the **Phase B** gate artifact; keep Phase A review intact for history.
