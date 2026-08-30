## Spec Review — US-8.2

### Verdict: GAPS

US-8.2 intent — the **System** runs **SadTalker** (`sadtalker_low`) as the V1 default low-tier talking-head provider for **Avatar propio** and **Avatar genérico** (when policy selects it), consuming portrait still + voiceover audio, polling a cloud API, download-and-own into `neuramark_media_assets`, with server-side consent and budget re-check before submit, and job state owned by server-side polling only — is **directionally aligned** with SPEC §3 **Video Provider Adapter** (S3.M9: adapters `estimate/create/status/fetch`; `neuramark_video_jobs`; low-tier SadTalker default; download-and-own; keys server-only; re-check consent+budget; no human recording), SPEC §1 SC-1 (Reels without grabarse), SPEC §5 (`lib/providers/`; ADR-0003 worker split), USER_STORIES provider-tier matrix (SadTalker ~$0.10/Reel), frozen **US-8.1 CONTRACT** (interface, normalization, `externalJobIdSchema`, ADR-0003 method matrix, `fetchAsset` Storage contract), frozen **US-7.2** routing (talking-head without reference loop → `sadtalker_low`), frozen **US-7.1** budget gate handoff (`assertReelBudgetAllowsSpend`, `recordReelSpendEvent`), and **US-3.2** `assertActiveAvatarConsentForJobs` mandatory call site.

**Gaps** sit between USER_STORIES § US-8.2 acceptance criteria / owner table and what must be frozen in **CONTRACT.md** / **SECURITY.md** before BUILD: `neuramark_video_jobs` DDL and multi-tenant shape, job-create orchestration sequence, Replicate integration + host allowlist, spend-ledger sync on create/complete, FE scope split vs **US-8.4**, poller/worker ownership vs retry AC, input-asset rules vs **US-8.6** MuseTalk routing, and phased acceptance when **US-9.3** voiceover is not yet wired. Story intent does not drift from SPEC; unresolved contract shape is the blocker.

**Upstream dependencies satisfied or frozen:** **US-8.1** ✅ (CLOSED — `VideoProviderAdapter`, registry, normalize helpers, stub `sadtalker_low`, ADR-0003 split documented). **US-7.2** ✅ (`resolveProviderForJob`; faceless → Wan; generic+loop → MuseTalk; own/generic portrait → SadTalker when `hasReferenceLoop: false`). **US-7.1** ✅ (budget gate + spend ledger; US-8.2+ call sites documented). **US-X.4** ✅ (`sadtalker_low` catalog row, `REPLICATE_API_TOKEN`, flat per-run cost model). **US-3.2** ✅ (`assertActiveAvatarConsentForJobs` exported + unit-tested). **US-3.3** ✅ (portrait `media_assets`, storage keys). **US-5.1** ✅ (`reel_script_id` lineage). **Partial / downstream:** **US-9.3** (voiceover `media_assets` — required for full E2E) · **US-8.4** (Operator status UI, retry handler, stale-job timeout, client-scoped poll DTO hardening) · **US-7.3** (`finalizeGenerationCost` / actual backfill on terminal status).

---

### Findings

