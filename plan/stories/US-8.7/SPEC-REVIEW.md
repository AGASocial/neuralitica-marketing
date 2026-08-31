## Spec Review — US-8.7

### Verdict: GAPS

US-8.7 intent — the **System** ships a real **HeyGen** `VideoProviderAdapter` for catalog key **`heygen_high`** (high tier / P1), never as the silent low-tier default; activates the catalog row so **`provider_tier = high`** can select it; adds an **Operator-only** “Generate with HeyGen” fallback after failed low-tier talking-head jobs with a recorded override; reuses US-8.1 normalizers, US-8.2/8.4 consent·budget·download-and-own·poller, and US-8.6 allowlist-extension pattern; **Avatar IV never auto-selected** — is **directionally aligned** with SPEC §3 **Video Provider Adapter** (S3.M9: swappable adapters `estimate/create/status/fetch`; `neuramark_video_jobs`; download-and-own; keys server-only; re-check consent+budget; **HeyGen = high/P1 no default**), SPEC §3 Cost Policy (S3.M8: Operator override auditado; Cliente never sends provider/cost), SPEC §1 SC-1 (Reels without grabarse), SPEC §4 Operator exception paths (job failed → reintentar / override / upload), SPEC §5 (`lib/providers/`; ADR-0003 worker poll/fetch), USER_STORIES provider-tier matrix (HeyGen high / operator fallback, not silent default), frozen **US-8.1** interface + stub `heygen_high`, frozen **US-8.2 / US-8.6** adapter patterns, frozen **US-8.4** jobs + poller + Operator UI, frozen **US-7.2** tier floor (high never chosen while `provider_tier = low`), frozen **US-X.4** catalog seed (`heygen_high`, `HEYGEN_API_KEY`, `active = false` until activation).

**Gaps** sit between USER_STORIES § US-8.7 acceptance criteria / PREP freezes and what must be frozen in **CONTRACT.md** / **SECURITY.md** before BUILD: HeyGen v3 create/status contract + explicit non–Avatar-IV `engine` string, avatar identity input matrix (`image_url` vs `avatar_id`), output-host allowlist, operator fallback Server Action + override audit storage, orchestrator allowlist unlock for `heygen_high`, storage-key shape reconciliation with US-8.2/`STORAGE_KEY_REGEX`, and AC “per-minute” wording vs catalog `per_second` seed. Story intent does **not** drift from SPEC; unresolved contract shape is the blocker. **No CONFLICT** with SPEC/ADR text.

**Upstream dependencies satisfied or frozen:** **US-8.1** ✅ (interface, registry, normalizers, stub `heygen_high`). **US-8.2** ✅ (consent / budget / download-and-own / Replicate-style adapter pattern). **US-8.4** ✅ (job table, poller, retry UI — reuse; no new DDL). **US-8.6** ✅ (allowlist extension pattern for talking-head keys). **US-7.1** ✅ / **US-7.2** ✅ (budget + tier floor). **US-X.4** ✅ (`heygen_high` inactive seed, `HEYGEN_API_KEY`). **US-3.2** ✅ / **US-3.3** ✅ / **US-5.1** ✅. **Soft:** **US-9.3** (voiceover fixture OK).

---

### Findings

