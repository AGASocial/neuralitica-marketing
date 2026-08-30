# US-9.3 — Text-to-speech for voiceover

**Status:** CLOSED Phase A (2026-08-30) — VALIDATION PASS WITH NOTES `1715048` · QA APPROVE WITH CONDITIONS `e9c1833` · PO AC check-off 5/6 on `feature/US-9.3-tts-voiceover`. Builds adapter `7a2e4ae` · BE `1f2319e` · FE `1d9d813`. ElevenLabs high-tier AC deferred Phase B.

**As a** System, **I want** AI voice from voiceover script, **so that** clients never record audio.

Ship **CosyVoice2 TTS (low tier)** end-to-end: server-only **`TtsProviderAdapter`** for catalog key **`siliconflow_cosyvoice2`**; Operator-triggered synthesis from **`neuramark_reel_scripts.voiceover_text`**; persist output as **`neuramark_media_assets`** (`asset_type = voiceover`); Cliente **voice picker** on Preferencias with playable samples; **`voice_id`** on **`neuramark_visual_preferences`** validated against a closed server catalog; **budget gate** on TTS spend via **`neuramark_reel_spend_events`**. Video jobs and assembly consume **`voiceoverAssetId`** — no FFmpeg in this story.

**Canonical acceptance criteria:** [`plan/USER_STORIES.md`](../../USER_STORIES.md) → US-9.3 (5/6 AC checked Phase A — ElevenLabs high tier deferred Phase B).

**This folder:** [`plan/stories/US-9.3/`](./) — `README.md` · `TASKS.md` (gates: `SECURITY.md` · `CONTRACT.md` · `VALIDATION.md` · `QA.md` — create when story enters sprint).

**Branch:** `feature/US-9.3-tts-voiceover`

**Depends on:** [US-5.1](../US-5.1/) ✅ `voiceover_text` on `neuramark_reel_scripts` · [US-X.4](../US-X.4/) ✅ `siliconflow_cosyvoice2` catalog row · [US-3.1](../US-3.1/) ✅ Preferencias surface `/settings/preferences` · [US-7.1](../US-7.1/) ✅ cumulative budget gate + spend ledger · [US-14.5](../US-14.5/) ✅ `requireOperator()` / `requireActive()`.

**Soft / downstream:** [US-8.4](../US-8.4/) (talking-head jobs consume `voiceoverAssetId`) · [US-9.1](../../USER_STORIES.md) (assembly consumes stored voiceover asset) · [US-7.3](../US-7.3/) (TTS actual-cost backfill on spend events).

**Unblocks:** Full SadTalker/MuseTalk E2E with generated voiceover (US-8.4 + US-8.6) · US-9.1 assembly audio input · US-7.3/7.4 TTS cost lines on spend ledger.

---

## Scope in

| Area | What US-9.3 BUILD adds |
|------|------------------------|
| **FE** | Voice picker on **`/settings/preferences`**: closed catalog (EN + ES voices); play sample per voice (`<audio>` via authenticated or static sample route); save **`voice_id`** with Preferencias; loading/error/empty states; EN/ES copy under **`settings.preferences.voice.*`**. |
| **BE** | **`lib/providers/tts/siliconflow-cosyvoice2-adapter.ts`** — real **`TtsProviderAdapter`** (`estimateCost` from `per_1m_chars`; **`synthesize`** → Storage upload → **`StoredMediaAsset`**); register in **`createProviderRegistry()`**; closed **`lib/tts/voice-catalog.ts`** (voice ids, locale, tone tags, provider voice param map, sample paths); **`synthesizeVoiceoverForReelScript()`** orchestrator (Operator-only): load script + prefs → resolve TTS provider via policy → budget gate → adapter → INSERT `media_assets` + spend event; Route Handler or action for sample playback if not static; extend **`assertReelBudgetAllowsEstimatedSpend`** / **`reelSpendJobKindSchema`** for TTS; mocked-HTTP adapter tests. |
| **DB** | Migration: extend **`neuramark_media_asset_type`** with **`voiceover`**; relax **`storage_key`** CHECK for audio extensions (`.mp3`, `.wav`, `.m4a`); add **`voice_id text NULL`** on **`neuramark_visual_preferences`** (app-validated against catalog — no FK to vendor). |
| **Implementers** | **media-pipeline-engineer** (CosyVoice2 adapter + synthesize I/O) + **nextjs-backend** (`CONTRACT.md`, orchestrator, migration, budget/spend wiring, tests) + **nextjs-frontend** (voice picker UI). |

## Scope out

