# Validation Report — US-9.3

**Story:** Text-to-speech for voiceover  
**Branch:** `feature/US-9.3-tts-voiceover`  
**BUILD commits validated:** adapter `7a2e4ae`, BE `1f2319e`, FE `1d9d813`  
**CONTRACT:** `plan/stories/US-9.3/CONTRACT.md` (Reviewed by FE: yes — 2026-08-30)  
**SECURITY:** `plan/stories/US-9.3/SECURITY.md` (APPROVE WITH CONDITIONS)  
**Validator:** requirements-validator  
**Date:** 2026-08-30  

### Verdict: PASS WITH NOTES

Phase A BUILD closes the CosyVoice2 low-tier path, closed EN/ES voice catalog, Preferencias `voiceId`, Operator synthesize orchestrator, budget gate + spend ledger, `voiceover` media assets, and Operator `/operator/scripts` UI per frozen CONTRACT. **USER_STORIES AC for ElevenLabs high tier remains partially open** until Phase B (`elevenlabs_tts_high` active) — documented per CONTRACT phased acceptance. Residual notes: SECURITY automated-test matrix gaps (foreign `reelScriptId` 404, voiceover serve IDOR), no `npm test` script, production `npm run build` fails on pre-existing `AUTH_DEV_FALLBACK` env guard (types compile). PO may proceed to QA CLOSE for Phase A scope; product-owner checks USER_STORIES AC (not validator).

---

## Test runs

| Command | Result |
|---------|--------|
| `npx tsx --test lib/tts/voice-catalog.test.ts lib/tts/synthesize-voiceover-for-reel-script.test.ts lib/providers/tts/siliconflow-cosyvoice2-adapter.test.ts lib/visual-preferences/visual-preferences.test.ts lib/cost-policy/cost-policy.test.ts` | **79 pass / 0 fail** (27 suites) |

**Breakdown (US-9.3–focused):**

| Suite | Tests | Notes |
|-------|-------|-------|
| `siliconflow-cosyvoice2-adapter.test.ts` | 8 | estimateCost, missing key, round-trip, error paths, max size, server-only |
| TTS registry (`providers.test` slice in adapter file) | 1 | `getTtsAdapter("siliconflow_cosyvoice2")` |
| `synthesize-voiceover-for-reel-script.test.ts` | 6 | forbidden keys, non-operator 403, budget block, empty text, happy path + spend, `tts_regenerate` |
| `voice-catalog.test.ts` | 8 | four voices, allowlist, DTO without `providerVoice`, locale filter, tone heuristic, picker visibility |
| `visual-preferences.test.ts` (regression) | includes | `providerVoice` / `voice_id` smuggling rejected |
| `cost-policy.test.ts` (regression) | includes | budget gate architecture unchanged |

`npm test` is **not** defined in `package.json`; use `npx tsx --test` (same as prior story validations).

`npm run build`: compiled successfully; type-check passed; page-data collection failed on `/login` with `AUTH_DEV_FALLBACK must not be set when NODE_ENV=production` — **pre-existing auth env guard**, not introduced by US-9.3.

---

