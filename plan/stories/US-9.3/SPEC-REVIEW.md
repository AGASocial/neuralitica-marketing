## Spec Review — US-9.3

### Verdict: GAPS

US-9.3 intent — the **System** synthesizes **voiceover** from **`neuramark_reel_scripts.voiceover_text`** via low-tier **CosyVoice2** (`siliconflow_cosyvoice2`), download-and-own into **`neuramark_media_assets`** (`asset_type = voiceover`); the **Cliente** picks a default voice from a closed server catalog on **Preferencias de producción visual** (`voice_id` on **`neuramark_visual_preferences`**); the **Operator** triggers synthesis on **`/operator/scripts`**; TTS spend passes the cumulative **Política de costo** gate (US-7.1) and writes **`neuramark_reel_spend_events`**; downstream video jobs consume **`voiceoverAssetId`** — is **directionally aligned** with SPEC §1 SC-1 (Reels without grabarse), SPEC §3 **Video Script Agent** (VO in Paquete de guion), **Video Provider Adapter** (S3.M9: TTS catálogo), **Cost Policy Engine** (S3.M8: budget-before-generate), **Media Assembly Pipeline** (S3.M10: CosyVoice2 low + EN/ES catalog — synthesis slice; mux in US-9.1), **Avatar / Visual Mode** (S3.M4: Preferencias surface), USER_STORIES § US-9.3, frozen upstream **US-8.1** (`TtsProviderAdapter`, `synthesizeSpeechRequestSchema`, registry), **US-X.4** (`siliconflow_cosyvoice2` seed), **US-7.2** (TTS projection + `resolveProviderForJob`), **US-7.1** (budget gate + spend ledger), **US-5.1** (`voiceover_text`, Operator scripts workspace), **US-3.1** (`faceless_style.voice` axis), and **ADR-0003** (no FFmpeg in this story — short vendor I/O + Storage on Vercel app layer).

**Gaps** sit between USER_STORIES § US-9.3 acceptance criteria / frozen PO decisions and what must be frozen in **SECURITY.md** / **CONTRACT.md** before BUILD: SiliconFlow TTS REST contract, orchestrator tenancy + error codes, voice-catalog tone heuristic table, regenerate/orphan asset policy, `reelSpendJobKindSchema` extension, migration constraints (enum + `storage_key` audio regex), Operator vs Cliente synthesis boundaries, and phased closure when **ElevenLabs** high tier remains inactive. Story intent does not drift from SPEC; unresolved contract shape is the blocker.

**Upstream dependencies satisfied or frozen:** **US-5.1** ✅ (`voiceover_text`, `/operator/scripts`) · **US-X.4** ✅ (`siliconflow_cosyvoice2` catalog row) · **US-3.1** ✅ (Preferencias surface, `faceless_style`) · **US-7.1** ✅ (`assertReelBudgetAllowsEstimatedSpend`, `recordReelSpendEvent`) · **US-7.2** ✅ (TTS line in projection; `assetRole: "tts"`) · **US-8.1** ✅ (`TtsProviderAdapter`, contracts, registry seam) · **US-14.5** ✅ (`requireOperator()`). **Partial / downstream:** **US-8.4** (consumes `voiceoverAssetId` for SadTalker E2E) · **US-9.1** (assembly mux) · **US-7.3** (actual-cost backfill on spend events — story uses estimate when vendor silent).

---

### Findings

