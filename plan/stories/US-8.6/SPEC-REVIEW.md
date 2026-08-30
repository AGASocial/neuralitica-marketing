## Spec Review — US-8.6

### Verdict: GAPS

US-8.6 intent — the **System** runs **MuseTalk** (`musetalk_low`) as the low-tier talking-head provider for **Avatar genérico** when a **bucle de referencia** (reference video loop) exists, consuming loop video + voiceover audio via Replicate, polling with the same download-and-own and security rules as SadTalker, wired into the existing US-8.4 job orchestration without new FE — is **directionally aligned** with SPEC §3 **Video Provider Adapter** (S3.M9: swappable adapters `estimate/create/status/fetch`; jobs in `neuramark_video_jobs`; download-and-own; keys server-only; re-check consent+budget before submit), SPEC §1 **SC-1** (Reels without grabarse), SPEC §3 Avatar/Visual (generic avatar + `must_disclose_not_owner`; no human recording), USER_STORIES provider-tier matrix (MuseTalk ~$0.19/Reel for generic loop), frozen **US-8.1** adapter interface + normalizers, frozen **US-8.2 CONTRACT** SadTalker pattern (Replicate HTTP, host allowlist, phased adapter/orchestrator split), frozen **US-8.4 CONTRACT** (job table, poller, retry UI — provider-agnostic; Phase B adapter reuse), frozen **US-7.2** routing (`generic_avatar` + `hasReferenceLoop` → `musetalk_low`; own/generic still → `sadtalker_low`), frozen **US-X.4** catalog seed (`musetalk_low`, `REPLICATE_API_TOKEN`, 19¢ `per_run`, `prefersReferenceLoop`), and **ADR-0003** (Vercel create/enqueue; Fly poll + `fetchAsset`).

**Gaps** sit between USER_STORIES § US-8.6 acceptance criteria / PREP freezes and what must be frozen in **CONTRACT.md** / **SECURITY.md** before BUILD: MuseTalk input matrix + Replicate model version hash, orchestrator unlock for `musetalk_low` (current code rejects loop path and non-`sadtalker_low` provider), server-side reference-loop asset resolution helper, `resolveMediaAssetUrlForProvider` video-kind seam, `portrait_asset_id` semantic overload on job rows, storage-key shape reconciliation with US-3.3, and phased acceptance for the deferred operator SadTalker↔MuseTalk override AC. Story intent does **not** drift from SPEC; unresolved contract shape is the blocker.

**Upstream dependencies satisfied or frozen:** **US-8.1** ✅ (interface, registry, normalizers, `DEFAULT_LOW_TIER_PROVIDER_KEYS.talkingHeadLoop: "musetalk_low"`). **US-8.2** ✅ (SadTalker adapter pattern; input matrix explicitly rejects `referenceVideoAssetId` on SadTalker). **US-8.4** ✅ (orchestrator, poller, retry UI, M1 provider-assets route — MuseTalk reuses as-is). **US-7.2** ✅ (`resolveProviderForJob` selects `musetalk_low` when `hasReferenceLoop: true`; `hasReferenceLoopAssetForClient` shipped). **US-X.4** ✅ (`musetalk_low` catalog row). **US-3.1** ✅ (`generic_avatar` mode). **US-3.4** ✅ (`must_disclose_not_owner`; adapter must not bypass QA disclosure). **Partial / soft:** **US-9.3** (TTS orchestration — fixture/pre-uploaded `voiceoverAssetId` OK for V1 adapter + orchestrator E2E).

---

### Findings

