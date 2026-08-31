## Spec Review — US-8.8

### Verdict: ALIGNED

US-8.8 intent — the **System** ships a real **FAL LTX** `VideoProviderAdapter` for catalog key **`ltx_broll_high`** (`videoAssetRole: broll`, high tier / P1), never as the silent low-tier default; activates the catalog row so **`provider_tier = high`** + `needs_broll` can select it; extends **`createBrollVideoJobs`** (replacing the Wan-only guard at L188–190) with the same **graceful degrade** semantics as US-8.5; reuses US-8.1 normalizers, US-8.4 jobs/poller, US-7.1 budget, and US-8.7 **activate migration** pattern — is **directionally aligned** with SPEC §3 **Video Provider Adapter** (S3.M9: swappable adapters `estimate/create/status/fetch`; `neuramark_video_jobs`; download-and-own; keys server-only; budget re-check; low-tier **Wan** default; high-tier providers not silent on low), SPEC §3 Cost Policy (S3.M8: cumulative Reel budget; Cliente never sends cost/provider), SPEC §3 Avatar / Visual Mode (S3.M4: **B-roll / sin presencia** as allowlisted modalidad; modality per slot — not a single rigid mode), SPEC §1 SC-1 (Reels without grabarse), SPEC §5 (`lib/providers/`; ADR-0003 poll/fetch on Fly), USER_STORIES § US-8.8 (7 AC), frozen **US-8.1** interface + registry, frozen **US-7.2** tier floor + high-tier B-roll routing intent, frozen **US-X.4** catalog seed (`ltx_broll_high`, `FAL_API_KEY`, `active = false`, 126¢ `per_clip`, `ltx-2.3-pro`), frozen **US-8.5** B-roll orchestrator + degrade pattern, frozen **US-9.1 Phase B** stitch consumer (produce clips here / stitch there).

**Gaps** sit between PREP freezes / USER_STORIES AC and what **CONTRACT.md** / **SECURITY.md** must freeze before BUILD: FAL LTX model id + async API shape, reference-still resolution (reuse Wan resolver), max clips, duration clamp vs reject, FAL output-host allowlist, orchestrator allowlist unlock for `{ ltx_broll_high + high }`, poller/retry parity for `asset_role = broll` with LTX parent key, storage-key shape vs `STORAGE_KEY_REGEX`, and explicit VALIDATION handoff that AC “stitched in assembly” is **produce clips here / stitch in US-9.1 Phase B** (already CLOSED). Story intent does **not** contradict SPEC or ADRs. **No DRIFT. No SPEC block.**

**Branch `feature/US-8.8-ltx-broll-high` (PREP only):** README + TASKS + USER_STORIES entry — no adapter/orchestrator/migration code yet. This review gates SECURITY → CONTRACT → BUILD.

**Upstream dependencies satisfied or frozen:** **US-8.1** ✅ interface + normalizers + registry. **US-7.2** ✅ policy high-tier B-roll path (inactive until activate). **US-X.4** ✅ catalog seed. **US-8.4** ✅ job table + poller. **US-8.5** ✅ `createBrollVideoJobs` + Wan adapter + degrade (extend, do not fork). **US-7.1** ✅ budget. **US-8.7** ✅ activate migration pattern (mirror for LTX). **US-9.1 Phase B** ✅ stitch consumer. **Soft:** **US-5.1** (`broll_beats` / `modalidad`).

---

### Findings

