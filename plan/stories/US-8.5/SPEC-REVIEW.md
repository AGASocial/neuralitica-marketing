## Spec Review — US-8.5

### Verdict: GAPS

US-8.5 intent — the **System** replaces the **`siliconflow_wan21_turbo`** stub with a real **SiliconFlow Wan2.1 I2V Turbo** `VideoProviderAdapter` (`videoAssetRole: broll`), wires registry + **`estimateCost`** from catalog **`per_clip` / 21¢**, runs **`createJob` / `getJobStatus` / `fetchAsset`** through US-8.1 normalizers under **`SILICONFLOW_API_KEY`**, then (Phase B) unlocks a **B-roll job orchestrator** that creates **`neuramark_video_jobs`** with **`asset_role = broll`**, counts budget per clip, and **gracefully degrades** so failed B-roll never blocks talking-head **primary** — is **directionally aligned** with SPEC §3 **Video Provider Adapter** (S3.M9: swappable adapters `estimate/create/status/fetch`; `neuramark_video_jobs`; low-tier **Wan**; download-and-own; keys server-only; budget re-check), SPEC §3 Cost Policy (S3.M8: cumulative Reel budget; Cliente never sends cost/provider), SPEC §3 Avatar / Visual Mode (S3.M4: **B-roll / sin presencia** as allowlisted modalidad; modality per slot — not a single rigid mode), SPEC §1 SC-1 (Reels without grabarse), SPEC §5 (`lib/providers/`; ADR-0003 poll/fetch on Fly), USER_STORIES § US-8.5 (6 AC), frozen **US-8.1** stub + interface, **US-7.2** low + `needsBroll` → Wan, **US-X.4** catalog seed (active, 21¢, `SILICONFLOW_API_KEY`), **US-8.4** jobs + poller, **US-7.1** cumulative budget, and **US-9.1 Phase A** deferral that names **US-8.5** as the clip producer for **Phase B stitch**.

**Gaps** sit between PREP freezes / USER_STORIES AC and what **CONTRACT.md** / **SECURITY.md** must freeze before BUILD: SiliconFlow Wan I2V model id + async API shape, reference-still resolution, max clips, duration clamp vs reject, output-host allowlist, B-roll orchestrator + degrade contract, poller/retry parity for `asset_role = broll` (today retry hardcodes `primary`), storage-key shape vs `STORAGE_KEY_REGEX`, and explicit VALIDATION handoff that AC “stitched in assembly” is **produce clips here / stitch in US-9.1 Phase B**. Story intent does **not** contradict SPEC or ADRs. **No CONFLICT.**

**Upstream dependencies satisfied or frozen:** **US-8.1** ✅ stub `siliconflow_wan21_turbo` + normalizers. **US-7.2** ✅ / **US-X.4** ✅ policy + catalog (active, 21¢). **US-8.4** ✅ job table + poller (extend for `broll`, do not fork). **US-7.1** ✅ budget. **US-8.2 / 8.6 / 8.7** ✅ adapter patterns. **CosyVoice2** ✅ shared `SILICONFLOW_API_KEY` HTTP style. **Soft:** **US-5.1** (`broll_beats` / `modalidad`). **Downstream:** **US-9.1 Phase B** stitch consumer (`build-broll-concat-args`).

---

### Findings