| Severity | Finding | SPEC/ADR reference | Fix |
|----------|---------|-------------------|-----|
| **High** | **No US-8.7 CONTRACT.md.** PREP/TASKS sketch HeyGen v3 (`POST /v3/videos`, `GET /v3/videos/{id}`, `X-Api-Key`) but do not freeze request body, status field map, MIME allowlists, `createHeygenHighAdapter` factory signature, or `lib/contracts/heygen-high.ts` constants. BUILD cannot start without US-8.2/8.6 CONTRACT depth. | USER_STORIES US-8.7; SPEC S3.M9; US-8.2 / US-8.6 CONTRACT; TASKS.md open Q1–3 | Author **US-8.7 CONTRACT.md** — freeze constants module, create/poll JSON contracts, normalizer mapping, factory params, phased BUILD (A adapter; B activate + orchestrator + FE). |
| **High** | **Non–Avatar-IV `engine` string unresolved.** AC: Avatar IV never auto-selected. HeyGen omits → defaults to Avatar IV (cost footgun). PO lean: CONTRACT freezes exact standard/non–IV engine string; adapter must **never omit** `engine`. | USER_STORIES US-8.7 AC #3; README PO #8; TASKS open Q1 | CONTRACT + SECURITY: freeze engine constant; unit test asserts field present and ≠ Avatar IV default; document IV/V out of scope (no catalog key, no UI). |
| **High** | **Avatar identity / createJob input matrix undefined.** PO lean: portrait `image_url` for `own_avatar` + configured studio `avatar_id` for generic — not frozen. Risk: wrong modality inputs, SSRF on unvalidated URLs, or client-influenced avatar ids. | SPEC §3 Preferencias / Avatar; US-8.2 input matrix; TASKS open Q2 | CONTRACT: freeze **HeyGen input matrix** by modalidad — `own_avatar` → server-resolved portrait HTTPS (owned media only); `generic_avatar` → server `heygenAvatarId` / env; reject client `avatar_id` / `image_url` / `engine` / `provider_key`. SECURITY: input URL allowlist. |
| **High** | **Operator fallback action + override audit not frozen.** AC requires explicit operator trigger after low-tier failure with override recorded. PREP sketches Server Action + reason key `operator_heygen_fallback` but storage (job metadata jsonb vs dedicated audit table) and eligibility window are open. | SPEC S3.M8 override auditado; S3.M9 Operator; USER_STORIES US-8.7 AC #2/#5; TASKS open Q4–5 | CONTRACT: freeze Server Action name, `requireOperator`, eligibility (latest talking-head `failed` ∧ `provider_key` ∈ `{sadtalker_low,musetalk_low}`), server-forced `heygen_high` (no client provider field), override record shape (operator id, reason, timestamp, parent job id), 403 for Cliente. |
| **High** | **Orchestrator allowlist unlock for `heygen_high` not contracted.** Phase B must extend `isAllowedTalkingHeadProviderKey` and high-tier `resolveProviderForJob` path; today only low-tier keys are expected in create path. Without CONTRACT, Phase A adapter may ship while policy/orchestrator still reject `heygen_high`. | US-7.2 tier floor; US-8.4 / US-8.6 orchestrator pattern; README PO #6 | CONTRACT: Phase B unlock sequence — allow `{sadtalker_low, musetalk_low, heygen_high}`; high tier + active row → policy select; low tier **never** selects even when active; fallback force only via operator action. Gate order unchanged: policy/fallback → estimate → budget → consent (`own_avatar`) → `createJob` → INSERT → spend → poll. |
| **High** | **HeyGen output host allowlist not frozen.** AC [SEC] same download-and-own / URL validation as US-8.2. PREP correctly forbids reusing Replicate hosts; exact CDN hosts TBD. | US-8.1 `validateProviderOutputUrl`; US-8.2 CONTRACT hosts; ADR-0003 fetch on worker | CONTRACT: freeze **`HEYGEN_ALLOWED_OUTPUT_HOSTS`**; adapter pipes all vendor URLs through US-8.1 normalizers; poll/`fetchAsset` on Fly worker (US-8.4) — no Vercel long poll. |
| **Medium** | **Storage key shape contradicts US-8.2 / `STORAGE_KEY_REGEX`.** README media checklist cites `neuramark/{clientId}/{reelScriptId}/{uuid}.mp4`; talking-head adapters use flat **`{uuid}.mp4`** (same finding as US-8.6 SPEC-REVIEW). | US-8.2 CONTRACT `fetchAsset`; `lib/contracts/media-assets.ts` `STORAGE_KEY_REGEX`; US-8.6 SPEC-REVIEW | CONTRACT: reconcile to **flat `{uuid}.mp4`**; amend README checklist; lineage from job context / poller L1 only. |
| **Medium** | **AC “per-minute model” vs catalog `per_second`.** USER_STORIES AC says per-minute ~$1/min; PREP correctly keeps `billingUnit: "per_second"` with `unitCostCents: 2` (~$1.20/min) and migrates prior seed `7`. Wording mismatch can confuse VALIDATION. | USER_STORIES US-8.7 AC #3; README PO #7; US-X.4 seed | CONTRACT: freeze estimate = `unitCostCents * targetDurationSec` (server duration); document AC satisfaction via `approxPerMinuteCents: 120`; migration comment for 7→2; never client cost drivers. |
| **Medium** | **Audio vs text on create unsettled.** PO lean: prefer `audio_url` from voiceover asset; text script fallback optional. Adapter create validation may diverge without freeze. | US-8.2 voiceover required; US-9.3 soft; TASKS open Q3 | CONTRACT: require `voiceoverAssetId` → `audio_url` for V1 lip-sync when asset present; if text fallback allowed, freeze schema + when used; fixture audio OK for Phase A tests. |
| **Medium** | **FE eligibility vs automatic high-tier create.** USER_STORIES FE: action when tier `high` **or** fallback. PREP also unlocks policy auto-select when `provider_tier = high`. Risk: duplicate create paths or FE implying HeyGen is only manual on high. | SPEC S3.M9 auto en ciclo; USER_STORIES US-8.7 FE; README scope FE Phase B | CONTRACT: document dual path — (1) policy-selected create when tier=high + active (cycle/orchestrator); (2) Operator FE action for high **and** post-failure fallback; same Server Action or thin wrappers; no client-visible cost/provider injection. |
| **Medium** | **Retry must not silently upgrade to HeyGen.** TASKS: low-tier retry stays low; HeyGen retry stays `heygen_high`. Easy to break if retry shares fallback force path. | US-8.4 retry; USER_STORIES US-8.7 AC #1 | CONTRACT: retry inherits parent `provider_key` only; fallback is a **separate** operator action, not retry. |
| **Low** | **AC mentions “webhook/polling security” while V1 is poll-only.** PREP correctly scopes poll-only (US-8.4); wording can imply webhook work in-scope. | USER_STORIES US-8.7 AC #4; TASKS open Q6; US-8.2 [SEC] | CONTRACT: V1 = poll-only; AC satisfied by same poll/download-and-own rules as US-8.2; webhook out of scope (signature verify if added later). |
| **Low** | **Partial CLOSE after Phase A discouraged.** PO lean: no — AC remain unchecked until Phase B VALIDATION. Aligns with MuseTalk-style full close. | README Phase A/B; USER_STORIES AC | SPRINT-STATE may note Phase A done; do not check USER_STORIES AC until B + VALIDATION. |
| **Info** | **Tier floor / no silent default aligned.** Activating `heygen_high` must not change low-tier routing; no auto-fallback after low failure. Matches SPEC “HeyGen = high/P1 no default” and US-7.2. | SPEC S3.M9; US-7.2 AC | Tests: `provider_tier=low` + active → never `heygen_high`; fallback only via operator. |
| **Info** | **ADRs respected.** No FFmpeg in adapter (ADR-0003); no IG publish (ADR-0002); no cron in 8.7 (ADR-0001). Long poll/`fetchAsset` via US-8.4 Fly worker. | ADR-0001–0003 | Adapter = HeyGen HTTP only; assembly stays US-9.x / worker. |
| **Info** | **Roles unchanged.** Cliente cannot request HeyGen; Operator status/fallback/high action; System adapter + policy. Minimal `role` flag / `requireOperator` — no RBAC UI. | SPEC §2; AGENTS.md | FE hides action from Cliente; BE 403. |
| **Info** | **Out of scope held:** Wan (US-8.5), Avatar IV/V auto-select, client-forced provider, silent low→high upgrade, new job table/poller, live HeyGen CI, ElevenLabs/LTX, assembly FFmpeg, per-client HeyGen avatar picker UI, Stories IG, multicanal, ads, RBAC UI. | SPEC §1 fuera de alcance; USER_STORIES | US-8.7 = HeyGen adapter + activate + operator fallback/FE — not second job system. |