| Severity | Finding | SPEC/ADR reference | Fix |
|----------|---------|-------------------|-----|
| **High** | **No US-8.8 CONTRACT.md.** PREP/TASKS sketch adapter path, factory, orchestrator unlock, and open Q1–7, but do not freeze FAL LTX model id, create/status/fetch URLs + body, MIME/host allowlists, `createLtxBrollHighAdapter` signature, or Phase A/B acceptance. BUILD cannot start at US-8.5/8.7 depth. | USER_STORIES US-8.8; SPEC S3.M9; README gates; TASKS open Q1–7 | Author **US-8.8 CONTRACT.md** before BUILD — constants module, vendor JSON contracts, factory params, Phase A/B acceptance, orchestrator allowlist table, forbidden client keys. **Reviewed by FE: N/A**. |
| **High** | **FAL LTX vendor contract unresolved.** Model `ltx-2.3-pro`, async queue + poll paths, auth header (`Authorization: Key ${FAL_API_KEY}` or FAL-documented), and status→US-8.1 normalizer map are PO lean only. Wrong shape → broken poller or stub gap. | SPEC S3.M9; US-8.5 FAL-adjacent pattern (none — new vendor); TASKS open Q1 | CONTRACT: freeze model string (seed metadata), base URL family, create/poll/fetch paths, auth via `FAL_API_KEY`, status field map, `PROVIDER_CONFIG_MISSING` before network I/O. |
| **High** | **Reference still + prompt authority not frozen.** I2V/T2V needs server-resolved image + server-authored prompt from beats/script. PO lean reuses **`getBrollReferenceStillAssetForClient`** (US-8.5) — fail-closed rules and MIME allowlist still unspecified for LTX path. | SPEC S3.M4 B-roll assets; S3.M9 server keys; TASKS open Q2–3; US-8.5 CONTRACT | CONTRACT + SECURITY: owned still only (same resolver as Wan); fail closed with `messageKey` if none; prompt built from `brollBeats[i]` + script via **`buildLtxBrollPrompt`**; **reject** client `provider_key` / raw unbounded prompt as sole authority. |
| **High** | **Orchestrator Wan-only guard blocks high-tier AC.** `create-broll-video-jobs.ts` L188–190 rejects any non-Wan/low pair with `BROLL_PROVIDER_UNAVAILABLE`. Phase B must replace with allowlist `{ siliconflow_wan21_turbo + low, ltx_broll_high + high }` without coupling primary create. | USER_STORIES US-8.8 AC #1/#2/#5; US-8.5 orchestrator; README PO #5 | CONTRACT: freeze allowlist unlock sequence; independent of talking-head create; graceful degrade unchanged; tests: high + needsBroll → LTX; low → never LTX; primary succeeds when LTX fails. |
| **High** | **Poller / retry parity for LTX `broll` not contracted.** US-8.4 poller is provider-agnostic in intent; US-8.5 unlocked retry for `asset_role = broll` + Wan parent. LTX path must inherit **`provider_key = ltx_broll_high`** on retry — easy to regress if retry hardcodes Wan. | USER_STORIES US-8.8 AC degrade/SEC; US-8.5 CONTRACT retry; TASKS Phase B | CONTRACT: retry inherits parent `provider_key` + **`asset_role = broll`**; never converts LTX → talking-head / Wan; poller processes LTX B-roll rows same as Wan. |
| **High** | **FAL output host allowlist not frozen.** Download-and-own requires `validateProviderOutputUrl`; FAL CDN hosts TBD (must not reuse SiliconFlow/Replicate/HeyGen lists blindly). | US-8.1 normalizers; ADR-0003 fetch on worker; [SEC] AC | CONTRACT: freeze **`LTX_FAL_ALLOWED_OUTPUT_HOSTS`** (or shared FAL host list if documented); all vendor URLs through US-8.1 validators; long poll/`fetchAsset` on Fly (US-8.4) — no Vercel long poll. |
| **Medium** | **AC “stitched in assembly (US-9.1)” is a handoff, not US-8.8 BUILD.** PREP correctly scopes stitch to US-9.1 Phase B (CLOSED); VALIDATION must record produce-only closure. | USER_STORIES US-8.8 AC #6; US-9.1 VALIDATION; README PO #10 | CONTRACT + VALIDATION: US-8.8 closes by producing N owned `broll` clips; stitch = **US-9.1 Phase B** consumer only. Do not pull FFmpeg into US-8.8. |
| **Medium** | **Storage key shape contradicts `STORAGE_KEY_REGEX`.** Media checklist cites flat **`{uuid}.mp4`** (US-8.5 CONTRACT amendment) — reconcile in CONTRACT; no hierarchical path. | `lib/contracts/media-assets.ts` `STORAGE_KEY_REGEX`; US-8.5 CONTRACT | CONTRACT: flat `{uuid}.mp4`; lineage via job context / poller L1. |
| **Medium** | **Activate migration not shipped.** Seed has `active = false`; AC #2 requires active row for high-tier default. Phase B migration mirrors US-8.7 HeyGen activate (`UPDATE … SET active = true WHERE key = 'ltx_broll_high'`). | USER_STORIES US-8.8 DB row; US-X.4 seed; US-8.7 pattern | CONTRACT: freeze migration filename + idempotent UPDATE; no cost_model change unless SECURITY finds gap; policy tests after activate. |
| **Medium** | **Max clips + duration clamp vs reject still open.** Lean max **8** / clamp **≤5s** (catalog `clipDurationSec: 5`; policy band 3–5s) — share `clampWanClipCount` or rename to shared `clampBrollClipCount`. | USER_STORIES AC #3; S3.M8 budget; TASKS open Q4 | CONTRACT: default request **5s**; **clamp** >5s; **max clips lean 8**; one job per beat; LTX and Wan share cap helper. |
| **Medium** | **Consent re-check wording vs B-roll.** SPEC S3.M9 says re-check consent+budget; PO correctly skips **avatar consent** for B-roll (not likeness talking-head). Must freeze so BUILD does not block LTX on missing own-avatar consent. | SPEC S3.M9; S3.M4 consent for own-avatar; README PO #12 | CONTRACT: gate order for B-roll = policy → estimate → **budget** → create (**no** consent gate); talking-head consent unchanged. |
| **Medium** | **Registry bootstrap for inactive row.** PO lean: register adapter when catalog row **exists** regardless of `active`; policy filters `active` at resolve time (US-X.4 pattern). Must freeze or Phase A tests vs Phase B routing diverge. | TASKS open Q7; US-X.4; README PO #14 | CONTRACT: registry registers on row presence; `resolveProvider` excludes inactive; orchestrator returns `BROLL_PROVIDER_UNAVAILABLE` pre-activate. |
| **Medium** | **Optional FE preview deferred vs USER_STORIES FE row.** Owner table lists optional preview strip; PREP defers with **Reviewed by FE: N/A**. Acceptable — no FE AC checkboxes. | USER_STORIES US-8.8 FE; README PO #13 | CONTRACT/VALIDATION: FE out of scope for CLOSE; Operator primary-filtered job list acceptable. |
| **Low** | **Partial CLOSE after Phase A discouraged.** PO lean: keep AC unchecked until Phase B (high-tier routing + activate are core AC). Aligns with Wan/HeyGen full-close pattern. | README Phase A/B; USER_STORIES AC | Do not check USER_STORIES AC until A+B + VALIDATION. |
| **Low** | **Display label already seeded.** `resolve-provider-display-label.ts` has `ltx_broll_high: "LTX B-roll"` — Operator diagnostics OK; no Cliente-facing copy in this story. | CONTEXT terminology | FE follow-up (if any) uses **B-roll / sin presencia**, not “faceless”. |
| **Info** | **Vision & hard rules intact.** No publish without Aprobación; no human recording; no Stories/multicanal/ads/RBAC UI; Playbook vs Trend not conflated; B-roll is modalidad support, not a second playbook. | SPEC §1 SC-1–SC-4; CONTEXT | LTX clips feed assembly → QA → Aprobación — not IG Graph. |
| **Info** | **Tier floor / no silent default aligned.** Activating `ltx_broll_high` must not change low-tier routing (Wan remains default B-roll on low). Matches SPEC S3.M9 + US-7.2. | SPEC S3.M9; US-7.2 AC | Tests: `provider_tier=low` + active LTX row → never `ltx_broll_high`. |
| **Info** | **Roles unchanged.** System adapter + jobs; Operator orchestrator/retry; Cliente never supplies `provider_key` or costs. LTX is policy-selected on high tier — no Operator fallback UI (unlike US-8.7 HeyGen). | SPEC §2; AGENTS.md | `requireOperator` on create path V1 (mirror US-8.5). |
| **Info** | **ADRs respected.** No FFmpeg in adapter (ADR-0003 — stitch stays Fly/US-9.1 ✅); no IG publish (ADR-0002); no cron in 8.8 (ADR-0001). Long poll/`fetchAsset` via US-8.4 Fly worker. | ADR-0001–0003 | Adapter = FAL HTTP only under `lib/providers/**`. |
| **Info** | **Out of scope held:** US-9.1 stitch (consumer only), FE preview strip, low-tier Wan changes beyond allowlist generalization, HeyGen/ElevenLabs, Operator LTX fallback UI, new job DDL, live FAL CI, client-forced provider, Stories IG, multicanal, ads, RBAC UI. | SPEC §1 fuera de alcance; USER_STORIES | US-8.8 = LTX adapter + activate + orchestrator unlock — not second job system. |

