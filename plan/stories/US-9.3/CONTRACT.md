Reviewed by FE: yes — 2026-08-30 — nextjs-frontend.

# API Contract — US-9.3 Text-to-speech for voiceover

**Story:** US-9.3  
**Status:** Frozen — 2026-08-30  
**Security:** `plan/stories/US-9.3/SECURITY.md` (APPROVE WITH CONDITIONS — reconciled below)  
**Spec review:** `plan/stories/US-9.3/SPEC-REVIEW.md` (GAPS — resolved by this contract)  
**Depends on:** US-5.1 ✅ `voiceover_text` + `/operator/scripts` · US-X.4 ✅ `siliconflow_cosyvoice2` catalog · US-3.1 ✅ Preferencias · US-7.1 ✅ budget gate + spend ledger · US-7.2 ✅ TTS projection · US-8.1 ✅ `TtsProviderAdapter` · US-14.5 ✅ `requireOperator()`  
**Soft downstream:** US-8.4 (`voiceoverAssetId` consumer) · US-9.1 (assembly mux) · US-7.3/7.4 (TTS spend lines)  
**Feature branch:** `feature/US-9.3-tts-voiceover`  
**Error envelope style:** same class as US-5.1 / US-7.1 / US-8.4 (`ok: true` vs `{ ok: false, error: { code, fields?, messageKey? } }`)

**This document is CONTRACT ONLY.** Zod mirrors live in `lib/contracts/tts-voiceover.ts` (BUILD). Extensions to `lib/contracts/visual-preferences.ts`, `lib/contracts/cost-policy.ts`, and `lib/contracts/media-assets.ts` are specified here and applied during BUILD.

**Terminology:** **voiceover** · **Preferencias de producción visual** · **Paquete de guion** · **Operator** · **Cliente** · **Política de costo** · **download-and-own**. Technical enums (`voice_id`, `siliconflow_cosyvoice2`, `ai_voiceover`) OK in code/DB. Do **not** expose raw vendor voice strings or `SILICONFLOW_API_KEY` to the browser.

**Critical boundary rule:** **`synthesizeSpeechRequestSchema` MUST NOT be used as the Server Action input schema.** It includes client-writable `clientId`, `text`, and `voiceId`. The Operator action uses **`synthesizeVoiceoverForReelScriptInputSchema`** (`{ reelScriptId }` only). The orchestrator builds **`resolvedSynthesizeSpeechInputSchema`** internally after server-side script/prefs/policy resolution.

---

## SPEC-REVIEW blocking gaps closed

| # | Gap (severity) | Resolution |
|---|----------------|------------|
| 1 | No US-9.3 CONTRACT.md (**High**) | This document |
| 2 | SiliconFlow TTS vendor contract undefined (**High**) | § CosyVoice2 adapter — REST URL, body, response, error normalization |
| 3 | Orchestrator tenancy + identity not frozen (**High**) | § `synthesizeVoiceoverForReelScript` — Operator-only; script-row `clientId`; forbidden keys |
| 4 | Profile tone → voice heuristic missing (**Medium**) | § `resolveDefaultVoiceId` — keyword map + locale fallback |
| 5 | Regenerate / orphan voiceover assets (**Medium**) | § Regenerate semantics — INSERT new row; `tts_regenerate` detection; orphan V1 policy |
| 6 | `reelSpendJobKindSchema` extension not in code (**Medium**) | § Spend ledger — `tts_generate`, `tts_regenerate` |
| 7 | Voice picker visibility edge `faceless_style.voice === "none"` (**Medium**) | § Preferencias FE — hide when faceless-only AND `voice ∈ { none, music_only }` |
| 8 | ElevenLabs high-tier AC partial closure (**Medium**) | § Phased BUILD — Phase A CosyVoice2 only; ElevenLabs deferred |
| 9 | Sample MP3s + catalog server-only (**Low**) | § Voice catalog — `server-only`; FE DTO `{ id, labelKey, locale, sampleUrl }` only |
| 10 | USER_STORIES DB shorthand omitting prefix (**Low**) | This contract uses **`neuramark_*`** exclusively |

## SECURITY reconciliation (binding)