| Severity | Finding | SPEC/ADR reference | Fix |
|----------|---------|-------------------|-----|
| **High** | **`neuramark_video_jobs` DDL not frozen.** USER_STORIES DB row lists `reel_script_id`, `provider_key`, `asset_role`, `external_job_id`, `status`, `output_url`, `provider_tier` but omits **`client_id`** (multi-tenant NFR), FK to input/output assets, `estimated_cost_cents`, sanitized `failure_reason`, `media_asset_id` (post-`fetchAsset`), spend-event linkage, and contradicts **US-8.1 CONTRACT** — provider URL must **not** be canonical `output_url`. US-8.4 adds `parent_job_id`, `attempt`. | SPEC §6 multi-tenant; USER_STORIES US-8.2 DB; US-8.1 CONTRACT § External job id, § `fetchAsset`; TASKS.md | CONTRACT: freeze migration — **`neuramark_video_jobs`** with `client_id`, `reel_script_id`, `provider_key`, `provider_tier`, `asset_role` (`primary` for SadTalker), `external_job_id`, `status`, `estimated_cost_cents`, `actual_cost_cents` (mirror), `failure_reason` (sanitized), `portrait_asset_id`, `voiceover_asset_id`, `output_media_asset_id`, optional `parent_job_id`/`attempt` (nullable until US-8.4), **`output_url` forbidden as canonical** (transient in-memory only per US-8.1); RLS deny-by-default; indexes on `(client_id, reel_script_id)`, `(external_job_id, provider_key, client_id)`. |
| **High** | **Job-create orchestration undefined.** AC [SEC]: consent re-check (US-3.2) + budget (US-7.1) immediately before submit; status writes server-only. No frozen Server Action / orchestrator module, enqueue handoff to Fly worker, or `recordReelSpendEvent` timing. | USER_STORIES US-8.2 [SEC]; US-7.1 CONTRACT call sites; US-8.1 CONTRACT § ADR-0003; US-3.2 CONTRACT `assertActiveAvatarConsentForJobs` | CONTRACT: freeze **`createTalkingHeadVideoJob()`** (`import "server-only"`) — (1) load trusted context (`reel_script_id`, modalidad, assets); (2) `resolveProviderForJob` → must resolve `sadtalker_low` for this story's paths; (3) `assertReelBudgetAllowsSpend` with adapter estimate; (4) if `own_avatar` → `assertActiveAvatarConsentForJobs(clientId)`; (5) `adapter.createJob(resolvedInput)`; (6) INSERT `neuramark_video_jobs`; (7) `recordReelSpendEvent` (`asset_role: talking_head`); (8) enqueue worker poll message. **Forbidden:** client-supplied `provider_key`, status, or `output_url`. |
| **High** | **FE scope bleed to US-8.4.** USER_STORIES owner table assigns **FE** “Job status polling UI / SSE (shared with US-8.4)” under US-8.2, but **US-8.4** owns Operator status badges, retry UI, and production list. Mixing risks duplicate surfaces or 8.2 BUILD blocking on UI. | USER_STORIES US-8.2 FE row; US-8.4 AC; SPEC error paths (Operator sees job failed) | CONTRACT: **US-8.2 FE = —** (BE-only). Client/Operator poll UI, SSE, and cost column → **US-8.4** only. US-8.2 may expose **internal** job-status read helper scoped by `client_id` for 8.4 to consume — not a standalone FE deliverable. Amend USER_STORIES owner table in CONTRACT preamble. |
| **Medium** | **Input asset ambiguity vs MuseTalk routing.** AC: “generic loop **still** + voiceover”; US-7.2 routes **`generic_avatar` + reference video loop** → **MuseTalk** (US-8.6), not SadTalker. SadTalker V1 inputs = **portrait still image** (`portraitAssetId` own avatar, or `referenceImageAssetId` generic still) + `voiceoverAssetId` — not `referenceVideoAssetId`. | USER_STORIES US-8.2 AC inputs; US-7.2 AC routing; `resolvedCreateVideoJobInputSchema`; US-8.6 scope | CONTRACT: frozen **SadTalker input matrix** — `own_avatar` → require `portraitAssetId` (US-3.3 asset); `generic_avatar` without loop → `referenceImageAssetId` or catalog generic still; **`referenceVideoAssetId` present → orchestrator must not call SadTalker** (policy selects MuseTalk). Reject job create if required image asset missing or wrong MIME. |
| **Medium** | **Poller / worker wiring split.** AC: status updated only by server-side poller; ADR-0003 + US-8.1: `getJobStatus` / `fetchAsset` on **Fly worker**, not Vercel loop. US-8.4 owns poller, stale timeout, webhooks. Without phased BUILD, US-8.2 cannot close status AC alone. | ADR-0003; US-8.1 CONTRACT § ADR-0003; USER_STORIES US-8.4 | CONTRACT: **phased acceptance** — Phase A: real SadTalker adapter + job create + enqueue + unit/integration tests with mocked Replicate; Phase B: minimal worker poll module (or shared with US-8.4) completes `getJobStatus` → `fetchAsset` → UPDATE job + `media_assets`. Do not run unbounded poll in Vercel Route Handlers. |
| **Medium** | **Retry AC owned by US-8.4.** AC “retries configurable with max attempts” overlaps US-8.4 retry handler, `parent_job_id`, Operator confirmation, budget re-check on retry. | USER_STORIES US-8.2 AC; US-8.4 AC | CONTRACT: US-8.2 sets **`attempt = 1`** on initial create; retry semantics → **US-8.4**. US-8.2 documents max-attempt config env/key for downstream; no retry UI or handler in 8.2 BUILD. |
| **Medium** | **US-9.3 soft dependency for E2E.** Depends lists US-9.3; AC requires voiceover from TTS. Adapter can unit-test with fixture audio asset; full pipeline needs CosyVoice2 output in Storage. | USER_STORIES US-8.2 Depends; US-9.3; Sprint 4 ordering | CONTRACT: Phase A tests use seeded `voiceoverAssetId` fixture; Phase B E2E after US-9.3. Job create **must** require `voiceoverAssetId` for SadTalker (no silent generate). |
| **Medium** | **Spend ledger sync on complete.** US-7.3 freezes canonical **`neuramark_reel_spend_events`** + `finalizeGenerationCost` on terminal status. US-8.2 AC implies billable completion but omits backfill hook after `fetchAsset`. | US-7.3 CONTRACT; US-7.1 `recordReelSpendEvent`; `storedMediaAssetSchema.actualCostCents` | CONTRACT: on terminal **completed** — UPDATE job row, INSERT/UPDATE `neuramark_media_assets`, call **`finalizeGenerationCost`** (or US-7.3 module) with `actualCostCents` from `StoredMediaAsset`; on **failed** — persist `sanitizedErrorMessage` only. One spend row per attempt at create (US-7.3 lineage rule). |
| **Medium** | **Replicate host allowlist not frozen.** AC [SEC]: validate https + expected host before fetch. US-8.1 `validateProviderOutputUrl` requires `allowedHosts` per adapter. | US-8.1 CONTRACT § `validateProviderOutputUrl`; USER_STORIES US-8.2 [SEC] | CONTRACT: freeze **`SADTALKER_ALLOWED_OUTPUT_HOSTS`** (e.g. `replicate.delivery`, `pbxt.replicate.delivery` — confirm against Replicate docs) in adapter or catalog `capabilities.allowedOutputHosts`; adapter **must** pipe all vendor URLs through normalizers (US-8.1 QA L2 — stubs must not be copied). |
| **Low** | **Registry bootstrap drift (US-8.1 QA M1).** Swapping stub for real adapter should wire **`initializeProviderRegistryFromCatalog()`** or document live catalog load at first job path — offline bootstrap risks stale cost defaults. | US-8.1 QA M1; US-8.1 CONTRACT bootstrap | CONTRACT: on real adapter registration, registry init uses live **`getProviderCatalog()`** for validation + estimate defaults. |
| **Low** | **Client-scoped status poll [SEC] underspecified.** AC: foreign job IDs → 404. No route, auth boundary, or DTO allowlist frozen (US-8.4 shares concern). | USER_STORIES US-8.2 [SEC]; US-8.4; SECURITY_BASELINE multi-tenant | CONTRACT: job status reads **`WHERE id = $1 AND client_id = $2`** from session — never job id alone; **`persistedVideoJobStatusSchema`** only; no `rawOutputUrl`, cost fields, or `external_job_id` in Cliente payloads. Implement surface may land in US-8.4 if 8.2 only ships internal helper. |
| **Info** | **Core adapter seam ready.** US-8.1 ships `VideoProviderAdapter`, `sadtalker_low` stub (`lib/providers/video/sadtalker-low-stub-adapter.ts`), normalizers, and registry — BUILD replaces stub body with Replicate HTTP per interface rules. | US-8.1 CLOSED; SPEC §5 | Real adapter registers in `createProviderRegistry()`; remove or gate stub in prod bootstrap. |
| **Info** | **Policy routing aligned.** SadTalker is not faceless/B-roll default; US-7.2 rejects `talking_head` for faceless and prefers MuseTalk when `hasReferenceLoop`. US-8.2 does not override policy engine. | SPEC §3 Avatar/Visual Mode; US-7.2 AC | Orchestrator calls `resolveProviderForJob` only — never hardcode SadTalker bypass. |
| **Info** | **ADRs respected.** No FFmpeg in adapter (ADR-0003); no IG publish (ADR-0002); no cron in 8.2 (ADR-0001). Long poll/download on worker. | ADR-0001–0003 | Adapter module: Replicate I/O only; assembly FFmpeg stays US-9.x / worker. |
| **Info** | **Out of scope held:** MuseTalk (US-8.6), Wan B-roll (US-8.5), HeyGen (US-8.7), manual upload (US-8.3), Operator retry UI, webhooks, QA gate, publish, Stories IG, multicanal, ads, RBAC UI. | SPEC §1; USER_STORIES phase split | US-8.2 = SadTalker + job persistence + create path — not full production list. |