| Severity | Finding | SPEC/ADR reference | Fix |
|----------|---------|-------------------|-----|
| **High** | **No US-9.3 CONTRACT.md.** PO decisions in README/TASKS are detailed but not a frozen API: SiliconFlow URL/body/response map, orchestrator DTOs/error codes, migration filename + CHECK text, `insertVoiceoverMediaAsset()` metadata shape, Preferencias DTO extensions, Operator UI action wiring, and sample asset paths are sketched only. | USER_STORIES US-9.3; README gates; TASKS § PO decisions | Author **US-9.3 CONTRACT.md** before BUILD; include **Reviewed by FE** line; freeze adapter factory, orchestrator return union, forbidden request keys, and migration SQL verbatim. |
| **High** | **SiliconFlow TTS vendor contract undefined.** Open question #1: endpoint host/path, model id (`cosyvoice2`), auth header, request voice param mapping from catalog `providerVoice`, response audio format (binary vs base64), and error normalization. BUILD cannot ship real adapter without this. | SPEC §5 server-only providers; US-8.1 adapter untrusted-response rules; TASKS open Q1 | CONTRACT: freeze REST spec (mirror `siliconflow-llm-adapter.ts` Bearer pattern); pipe errors through `ProviderAdapterError`; document allowed hosts if response is URL-based; mocked HTTP tests use frozen fixtures. |
| **High** | **Orchestrator tenancy + identity not frozen.** TASKS [SEC] says queries scoped to `getCurrentUser()` client id, but synthesis is **Operator-triggered** on scripts that belong to a **Cliente** row. Existing pattern in **`createTalkingHeadVideoJob`**: `requireOperator("handler")`, load script by `reelScriptId`, enforce `script.client_id === operator.id` (V1 internal) — **never** trust client-supplied `clientId` without script-row proof. | SPEC §6 multi-tenant `client_id`; US-5.1 tenancy; US-8.4 video-job pattern | CONTRACT: **`synthesizeVoiceoverForReelScript({ reelScriptId })`** only — forbidden: `providerKey`, `voiceId`, `clientId`, `estimatedCostCents`; resolve `clientId` from owned script row; Operator session gate; `FORBIDDEN` / `SCRIPT_NOT_FOUND` codes frozen. |
| **Medium** | **Profile tone → voice heuristic table missing.** AC: “Voice matches profile tone hint when possible.” PO lean: map personality keywords → catalog id when `voice_id` null. No frozen keyword list or fallback order (locale default vs tone vs gender tags). | USER_STORIES US-9.3 AC; SPEC S3.M10 “voz desde catálogo limitado”; README PO #8 | CONTRACT: freeze **`resolveDefaultVoiceId({ preferredLocale, profileTone })`** lookup table (e.g. `professional` → `*_professional_male`; default warm female per locale); deterministic, no LLM; document when `voice_id` set on Preferencias wins. |
| **Medium** | **Regenerate / orphan voiceover assets.** PO lean: INSERT new row; prior voiceover assets orphaned until cleanup. Unclear how **`tts_regenerate` vs `tts_generate`** is detected, whether video jobs still point at stale `voiceover_asset_id`, and US-7.4 roll-up double-count risk. | USER_STORIES US-9.3; US-7.3 spend lineage; US-8.4 `voiceoverAssetId` | CONTRACT: detect regenerate via latest `voiceover` asset for `(client_id, reel_script_id)`; return **new** `voiceoverAssetId` only; document orphan policy V1; optional metadata `supersedesAssetId`; Operator must re-bind video job if prior job used old id. |
| **Medium** | **`reelSpendJobKindSchema` extension not in code.** Story requires `tts_generate` / `tts_regenerate`; current enum stops at `talking_head_retry` (`lib/contracts/cost-policy.ts`). US-7.4 roll-up expects `asset_role: "tts"` rows when US-9.3 lands. | US-7.1 CONTRACT; US-7.4 Phase B; USER_STORIES US-9.3 [SEC] | CONTRACT + migration-free code change: extend enum; `recordReelSpendEvent` after successful INSERT only; blocked budget attempts write **no** spend row. |
| **Medium** | **Voice picker visibility edge: `faceless_style.voice === "none"`.** PO freezes hide when `music_only` + faceless-only. **`none`** (valid enum in `facelessStyleSchema`) also implies no AI voiceover — picker should hide or disable with copy; not specified. | US-3.1 `faceless_style`; README PO #13 | CONTRACT: picker visible when any path needs AI voice (`ai_voiceover`, or avatar modes); hidden when faceless-only AND `voice ∈ { none, music_only }`. FE i18n explains why hidden. |
| **Medium** | **ElevenLabs high-tier AC partial closure.** USER_STORIES AC: “high tier may use ElevenLabs when active.” Story correctly defers real adapter; VALIDATION must note partial AC until `elevenlabs_tts_high` activates — ensure CONTRACT does not imply V1 BUILD closes full AC row. | USER_STORIES US-9.3 AC; US-X.4 inactive high-tier rows | CONTRACT phased acceptance: **Phase A** = CosyVoice2 + prefs + budget only; ElevenLabs AC checkbox deferred with VALIDATION note (TASKS open Q10). |
| **Low** | **USER_STORIES DB shorthand omits `neuramark_` prefix.** Row lists `media_assets` / `visual_preferences`; canonical tables are **`neuramark_media_assets`** / **`neuramark_visual_preferences`**. | SPEC §6; AGENTS.md | Amend USER_STORIES when PO next edits; CONTRACT uses prefixed names exclusively. |
| **Low** | **Sample MP3s in `public/tts-samples/`.** PO commits ~4 static files. Ensure samples contain no PII; size budget; same-origin playback only — SECURITY should confirm no catalog secret leakage via `providerVoice` in client bundles (catalog module must stay `server-only`; FE gets DTO labels + sample URLs only). | SPEC §6 secrets; README PO #6 | SECURITY: `lib/tts/voice-catalog.ts` server-only; FE DTO exposes `id`, `labelKey`, `locale`, `sampleUrl` — not vendor voice strings. |
| **Info** | **Vision & hard rules intact.** US-9.3 reinforces SC-1 (no human audio recording UX); does not publish without Aprobación (SC-2); does not conflate Playbook vs Trend; no Stories IG, multicanal, ads, RBAC UI. | SPEC §1; CONTEXT | Operator synthesis is production prep, not publish. |
| **Info** | **Modalidad / Preferencias alignment.** `voice_id` extends Preferencias without collapsing allowlist + per-slot modalidad rule (S3.M4). Voice default uses Ficha tone hint — server-only. | SPEC S3.M4; CONTEXT **Preferencias de producción visual** | Changing `voice_id` does not silent-regenerate scripts or voiceovers (consistent with S3.M4). |
| **Info** | **ADRs respected.** TTS synthesis = short serverless I/O on Vercel (not FFmpeg). Weekly cycle auto-TTS explicitly out (ADR-0001 integrations-engineer). No IG publish (ADR-0002). Assembly FFmpeg stays US-9.1 / Fly (ADR-0003). | ADR-0001–0003; README scope out | Do not enqueue TTS on cron in US-9.3 BUILD. |
| **Info** | **Out of scope held:** US-9.1 assembly, US-9.2 subtitles/logo/cover, ElevenLabs body, Inworld, Cliente generate UI, voice cloning, live SiliconFlow CI, catalog/cost-policy CRUD, weekly auto-TTS. | README scope out; TASKS | US-9.3 = adapter + storage + prefs voice + Operator trigger + budget/spend. |
| **Info** | **Downstream handoff clear.** US-8.2/8.4 already require `voiceoverAssetId`; US-9.1 consumes stored audio. Story correctly avoids FFmpeg and documents `voiceoverAssetId` return. | USER_STORIES US-8.2 Depends; SPEC S3.M10 | E2E talking-head blocked until US-9.3 BUILD closes; fixture audio OK for interim adapter tests. |

