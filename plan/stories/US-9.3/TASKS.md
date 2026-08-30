# US-9.3 — Text-to-speech for voiceover

**Priority:** P0  
**Depends on:** US-5.1 ✅ `voiceover_text` · US-X.4 ✅ `siliconflow_cosyvoice2` catalog · US-3.1 ✅ Preferencias · US-7.1 ✅ budget gate + spend ledger · US-14.5 ✅ auth gates. **Soft:** US-8.4 (video job `voiceoverAssetId` consumer).  
**Acceptance criteria:** `plan/USER_STORIES.md` § US-9.3 (source of truth — do **not** redefine; do **not** check off in PREP)  
**Implementers:** **media-pipeline-engineer** + **nextjs-backend** + **nextjs-frontend** (`docs/development/AGENT-ROSTER.md` Phase 4).  
**Canonical terms:** **voiceover** · **Preferencias de producción visual** · **Paquete de guion** · **provider key** · **download-and-own**. Avoid CONTEXT _Evitar_ list in product-facing copy.

## Out of scope (do not implement here)

- **US-9.1** FFmpeg assembly pipeline.
- **US-9.2** subtitles, logo, cover frame.
- **ElevenLabs** real adapter (catalog row inactive — stub/defer P1).
- **Inworld Mini** adapter (not in US-X.4 seed).
- **Cliente** voiceover generate controls (Operator-only synthesis).
- **Custom voice clone / upload**.
- **Live SiliconFlow** calls in CI (mocked HTTP only).
- **Weekly cycle auto-TTS** (integrations-engineer).
- **Catalog / cost-policy write APIs**.

## Scope split

| Concern | Owner |
|---------|--------|
| CosyVoice2 `TtsProviderAdapter` | **US-9.3** BE (media-pipeline-engineer) |
| Registry TTS registration | **US-9.3** BE |
| Closed voice catalog + samples | **US-9.3** BE + FE |
| `voice_id` on Preferencias (DB + upsert) | **US-9.3** DB/BE/FE |
| Voice picker UI + sample playback | **US-9.3** FE |
| `synthesizeVoiceoverForReelScript` orchestrator | **US-9.3** BE |
| Operator "Generate voiceover" on `/operator/scripts` | **US-9.3** FE/BE |
| TTS budget gate + spend events | **US-9.3** BE |
| `voiceover` `media_assets` INSERT | **US-9.3** BE |
| Video job wiring with `voiceoverAssetId` | **US-8.4** (consumes output) |
| TTS line in cost projection | **US-7.2** ✅ (unchanged) |
| Assembly audio mux | **US-9.1** |

## PO decisions (freeze in CONTRACT unless SECURITY / SPEC vetoes)

