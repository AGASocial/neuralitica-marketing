# QA Report — US-9.3 (Text-to-speech for voiceover)

**Branch:** `feature/US-9.3-tts-voiceover`  
**BUILD commits reviewed:** `7a2e4ae`, `1f2319e`, `1d9d813`  
**Validation:** PASS WITH NOTES — `plan/stories/US-9.3/VALIDATION.md` @ `1715048`  
**CONTRACT:** `plan/stories/US-9.3/CONTRACT.md` (frozen, FE-reviewed)  
**SECURITY:** `plan/stories/US-9.3/SECURITY.md` (APPROVE WITH CONDITIONS)  
**Reviewer:** qa-engineer  
**Date:** 2026-08-30  

### Verdict: APPROVE WITH CONDITIONS

Phase A implements the frozen CONTRACT security model: closed server-only voice catalog, pointer-only synthesize input with forbidden authority keys, `requireOperator("handler")` before any side effects, budget gate before vendor I/O, spend ledger only after successful asset INSERT, tenancy-scoped script load and media serve, and CosyVoice2 adapter behind fixed URL + env key with max audio size. No Critical or High exploitable findings.

**Close recommendation (Phase A): YES** — ship CosyVoice2 + Preferencias + Operator orchestrator paths. ElevenLabs high-tier USER_STORIES AC remains intentionally open until Phase B (`elevenlabs_tts_high` active); not a QA blocker for Phase A.

---

## Findings

### Medium

| # | Severity | Location | Issue | Why it matters | Recommended fix |
|---|----------|----------|-------|----------------|-----------------|
| 1 | **Medium** | `lib/tts/synthesize-voiceover-for-reel-script.ts:185-204` | If `insertVoiceoverMediaAsset` succeeds but `recordReelSpendEvent` throws, orchestrator returns `INTERNAL_ERROR` while a persisted voiceover asset exists with **no** TTS spend row. | Cumulative budget gate under-counts vendor cost; Operator retry can trigger another paid synthesize + INSERT while prior audio is orphaned. Margin/ledger drift under failure, not IDOR. | Wrap INSERT + spend in a compensating pattern (delete asset on spend failure, or retry spend with idempotency key); add orchestrator test asserting no partial success without spend reconciliation. |
| 2 | **Medium** | `lib/tts/synthesize-voiceover-for-reel-script.ts:151-170` | Vendor `adapter.synthesize` runs after budget gate; if synthesize succeeds but `insertVoiceoverMediaAsset` returns null, no spend row is written but SiliconFlow was billed. | Accepted download-and-own residual, but silent ledger gap on INSERT failure. | Log structured reconcile signal; consider spend-on-vendor-success only when INSERT is guaranteed, or audit table for orphan synthesize attempts. |

### Low