| Severity | Finding | SPEC/ADR reference | Fix |
|----------|---------|-------------------|-----|
| **High** | **No US-8.6 CONTRACT.md.** PREP/TASKS sketch adapter + orchestrator but Replicate model `version` hash, input map (`video` + `audio`, optional `bbox_shift`/`cycle`), output host allowlist, MIME allowlists, and `createMusetalkLowAdapter` factory signature are not frozen. BUILD cannot start without mirroring US-8.2 CONTRACT depth. | USER_STORIES US-8.6; US-8.2 CONTRACT; TASKS.md § MuseTalk input matrix | Author **US-8.6 CONTRACT.md** — freeze `lib/contracts/musetalk-low.ts` constants, Replicate create/poll contract, MuseTalk input matrix (loop video + voiceover only; reject portrait still ids), `fetchAsset` hardening (reuse SadTalker limits unless SECURITY splits hosts), phased BUILD table (Phase A adapter; Phase B orchestrator). |
| **High** | **Orchestrator blocks MuseTalk path today.** `createTalkingHeadVideoJob()` returns `museTalkNotSupported` when `referenceVideoAssetId` is set, and accepts only `DEFAULT_LOW_TIER_PROVIDER_KEYS.talkingHead` (`sadtalker_low`) — policy-selected `musetalk_low` would fail even after removing the early reject. Phase B is scoped but CONTRACT must freeze the unlock sequence. | US-7.2 routing; US-8.4 CONTRACT § Phased BUILD Phase B; `lib/video-jobs/create-talking-head-video-job.ts` | CONTRACT: remove blanket `referenceVideoAssetId` reject; allow `providerKey ∈ { sadtalker_low, musetalk_low }`; MuseTalk branch requires `script.hasReferenceLoop` + server-resolved loop asset id; SadTalker branch unchanged (reject loop on adapter). Gate order unchanged: policy → estimate → budget → consent (**own_avatar** only) → `adapter.createJob` → INSERT → spend → poll. |
| **High** | **Reference-loop asset resolution undefined in contract.** US-7.2 uses boolean `hasReferenceLoopAssetForClient`; US-8.6 Phase B needs **`getPrimaryReferenceLoopVideoAssetForClient(clientId)`** — earliest `avatar_reference` with video MIME (`video/mp4` \| `video/quicktime`) by `created_at ASC`. Mismatch if policy selects MuseTalk but resolver returns no id → fail closed. | SPEC §3 Avatar/Visual; US-3.3 `avatar_reference`; TASKS.md open Q4–6 | CONTRACT: freeze helper query (same MIME filter as `hasReferenceLoopAssetForClient`); orchestrator maps missing asset → `NOT_FOUND` / validation error; **never** accept client-supplied loop asset id as authority (server-resolve only; optional operator override via trusted options later). |
| **Medium** | **Storage key shape contradicts US-3.3 / US-8.2.** README PO decision #9 cites `neuramark/{clientId}/{reelScriptId}/{uuid}.mp4`; US-8.2 CONTRACT + `STORAGE_KEY_REGEX` require flat **`{uuid}.mp4`** with lineage in job row, not path-encoded keys. | US-8.2 CONTRACT § `fetchAsset` storage; `lib/contracts/media-assets.ts` `STORAGE_KEY_REGEX`; US-3.3 VALIDATION | CONTRACT: reconcile to **flat `{uuid}.mp4`** (mirror SadTalker); amend README PO #9 in CONTRACT preamble; logical `clientId` + `reelScriptId` from job context map / poller L1 only. |
| **Medium** | **Partial AC deferral — operator SadTalker↔MuseTalk override.** USER_STORIES AC: “Selected by policy … **or as operator-configured low-tier alternative to SadTalker**.” PREP defers operator override UI to P1; V1 is policy-only (`hasReferenceLoop`). Intentional scope trim but VALIDATION must not check full AC until P1 or CONTRACT documents proxy. | USER_STORIES US-8.6 AC #1; README scope out | CONTRACT: **phased acceptance** — V1 closes “policy-selected `generic_avatar` + loop → `musetalk_low`” only; operator override → **P1 defer** with USER_STORIES AC note; do not check override AC in VALIDATION. |
| **Medium** | **`portrait_asset_id` semantic overload on job rows.** MuseTalk jobs store reference-loop **video** asset id in existing `portrait_asset_id` column (no DDL). Operator diagnostics / retry re-resolve may mislabel “portrait” vs “loop” unless CONTRACT documents per-`provider_key` semantics. | US-8.4 DDL; US-8.2 CONTRACT `portrait_asset_id`; TASKS.md open Q5 | CONTRACT: freeze **job row audit table** — `sadtalker_low`: portrait still id; `musetalk_low`: reference-loop video id; `voiceover_asset_id` unchanged; Operator DTO may show generic “input asset” label (US-8.4 provider-agnostic UI — no misleading “portrait” copy for MuseTalk rows). |
| **Medium** | **`resolveMediaAssetUrlForProvider` video-kind seam not frozen.** SadTalker CONTRACT uses `kind: "portrait" \| "audio"`. MuseTalk needs **`kind: "video" \| "audio"`** with video MIME allowlist. Without CONTRACT freeze, adapter and orchestrator may diverge on resolver params. | US-8.2 CONTRACT § Input asset resolution; TASKS.md § Asset resolver seam | CONTRACT: extend injectable resolver signature; default impl selects MIME allowlist by kind; video inputs use same tenant ownership + M1 presign path as portrait/audio. |
| **Medium** | **US-9.3 soft dependency for full E2E.** Depends lists US-9.3; AC implies voiceover from TTS. PREP allows any tenant-owned audio `media_assets` row — correct for adapter slice; full pipeline E2E waits on CosyVoice2 orchestration. | USER_STORIES US-8.6 Depends; US-9.3; US-8.2 CONTRACT phased voiceover | CONTRACT: Phase A/B tests use fixture `voiceoverAssetId`; job create **must** require `voiceoverAssetId` (no silent generate); document US-9.3 as soft for VALIDATION closure. |
| **Low** | **Multiple loop videos per client.** PREP picks earliest `created_at` video `avatar_reference`; no operator picker in V1. Acceptable if CONTRACT freezes selection rule; future override via create options is P1. | TASKS.md open Q4 | CONTRACT: document **deterministic earliest-wins** rule; fail if zero video MIME rows when MuseTalk selected. |
| **Low** | **Registry bootstrap.** Phase A must register real `createMusetalkLowAdapter` (not stub) in `createProviderRegistry` / `buildBootstrapCatalog()`; `initializeProviderRegistryFromCatalog()` on orchestration path (US-8.1 QA M1 hygiene). | US-8.1 QA; US-8.2 registry pattern | CONTRACT/BUILD: registry test asserts `getVideoAdapter("musetalk_low")` is real adapter; estimate from catalog **19¢** — no hardcoded override in adapter body. |
| **Info** | **Core routing already shipped.** `resolveProviderForJob` + `hasReferenceLoopAssetForClient` + catalog `prefersReferenceLoop` align with SPEC modalidad routing; US-8.6 does not override policy engine. | US-7.2 ✅; SPEC §3 Avatar/Visual | Orchestrator calls policy only — never hardcode MuseTalk bypass. |
| **Info** | **FE correctly out of scope.** USER_STORIES FE = —; US-8.4 Operator badges/retry/cost DTOs are `provider_key`-agnostic; `resolveProviderDisplayLabel` already maps `musetalk_low: "MuseTalk"`. | USER_STORIES US-8.6; US-8.4 CONTRACT | No new FE BUILD; no new i18n unless CONTRACT adds operator-facing label (display exists). |
| **Info** | **SEC — US-3.4 disclosure unchanged.** MuseTalk path is `generic_avatar`; adapter must not skip QA disclosure or `must_disclose_not_owner` enforcement (downstream US-10.x). Consent gate (`assertActiveAvatarConsentForJobs`) applies to **own_avatar** only — correct for MuseTalk. | SPEC §3 Preferencias; US-3.4 CONTRACT; USER_STORIES US-8.6 [SEC] | SECURITY.md: loop asset SSRF, download-and-own, impersonation class unchanged; no adapter bypass. |
| **Info** | **ADRs respected.** No FFmpeg in adapter (ADR-0003); no IG publish (ADR-0002); no cron in 8.6 (ADR-0001). `getJobStatus` / `fetchAsset` on Fly worker via US-8.4 poller — not unbounded Vercel loops. | ADR-0001–0003; US-8.2 CONTRACT runtime matrix | Adapter module: Replicate I/O only; assembly FFmpeg stays US-9.x / worker. |
| **Info** | **Out of scope held:** new job system/UI, Wan/HeyGen/manual adapters, operator SadTalker↔MuseTalk override UI (P1), live Replicate CI tests, `neuramark_video_jobs` DDL change, TTS synthesis orchestration (US-9.3), publish, Stories IG, multicanal, ads, RBAC UI. | SPEC §1; USER_STORIES phase split | US-8.6 = MuseTalk adapter body + orchestrator unlock — not second poller or FE. |