| Topic | SECURITY condition | **Frozen in this contract** |
|-------|-------------------|----------------------------|
| Synthesis input | `{ reelScriptId }` only | § Forbidden synthesis keys; **not** `synthesizeSpeechRequestSchema` |
| Voice catalog | Closed allowlist; no vendor strings in FE | § Voice catalog + Preferencias DTO |
| Preferencias upsert | Extend with optional `voiceId`; `.strict()` | § Preferencias mutation |
| Operator gate | `requireOperator("handler")` first | § Orchestrator step table |
| Tenancy | Script-owned `clientId`; foreign id → 404 | § Orchestrator — `loadReelScriptForVoiceover` |
| Budget gate | Before vendor I/O; no spend on block | § Orchestrator step 8–9 |
| Spend authority | After successful INSERT only | § Orchestrator step 11 |
| Provider resolution | Policy + catalog only | § Orchestrator step 6 |
| Adapter secrets | `server-only`; fixed URL; max audio size | § CosyVoice2 adapter |
| Media serve | Operator V1 + ownership for synthesized voiceover | § Media serve route |
| Regenerate | Same cumulative gate; no bypass | § Regenerate semantics |
| Auto-TTS | Explicit non-goal | § Out of scope |
| Static samples | Fixed catalog id paths only | § Voice catalog `sampleUrl` |

---

## Phased BUILD acceptance

| Phase | Scope | Closes |
|-------|-------|--------|
| **A (US-9.3 BUILD)** | CosyVoice2 adapter + registry; closed voice catalog + static samples; migration; Preferencias `voiceId`; Operator synthesize orchestrator + `/operator/scripts` UI; budget/spend wiring; media INSERT + serve extension | US-9.3 core AC: low-tier TTS, EN/ES voices, prefs voice, budget gate, `[SEC]` rows |
| **B (P1 — deferred)** | `elevenlabs_tts_high` real adapter when catalog row `active = true` | USER_STORIES AC: “high tier may use ElevenLabs when active” — **VALIDATION.md must note partial closure until Phase B** |

**VALIDATION note (binding):** Phase A does **not** close the ElevenLabs high-tier AC checkbox. Document in `VALIDATION.md`: CosyVoice2 + prefs + budget paths only until `elevenlabs_tts_high` activates.

---

## Overview

US-9.3 ships **Operator-triggered TTS synthesis** from approved **`neuramark_reel_scripts.voiceover_text`**, persists output as **`neuramark_media_assets`** (`asset_type = voiceover`), lets **Cliente** pick a default voice on **Preferencias**, and records TTS spend on **`neuramark_reel_spend_events`**. Downstream video jobs consume **`voiceoverAssetId`** (US-8.4). **No FFmpeg** in this story.

**Surfaces**

| # | Surface | Kind | Consumer |
|---|---------|------|----------|
| 1 | `getVisualPreferencesForClient` (extended) | Server helper | `/settings/preferences` RSC |
| 2 | `upsertVisualPreferences` (extended) | Server Action | Preferencias form |
| 3 | `synthesizeVoiceoverForReelScript` | Server Action | `/operator/scripts` expand row — Generate / Regenerate voiceover |
| 4 | `getReelScriptsForWeek` (extended) | Server Action | Batch `voiceoverByReelScriptId` on week load |
| 5 | `GET /api/media/assets/[assetId]` (extended) | Route Handler | Operator playback of synthesized voiceover |
| 6 | Static `/tts-samples/{voiceId}.mp3` | Public assets | Preferencias sample `<audio>` |
| 7 | `createSiliconflowCosyvoice2Adapter` | Provider adapter | Orchestrator internal |
| 8 | `insertVoiceoverMediaAsset` | Server helper | Orchestrator post-synthesize |

**Forbidden surfaces (BUILD veto):**

- Server Action / Route Handler accepting `text`, `voiceId`, `providerKey`, `clientId`, `estimatedCostCents`, or `synthesizeSpeechRequestSchema` fields on synthesize.
- Cliente-triggered synthesis (any path without `requireOperator`).
- Auto-TTS hook from US-5.1 script generate/regenerate.
- Exposing `providerVoice` or `SILICONFLOW_API_KEY` in responses, metadata, or client bundles.
- ElevenLabs real adapter body in Phase A BUILD.

---

## Zod contract modules (BUILD)

**New file:** `lib/contracts/tts-voiceover.ts` — FE-safe types; server validates at boundaries.

**Extend:**

| File | Change |
|------|--------|
| `lib/contracts/cost-policy.ts` | Add `tts_generate`, `tts_regenerate` to `reelSpendJobKindSchema` |
| `lib/contracts/visual-preferences.ts` | Optional `voiceId` on upsert; `ttsVoiceOptionDtoSchema`; extend view/success schemas |
| `lib/contracts/media-assets.ts` | `MEDIA_ASSET_TYPE_VOICEOVER`, `voiceoverAssetMetadataSchema`, extended `STORAGE_KEY_REGEX` |
| `lib/contracts/reel-script.ts` | `voiceoverByReelScriptId` on `getReelScriptsForWeekSuccessSchema` |

---