| Topic | Decision |
|-------|----------|
| Branch | **`feature/US-9.3-tts-voiceover`** |
| Adapter module | **`lib/providers/tts/siliconflow-cosyvoice2-adapter.ts`** (`import "server-only"`) |
| Factory | **`createSiliconflowCosyvoice2Adapter({ defaultUnitCostCents, uploadAudioBuffer?, fetchImpl? })`** |
| Provider key | **`siliconflow_cosyvoice2`** |
| Env | **`SILICONFLOW_API_KEY`** via `process.env[envKeyName]`; missing → **`ProviderAdapterError`** code `PROVIDER_CONFIG_MISSING` |
| Vendor API | SiliconFlow TTS REST (CONTRACT freezes URL, model `cosyvoice2`, request/response map) |
| `estimateCost` | **`per_1m_chars`** — `Math.max(1, Math.ceil((input.text.length / 1_000_000) * unitCostCents))` |
| `synthesize` input | **`resolvedSynthesizeSpeechInputSchema`** — `text`, `voiceId` (catalog id), `locale`, `reelScriptId`, `clientId`, `providerKey` |
| `synthesize` output | **`storedMediaAssetSchema`** — mp3 in Storage; **`actualCostCents`** from estimate if vendor silent |
| Storage key | **`neuramark/{clientId}/{reelScriptId}/{uuid}.mp3`** (relative; regex extended in migration) |
| Voice catalog module | **`lib/tts/voice-catalog.ts`** — export `TTS_VOICE_CATALOG`, `getVoiceById`, `listVoicesForLocale`, `isAllowedVoiceId` |
| V1 voice ids | **`en_warm_female`**, **`en_professional_male`**, **`es_warm_female`**, **`es_professional_male`** (CONTRACT may adjust labels; ids stable) |
| Samples | Static files **`public/tts-samples/{voiceId}.mp3`** (≤30s each); FE uses same-origin URL |
| `voice_id` column | **`neuramark_visual_preferences.voice_id text NULL`** — no DB CHECK enum (app Zod validates) |
| Default voice | When **`voice_id` null**: map **`preferred_locale`** + profile tone heuristic → catalog id (CONTRACT freezes heuristic table) |
| Preferencias upsert | Extend **`upsertVisualPreferencesInputSchema`** with optional **`voiceId`**; reject if not in catalog |
| Preferencias loader | Extend **`getVisualPreferencesForClient`** DTO with **`voiceId`** + **`availableVoices[]`** (id, labelKey, locale, sampleUrl) |
| Synthesis action | **`synthesizeVoiceoverForReelScript({ reelScriptId })`** — **`requireOperator("handler")`**; forbidden keys: `providerKey`, `estimatedCostCents`, `voiceId` override unless CONTRACT allows Operator regen with prefs voice only |
| Script input | Load **`voiceover_text`** from owned **`neuramark_reel_scripts`** row; reject empty text |
| Provider resolution | **`resolveProviderForJob({ assetRole: "tts", productionContext })`** — never client **`providerKey`** |
| Budget gate | **`assertReelBudgetAllowsEstimatedSpend`** immediately before **`adapter.synthesize`** |
| Spend event | **`recordReelSpendEvent({ assetRole: "tts", jobKind: "tts_generate" \| "tts_regenerate", estimatedCostCents, actualCostCents, providerKey })`** after successful INSERT |
| Job kinds | Add **`tts_generate`**, **`tts_regenerate`** to **`reelSpendJobKindSchema`** |
| Media helper | **`lib/media/insert-voiceover-media-asset.ts`** — `asset_type: voiceover`, metadata per CONTRACT |
| Serve audio | Reuse **`GET /api/media/assets/[assetId]`** — extend allowed response MIME for `audio/mpeg`, `audio/wav`, `audio/mp4` |
| Operator UI | **`/operator/scripts`** expand row: show voiceover asset status; **Generate voiceover** / **Regenerate** button; link **`voiceoverAssetId`** into existing video job CTA when present |
| Registry | **`createProviderRegistry`** registers CosyVoice2 when catalog contains key; update bootstrap catalog builder to include TTS row |
| High tier | **`elevenlabs_tts_high`** — no real body in BUILD; policy path documented for P1 |
| Tests | Mocked HTTP adapter tests; orchestrator unit tests; catalog validation; migration smoke |
| i18n | **`settings.preferences.voice.*`**, **`scripts.voiceover.*`** EN + ES |
| Implementers | **media-pipeline-engineer** (adapter) + **nextjs-backend** (CONTRACT, orchestrator, DB) + **nextjs-frontend** (picker + scripts CTA) |

### Catalog row (US-X.4 seed — do not change in US-9.3)

| Field | Value |
|-------|-------|
| `key` | `siliconflow_cosyvoice2` |
| `asset_role` | `tts` |
| `tier` | `low` |
| `active` | `true` |
| `env_key_name` | `SILICONFLOW_API_KEY` |
| `cost_model` | `{ "billingUnit": "per_1m_chars", "unitCostCents": 1, "metadata": { "model": "cosyvoice2" } }` |

### Adapter method sketch (CONTRACT freezes exact signatures)

```ts
// lib/providers/tts/siliconflow-cosyvoice2-adapter.ts
export function createSiliconflowCosyvoice2Adapter(params: {
  defaultUnitCostCents: number;
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

### Orchestrator sketch (CONTRACT freezes codes + DTOs)

```ts
// lib/tts/synthesize-voiceover-for-reel-script.ts
export async function synthesizeVoiceoverForReelScript(
  rawInput: unknown,
): Promise<
  | { ok: true; voiceoverAssetId: string; estimatedCostCents: number; durationSec?: number }
  | { ok: false; code: "VALIDATION_ERROR" | "BUDGET_EXCEEDED" | "FORBIDDEN" | "PROVIDER_UNAVAILABLE" | "SCRIPT_NOT_FOUND" | "EMPTY_VOICEOVER_TEXT" }