---

### Terminology violations (CONTEXT)

**None that block** in USER_STORIES § US-8.6 or PREP/TASKS (uses **System**, **bucle de referencia**, technical `provider_key` / `musetalk_low` as enums).

Product-facing EN/ES for any downstream copy (US-8.4 status surfaces) must use:

| Prefer | _Evitar_ |
|--------|----------|
| **Job de generación** | generation job |
| **Avatar genérico** / **Avatar genérico profesional** | generic_avatar (user-facing ES) |
| **Bucle de referencia** | reference loop (as primary ES product term where shown) |
| **Operator** | admin, administrador, staff |
| **Cliente** | prestador, dueño, usuario final (as product role) |
| **Reel** | piece, content item (generic) |

Technical enums (`queued`, `external_job_id`, `musetalk_low`) OK in code and Operator diagnostics; map to localized labels in FE.

---

### Blockers for SECURITY / CONTRACT

| Item | Blocks? | Guidance |
|------|---------|----------|
| US-8.6 CONTRACT.md (model version, input matrix, hosts, adapter factory) | **Yes — core AC** | Mirror US-8.2 CONTRACT structure; import US-8.4 orchestrator reuse verbatim. |
| Orchestrator unlock for `musetalk_low` | **Yes — routing AC** | Phase B; remove `museTalkNotSupported`; allow both low-tier talking-head keys. |
| Server-side loop asset resolver | **Yes — [SEC] asset authority** | No client-supplied loop id as source of truth. |
| Storage key = flat `{uuid}.mp4` | **Yes — US-3.3 CHECK** | Reconcile README PO #9 in CONTRACT. |
| `portrait_asset_id` per-provider semantics | **Yes — audit clarity** | Document in CONTRACT; avoid misleading Operator copy. |
| Video-kind asset URL resolver | **Yes — adapter inputs** | Extend resolver seam in CONTRACT. |
| Operator override AC (P1) | **No — phased defer** | Document in CONTRACT phased acceptance. |
| US-9.3 voiceover E2E | **No — soft** | Fixture audio OK for V1 VALIDATION. |
| Mocked HTTP tests only | **No — BUILD hygiene** | Align with US-8.2 pattern. |