| Severity | Finding | SPEC/ADR reference | Fix |
|----------|---------|-------------------|-----|
| **High** | **No US-8.5 CONTRACT.md.** PREP/TASKS sketch adapter path, factory, orchestrator steps, and open Q1–8, but do not freeze SiliconFlow model id, create/status/fetch URLs + body, MIME/host allowlists, `createSiliconflowWan21TurboAdapter` signature, or `createBrollVideoJobs` return union. BUILD cannot start at US-8.2/8.7 depth. | USER_STORIES US-8.5; SPEC S3.M9; README gates; TASKS open Q1–8 | Author **US-8.5 CONTRACT.md** before BUILD — constants module, vendor JSON contracts, factory params, Phase A/B acceptance, orchestrator step table, forbidden client keys. **Reviewed by FE: N/A**. |
| **High** | **SiliconFlow Wan I2V vendor contract unresolved.** Model id, async task create/poll paths, auth header, and status→US-8.1 normalizer map are PO lean only. Wrong shape → silent stub retention or broken poller. | SPEC S3.M9; CosyVoice2 SiliconFlow pattern; TASKS open Q1 | CONTRACT: freeze model string (catalog metadata lean `wan2.1-i2v-turbo`), base URL family, create/poll/fetch paths, Bearer auth via `SILICONFLOW_API_KEY`, status field map, `PROVIDER_CONFIG_MISSING` before network I/O. |
| **High** | **Reference still + prompt authority not frozen.** I2V needs server-resolved image + server-authored prompt from beats/script. Fail-closed rules and MIME allowlist unspecified — SSRF / injection / empty-faceless footguns. | SPEC S3.M4 B-roll assets; S3.M9 server keys; TASKS open Q2–3; SECURITY floor | CONTRACT + SECURITY: owned still only (profile/cover/uploaded still allowlist); fail closed with `messageKey` if none; prompt built from `brollBeats[i]` + script snippets with server wrap; **reject** client `provider_key` / raw unbounded prompt as sole authority. |
| **High** | **B-roll orchestrator + graceful degrade not contracted.** AC requires default create when low + `needs_broll`, budget per clip, and **failed B-roll must not** fail/cancel primary. Phase B module name/steps/error codes open; easy to couple create paths. | USER_STORIES US-8.5 AC #1/#4/#6; SPEC S3.M8–M9; README PO #8 | CONTRACT: freeze **`createBrollVideoJobs`** (or exact name) — Operator-gated V1; N jobs `asset_role = broll`; independent of `createTalkingHeadVideoJob`; on clip fail mark **that** job only; tests: primary succeeds when B-roll throws/fails/budget-blocked. |
| **High** | **Poller / retry parity for `broll` incomplete in current code.** US-8.4 poller is provider-agnostic in intent, but **`retry-video-job` hardcodes `assetRole: "primary"`** and `needsBroll: false`. Phase B AC “retry stays broll” will break without CONTRACT unlock. | USER_STORIES US-8.5 AC degrade/SEC; US-8.4 retry; TASKS Phase B poller/retry | CONTRACT: poller query includes `asset_role IN ('primary','broll')` (no primary-only filter); retry inherits parent `provider_key` + **`asset_role = broll`**; never converts Wan → talking-head / HeyGen. |
| **High** | **Output host allowlist not frozen.** Download-and-own requires `validateProviderOutputUrl`; SiliconFlow CDN hosts TBD (must not reuse Replicate/HeyGen lists blindly). | US-8.1 normalizers; ADR-0003 fetch on worker; [SEC] AC | CONTRACT: freeze **`SILICONFLOW_WAN_ALLOWED_OUTPUT_HOSTS`** (or shared SiliconFlow host list if CosyVoice2-compatible); all vendor URLs through US-8.1 validators; long poll/`fetchAsset` on Fly (US-8.4) — no Vercel long poll. |
| **Medium** | **AC “stitched in assembly (US-9.1)” is a handoff, not US-8.5 BUILD.** PREP correctly scopes stitch to US-9.1 Phase B; VALIDATION must record produce-only closure or AC will look incomplete. | USER_STORIES US-8.5 AC #5; US-9.1 SPEC-REVIEW / VALIDATION Phase B defer; README PO #9 | CONTRACT + VALIDATION: US-8.5 closes by producing N owned `broll` clips; stitch / `build-broll-concat-args` = **US-9.1 Phase B**. Do not pull FFmpeg into US-8.5. |
| **Medium** | **Storage key shape contradicts `STORAGE_KEY_REGEX`.** Media checklist cites `neuramark/{clientId}/{reelScriptId}/{uuid}.mp4`; talking-head adapters use flat **`{uuid}.mp4`** (same finding US-8.6/8.7). | `lib/contracts/media-assets.ts` `STORAGE_KEY_REGEX`; US-8.2 CONTRACT | CONTRACT: reconcile to **flat `{uuid}.mp4`**; amend README checklist; lineage via job context / poller L1. |
| **Medium** | **Estimate drift: stub/registry 10¢ vs catalog 21¢.** US-8.1 CONTRACT notes fallback **10** for Wan; production AC requires **~$0.21/clip**. | USER_STORIES US-8.5 AC #3; US-X.4 seed 21; README PO #6 | Phase A: `estimateCost` = **21 × clipCount** from catalog; registry bootstrap **21**; kill 10¢ stub leftovers; tests 1→21, 3→63. |
| **Medium** | **Max clips + duration clamp vs reject still open.** Lean max **8** / clamp **≤5s** — cost and policy band (3–5s) need freeze or budget abuse / overlong clips slip through. | USER_STORIES AC #2; S3.M8 budget; TASKS open Q4–5 | CONTRACT: default request **5s** (or script ≥3); **clamp** >5s; **max clips lean 8** (may lower for cost); one job per beat. |
| **Medium** | **Consent re-check wording vs B-roll.** SPEC S3.M9 says re-check consent+budget; PO correctly skips **avatar consent** for B-roll (not likeness talking-head). Must freeze so BUILD does not block Wan on missing own-avatar consent. | SPEC S3.M9; S3.M4 consent for own-avatar; README PO #13 | CONTRACT: gate order for B-roll = policy → estimate → **budget** → create ( **no** consent gate ); talking-head consent unchanged. |
| **Medium** | **Optional FE preview deferred vs USER_STORIES FE row.** Owner table lists optional preview strip; PREP defers with **Reviewed by FE: N/A**. Acceptable if no FE AC checkboxes — document so CLOSE does not wait on Operator B-roll list UX. | USER_STORIES US-8.5 FE; README PO #12 | CONTRACT/VALIDATION: FE out of scope for CLOSE; Operator primary-filtered job list acceptable; poller still processes `broll` rows. |
| **Low** | **USER_STORIES US-X.4 shorthand `siliconflow_wan21` vs canonical `siliconflow_wan21_turbo`.** Catalog/stubs/policy use `_turbo`; inventing `wan_broll_low` correctly rejected. | US-X.4 list; US-7.2 / US-8.1 contracts | Prefer **`siliconflow_wan21_turbo` only**; optional USER_STORIES typo fix when PO next edits — non-blocking. |
| **Low** | **Partial CLOSE after Phase A discouraged.** PO lean: keep AC unchecked until Phase B (degrade + default create are core). Aligns with MuseTalk/HeyGen full-close pattern. | README Phase A/B; USER_STORIES AC | Do not check USER_STORIES AC until A+B + VALIDATION. |
| **Info** | **Vision & hard rules intact.** No publish without Aprobación; no human recording; no Stories/multicanal/ads/RBAC UI; Playbook vs Trend not conflated; B-roll is modalidad support, not a second playbook. | SPEC §1 SC-1–SC-4; CONTEXT | Wan clips feed assembly → QA → Aprobación — not IG Graph. |
| **Info** | **Roles unchanged.** System adapter + jobs; Operator orchestrator/retry; Cliente never supplies `provider_key` or costs. Minimal `role` flag — no RBAC UI. | SPEC §2; AGENTS.md | `requireOperator` on create path V1 (mirror talking-head). |
| **Info** | **ADRs respected.** No FFmpeg in adapter (ADR-0003 — stitch stays Fly/US-9.1); no IG publish (ADR-0002); weekly auto B-roll enqueue out of this story (ADR-0001 / integrations). Long poll/`fetchAsset` via US-8.4 Fly worker. | ADR-0001–0003 | Adapter = SiliconFlow HTTP only under `lib/providers/**`. |
| **Info** | **US-9.1 Phase B dependency direction correct.** US-9.1 VALIDATION deferred faceless stitch until US-8.5 clips exist; US-8.5 must not implement concat. | US-9.1 VALIDATION § Phase B; CONTRACT stub note | Handoff note in CONTRACT + VALIDATION mandatory. |