>;
```

### Migration sketch (CONTRACT freezes filename + constraints)

```sql
-- Extend enum
ALTER TYPE public.neuramark_media_asset_type ADD VALUE IF NOT EXISTS 'voiceover';

-- Relax storage_key CHECK for audio extensions (replace constraint)
-- voice_id on visual_preferences
ALTER TABLE public.neuramark_visual_preferences
  ADD COLUMN IF NOT EXISTS voice_id text NULL;
```

## Carry-forwards / reuse (do not reinvent)

- Interface: `lib/providers/provider-adapters.ts` — **`TtsProviderAdapter`** (US-8.1 / US-X.4).
- Contracts: `lib/contracts/providers.ts` — **`synthesizeSpeechRequestSchema`**, **`resolvedSynthesizeSpeechInputSchema`**, **`storedMediaAssetSchema`**.
- LLM HTTP pattern: `lib/providers/siliconflow-llm-adapter.ts` (Bearer auth, server-only fetch).
- Media insert: `lib/video-jobs/insert-generated-video-media-asset.ts` — mirror for voiceover.
- Upload/storage: `lib/media/upload-avatar-reference-asset.ts`, `MediaStorage` interface.
- Budget: `lib/cost-policy/assert-reel-budget-allows-estimated-spend.ts`, `record-reel-spend-event.ts`.
- Policy: `lib/providers/resolve-provider-for-job.ts` — TTS estimate already implemented.
- Preferencias: `components/preferences/PreferencesEditor.tsx`, `upsert-visual-preferences.ts`.
- Scripts UI: `components/scripts/ScriptsPageView.tsx` — extend expand row.
- Security baseline: `plan/SECURITY_BASELINE.md`; US-7.1 SECURITY.md cumulative gate pattern.

---

## FE checklist

Concrete BE consumers: extended Preferencias loader; `upsertVisualPreferences` with `voiceId`; `synthesizeVoiceoverForReelScript` action; `GET /api/media/assets/[assetId]` for synthesized playback.

- [ ] **Voice picker** on `/settings/preferences`: list catalog voices (label from i18n keys); locale grouping or filter optional.
- [ ] **Play sample** per voice — `<audio controls>` or PrimeReact button + hidden audio; sample URL from server DTO (`/tts-samples/{id}.mp3` or equivalent).
- [ ] **Save `voiceId`** with Preferencias form; show current selection after load.
- [ ] **Hide picker** when faceless-only with **`faceless_style.voice === "music_only"`** (no AI voiceover path).
- [ ] **Operator scripts** expand row: voiceover generation status (missing / ready); **Generate voiceover** / **Regenerate** with pending/error states.
- [ ] **No recording UX** — copy reinforces AI voice only (CONTEXT).
- [ ] EN + ES: **`settings.preferences.voice.*`**, **`scripts.voiceover.*`**.
- [ ] No Supabase in Client Components; no raw vendor voice ids in UI.

---

## BE checklist

Concrete FE consumers: Preferencias loader/action; scripts page action; media serve route for audio.

- [ ] **`lib/providers/tts/siliconflow-cosyvoice2-adapter.ts`** — implement **`TtsProviderAdapter`**.
- [ ] **`estimateCost`** — `per_1m_chars` from catalog unit cost.
- [ ] **`synthesize`** — map catalog `voiceId` → provider param; POST SiliconFlow; decode audio; Storage upload; return **`storedMediaAssetSchema`**.
- [ ] **Register adapter** in **`createProviderRegistry`**; extend **`buildBootstrapCatalog()`** with TTS row.
- [ ] **`lib/tts/voice-catalog.ts`** — closed catalog + validation helpers.
- [ ] **Migration** — `voiceover` enum value; audio `storage_key` regex; **`voice_id`** column on Preferencias.
- [ ] **`lib/media/insert-voiceover-media-asset.ts`** — INSERT `neuramark_media_assets`.
- [ ] **`lib/tts/synthesize-voiceover-for-reel-script.ts`** — orchestrator with policy + budget + adapter + INSERT + spend event.
- [ ] **Extend `reelSpendJobKindSchema`** — `tts_generate`, `tts_regenerate`.
- [ ] **Extend `upsertVisualPreferences`** — validate `voiceId` against catalog; persist column.
- [ ] **Extend `getVisualPreferencesForClient`** — return `voiceId` + voice list for picker.
- [ ] **Extend media serve route** — audio MIME types for `voiceover` assets.
- [ ] **Commit sample MP3s** under `public/tts-samples/` (or CONTRACT alternate).
- [ ] **[SEC] `server-only`** on adapter, catalog, orchestrator; API key never logged/returned.
- [ ] **[SEC] `voiceId` allowlist** on upsert and synthesize (prefs voice only — no request override of arbitrary vendor ids).
- [ ] **[SEC] Budget gate** before vendor I/O; spend row only on success.
- [ ] **[SEC] Tenancy** — script/asset queries scoped to `getCurrentUser()` client id.
- [ ] **`lib/providers/tts/siliconflow-cosyvoice2-adapter.test.ts`** — mocked HTTP round-trip.
- [ ] **Orchestrator tests** — budget block, empty voiceover text, happy path with mocked adapter.
- [ ] **Registry test** — `getTtsAdapter("siliconflow_cosyvoice2")` returns real adapter.

---

## DB checklist

All objects keep `neuramark_` prefix.

- [ ] **Extend `neuramark_media_asset_type`** — add **`voiceover`**.
- [ ] **Update `neuramark_media_assets.storage_key` CHECK** — allow `.mp3`, `.wav`, `.m4a` (keep UUID + relative key rules).
- [ ] **Add `neuramark_visual_preferences.voice_id`** — nullable `text`; COMMENT documents app-level catalog validation.
- [ ] **No new tables** — voice catalog is code config V1.
- [ ] RLS deny-by-default unchanged; service-role Node only.
- [ ] Suggested filename: `supabase/migrations/YYYYMMDDHHMMSS_neuramark_tts_voiceover.sql`.

---

## Gates (orchestrator)

- [ ] SPEC-REVIEW.md (spec-guardian)
- [ ] SECURITY.md (security-architect)
- [ ] CONTRACT.md authored (nextjs-backend — frozen; **Reviewed by FE** line required)
- [ ] BUILD (media-pipeline-engineer + nextjs-backend + nextjs-frontend)
- [ ] VALIDATION.md (requirements-validator)
- [ ] QA.md (qa-engineer)

**Status:** PREP — awaiting SECURITY + CONTRACT before BUILD.

---

## Open questions (for SPEC / SECURITY / CONTRACT)

1. **SiliconFlow TTS endpoint path?** **PO lean:** mirror LLM host `api.siliconflow.cn` — CONTRACT documents exact path + model id for CosyVoice2.
2. **Raw `fetch` vs SDK?** **PO lean:** **`fetch`** (same as `siliconflow-llm-adapter.ts`).
3. **Regenerate deletes prior voiceover row?** **PO lean:** **insert new row**; old rows orphaned until cleanup job (V1) — video job points to latest id returned by action. CONTRACT may add soft superseded metadata.
4. **Operator can pick voice per Reel vs prefs only?** **PO lean:** **prefs only in V1** — no per-Reel voice override (reduces SEC surface). Regenerate uses current prefs `voice_id`.
5. **Duration metadata on voiceover asset?** **PO lean:** parse from mp3 header when cheap; optional in metadata; not blocking.
6. **`tts_regenerate` vs always `tts_generate`?** **PO lean:** use **`tts_regenerate`** when a prior `voiceover` asset exists for same `reel_script_id` (query latest by metadata.reelScriptId or CONTRACT link column).
7. **ElevenLabs stub in registry?** **PO lean:** **omit** until row activated — `getTtsAdapter` throws for unknown keys (same as video stubs pattern).
8. **Sample files in repo vs generated on deploy?** **PO lean:** **committed static MP3s** in `public/tts-samples/` (~4 small files).
9. **Profile tone heuristic?** **PO lean:** simple map: `professional` → `*_professional_male`; default warm female per locale; CONTRACT table.
10. **Partial AC if ElevenLabs inactive?** **PO lean:** **yes** — VALIDATION closes CosyVoice2 + prefs + budget paths; ElevenLabs AC deferred until catalog activation (note in VALIDATION.md).

No SPEC amendment assumed in PREP: SPEC §3 assembly expects CosyVoice2 low TTS + EN/ES catalog — US-9.3 delivers synthesis + storage; US-9.1 consumes asset.