| # | Severity | Location | Issue | Why it matters | Recommended fix |
|---|----------|----------|-------|----------------|-----------------|
| 3 | **Low** | `lib/tts/synthesize-voiceover-for-reel-script.test.ts` (suite) | No unit test for foreign / missing `reelScriptId` → `NOT_FOUND`. Loader scopes `client_id` (`load-reel-script-for-voiceover.ts:53-55`) but matrix item from SECURITY.md is untested. | Regression risk on IDOR uniform-404 floor. | Add mocked test returning `null` from loader → assert `NOT_FOUND`, no synthesize/spend. |
| 4 | **Low** | `app/api/media/assets/[assetId]/route.ts:145-166` | Voiceover serve branch enforces `requireOperator` + `row.client_id === operator.id` → 404, but **no** automated route test (VALIDATION + SECURITY gap). | Cross-tenant audio leak is high impact if regressed; code review only today. | Add handler unit test: foreign `client_id` → 404 with operator session mock. |
| 5 | **Low** | `lib/visual-preferences/upsert-visual-preferences.test.ts:151` | **Regression:** `happy path upserts Preferencias only` fails (83/84 pass in combined run). US-9.3 added pre-upsert `SELECT voice_id` when `voiceId` omitted; test mock only implements `.upsert()` chain. | CI signal noise; does not indicate production upsert failure with real Supabase. | Extend `installUpsertMocks` with `.select("voice_id").maybeSingle()` path returning null. |
| 6 | **Low** | `lib/visual-preferences/upsert-visual-preferences.test.ts` (suite) | No dedicated integration test for unknown `voiceId` string on upsert (Zod enum rejects via schema — `visual-preferences.test.ts` covers `providerVoice` / `voice_id` smuggling only). | SECURITY matrix marked partial in VALIDATION. | Add one upsert test: `{ voiceId: "evil_clone" }` → `VALIDATION_ERROR`, no DB write. |
| 7 | **Low** | `lib/tts/synthesize-voiceover-for-reel-script.test.ts` (suite) | No test asserting vendor synthesize failure → no spend row (only budget-block and empty-text paths). | Minor regression gap on spend-on-success-only invariant. | Mock adapter throw after budget pass; assert `wasSpendCalled() === false`. |
| 8 | **Low** | `lib/tts/get-voiceover-summaries-for-reel-scripts.ts:121-149` | `findLatestVoiceoverAssetId` loads all client voiceover rows then filters in memory by `metadata.reelScriptId`. | Scales poorly with regenerate orphans; not a trust-boundary defect in V1 self-tenant. | Optional SQL filter on `metadata->>'reelScriptId'` when volume grows. |

### Informational (non-blocking)

| Topic | Status | Notes |
|-------|--------|-------|
| ElevenLabs high tier | **Deferred (Phase B)** | Orchestrator hard-rejects non-`siliconflow_cosyvoice2` at `:111-114`. USER_STORIES AC partial — documented in CONTRACT + VALIDATION. |
| Hardcoded local operator | **Sanctioned** | `getCurrentUser()` / `requireOperator` interim per AGENTS.md — not a finding. |
| `npm run build` | **Pre-existing** | Compiles; page-data collection fails on `AUTH_DEV_FALLBACK` in production — not introduced by US-9.3 (VALIDATION noted). |
| `npm test` | **Not defined** | Use `npx tsx --test` per repo convention. |
| Static samples | **PASS** | Four MP3s under `public/tts-samples/`; DTO regex locks paths. |
| Auto-TTS from US-5.1 | **PASS** | No `synthesizeVoiceover` import under `lib/reel-scripts/`. |

---

## Security control verification

| Control (CONTRACT / SECURITY.md) | Status | Evidence |
|----------------------------------|--------|----------|
| Closed catalog; `providerVoice` server-internal | **PASS** | `lib/tts/voice-catalog.ts:1`, `toTtsVoiceOptionDto`; FE uses `TTS_VOICE_OPTIONS_FE` / loader DTO only |
| Synthesize input `{ reelScriptId }` only | **PASS** | `synthesizeVoiceoverForReelScriptInputSchema` strict; `findForbiddenTtsSynthesisKeys` |
| Forbidden authority keys rejected | **PASS** | `find-forbidden-synthesis-keys.ts`; test rejects `providerKey` |
| `requireOperator("handler")` first on synthesize | **PASS** | `synthesize-voiceover-for-reel-script.ts:51-57`; Cliente → `FORBIDDEN` test |
| Script tenancy: foreign id → NOT_FOUND | **PASS (code)** | `load-reel-script-for-voiceover.ts:53-55`; **no unit test** (Finding 3) |
| Voice from prefs + server heuristic only | **PASS** | `synthesize-voiceover-for-reel-script.ts:86-91`; no request `voiceId` |
| Provider via policy + catalog only | **PASS** | `resolveProviderForJob`; rejects non-low TTS key |
| Budget gate before vendor I/O | **PASS** | `:129-142` before `adapter.synthesize`; budget-block test |
| Spend only after successful INSERT | **PASS** | `:172-196`; happy path + budget block tests |
| Preferencias `voiceId` catalog validation | **PASS** | Zod `ttsVoiceIdSchema`; forbidden `voice_id` / `providerVoice` keys |
| Preferencias upsert no synthesis side effects | **PASS** | No TTS imports in upsert path |
| CosyVoice2 adapter server-only + fixed URL | **PASS** | `siliconflow-cosyvoice2-adapter.ts:1`, `SILICONFLOW_TTS_SPEECH_URL`; adapter tests |
| Max audio size + MIME validation | **PASS** | `TTS_MAX_AUDIO_BYTES`; adapter tests 5–6 |
| Media serve Operator + ownership | **PASS (code)** | `route.ts:145-166`; **no unit test** (Finding 4) |
| No `@supabase/supabase-js` in Client Components | **PASS** | `OperatorVoiceoverPanel.tsx` imports action + contracts only |
| Migration `neuramark_*` prefix | **PASS** | `20260830120000_neuramark_tts_voiceover.sql` |
| RLS deny-by-default unchanged | **PASS** | Migration comments; no new policies |
| No debug budget bypass | **PASS** | `skipBudgetCheck` in forbidden set only |