---

### TASKS open questions — resolved against SPEC

| Question (README / TASKS) | Resolution | SPEC / ADR basis |
|---------------------------|------------|------------------|
| Exact FAL model endpoint for `ltx-2.3-pro`? | CONTRACT freezes against FAL docs; async queue + poll; auth `FAL_API_KEY`. | S3.M9 adapters |
| Reference still when faceless? | Reuse **`getBrollReferenceStillAssetForClient`** (US-8.5); fail closed — Operator manual primary remains alternate. | S3.M4 work photos / B-roll; S3.M9 download-and-own |
| Prompt authorship? | Server-built from `brollBeats` + script via LTX-specific wrapper; never client free-text as sole authority. | S3.M6 Paquete de guion; [SEC] injection floor |
| Max clips per Reel? | Lean **8** (script `brollBeats` max); CONTRACT may lower for cost; shared cap with Wan. | S3.M8 budget; US-5.1 beats |
| Shared orchestrator constants? | Minimal branch in orchestrator unless CONTRACT proves duplication → optional `lib/contracts/broll-shared.ts`. | DRY — not required for SPEC |
| Partial CLOSE after Phase A? | **No** — AC unchecked until Phase B VALIDATION. | High-tier routing AC requires active row + orchestrator |
| Registry bootstrap for inactive row? | Register on row presence; policy filters `active`. | US-X.4 pattern |
| US-9.1 stitch in same PR? | **No** — handoff only; US-9.1 Phase B already CLOSED. | S3.M10 assembly |
| Consent for B-roll? | **Not required** (not own-avatar likeness); budget **does** apply. | S3.M4 consent scope; S3.M8 budget |
| Activate catalog migration? | **Yes — Phase B** (`active = true`); unlike Wan (already active). | US-X.4 seed; US-8.7 mirror |
| Provider key rename? | **Reject** — canonical **`ltx_broll_high` only** (US-X.4). | US-7.2 / US-X.4 |
| FFmpeg / stitch in US-8.8? | **Out of scope** — ADR-0003 worker / US-9.1 Phase B ✅. | ADR-0003; S3.M10 |