---

### TASKS open questions — resolved against SPEC

| Question (README / TASKS) | Resolution | SPEC / ADR basis |
|---------------------------|------------|------------------|
| Exact SiliconFlow Wan I2V model + async shape? | CONTRACT freezes against Wan2.1 I2V Turbo docs; Bearer + CosyVoice2 host/auth family; async task + poll. | S3.M9 adapters; existing SiliconFlow TTS pattern |
| Reference still when faceless (no avatar)? | Server picks first owned still (logo/cover/upload); fail closed — Operator manual primary (US-8.3) remains alternate. | S3.M4 work photos / B-roll; S3.M9 download-and-own |
| Prompt authorship? | Server-built from `brollBeats` + script; never client free-text as sole authority. | S3.M6 Paquete de guion; [SEC] injection floor |
| Max clips per Reel? | Lean **8** (script `brollBeats` max); CONTRACT may lower for cost. | S3.M8 budget; US-5.1 beats |
| Clamp vs reject duration > 5s? | **Clamp** to 5s (catalog `clipDurationSec: 5`); policy band 3–5s. | USER_STORIES AC #2; catalog metadata |
| Extend Operator job list for `broll`? | **No** for CLOSE — defer with preview strip; poller must still process B-roll. | USER_STORIES FE optional; no FE AC |
| Partial CLOSE after Phase A? | **No** — AC unchecked until Phase B VALIDATION. | Degrade + default create are core AC |
| US-9.1 stitch in same PR? | **No** — handoff only; open US-9.1 Phase B after clips exist. | S3.M10 assembly; US-9.1 Phase B binding |
| Consent for B-roll? | **Not required** (not own-avatar likeness); budget **does** apply. | S3.M4 consent scope; S3.M8 budget |
| Activate catalog migration? | **No** — row already `active = true` (unlike HeyGen). | US-X.4 seed |
| Provider key rename to `wan_broll_low`? | **Reject** — canonical **`siliconflow_wan21_turbo` only**. | US-7.2 / US-8.1 / US-X.4 |
| FFmpeg / stitch in US-8.5? | **Out of scope** — ADR-0003 worker / US-9.1 Phase B. | ADR-0003; S3.M10 |