**SPEC blockers on intent:** none. **ADR breaches:** none if poll/fetch stay on Fly worker and secrets remain server-only.

---

### Recommended action

Proceed to **SECURITY.md** then **CONTRACT.md** with these **non-negotiable freezes**:

1. **`createMusetalkLowAdapter()`** — Replicate HTTP; `REPLICATE_API_TOKEN`; `MUSETALK_ALLOWED_OUTPUT_HOSTS`; mandatory US-8.1 normalizers; register replaces stub for `musetalk_low`.
2. **MuseTalk input matrix** — `referenceVideoAssetId` (server-resolved loop video) + `voiceoverAssetId` required; reject `portraitAssetId` / `referenceImageAssetId`; mirror SadTalker forbidden-fields symmetry.
3. **Orchestrator Phase B** — accept `sadtalker_low` \| `musetalk_low`; server-resolve loop asset; INSERT with documented `portrait_asset_id` overload for MuseTalk rows.
4. **`getPrimaryReferenceLoopVideoAssetForClient`** — earliest video `avatar_reference`; fail closed when policy selects MuseTalk but no asset.
5. **Storage** — flat `{uuid}.mp4` per `STORAGE_KEY_REGEX` (not hierarchical path in README PO #9).
6. **Phased BUILD** — Phase A adapter + registry + mocked tests; Phase B orchestrator E2E with fixture voiceover; operator override AC → P1 defer documented.
7. **ADR-0003** — reuse US-8.4 poller; no Vercel long poll; no FFmpeg in adapter.
8. **Explicit out of scope:** new FE, DDL migration, operator override UI, live Replicate CI, TTS orchestration (US-9.3), Wan/HeyGen/manual, assembly FFmpeg.

Do not check off USER_STORIES acceptance criteria in this gate.