**No SPEC amendment required** — LTX high-tier B-roll is the documented provider under S3.M9 + US-X.4 seed + US-7.2 high-tier routing; phased A/B + US-9.1 stitch handoff is consistent with US-8.5 Wan pattern.

---

### Terminology violations (CONTEXT)

**None that block** in README/TASKS planning language (technical enums `faceless`, `needs_broll`, `provider_key`, `ltx_broll_high` OK in code/contracts).

Product-facing EN/ES (if any follow-up Operator copy) must use:

| Prefer | _Evitar_ |
|--------|----------|
| **Video sin rostro** / **B-roll / sin presencia** | faceless (user-facing ES; enum `faceless` OK in code) |
| **Job de generación** | generation job |
| **Operator** | admin, administrador, staff |
| **Cliente** | prestador, dueño, usuario final (as product role) |
| **Modalidad de producción** | production mode, slot visual type |
| **Preferencias de producción visual** | visual mode selector / single mode |
| **Política de costo** | max_cost as loose business concept |
| **Paquete de guion** | script package |
| **Reel** | piece, content item (generic) |

Do **not** expose FAL URLs, API keys, storage keys, or raw vendor error bodies in UI/DTOs.

---

### Blockers for SECURITY / CONTRACT

| Item | Blocks? | Guidance |
|------|---------|----------|
| US-8.8 CONTRACT.md (FAL API, factory, Phase A/B, orchestrator unlock) | **Yes — BUILD gate** | Mirror US-8.5 / US-8.7 CONTRACT depth. |
| FAL LTX model id + create/poll/fetch contracts | **Yes — Phase A AC** | Freeze before media-pipeline BUILD. |
| Reference still + prompt server authority | **Yes — [SEC]** | Reuse Wan resolver; fail closed; no client prompt sole authority. |
| FAL output host allowlist + download-and-own | **Yes — SSRF / S3.M9** | Distinct allowlist; Fly fetch via US-8.4. |
| Orchestrator allowlist unlock + graceful degrade | **Yes — AC #1/#2/#5** | Replace L188–190 guard; Phase B required for CLOSE. |
| Poller includes LTX `broll` + retry inherits parent key | **Yes — parity** | Mirror US-8.5 retry contract for LTX parent. |
| Budget per clip (`assertReelBudgetAllowsSpend`) | **Yes — AC [SEC] / US-7.1** | Block B-roll without failing primary. |
| Activate migration Phase B | **Yes — AC #2** | `active = true` before high-tier routing E2E. |
| Storage key = flat `{uuid}.mp4` | **Yes — US-8.5 CHECK** | Reconcile in CONTRACT. |
| Estimate 126¢ from catalog | **Yes — AC #4** | `per_clip` × clipCount; registry bootstrap 126. |
| Max clips + duration clamp | **Yes — freeze in CONTRACT** | Lean 8 / clamp ≤5s. |
| Consent skip for B-roll | **Yes — document** | Budget yes; avatar consent no. |
| AC stitch → US-9.1 Phase B | **No — handoff** | US-9.1 ✅ CLOSED; VALIDATION note binding. |
| Optional FE preview | **No — deferred** | Reviewed by FE: N/A. |
| Live FAL CI | **No — out of scope** | Mocked HTTP only. |