## Migration SQL (verbatim)

**Filename (BUILD):** `supabase/migrations/20260830120000_neuramark_tts_voiceover.sql`

```sql
-- US-9.3: voiceover media assets + Preferencias voice_id

ALTER TYPE public.neuramark_media_asset_type ADD VALUE IF NOT EXISTS 'voiceover';

-- Replace storage_key CHECK to allow legacy UUID keys AND voiceover path keys
ALTER TABLE public.neuramark_media_assets
  DROP CONSTRAINT IF EXISTS neuramark_media_assets_storage_key_relative_chk;

ALTER TABLE public.neuramark_media_assets
  ADD CONSTRAINT neuramark_media_assets_storage_key_relative_chk
  CHECK (
    storage_key !~ '^/' AND
    storage_key !~ '\\' AND
    storage_key !~ '\.\.' AND
    (
      -- US-3.3 / US-8.3 legacy: single UUID + ext at repo root
      storage_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|mp4|mov)$'
      OR
      -- US-9.3 voiceover: neuramark/{clientId}/{reelScriptId}/{uuid}.mp3|wav|m4a
      storage_key ~ '^neuramark/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(mp3|wav|m4a)$'
    )
  );

ALTER TABLE public.neuramark_visual_preferences
  ADD COLUMN IF NOT EXISTS voice_id text NULL;

COMMENT ON COLUMN public.neuramark_visual_preferences.voice_id IS
  'Optional catalog voice id (e.g. en_warm_female). App-validated against lib/tts/voice-catalog.ts — no DB FK to vendor.';
```

| Rule | Detail |
|------|--------|
| RLS | Unchanged deny-by-default on `neuramark_media_assets`, `neuramark_visual_preferences` |
| Voice catalog | **Code config V1** — no new tables |
| `voice_id` | Nullable; no DB CHECK enum |

---

## Voice catalog — closed server allowlist

**File:** `lib/tts/voice-catalog.ts` (`import "server-only"`)

**Exports:** `TTS_VOICE_CATALOG`, `ttsVoiceIdSchema`, `getVoiceById`, `listVoicesForLocale`, `isAllowedVoiceId`, `resolveDefaultVoiceId`, `toTtsVoiceOptionDto`

### V1 catalog ids (frozen)

| `id` | `locale` | `labelKey` | `toneTags` | `providerVoice` (adapter-internal) | `sampleAssetPath` |
|------|----------|------------|------------|-----------------------------------|-------------------|
| `en_warm_female` | `en` | `settings.preferences.voice.enWarmFemale` | `warm`, `gentle` | `FunAudioLLM/CosyVoice2-0.5B:claire` | `public/tts-samples/en_warm_female.mp3` |
| `en_professional_male` | `en` | `settings.preferences.voice.enProfessionalMale` | `professional`, `steady` | `FunAudioLLM/CosyVoice2-0.5B:alex` | `public/tts-samples/en_professional_male.mp3` |
| `es_warm_female` | `es` | `settings.preferences.voice.esWarmFemale` | `warm`, `passionate` | `FunAudioLLM/CosyVoice2-0.5B:bella` | `public/tts-samples/es_warm_female.mp3` |
| `es_professional_male` | `es` | `settings.preferences.voice.esProfessionalMale` | `professional`, `deep` | `FunAudioLLM/CosyVoice2-0.5B:benjamin` | `public/tts-samples/es_professional_male.mp3` |

**Rules:**

- `providerVoice` is mapped inside **`createSiliconflowCosyvoice2Adapter` only** — never in Cliente DTOs, Preferencias responses, or browser bundles.
- Static samples: committed MP3s under `public/tts-samples/` (≤30s each, no PII); FE uses same-origin URLs from server DTO only.

### FE-safe DTO — `ttsVoiceOptionDtoSchema`

```ts
{
  id: TtsVoiceId;           // en_warm_female | en_professional_male | es_warm_female | es_professional_male
  labelKey: string;         // i18n key — FE resolves EN/ES
  locale: "en" | "es";
  sampleUrl: string;        // /^\/tts-samples\/(en_warm_female|en_professional_male|es_warm_female|es_professional_male)\.mp3$/
}
```

**Forbidden in Cliente DTO:** `providerVoice`, `toneTags`, cost fields, vendor model strings.

### `resolveDefaultVoiceId({ preferredLocale, profileTone })`

**File:** `lib/tts/voice-catalog.ts`

**Inputs:**

| Field | Source |
|-------|--------|
| `preferredLocale` | `getCurrentUser().preferredLocale ?? "en"` at synthesize time (Operator session carries client locale in V1 self-tenant model) |
| `profileTone` | `getBusinessProfileForAgents(clientId).fields.tone?.description ?? ""` (lowercased for matching) |