---

### Terminology violations (CONTEXT)

**None that block** in USER_STORIES § US-8.7 or PREP/TASKS (uses **System**, **Operator**, technical `provider_key` / `heygen_high` as enums).

Product-facing EN/ES for Operator FE (Phase B) must use:

| Prefer | _Evitar_ |
|--------|----------|
| **Job de generación** | generation job |
| **Operator** | admin, administrador, staff |
| **Cliente** | prestador, dueño, usuario final (as product role) |
| **Avatar propio** / **Avatar genérico** | own_avatar / generic_avatar (user-facing ES) |
| **Política de costos** | max_cost as loose business concept |
| **Reel** | piece, content item (generic) |

Technical enums (`queued`, `external_job_id`, `heygen_high`, `provider_tier`) OK in code and Operator diagnostics; map to localized labels in FE (“Generate with HeyGen” / ES equivalent — CONTRACT freezes keys).

---

### Blockers for SECURITY / CONTRACT

| Item | Blocks? | Guidance |
|------|---------|----------|
| US-8.7 CONTRACT.md (v3 body, engine, hosts, factory, phased BUILD) | **Yes — core AC** | Mirror US-8.2 / US-8.6 CONTRACT structure. |
| Explicit non–Avatar-IV `engine` constant | **Yes — cost / AC #3** | Never omit; unit-test; SECURITY Avatar IV footgun. |
| Avatar input matrix (`image_url` / `avatar_id` by modalidad) | **Yes — [SEC] asset authority** | Server-resolved only; no client avatar/engine fields. |
| Operator fallback action + override audit storage | **Yes — AC #2/#5** | `requireOperator`; eligibility; recorded override. |
| Orchestrator allowlist + high-tier select | **Yes — routing AC** | Phase B; tier floor tests mandatory. |
| HeyGen output host allowlist | **Yes — SSRF / download-and-own** | Distinct from Replicate hosts. |
| Storage key = flat `{uuid}.mp4` | **Yes — US-3.3 / US-8.2 CHECK** | Reconcile README hierarchical path. |
| `per_second` estimate vs AC “per-minute” | **No — document** | Freeze math + migration 7→2 in CONTRACT. |
| Audio vs text create | **Yes — adapter inputs** | Prefer voiceover `audio_url`; freeze fallback if any. |
| FE dual path (policy high vs action) | **Yes — FE Reviewed** | CONTRACT + Reviewed by FE required. |
| Poll-only vs webhook AC wording | **No — document** | Poll-only V1. |
| US-9.3 voiceover E2E | **No — soft** | Fixture audio OK for VALIDATION slice. |