## Acceptance Criteria (`plan/USER_STORIES.md` § US-9.3)

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Low tier (`provider_tier = low`): CosyVoice2 or equivalent catalog row; high tier may use ElevenLabs when active | **PASS WITH NOTE (Phase A)** | Orchestrator resolves TTS via `resolveProviderForJob({ assetRole: "tts" })` and **rejects** non-`siliconflow_cosyvoice2` keys (`lib/tts/synthesize-voiceover-for-reel-script.ts:111-114`). Adapter `createSiliconflowCosyvoice2Adapter` registered in `lib/providers/create-provider-registry.ts`; bootstrap catalog includes `siliconflow_cosyvoice2`. **ElevenLabs high-tier AC checkbox intentionally deferred** — no real ElevenLabs adapter body; orchestrator returns `PROVIDER_UNAVAILABLE` if policy resolves high-tier TTS. CONTRACT § Phased BUILD Phase B. |
| Voice matches profile tone hint when possible | **PASS** | `resolveDefaultVoiceId` keyword map (`lib/tts/voice-catalog.ts:90-133`); prefs `voice_id` wins when set (`synthesize-voiceover-for-reel-script.ts:86-91`). Tests: `voice-catalog.test.ts` § resolveDefaultVoiceId. |
| Spanish and English voices supported | **PASS** | Four frozen catalog ids: `en_warm_female`, `en_professional_male`, `es_warm_female`, `es_professional_male` (`lib/tts/voice-catalog.ts:19-51`). Static samples `public/tts-samples/*.mp3` (4 files). i18n `messages/en.json` + `messages/es.json` under `settings.preferences.voice.*` and `scripts.voiceover.*`. |
| TTS cost included in job estimate | **PASS** | **Projection (US-7.2):** `ttsCharCount` in `ReelProductionContext` (`lib/cost-policy/build-reel-production-context.ts:31,155`) and video-job paths (`create-talking-head-video-job.ts:106`). **Synthesize path:** `adapter.estimateCost` before budget gate (`synthesize-voiceover-for-reel-script.ts:127-135`); spend recorded with `assetRole: "tts"` (`recordReelSpendEvent` at `:186-196`). `reelSpendJobKindSchema` extended with `tts_generate` / `tts_regenerate` (`lib/contracts/cost-policy.ts:28-29`). |
| [SEC] `voice_id` validated server-side against offered catalog | **PASS** | Closed catalog `lib/tts/voice-catalog.ts` (`import "server-only"`). Upsert: Zod `ttsVoiceIdSchema` + explicit reject (`upsert-visual-preferences.ts:123-130`); forbidden `providerVoice`, `voice_id` keys (`helpers.ts:48-52`). Synthesize: **no** client `voiceId` — resolves prefs + server heuristic only (`synthesize-voiceover-for-reel-script.ts:86-91`). FE DTOs omit `providerVoice` (`lib/contracts/tts-voiceover.ts`, `toTtsVoiceOptionDto`). |
| [SEC] TTS provider key server-only; TTS spend in cumulative budget check (US-7.1) | **PASS** | Adapter reads `SILICONFLOW_API_KEY` from env (`siliconflow-cosyvoice2-adapter.ts`); `assertReelBudgetAllowsEstimatedSpend` before `adapter.synthesize` (`synthesize-voiceover-for-reel-script.ts:129-142`). Test: budget block prevents synthesize + no spend (`synthesize-voiceover-for-reel-script.test.ts`). Spend only after INSERT (`happy path` test). |

---

## CONTRACT surfaces