---

### Terminology violations (CONTEXT)

**None that block** in USER_STORIES § US-8.2 (uses “System”, technical `provider_key`, `own_avatar` / `generic_avatar` as enums).

Product-facing EN/ES for any status copy introduced downstream (US-8.4) must use:

| Prefer | _Evitar_ |
|--------|----------|
| **Job de generación** | generation job |
| **Avatar propio** / **Avatar genérico** | own_avatar / generic_avatar (user-facing ES) |
| **Operator** | admin, administrador, staff |
| **Cliente** | prestador, dueño, usuario final (as product role) |
| **Reel** | piece, content item (generic) |

Technical enums (`queued`, `processing`, `external_job_id`, `sadtalker_low`) OK in code and Operator diagnostics; map to localized labels in FE.

---

### Blockers for SECURITY / CONTRACT

| Item | Blocks? | Guidance |
|------|---------|----------|
| `neuramark_video_jobs` migration + multi-tenant shape | **Yes — DB AC** | Freeze before BUILD; no canonical provider URL column. |
| `createTalkingHeadVideoJob` orchestration | **Yes — [SEC] AC** | Consent + budget + engine-resolved provider only. |
| Real SadTalker adapter + Replicate allowlist | **Yes — core AC** | Implement US-8.1 interface; mandatory normalizers. |
| `fetchAsset` → Storage + `media_assets` | **Yes — SPEC download-and-own** | Return `StoredMediaAsset` only. |
| Spend row at create + finalize on complete | **Yes — economics** | Align US-7.1 + US-7.3. |
| FE scope → US-8.4 | **Yes — sprint scope** | US-8.2 BE-only in CONTRACT. |
| Phased poller/worker vs US-8.4 | **Yes — ADR-0003** | Phase A adapter + create; Phase B poll complete. |
| Input asset matrix vs MuseTalk | **Yes — routing AC** | No SadTalker when video loop selected. |
| Client-scoped status reads | **Yes — [SEC]** | 404 cross-tenant; minimal DTO. |
| Retry / max attempts | **No — US-8.4** | Initial `attempt = 1` only in 8.2. |
| Registry catalog-backed init | **No — hygiene** | Fix US-8.1 M1 when registering real adapter. |