**SPEC blockers on intent:** none. **ADR breaches:** none if poll/fetch stay on Fly worker, FFmpeg stitch stays US-9.1, secrets remain server-only (`FAL_API_KEY`, never in catalog rows or responses), and no IG publish path is introduced.

---

### Recommended action

Proceed to **SECURITY.md** then **CONTRACT.md** with these **non-negotiable freezes**:

1. **`createLtxBrollHighAdapter()`** — FAL LTX HTTP; `FAL_API_KEY`; host allowlist; US-8.1 normalizers; registry hook; `videoAssetRole: "broll"`; estimate **126¢ × clipCount**.
2. **I2V/T2V inputs** — server-resolved owned still (reuse US-8.5 resolver) + server-authored beat/script prompt; duration **clamp ≤ 5s**; reject client `provider_key` / free-form sole prompt.
3. **Phase B orchestrator unlock** — allowlist `{ siliconflow_wan21_turbo + low, ltx_broll_high + high }`; replace L188–190 Wan-only guard; **graceful degrade** vs primary unchanged; max clips frozen.
4. **Phase B activate migration** — `ltx_broll_high.active = true` (mirror US-8.7 HeyGen pattern).
5. **Poller + retry** — process LTX `broll` rows; retry keeps LTX + `broll`; no primary coupling.
6. **Storage** — flat `{uuid}.mp4` per `STORAGE_KEY_REGEX`.
7. **Tier floor** — `provider_tier = low` never resolves `ltx_broll_high` even when row active.
8. **ADR-0003** — no Vercel long poll; no FFmpeg in US-8.8.
9. **VALIDATION** — document stitch handoff to **US-9.1 Phase B** (already CLOSED); FE preview deferred; no AC check-off until A+B.
10. **Explicit out of scope:** US-9.1 stitch BUILD, FE preview strip, HeyGen/ElevenLabs, Operator LTX fallback UI, low-tier Wan behavior change, live FAL CI, talking-head path changes, Stories/multicanal/ads/RBAC UI.

Do not check off USER_STORIES acceptance criteria in this gate.