**Keyword map (first match wins; deterministic; no LLM):**

| Substring in `profileTone` (case-insensitive) | Resolved id |
|-----------------------------------------------|-------------|
| `professional`, `formal`, `corporate`, `authoritative`, `serio`, `profesional` | `{locale}_professional_male` |
| `warm`, `friendly`, `approachable`, `gentle`, `cálid`, `amigable`, `cercan` | `{locale}_warm_female` |
| *(no match)* | `{locale}_warm_female` |

**Precedence at synthesize:**

1. If **`neuramark_visual_preferences.voice_id`** is non-null and ∈ catalog → use it.
2. Else → `resolveDefaultVoiceId({ preferredLocale, profileTone })`.

**No per-Reel voice override in V1** — prefs + server default only.

---

## CosyVoice2 adapter — `createSiliconflowCosyvoice2Adapter`

**File:** `lib/providers/tts/siliconflow-cosyvoice2-adapter.ts` (`import "server-only"`)

```ts
export function createSiliconflowCosyvoice2Adapter(params: {
  defaultUnitCostCents: number;
  envKeyName?: string; // default SILICONFLOW_API_KEY from catalog
  resolveCatalogVoice?: (voiceId: string) => TtsCatalogVoice;
  uploadAudioBuffer?: (args: {
    clientId: string;
    reelScriptId: string;
    buffer: Buffer;
    mimeType: string;
  }) => Promise<{ storageKey: string; sizeBytes: number }>;
  fetchImpl?: typeof fetch;
}): TtsProviderAdapter;
```

**Provider key:** `siliconflow_cosyvoice2` (readonly on adapter instance).

### REST contract (frozen)

| Item | Value |
|------|-------|
| Base URL | `https://api.siliconflow.cn/v1/audio/speech` (mirror `siliconflow-llm-adapter.ts` host) |
| Method | `POST` |
| Auth | `Authorization: Bearer ${process.env[envKeyName]}` |
| Missing key | Throw **`ProviderAdapterError(PROVIDER_CONFIG_MISSING, "Provider is not configured")`** before `fetch` |
| Content-Type request | `application/json` |
| Content-Type response | `audio/mpeg` (binary body) — treat as untrusted |

**Request body (JSON):**

```json
{
  "model": "FunAudioLLM/CosyVoice2-0.5B",
  "input": "<server-loaded voiceover_text>",
  "voice": "<catalog providerVoice for resolved catalog voiceId>",
  "response_format": "mp3",
  "speed": 1.0
}
```

**Response handling:**

| Step | Rule |
|------|------|
| Non-2xx | Log `{ providerKey, status, clientId, reelScriptId }` only — **never** Bearer token; throw **`ProviderAdapterError("PROVIDER_REQUEST_FAILED", sanitizeProviderErrorMessage(body))`** |
| 2xx body | Read as `ArrayBuffer` → `Buffer`; reject if `byteLength > TTS_MAX_AUDIO_BYTES` (**10_485_760** = 10 MiB) → **`ProviderAdapterError("PROVIDER_RESPONSE_INVALID", "Audio response too large")`** |
| MIME sniff | Require MP3 magic / `Content-Type` audio/mpeg; reject otherwise |
| Storage | Upload via injected helper; key **`neuramark/{clientId}/{reelScriptId}/{uuid}.mp3`** |
| Cost | `actualCostCents` = `estimateCost` result when vendor omits billing metadata (US-7.3 lean) |
| Duration | Optional `durationSec` from mp3 header when cheap; omit if parse fails |

### `estimateCost`

**Billing unit:** `per_1m_chars` from catalog (`unitCostCents: 1` in US-X.4 seed).

```ts
Math.max(1, Math.ceil((input.text.length / 1_000_000) * unitCostCents))
```

Uses **`voiceover_text`** char count at orchestration time (same as US-7.2 projection `ttsCharCount`).

### Registry

**File:** `lib/providers/create-provider-registry.ts`

- Register real adapter when catalog contains `siliconflow_cosyvoice2` and env key present.
- Extend **`buildBootstrapCatalog()`** with TTS row matching US-X.4 seed.
- **Do not** register ElevenLabs stub until catalog row `active = true`.

---

## Preferencias — voice picker

### Loader extension — `getVisualPreferencesForClient`

**Add to success shapes:**

```ts
voiceId: TtsVoiceId | null;
availableVoices: TtsVoiceOptionDto[];  // all catalog entries for picker
voicePickerVisible: boolean;
```

**`voicePickerVisible` server rule:**