| # | Surface | Status | Evidence |
|---|---------|--------|----------|
| 1 | `getVisualPreferencesForClient` extended | **PASS** | `voiceId`, `availableVoices`, `voicePickerVisible` (`get-visual-preferences-for-client.ts:29,69-89`) |
| 2 | `upsertVisualPreferences` extended | **PASS** | optional `voiceId` (`upsert-visual-preferences.ts`, `visual-preferences.ts` schema) |
| 3 | `synthesizeVoiceoverForReelScript` | **PASS** | `lib/tts/synthesize-voiceover-for-reel-script.ts` + action wrapper |
| 4 | `getReelScriptsForWeek` extended | **PASS** | `voiceoverByReelScriptId` (`get-reel-scripts-for-week.ts:23,78,129+) |
| 5 | `GET /api/media/assets/[assetId]` voiceover | **PASS** | Operator gate + ownership (`route.ts:145-166`) |
| 6 | Static `/tts-samples/{voiceId}.mp3` | **PASS** | `public/tts-samples/` (4 MP3s) |
| 7 | `createSiliconflowCosyvoice2Adapter` | **PASS** | `lib/providers/tts/siliconflow-cosyvoice2-adapter.ts` |
| 8 | `insertVoiceoverMediaAsset` | **PASS** | `lib/media/insert-voiceover-media-asset.ts` |

**Migration:** `supabase/migrations/20260830120000_neuramark_tts_voiceover.sql` — `voiceover` enum, storage_key CHECK, `voice_id` column — matches CONTRACT verbatim.

**FE consumers:** `VoicePickerSection.tsx` (PrimeReact `RadioButton`, `<audio controls>`), `OperatorVoiceoverPanel.tsx`, `PreferencesEditor.tsx`, `ScriptsPageView.tsx` batch overrides.

---

## SECURITY binding floors

| Floor | Status | Evidence |
|-------|--------|----------|
| Closed catalog; no vendor strings in FE | **PASS** | `voice-catalog.ts` server-only; FE `TTS_VOICE_OPTIONS_FE` / `toTtsVoiceOptionDto` |
| Pointer-only synthesize input | **PASS** | `synthesizeVoiceoverForReelScriptInputSchema` strict `{ reelScriptId }`; `findForbiddenTtsSynthesisKeys` |
| Budget gate before vendor I/O | **PASS** | Orchestrator step order; test blocks fetch |
| Operator-only synthesis | **PASS** | `requireOperator("handler")` first; Cliente → `FORBIDDEN` test |
| No forbidden / authority fields | **PASS** | Forbidden-key tests on synthesize + upsert |
| No auto-TTS from US-5.1 | **PASS** | No `synthesizeVoiceover` import in `lib/reel-scripts` generate modules (grep) |
| Spend after successful INSERT only | **PASS** | Happy-path test `wasSpendCalled()`; budget block `wasSpendCalled() === false` |
| Serve ownership (Operator V1) | **PASS (code)** | `route.ts` voiceover branch mirrors `generated_video` |
| Adapter server-only + fixed URL | **PASS** | `SILICONFLOW_TTS_SPEECH_URL` constant; `import "server-only"` tests |

**SECURITY automated-test matrix (partial):**

| Required test (SECURITY.md) | Automated? |
|-----------------------------|------------|
| Unknown `voiceId` on upsert rejected | **Partial** — Zod schema + `ttsVoiceIdSchema`; explicit upsert test for `providerVoice` smuggling, not unknown `voiceId` string |
| Synthesize forbidden keys | **PASS** | `providerKey` test |
| Cliente 403 on synthesize | **PASS** |
| Foreign `reelScriptId` → 404 | **MISSING** — loader returns null → `NOT_FOUND` in code (`load-reel-script-for-voiceover.ts`) but no unit test |
| Budget block prevents fetch | **PASS** |
| Spend absent on block / present on success | **PASS** |
| Adapter not importable from client harness | **PASS** | server-only stub tests |
| Serve foreign asset → 404 | **MISSING** — route logic present, no unit test |
| `providerVoice` absent from Preferencias DTO | **PASS** | `voice-catalog.test.ts` § getVoiceById DTO |

---

## Convention compliance

| Check | Status |
|-------|--------|
| EN + ES user-facing strings | **PASS** — `messages/en.json`, `messages/es.json` |
| Server Components default; small `"use client"` boundaries | **PASS** — Preferencias RSC + editor client; scripts panel client |
| PrimeReact-first UI | **PASS** — `RadioButton`, `Message`, `Tag` in voice picker / operator panel |
| Loading / empty / error / pending | **PASS** — Operator panel pending state; preferences loadFailed; synthesis error `messageKey` mapping |
| No Supabase in Client Components | **PASS** — actions/helpers server-only |
| `neuramark_` DB prefix | **PASS** — migration + table names |
| Concrete FE consumers for BE endpoints | **PASS** — CONTRACT surface table satisfied |

---

## Phase A partial closure (ElevenLabs)

Per CONTRACT § Phased BUILD: **Phase A does not close** USER_STORIES AC row “high tier may use ElevenLabs when active.” BUILD validates CosyVoice2 + prefs + budget only. Orchestrator hard-rejects non-low TTS provider key at synthesize time. ElevenLabs activation is **Phase B / P1** — not a US-9.3 BUILD blocker.

---

## Gaps (what blocks PASS)

**None for Phase A VALIDATION gate.** ElevenLabs partial AC is **documented deferral**, not an implementation defect.

---

## Scope creep

| Item | Assessment |
|------|------------|
| `TTS_VOICE_OPTIONS_FE` static FE mirror in contracts | **Acceptable** — FE-safe catalog without importing server-only module |
| `lib/tts/errors.ts` envelope helpers | **In scope** — matches other modules |
| `upload-voiceover-buffer.ts` | **In scope** — adapter storage injection |

No speculative Cliente synthesis UI, no auto-TTS cron, no ElevenLabs body, no assembly FFmpeg.

---

## Blockers for QA (manual / E2E)

1. **Apply migration** `20260830120000_neuramark_tts_voiceover.sql` on target Supabase before synthesis or prefs `voice_id` persist.
2. **Live synthesis E2E** requires `SILICONFLOW_API_KEY` in server env; CI uses mocks only.
3. **Manual SECURITY checks** not covered by unit tests: foreign `reelScriptId` → `NOT_FOUND`; `GET /api/media/assets/{foreignVoiceoverId}` → 404 with Operator session.
4. **Downstream handoff:** Operator must pass returned `voiceoverAssetId` into `createTalkingHeadVideoJob` (US-8.4); stale ids on old jobs remain Operator responsibility (CONTRACT regenerate semantics).
5. **Assembly link:** BE work table “link to assembly job” is satisfied via persisted `voiceover` asset + `voiceoverAssetId` handoff — **US-9.1** consumes asset; no FFmpeg in this story.

---

## Recommended next actions

| Action | Owner |
|--------|-------|
| QA CLOSE Phase A — Preferencias picker, Operator generate/regenerate, budget block, roll-up TTS lines | **qa-engineer** |
| Add unit tests: foreign `reelScriptId` NOT_FOUND, voiceover serve IDOR 404 | **nextjs-backend** (non-blocking) |
| Phase B ElevenLabs adapter when `elevenlabs_tts_high` activates | **media-pipeline-engineer** (P1) |
| Check off USER_STORIES § US-9.3 AC (except ElevenLabs row until Phase B) | **product-owner** |