| Story / topic | Why out |
|---------------|---------|
| **US-9.1** FFmpeg assembly | Consumes `voiceover` `media_assets` later; metadata link only here. |
| **US-9.2** subtitles/logo/cover | Separate story. |
| **ElevenLabs real adapter body** | Catalog row **`elevenlabs_tts_high`** remains **`active = false`** in V1; optional stub registration only — real body when P1 activates row. |
| **Inworld Mini** | Mentioned in Conventions as alt low-tier; not seeded in US-X.4 — out unless catalog amended. |
| **Cliente TTS generate UI** | Operator triggers synthesis on **`/operator/scripts`**; Cliente only picks default voice on Preferencias. |
| **Voice cloning / custom voice upload** | SEC forbids arbitrary provider voice IDs from client. |
| **Live SiliconFlow integration tests in CI** | Mocked HTTP only; manual smoke optional post-QA. |
| **Weekly cycle auto-TTS** | integrations-engineer (ADR-0001) — manual Operator path first. |
| **Operator cost-policy / catalog CRUD** | US-7.1 / US-X.4 unchanged. |

## Canonical terms (CONTEXT)

Use **voiceover**, **Preferencias de producción visual**, **Paquete de guion**, **provider tier**, **provider key**, **download-and-own**.  
_Evitar:_ client-supplied `provider_key`; arbitrary vendor `voice_id`; human audio recording UX.

## What prior stories already shipped (do not duplicate)

| Source | Continuity |
|--------|------------|
| US-8.1 | **`TtsProviderAdapter`** interface + **`synthesizeSpeechRequestSchema`** / **`resolvedSynthesizeSpeechInputSchema`** in `lib/contracts/providers.ts`; registry **`registerTts` / `getTtsAdapter`**. |
| US-X.4 | Catalog row **`siliconflow_cosyvoice2`**: `tts` · `low` · `active` · `SILICONFLOW_API_KEY` · `cost_model: { billingUnit: "per_1m_chars", unitCostCents: 1 }`. |
| US-7.2 | **`resolveProviderForJob({ assetRole: "tts" })`** + **`ttsCharCount`** from `voiceover_text`; projection already includes TTS line. |
| US-7.1 | **`assertReelBudgetAllowsEstimatedSpend`**, **`recordReelSpendEvent`**, **`neuramark_reel_spend_events`** — extend for `asset_role: "tts"`. |
| US-5.1 | **`voiceover_text`** on script package; Operator scripts workspace **`/operator/scripts`**. |
| US-3.3 | **`neuramark_media_assets`** + Storage upload pattern (`insertGeneratedVideoMediaAsset` — mirror for voiceover). |
| US-8.4 | **`neuramark_video_jobs.voiceover_asset_id`** FK — orchestrator passes generated asset id into video job create. |

**US-9.3 adds real CosyVoice2 synthesis, voiceover `media_assets`, Preferencias voice selection, and TTS budget/spend tracking** — not assembly or ElevenLabs production body.

## PO decisions frozen (2026-08-30)