---

### Terminology violations (CONTEXT)

**None that block** in README/TASKS (uses **voiceover**, **Preferencias de producción visual**, **Paquete de guion**, **Cliente**, **Operator**, **provider key**; avoids human recording UX).

Product-facing EN/ES for US-9.3 UI must use:

| Prefer | _Evitar_ |
|--------|----------|
| **voiceover** / voz IA | human recording, “record audio”, mic capture UX |
| **Preferencias de producción visual** | visual mode selector, visual preferences (as business name) |
| **Video sin rostro** / **B-roll** | faceless (user-facing ES; enum `faceless` OK in code) |
| **Paquete de guion** | script package |
| **Cliente** | prestador, dueño, usuario final |
| **Operator** | admin, administrador, staff |
| **Política de costo** | max_cost as loose business concept in Cliente UI |

Technical enums (`voice_id`, `siliconflow_cosyvoice2`, `ai_voiceover`, `music_only`, `asset_type: voiceover`) OK in code/DB; map to localized labels in FE. **Never** expose raw vendor voice strings or `SILICONFLOW_API_KEY` to the browser.

---

### Blockers for SECURITY / CONTRACT

| Item | Blocks? | Guidance |
|------|---------|----------|
| US-9.3 CONTRACT.md (vendor API, orchestrator, migration, DTOs) | **Yes — BUILD gate** | Freeze before media-pipeline + BE + FE BUILD. |
| SiliconFlow TTS REST + error normalization | **Yes — adapter AC** | Mirror LLM adapter security patterns. |
| Orchestrator tenancy (script-owned `clientId`) | **Yes — [SEC] multi-tenant** | No client `providerKey` / arbitrary `voiceId`. |
| Closed voice catalog validation on upsert + synthesize | **Yes — [SEC] AC** | App allowlist only; prefs voice on synthesize. |
| Budget gate before vendor I/O + spend on success | **Yes — [SEC] AC** | `assertReelBudgetAllowsEstimatedSpend` + `recordReelSpendEvent`. |
| `reelSpendJobKindSchema` + `asset_role: "tts"` | **Yes — US-7.4 handoff** | Extend enum in CONTRACT implementation list. |
| Tone heuristic table | **No — but freeze before BE** | Deterministic server map. |
| Regenerate / orphan policy | **No — but freeze before BE** | Avoid stale `voiceoverAssetId` in video jobs. |
| ElevenLabs high tier | **No — Phase B** | Document partial VALIDATION. |
| Weekly auto-TTS | **No — out of scope** | ADR-0001 integrations-engineer. |