**SPEC blockers on intent:** none. **ADR breaches:** none if poll/fetch stay on Fly worker and secrets remain server-only (`HEYGEN_API_KEY`, never in catalog rows or responses).

---

### Recommended action

Proceed to **SECURITY.md** then **CONTRACT.md** with these **non-negotiable freezes**:

1. **`createHeygenHighAdapter()`** — HeyGen HTTP; `HEYGEN_API_KEY` / `X-Api-Key`; `HEYGEN_ALLOWED_OUTPUT_HOSTS`; mandatory US-8.1 normalizers; registry replaces stub for `heygen_high`.
2. **Explicit non–Avatar-IV `engine`** on every `createJob`; Avatar IV/V never selectable in V1.
3. **Input matrix** — own_avatar portrait URL from owned media; generic via server avatar id; prefer voiceover `audio_url`; reject client provider/engine/avatar fields.
4. **Phase B** — activate catalog + cost_model (`per_second`, `unitCostCents: 2`); unlock orchestrator allowlist; high-tier policy select; Operator fallback action + override audit; FE “Generate with HeyGen” EN/ES + estimate confirm.
5. **Tier floor** — `provider_tier = low` never resolves `heygen_high`; no silent post-failure upgrade.
6. **Storage** — flat `{uuid}.mp4` per `STORAGE_KEY_REGEX` (not hierarchical path in README).
7. **Consent / budget / download-and-own** — same gate order as US-8.2/8.4; poller reuse only.
8. **ADR-0003** — no Vercel long poll; no FFmpeg in adapter.
9. **Explicit out of scope:** Avatar IV/V, Wan/LTX/ElevenLabs, client HeyGen request, silent upgrade, new poller/DDL, live HeyGen CI, avatar marketplace UI, assembly, Stories/multicanal/ads/RBAC UI.

Do not check off USER_STORIES acceptance criteria in this gate.