1. **Vendor (low tier):** **SiliconFlow CosyVoice2** via **`process.env.SILICONFLOW_API_KEY`** (catalog `envKeyName`); missing key → **`ProviderAdapterError`** before network I/O.
2. **Adapter module:** **`lib/providers/tts/siliconflow-cosyvoice2-adapter.ts`** (`import "server-only"`); factory **`createSiliconflowCosyvoice2Adapter(params)`**; **`providerKey: "siliconflow_cosyvoice2"`**.
3. **Registry:** Register real adapter in **`createProviderRegistry()`** / **`initializeProviderRegistryFromCatalog()`**; bootstrap catalog must include TTS row when building from DB.
4. **`estimateCost`:** **`per_1m_chars`** from catalog — `Math.max(1, Math.ceil((text.length / 1_000_000) * unitCostCents))`; use script **`voiceover_text`** char count at orchestration time.
5. **`synthesize`:** POST SiliconFlow TTS API (CONTRACT freezes URL + body map); stream/decode audio → Storage put under **`neuramark/{clientId}/{reelScriptId}/{uuid}.mp3`**; return **`storedMediaAssetSchema`** with **`actualCostCents`** (from estimate when vendor omits billing metadata — US-7.3 lean).
6. **Voice catalog:** **Server-only closed list** in **`lib/tts/voice-catalog.ts`** — **not** DB, **not** client-writable. V1 minimum **4 voices** (2 EN, 2 ES) with stable ids e.g. **`en_warm_female`**, **`en_professional_male`**, **`es_warm_female`**, **`es_professional_male`**. Each entry: `id`, `locale`, `displayLabelKey`, `toneTags[]`, `providerVoice` (CosyVoice2 param), `sampleAssetPath` (static under `public/tts-samples/` or CONTRACT path).
7. **`voice_id` column:** **`neuramark_visual_preferences.voice_id text NULL`**. Nullable — when null at synthesize time, server picks **default for client `preferred_locale`** (from profile or `en`). Upsert Preferencias validates **`voice_id`** ∈ catalog ids; reject unknown (403/validation). **Never** accept raw vendor voice strings from browser.
8. **Tone hint:** Map **`getBusinessProfileForAgents()`** tone/personality keywords to **preferred catalog voice** when **`voice_id` is null** (server-only heuristic); if **`voice_id` set**, use it. No LLM call for voice selection in V1.
9. **Synthesis trigger:** Operator Server Action **`synthesizeVoiceoverForReelScript({ reelScriptId })`** on **`/operator/scripts`** expand row — **Generate voiceover** / **Regenerate voiceover**. Requires approved strategy + existing script row with non-empty **`voiceover_text`**. **No** auto-TTS on script generate (US-5.1).
10. **Budget gate:** Before vendor I/O, call **`assertReelBudgetAllowsEstimatedSpend`** with adapter estimate; on success **`recordReelSpendEvent({ assetRole: "tts", jobKind: "tts_generate" | "tts_regenerate", ... })`** after successful synthesize (not on blocked attempts). Add job kinds to **`reelSpendJobKindSchema`**.
11. **Media asset:** INSERT **`neuramark_media_assets`** with **`asset_type = voiceover`**, metadata `{ originalFilename, detectedMime, sizeBytes, durationSec?, source: "tts_synthesize", reelScriptId, voiceId, providerKey }`. Helper **`insertVoiceoverMediaAsset()`** mirroring video insert pattern.
12. **Link to downstream jobs:** Return **`{ voiceoverAssetId }`** from synthesize action; Operator may pass into **`createTalkingHeadVideoJob`** (US-8.4). Optional **`GET /api/media/assets/[assetId]`** already serves owned audio — extend MIME allowlist for audio playback.
13. **FE voice picker:** Section on **`/settings/preferences`** when any mode uses AI voice ( **`faceless_style.voice === "ai_voiceover"`** OR **`own_avatar` / `generic_avatar`** in allowlist — PO lean: **always show** picker when Preferencias exist; hide only when **`faceless_style.voice === "music_only"`** and faceless-only without avatar modes). Samples: PrimeReact **`Dropdown`** or radio list + play button.
14. **High tier:** When **`provider_tier = high`** and **`elevenlabs_tts_high`** becomes active (P1), policy resolves ElevenLabs — **out of US-9.3 BUILD** except documenting stub; V1 BUILD validates low-tier CosyVoice2 path only.
15. **Tests:** Mocked HTTP for adapter; orchestrator tests with fixture script + budget/spend mocks; voice catalog validation tests; FE optional component test for picker.
16. **Implementers:** **media-pipeline-engineer** + **nextjs-backend** + **nextjs-frontend**; CONTRACT before BUILD; FE signoff on **`CONTRACT.md`**.

---

## Gates (orchestrator)

- [x] SPEC-REVIEW.md (spec-guardian)
- [x] SECURITY.md (security-architect — APPROVE WITH CONDITIONS)
- [x] CONTRACT.md (nextjs-backend — frozen; **Reviewed by FE** yes)
- [x] BUILD (media-pipeline-engineer + nextjs-backend + nextjs-frontend)
- [x] VALIDATION.md (requirements-validator — PASS WITH NOTES `1715048`)
- [x] QA.md (qa-engineer — APPROVE WITH CONDITIONS `e9c1833`)

**Status:** CLOSED Phase A. **PO close:** `dfdd08b` · **QA baseline:** `e9c1833` on `feature/US-9.3-tts-voiceover` (merged to main).

**Next after CLOSE:** **SELECT US-9.1** (assemble final 9:16 Reel — voiceover asset now available); Phase B ElevenLabs when `elevenlabs_tts_high` activates.

---

## Acceptance criteria mapping (USER_STORIES § US-9.3)

| AC | US-9.3 deliverable |
|----|-------------------|
| Low tier CosyVoice2 | Real **`siliconflow_cosyvoice2`** adapter + policy resolution |
| Voice matches profile tone hint | Server default mapping when **`voice_id` null** |
| Spanish and English voices | Closed catalog ≥2 per locale + picker labels EN/ES |
| TTS cost in job estimate | Already in US-7.2 projection; synthesize uses same **`estimateCost`** |
| [SEC] **`voice_id`** catalog validation | Upsert + synthesize paths |
| [SEC] Server-only API key + cumulative budget | **`assertReelBudgetAllowsEstimatedSpend`** + spend ledger |