---

## Checks run

| Command | Result |
|---------|--------|
| `npx tsx --test lib/tts/voice-catalog.test.ts lib/tts/synthesize-voiceover-for-reel-script.test.ts lib/providers/tts/siliconflow-cosyvoice2-adapter.test.ts lib/visual-preferences/visual-preferences.test.ts lib/visual-preferences/upsert-visual-preferences.test.ts lib/cost-policy/cost-policy.test.ts` | **83 pass / 1 fail** — US-9.3 TTS suites **21/21 pass**; failure is upsert mock regression (Finding 5) |
| `npm run lint` | **Exit 0** with pre-existing `@typescript-eslint/no-require-imports` warnings in `*.test.ts` files (incl. US-9.3 tests) |
| `npx tsc --noEmit` | **Errors** in test files only (`.ts` import extensions, video-jobs mocks) — pre-existing pattern |
| `npm run build` | **Compile OK**; page-data collection fails on `AUTH_DEV_FALLBACK` production guard — pre-existing |

**US-9.3-focused automated coverage (passing):** adapter (8), registry (1), orchestrator (6), voice catalog (6), picker visibility (2), Preferencias forbidden-key regression for TTS smuggling.

---

## What was not covered

- Live SiliconFlow E2E synthesis (requires `SILICONFLOW_API_KEY` + applied migration on Supabase).
- Manual verification of foreign `reelScriptId` → `NOT_FOUND` and foreign voiceover asset serve → 404 (code reviewed; tests missing — Findings 3–4).
- ElevenLabs Phase B adapter (explicitly out of Phase A scope).
- Production bundle audit for `SILICONFLOW_API_KEY` leakage (static import graph review only — adapter/catalog/orchestrator are server-only; no `NEXT_PUBLIC_*` SiliconFlow vars found).
- Downstream US-8.4 / US-9.1 consumption of `voiceoverAssetId` (owned by those stories).

---

## Conditions for merge / close

| # | Condition | Blocks Phase A close? |
|---|-----------|----------------------|
| 1 | Reconcile INSERT vs spend failure (Finding 1) | **No** — follow-up hardening; V1 self-tenant blast radius limited |
| 2 | Add foreign `reelScriptId` + serve IDOR unit tests (Findings 3–4) | **No** — code paths correct; backlog for nextjs-backend |
| 3 | Fix upsert mock regression test (Finding 5) | **No** — test harness only |
| 4 | Document ElevenLabs AC open until Phase B | **Done** — VALIDATION + CONTRACT phased acceptance |

---

## Close recommendation

**YES for Phase A** — Operator-triggered CosyVoice2 synthesis, closed catalog, Preferencias voice picker, budget/spend wiring, and media persistence meet enterprise security bar for local/V1 with sanctioned hardcoded operator. Proceed to product-owner AC checkoff (except ElevenLabs row). Track Findings 1–7 as non-blocking hardening backlog.