**No SPEC amendment required** — Wan is the documented low-tier B-roll provider under S3.M9; phased A/B + US-9.1 stitch split is consistent with prior media stories.

---

### Terminology violations (CONTEXT)

**None that block** in README/TASKS planning language (technical enums `faceless`, `needs_broll`, `provider_key`, `siliconflow_wan21_turbo` OK in code/contracts).

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

Do **not** expose SiliconFlow URLs, API keys, storage keys, or raw vendor error bodies in UI/DTOs.

---

### Blockers for SECURITY / CONTRACT

| Item | Blocks? | Guidance |
|------|---------|----------|
| US-8.5 CONTRACT.md (vendor API, factory, Phase A/B, orchestrator) | **Yes — BUILD gate** | Mirror US-8.2 / CosyVoice2 / US-8.7 CONTRACT depth. |
| Wan I2V model id + create/poll/fetch contracts | **Yes — Phase A AC** | Freeze before media-pipeline BUILD. |
| Reference still + prompt server authority | **Yes — [SEC]** | Owned media only; fail closed; no client prompt sole authority. |
| Output host allowlist + download-and-own | **Yes — SSRF / S3.M9** | Distinct allowlist; Fly fetch via US-8.4. |
| B-roll orchestrator + graceful degrade tests | **Yes — AC #1/#4** | Independent jobs; Phase B required for CLOSE. |
| Poller includes `broll` + retry inherits `asset_role` | **Yes — parity** | Unlock retry from primary-only hardcode. |
| Budget per clip (`assertReelBudgetAllowsSpend`) | **Yes — AC [SEC] / US-7.1** | Block B-roll without failing primary. |
| Storage key = flat `{uuid}.mp4` | **Yes — CHECK / US-8.2** | Reconcile README hierarchical path. |
| Estimate 21¢ (fix 10¢ stub) | **Yes — AC #3** | Catalog-driven; registry bootstrap 21. |
| Max clips + duration clamp | **Yes — freeze in CONTRACT** | Lean 8 / clamp ≤5s. |
| Consent skip for B-roll | **Yes — document** | Budget yes; avatar consent no. |
| AC stitch → US-9.1 Phase B | **No — handoff** | VALIDATION note binding. |
| Optional FE preview | **No — deferred** | Reviewed by FE: N/A. |
| Catalog activate migration | **No** | Already active. |
| Live SiliconFlow CI | **No — out of scope** | Mocked HTTP only. |
| High-tier `ltx_broll_high` | **No — out of scope** | Separate story. |

**SPEC blockers on intent:** none. **ADR breaches:** none if poll/fetch stay on Fly worker, FFmpeg stitch stays US-9.1, secrets remain server-only (`SILICONFLOW_API_KEY`, never in catalog rows or responses), and no IG publish path is introduced.

---

### Recommended action

Proceed to **SECURITY.md** then **CONTRACT.md** with these **non-negotiable freezes**:

1. **`createSiliconflowWan21TurboAdapter()`** — SiliconFlow Wan I2V HTTP; `SILICONFLOW_API_KEY`; host allowlist; US-8.1 normalizers; registry **replaces stub**; `videoAssetRole: "broll"`; estimate **21¢ × clipCount**.
2. **I2V inputs** — server-resolved owned still + server-authored beat/script prompt; duration **clamp ≤ 5s**; reject client `provider_key` / free-form sole prompt.
3. **Phase B `createBrollVideoJobs`** — policy low + `needsBroll` → N `asset_role = broll` jobs; budget per clip; **graceful degrade** vs primary; max clips frozen.
4. **Poller + retry** — process `broll` rows; retry keeps Wan + `broll`; no primary coupling.
5. **Storage** — flat `{uuid}.mp4` per `STORAGE_KEY_REGEX`.
6. **ADR-0003** — no Vercel long poll; no FFmpeg in US-8.5.
7. **VALIDATION** — document stitch deferred to **US-9.1 Phase B**; FE preview deferred; no AC check-off until A+B.
8. **Explicit out of scope:** US-9.1 stitch, FE preview strip, `ltx_broll_high`, `wan_broll_low` rename, catalog activate migration, live SiliconFlow CI, talking-head path changes, Stories/multicanal/ads/RBAC UI.

Do not check off USER_STORIES acceptance criteria in this gate.