| Condition | `voicePickerVisible` |
|-----------|---------------------|
| `allowedModes` includes `own_avatar` or `generic_avatar` | `true` |
| `allowedModes` includes `faceless` AND `facelessStyle.voice === "ai_voiceover"` | `true` |
| `allowedModes` is **only** `["faceless"]` AND `facelessStyle.voice ∈ { "none", "music_only" }` | `false` |
| `allowedModes` is **only** `["faceless"]` AND `facelessStyle.voice === "none"` | `false` |
| Default (mixed modes with AI voice path) | `true` |

When `voicePickerVisible === false`, FE hides section and shows i18n **`settings.preferences.voice.hiddenNoAiVoice`**.

**Select extension:** add `voice_id` to Supabase SELECT on `neuramark_visual_preferences`.

### Upsert extension — `upsertVisualPreferences`

**Input schema add:**

```ts
voiceId: ttsVoiceIdSchema.optional()
```

| Step | Rule |
|------|------|
| Auth | `requireActive("handler")` (unchanged US-3.1) |
| Forbidden keys | Preserve US-3.1 strip list **plus** `providerVoice`, `providerKey`, `provider_key`, `voice_id` (snake smuggle) |
| Validation | When `voiceId` present → `isAllowedVoiceId(voiceId)` else **`VALIDATION_ERROR`** |
| Persist | Map to `voice_id` column; nullable when omitted on upsert (do not clear unless explicit `null` — BUILD: optional field absent = leave unchanged; send `voiceId: null` to clear if FE supports) |
| Side effects | **No** synthesis, **no** provider calls (US-3.1 no-regen floor) |

**Success schema add:** `voiceId: TtsVoiceId | null`

### i18n (EN + ES)

- `settings.preferences.voice.*` — labels, section title, hidden explanation, save states
- `scripts.voiceover.*` — Operator generate/regenerate/status copy

---

## `insertVoiceoverMediaAsset`

**File:** `lib/media/insert-voiceover-media-asset.ts` (`import "server-only"`)

```ts
export async function insertVoiceoverMediaAsset(params: {
  clientId: string;
  reelScriptId: string;
  storedAsset: StoredMediaAsset;
  voiceId: TtsVoiceId;
  providerKey: string;
  supersedesAssetId?: string | null;
}): Promise<{ mediaAssetId: string } | null>;
```

**INSERT `neuramark_media_assets`:**

| Column | Value |
|--------|-------|
| `client_id` | Server-resolved from script row |
| `asset_type` | `voiceover` |
| `storage_key` | From `storedAsset.storageKey` |
| `metadata` | Allowlist below |

**`voiceoverAssetMetadataSchema`:**

```ts
{
  originalFilename: string;       // e.g. "voiceover.mp3"
  detectedMime: "audio/mpeg" | "audio/wav" | "audio/mp4";
  sizeBytes: number.int().positive();
  durationSec?: number.positive();
  source: "tts_synthesize";
  reelScriptId: uuid;
  voiceId: TtsVoiceId;
  providerKey: string;            // e.g. siliconflow_cosyvoice2 — not secret
  supersedesAssetId?: uuid;       // prior voiceover row when regenerate
}
```

**Forbidden in metadata:** raw vendor error bodies, API payloads, Bearer tokens, full `voiceover_text`.

---

## `synthesizeVoiceoverForReelScript`

**File:** `lib/tts/synthesize-voiceover-for-reel-script.ts` (`import "server-only"`)  
**Action file:** `lib/tts/actions/synthesize-voiceover-for-reel-script.ts` (`"use server"`)  
**Consumer:** `/operator/scripts` expand row — **Generate voiceover** / **Regenerate voiceover**

```ts
export async function synthesizeVoiceoverForReelScript(
  rawInput: unknown,
): Promise<SynthesizeVoiceoverForReelScriptResult>;
```

### Request — `synthesizeVoiceoverForReelScriptInputSchema`

```ts
{ reelScriptId: z.string().uuid() }  // .strict() — pointer only
```

### Orchestrator step table