**SPEC blockers on intent:** none. **ADR breaches:** none if poll/fetch stay off Vercel and enqueue uses Fly worker.

---

### Recommended action

Proceed to **SECURITY.md** then **CONTRACT.md** with these **non-negotiable freezes**:

1. **`neuramark_video_jobs`** — full DDL with `client_id`, asset FKs, no canonical provider URL, RLS deny-by-default.
2. **`createTalkingHeadVideoJob()`** — ordered gates: resolve → budget → consent (own avatar) → `createJob` → persist → spend row → enqueue.
3. **`createSadtalkerLowAdapter()`** — Replicate HTTP; `REPLICATE_API_TOKEN`; host allowlist; normalizers mandatory; register replaces stub.
4. **SadTalker input matrix** — portrait still + voiceover only; reject video-loop path (MuseTalk).
5. **ADR-0003 phased BUILD** — Vercel create/enqueue; Fly worker poll + `fetchAsset` + job UPDATE (minimal poll OK in 8.2 Phase B or shared 8.4 module).
6. **Spend ledger** — `recordReelSpendEvent` at create; `finalizeGenerationCost` on complete with `actualCostCents`.
7. **FE = —** — status UI/SSE/retry → US-8.4; optional internal status helper for 8.4.
8. **Explicit out of scope:** retry handler, Operator production list, MuseTalk/Wan/HeyGen/manual, FFmpeg assembly, TTS synthesize (US-9.3), publish, cron.

Do not check off USER_STORIES acceptance criteria in this gate.