**SPEC blockers on intent:** none. **ADR breaches:** none if TTS stays off Fly/FFmpeg and cron auto-TTS remains deferred.

---

### Recommended action

Proceed to **SECURITY.md** then **US-9.3 CONTRACT.md** with these **non-negotiable freezes**:

1. **`createSiliconflowCosyvoice2Adapter`** — `estimateCost` (`per_1m_chars`), `synthesize` → Storage → `storedMediaAssetSchema`; `server-only`; missing `SILICONFLOW_API_KEY` → `PROVIDER_CONFIG_MISSING`.
2. **`synthesizeVoiceoverForReelScript({ reelScriptId })`** — Operator-only; script-row tenancy; policy-resolved `providerKey`; budget gate immediately before `adapter.synthesize`; spend event after successful `media_assets` INSERT.
3. **`lib/tts/voice-catalog.ts`** — closed V1 ids (≥2 EN, ≥2 ES); server-only; FE gets sanitized DTO + sample URLs.
4. **Migration** — `voiceover` enum; audio `storage_key` CHECK; `neuramark_visual_preferences.voice_id` nullable text.
5. **Preferencias** — extend upsert/loader; Cliente voice picker with hide rules for non-AI voice paths; EN/ES `settings.preferences.voice.*`.
6. **Operator `/operator/scripts`** — Generate / Regenerate voiceover; return `voiceoverAssetId` for US-8.4 handoff.
7. **Phased AC** — CosyVoice2 low tier closes core AC; ElevenLabs deferred until catalog activation.
8. **Explicit out of scope:** FFmpeg assembly (US-9.1), subtitles/logo (US-9.2), Cliente synthesis controls, voice cloning, weekly cron TTS, IG publish, Stories IG, multicanal.

Do not check off USER_STORIES acceptance criteria in this gate.