| Step | Action |
|------|--------|
| 1 | **`requireOperator("handler")`** — first await; Cliente → **403** |
| 2 | Reject forbidden keys → **`FORBIDDEN_FIELDS`** |
| 3 | Parse `{ reelScriptId }`; Zod fail → **`VALIDATION_ERROR`** |
| 4 | Resolve `clientId = operator.id` (V1 self-tenant; must match script row) |
| 5 | **`loadReelScriptForVoiceover({ reelScriptId, clientId })`** — mirrors `loadReelScriptForVideoJob`: approved strategy, profile + visual prefs present; foreign/missing → **`NOT_FOUND`** (404 uniform) |
| 6 | Reject empty/whitespace `voiceover_text` → **`EMPTY_VOICEOVER_TEXT`**, no vendor I/O |
| 7 | Resolve catalog **`voiceId`**: prefs `voice_id` ?? `resolveDefaultVoiceId({ preferredLocale, profileTone })` |
| 8 | **`resolveProviderForJob({ clientId, assetRole: "tts", productionContext })`** — never client `providerKey`; Phase A must resolve **`siliconflow_cosyvoice2`**; fail → **`PROVIDER_UNAVAILABLE`** |
| 9 | Build **`resolvedSynthesizeSpeechInputSchema`**: `{ reelScriptId, clientId, providerKey, text: voiceover_text, voiceId, locale: preferredLocale }` |
| 10 | `adapter.estimateCost(resolvedInput)` |
| 11 | **`assertReelBudgetAllowsEstimatedSpend({ clientId, reelScriptId, estimatedCostCents, operatorClientId: operator.id, providerTier })`** — fail → **`BUDGET_EXCEEDED`**, no vendor call, no INSERT, no spend |
| 12 | Detect regenerate: latest `voiceover` asset for `(client_id, metadata.reelScriptId)` → sets `jobKind` **`tts_regenerate`** vs **`tts_generate`**; capture `supersedesAssetId` |
| 13 | **`adapter.synthesize(resolvedInput)`** → Storage + `StoredMediaAsset` |
| 14 | **`insertVoiceoverMediaAsset(...)`** — fail → **`INTERNAL_ERROR`**, no spend row |
| 15 | **`recordReelSpendEvent({ assetRole: "tts", jobKind, estimatedCostCents, actualCostCents: stored.actualCostCents, providerKey, operatorClientId, durationSec? })`** |
| 16 | Return success union |

### Success — `synthesizeVoiceoverForReelScriptSuccessSchema`

```ts
{
  ok: true;
  voiceoverAssetId: string;       // uuid — handoff to US-8.4 createTalkingHeadVideoJob
  reelScriptId: string;
  voiceId: TtsVoiceId;
  providerKey: "siliconflow_cosyvoice2";
  estimatedCostCents: number;
  actualCostCents: number;
  durationSec?: number;
  jobKind: "tts_generate" | "tts_regenerate";
}
```

**Forbidden on success response:** storage keys, raw audio URLs, API internals, `providerVoice`.

### Regenerate semantics (V1)

| Rule | Detail |
|------|--------|
| Row policy | **INSERT new** `media_assets` row; prior voiceover rows **orphaned** until future cleanup job |
| Detection | `SELECT id FROM neuramark_media_assets WHERE client_id = $1 AND asset_type = 'voiceover' AND metadata->>'reelScriptId' = $2 ORDER BY created_at DESC LIMIT 1` |
| Return | Always **latest** `voiceoverAssetId` from new INSERT |
| Metadata | Set optional `supersedesAssetId` on new row |
| Video jobs | Operator must pass **new** id into `createTalkingHeadVideoJob`; stale `voiceover_asset_id` on old jobs is Operator responsibility (US-8.4 ownership check still passes for old asset) |
| Budget | Each regenerate runs full cumulative gate — includes prior `tts_*` spend |

---

## Forbidden synthesis keys

Reject with **`FORBIDDEN_FIELDS`** (merge with `FORBIDDEN_BUDGET_SPEND_KEYS` + `FORBIDDEN_PROVIDER_AUTHORITY_KEYS` where applicable):

```
voiceId, voice_id, providerVoice, provider_voice,
providerKey, provider_key, tier, providerTier, provider_tier,
estimatedCostCents, estimated_cost_cents,
text, voiceoverText, voiceover_text, hook, body, cta,
clientId, client_id,
skipBudgetCheck, skip_budget_check, overrideBudget, override_budget,
policyId, policy_id, rules,
locale, preferredLocale, preferred_locale,
confirmGeneration, confirm_generation,
actualCostCents, actual_cost_cents
```

**Do not** accept **`synthesizeSpeechRequestSchema`** at the action boundary.

### Preferencias forbidden keys (added)

Extend `findForbiddenUpsertVisualPreferencesKeys` strip list:

```
providerVoice, provider_voice, providerKey, provider_key, voice_id
```

(`voiceId` camelCase is **allowed** when ∈ catalog.)

---

## Spend ledger extension

**File:** `lib/contracts/cost-policy.ts`

```ts
export const reelSpendJobKindSchema = z.enum([
  // ... existing ...
  "tts_generate",
  "tts_regenerate",
]);
```

**`recordReelSpendEvent` call (orchestrator success path only):**

```ts
{
  clientId,
  reelScriptId,
  assetRole: "tts",
  jobKind: "tts_generate" | "tts_regenerate",
  estimatedCostCents,
  actualCostCents: storedAsset.actualCostCents,
  durationSec: storedAsset.durationSec ?? null,
  operatorClientId: operator.id,
  providerKey: "siliconflow_cosyvoice2",
}
```

Blocked budget → **`neuramark_budget_events`** audit only (US-7.1) — **no** TTS vendor call, **no** spend row.

---

## Media serve route extension

**File:** `app/api/media/assets/[assetId]/route.ts`

Add branch for `asset_type === "voiceover"`:

| Rule | Detail |
|------|--------|
| Auth | **`requireOperator("handler")`** (mirror `generated_video` — US-11.1 may widen Cliente read later) |
| Tenancy | `row.client_id === operator.id` else **404** |
| MIME | `audio/mpeg`, `audio/wav`, `audio/mp4` from metadata `detectedMime` |
| Headers | `Cache-Control: private, no-store`; sanitized `Content-Disposition` |
| Metadata parse | `voiceoverAssetMetadataSchema` |

Static samples under `/tts-samples/*.mp3` remain **public** (no auth).

---

## Operator scripts FE contract

**Extend `getReelScriptsForWeekSuccessSchema`:**

```ts
voiceoverByReelScriptId: voiceoverSummaryByReelMapSchema;
// Record<reelScriptId, VoiceoverSummaryDto | null>
```

**`VoiceoverSummaryDto`:**

```ts
{
  voiceoverAssetId: string | null;  // latest by created_at for script
  voiceId: TtsVoiceId | null;       // from metadata when asset exists
  createdAt: string | null;
  canSynthesize: boolean;           // script package present + non-empty voiceover_text + approved strategy
  canRegenerate: boolean;           // canSynthesize && voiceoverAssetId != null
}
```

**Expand row UI (`/operator/scripts`):**

| Element | Behavior |
|---------|----------|
| Status | Missing / Ready — from `voiceoverByReelScriptId[scriptId]` |
| **Generate voiceover** | Calls `synthesizeVoiceoverForReelScript({ reelScriptId })` when `canSynthesize && !voiceoverAssetId` |
| **Regenerate voiceover** | Same action when `canRegenerate`; pending/error states |
| Handoff | On success, surface `voiceoverAssetId` for **Start video** / `createTalkingHeadVideoJob` (US-8.4) |
| Cost | No cost fields on this DTO — roll-ups stay on `reelCostRollups` (US-7.4) |

**Batch load:** `getVoiceoverSummariesForReelScripts({ clientId, reelScriptIds })` called from `getReelScriptsForWeek` after `requireOperator`.

---

## Error codes

**`ttsVoiceoverErrorCodeSchema`:**

| Code | When |
|------|------|
| `UNAUTHENTICATED` | No session |
| `FORBIDDEN` | Non-operator on synthesize |
| `NOT_FOUND` | Foreign / missing `reelScriptId` (404 uniform) |
| `VALIDATION_ERROR` | Zod / field errors |
| `FORBIDDEN_FIELDS` | Rejected authority keys |
| `EMPTY_VOICEOVER_TEXT` | Script row has empty `voiceover_text` |
| `BUDGET_EXCEEDED` | `assertReelBudgetAllowsEstimatedSpend` failed |
| `COST_POLICY_UNAVAILABLE` | Policy / ownership verify failed inside budget helper |
| `PROVIDER_UNAVAILABLE` | Inactive/missing TTS provider or adapter |
| `INTERNAL_ERROR` | Unexpected / INSERT failed after synthesize |

**Adapter-internal (orchestrator maps to `PROVIDER_UNAVAILABLE` or `INTERNAL_ERROR`):** `PROVIDER_CONFIG_MISSING`, `PROVIDER_REQUEST_FAILED`, `PROVIDER_RESPONSE_INVALID`.

---

## Fixtures (mock payloads)

### Preferencias loader snippet

```json
{
  "exists": true,
  "allowedModes": ["own_avatar", "faceless"],
  "facelessStyle": { "voice": "ai_voiceover", "onScreenText": "captions", "broll": "stock" },
  "voiceId": "en_warm_female",
  "availableVoices": [
    {
      "id": "en_warm_female",
      "labelKey": "settings.preferences.voice.enWarmFemale",
      "locale": "en",
      "sampleUrl": "/tts-samples/en_warm_female.mp3"
    }
  ],
  "voicePickerVisible": true,
  "genericAvatarId": null,
  "rules": { "must_disclose_not_owner": false },
  "updatedAt": "2026-08-30T16:00:00.000Z",
  "ownAvatarConsentActive": true
}
```

### Synthesize success

```json
{
  "ok": true,
  "voiceoverAssetId": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
  "reelScriptId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "voiceId": "en_warm_female",
  "providerKey": "siliconflow_cosyvoice2",
  "estimatedCostCents": 1,
  "actualCostCents": 1,
  "durationSec": 28.4,
  "jobKind": "tts_generate"
}
```

### Synthesize blocked (budget)

```json
{
  "ok": false,
  "error": {
    "code": "BUDGET_EXCEEDED",
    "messageKey": "scripts.voiceover.error.budgetExceeded"
  }
}
```

### Synthesize forbidden fields

```json
{
  "ok": false,
  "error": {
    "code": "FORBIDDEN_FIELDS",
    "messageKey": "scripts.voiceover.error.forbiddenFields"
  }
}
```

### Week batch voiceover map

```json
{
  "voiceoverByReelScriptId": {
    "f47ac10b-58cc-4372-a567-0e02b2c3d479": {
      "voiceoverAssetId": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
      "voiceId": "en_warm_female",
      "createdAt": "2026-08-30T16:05:00.000Z",
      "canSynthesize": true,
      "canRegenerate": true
    }
  }
}
```

---

## Out of scope (explicit)

- US-9.1 FFmpeg assembly · US-9.2 subtitles/logo/cover
- ElevenLabs real adapter (Phase B / P1)
- Inworld Mini adapter
- Cliente synthesis controls
- Custom voice clone / upload
- Live SiliconFlow HTTP in CI (mocked only)
- Weekly cycle auto-TTS (ADR-0001 integrations-engineer)
- Catalog / cost-policy CRUD
- Auto-TTS on US-5.1 script generate/regenerate

---

## Reviewed by FE

**Reviewed by FE** — 2026-08-30 (nextjs-frontend)

**Preferencias (`/settings/preferences`):** Extend `PreferencesEditor` / `PreferencesView` with a voice section when visible. Use server `voicePickerVisible` + `availableVoices[]` + `voiceId` from `getVisualPreferencesForClient`; during draft edits, mirror the CONTRACT visibility table from **draft** `allowedModes` + `facelessStyle.voice` (same pattern as faceless-style axes today). When hidden, render i18n `settings.preferences.voice.hiddenNoAiVoice` only — no client catalog. Picker: PrimeReact `RadioButton` or `Dropdown` over `availableVoices`; label via `labelKey` → `messages/{en,es}.json`. Sample playback: same-origin `<audio controls src={sampleUrl}>` per voice (public `/tts-samples/*.mp3` — no auth). Persist `voiceId` on existing `upsertVisualPreferences` save (optional field; omit = unchanged). No `providerVoice`, `toneTags`, or cost in UI.

**Operator scripts (`/operator/scripts`):** Batch `voiceoverByReelScriptId[scriptId]` on `getReelScriptsForWeek` — same override-map pattern as `videoJobsByReelScriptId`. New panel in `ReelDetailPanel` expand row (above `OperatorVideoJobSummaryPanel`): status Tag (missing / ready from `voiceoverAssetId`), optional `<audio controls src={/api/media/assets/{voiceoverAssetId}}>` when ready (operator cookie auth). **Generate voiceover** / **Regenerate voiceover** call `synthesizeVoiceoverForReelScript({ reelScriptId })` only — no budget confirm dialog (forbidden `confirmGeneration`); map `error.messageKey` when present else `error.code` → `scripts.voiceover.error.*`. On success, merge `voiceoverAssetId` + `voiceId` into local overrides; surface id for downstream `createTalkingHeadVideoJob` when that CTA ships (US-8.4 retry path exists; primary generate-video button still future). No cost on `VoiceoverSummaryDto` — roll-ups stay on `reelCostRollups`. Types in `lib/contracts/tts-voiceover.ts` + extensions to `visual-preferences.ts` / `reel-script.ts` per BUILD.

**i18n:** EN + ES under `settings.preferences.voice.*` (section title, four catalog labels, hidden explanation, save states) and `scripts.voiceover.*` (generate/regenerate labels, pending, status missing/ready, error codes). No Supabase in Client Components.

---

## Changelog

| Date | Change |
|------|--------|
| 2026-08-30 | Initial freeze — CosyVoice2 adapter, voice catalog, orchestrator, migration, Preferencias + Operator scripts surfaces; resolves SPEC-REVIEW + SECURITY gaps; Phase A only |
| 2026-08-30 | Reviewed by FE — nextjs-frontend signoff; BUILD unblocked for FE slice |
