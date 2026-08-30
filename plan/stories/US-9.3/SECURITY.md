# Security Design Review — US-9.3

**Story:** US-9.3 — Text-to-speech for voiceover  
**Date:** 2026-08-30  
**Reviewer:** security-architect  
**Sources:** `plan/USER_STORIES.md` (US-9.3 `[SEC]` + AC), `plan/stories/US-9.3/README.md`, `TASKS.md`, `plan/SECURITY_BASELINE.md` (Media Assembly / provider boundary), `plan/stories/US-3.1/SECURITY.md` (Preferencias mutation + IDOR), `plan/stories/US-7.1/SECURITY.md` (budget gate + spend authority), `plan/stories/US-5.1/SECURITY.md` (Operator-gated synthesis + forbidden fields), `plan/stories/US-X.4/SECURITY.md` (catalog + no client `provider_key`), `plan/stories/US-8.4/SECURITY.md` (voiceover asset ownership), `lib/contracts/providers.ts` (`TtsProviderAdapter`, `synthesizeSpeechRequestSchema`), `lib/providers/siliconflow-llm-adapter.ts` (Bearer + server-only fetch pattern), `lib/cost-policy/assert-reel-budget-allows-estimated-spend.ts`, `app/api/media/assets/[assetId]/route.ts`  
**Status:** Binding for implementing agents; validated by requirements-validator like any other acceptance criterion. Do not treat this file as CONTRACT.md. Do not check off `USER_STORIES.md` AC here.

---

## Verdict: APPROVE WITH CONDITIONS

The story shape is correct: **Operator-gated** synthesis from server-loaded **`voiceover_text`** on an owned **`neuramark_reel_scripts`** row; **Cliente-gated** Preferencias upsert for **`voice_id`** against a **closed server catalog** (`lib/tts/voice-catalog.ts` — not DB, not client-writable); **server-only** CosyVoice2 adapter behind **`SILICONFLOW_API_KEY`**; **policy-resolved** `provider_key` via **`resolveProviderForJob({ assetRole: "tts" })`** — never client authority; **mandatory budget gate** (`assertReelBudgetAllowsEstimatedSpend`) immediately before vendor I/O; **spend ledger** row only after successful synthesize + **`media_assets`** INSERT; persisted audio under **server-generated storage keys** with **ownership-checked serve**; static voice **samples** in `public/tts-samples/` (no secrets, no tenancy).

No REDESIGN. No veto of PO lean defaults (CosyVoice2 low tier only in BUILD; prefs-only voice selection V1 — no per-Reel override; Operator trigger on `/operator/scripts`; insert-new voiceover row on regenerate; ElevenLabs stub deferred; mocked HTTP CI only; hardcoded local Operator OK until auth universal). Orchestrator may proceed to **CONTRACT.md** after freezing the items below.

**Inherited floors (US-3.1 / US-7.1 / US-5.1 / US-X.4 / US-14.5 / US-8.4 — do not weaken):** `requireOperator()` calls `requireActive()` first; role never from request; handler-level gates mandatory on synthesis; `client_id` server-resolved only on all spend and asset paths; catalog via `getProviderCatalog()` + policy only; `provider_key` / `tier` / `estimatedCostCents` never client-authoritative; RLS deny-by-default on `neuramark_media_assets` and `neuramark_visual_preferences`; service-role Node only; no `@supabase/supabase-js` in Client Components; Preferencias upsert remains Server Action + `.strict()` + arity-0 identity (US-3.1); cumulative budget gate architecture from US-7.1; downstream video jobs consume `voiceoverAssetId` with **server-side ownership check** (US-8.4).

**This story owns:** Real **`siliconflow_cosyvoice2`** `TtsProviderAdapter`; closed **`lib/tts/voice-catalog.ts`**; migration (`voiceover` asset type, audio `storage_key` CHECK, `voice_id` on Preferencias); **`synthesizeVoiceoverForReelScript`** orchestrator; Operator Server Action + `/operator/scripts` UI trigger; Preferencias **`voiceId`** upsert validation + picker FE; **`insertVoiceoverMediaAsset`**; extend **`reelSpendJobKindSchema`** with `tts_generate` / `tts_regenerate`; extend media serve route for **`voiceover`** audio MIME; security tests for catalog allowlist, forbidden synthesis fields, operator gate, budget block before I/O, tenancy/IDOR, API key non-exposure, adapter server-only boundary.

**This story does not own:** FFmpeg assembly (US-9.1); subtitles/logo/cover (US-9.2); ElevenLabs real adapter body (P1); weekly cycle auto-TTS (integrations-engineer); Cliente-facing voiceover generate controls; custom voice clone / upload; catalog or cost-policy CRUD; QA synthetic-voice disclosure UI (US-10.1 consumes assets); auth redesign; operator cost fields on Cliente surfaces (US-7.4).

**Terminology:** **voiceover** · **Preferencias de producción visual** · **Paquete de guion** · **provider key** · **download-and-own**. Technical names `synthesizeVoiceoverForReelScript`, `isAllowedVoiceId`, `assertReelBudgetAllowsEstimatedSpend`, `requireOperator` are canonical. Do not expose raw vendor voice parameter strings in UI or Cliente DTOs.

---

### Threat Summary (US-9.3–specific)

| Threat | Impact | Mitigation in this story |
|---|---|---|
| **Client sends arbitrary vendor `voice_id` / `providerVoice` for cloning or billing surprise** | Voice-cloning misuse; unexpected SiliconFlow charges | Closed **`TTS_VOICE_CATALOG`** server-only; Preferencias upsert validates `voiceId` ∈ catalog ids; synthesize resolves voice from **prefs + server default heuristic only** — **no** request `voiceId` override in V1. Adapter maps catalog id → fixed `providerVoice` param internally |
| **Client sends `providerKey`, `tier`, or `estimatedCostCents` on synthesize** | Force high tier or skip budget | Synthesis action input **`{ reelScriptId }` only** (CONTRACT exact); forbidden fields → **`FORBIDDEN_FIELDS`**. Server resolves provider via policy + catalog; estimate via adapter `estimateCost` on server-loaded text |
| **Direct call to synthesize bypasses budget gate** | Uncontrolled TTS spend | **`assertReelBudgetAllowsEstimatedSpend`** runs inside orchestrator **after** identity + script load + estimate, **before** `adapter.synthesize`. No vendor I/O on block. UI button disable is not the control |
| **Cliente triggers TTS synthesis** | Burn vendor budget without Operator review | **`synthesizeVoiceoverForReelScript`** calls **`requireOperator("handler")`** as **first** await. Cliente → **403**, no vendor call |
| **IDOR via `reelScriptId` or `voiceoverAssetId`** | Synthesize or read another tenant's script/audio | Script load **`WHERE id = $reelScriptId AND client_id = $serverClientId`**; foreign/missing → **404** uniform. Media serve checks **`client_id`** match after auth gate |
| **`SILICONFLOW_API_KEY` in client bundle, response, logs, or metadata** | Direct financial abuse of TTS API | Adapter + orchestrator **`import "server-only"`**; key from `process.env[envKeyName]` only; missing key → **`ProviderAdapterError`** before network; never log Bearer token or full request bodies with key |
| **Client overrides `voiceover_text` in synthesize payload** | Inject harmful/extremely long text into TTS | Text loaded **only** from owned script row **`voiceover_text`**; synthesize schema **excludes** `text`, `voiceoverText`, `hook`, etc. Max length enforced at script persist (US-5.1) and adapter schema (**50_000** cap in `resolvedSynthesizeSpeechInputSchema`) |
| **Smuggled `clientId` on synthesis boundary** | Cross-tenant synthesize | Action arity: **`reelScriptId` pointer only**; `clientId` from **`getCurrentUser()`** / operator-resolved tenant — **never** from `synthesizeSpeechRequestSchema`-style client body. CONTRACT must not expose `clientId` as client-writable on the action |
| **Unauthenticated / inactive Preferencias or synthesis** | Anonymous mutate voice prefs or trigger spend | Preferencias: **`requireActive("handler")`** (US-3.1). Synthesis: **`requireOperator`**. Inactive → **403** |
| **Mass assignment on Preferencias upsert (`providerVoice`, `rules`, tenant ids)** | Bypass catalog or legal flags | Extend upsert with optional **`voiceId`** only; Zod **`.strict()`**; reject `providerVoice`, `providerKey`, `rules`, `client_id`, unknown keys (US-3.1 strip list preserved) |
| **Serving voiceover audio without ownership check** | Cross-tenant audio leak | **`GET /api/media/assets/[assetId]`** extended for `asset_type = voiceover` with same pattern as existing types: auth gate + **`row.client_id === user.id`** → else **404**. V1 lean: **Operator session** for synthesized voiceover (mirrors `generated_video`); static samples in `public/` need no auth |
| **Untrusted vendor response (oversized/malformed audio)** | DoS, memory exhaustion, stored XSS via metadata | Treat SiliconFlow response as untrusted: max audio size cap (CONTRACT freezes, recommend **≤ 10 MiB** per voiceover); validate MIME/sniff before Storage put; metadata from server-computed fields only — no raw vendor HTML in metadata |
| **SSRF via adapter URL** | Server fetches attacker URL | Adapter uses **fixed SiliconFlow base URL** (CONTRACT frozen); no client-supplied URLs in TTS path |
| **Path traversal in storage key** | Read/write arbitrary files | Server-generated key **`neuramark/{clientId}/{reelScriptId}/{uuid}.mp3`** only; regex CHECK on INSERT; no `..` or absolute paths |
| **Spend row on failed synthesize or blocked budget** | Ledger drift; false cumulative totals | **`recordReelSpendEvent`** only **after** successful Storage upload + **`media_assets`** INSERT. Blocked budget → audit via existing **`neuramark_budget_events`** (US-7.1), **no** TTS vendor call, **no** spend row |
| **Auto-TTS on script generate (US-5.1)** | Silent spend without Operator confirm | **Explicit non-goal:** synthesis is Operator button on `/operator/scripts` only — no hook from script LLM job |
| **Regenerate spam / retry without cumulative budget** | Margin burn | Regenerate uses **`tts_regenerate`** job kind; same cumulative gate sums prior TTS + all Reel spend; each attempt gated independently |

**Residual risk accepted:** Operator trust model — Operator can synthesize for server-resolved client (V1: self). Closed catalog limits voice-cloning surface but cannot prevent vendor-side misuse if API key is compromised — key rotation is ops. Profile tone heuristic for default voice is server-only convenience, not a security control. Orphaned voiceover rows on regenerate are a storage hygiene issue, not IDOR, if serve route enforces ownership. Full Cliente preview of synthesized voiceover at approval (US-11.1) may require widening serve auth — defer to US-11.1; V1 Operator-only serve for `voiceover` assets is acceptable. ElevenLabs high-tier path documented but inactive — no BUILD body.

---

## Assets and Trust Boundaries

| Asset | Sensitivity | Trust boundary |
|---|---|---|
| `SILICONFLOW_API_KEY` | **Critical** — direct TTS financial abuse | Server env only via catalog `envKeyName`; never client/response/logs |
| `lib/tts/voice-catalog.ts` | **High** — maps product voice → vendor param | **`import "server-only"`**; never imported from Client Components; FE receives id + label keys + sample URLs only |
| `neuramark_visual_preferences.voice_id` | Medium — production preference | Cliente upsert with catalog validation; nullable; server default when null at synthesize |
| `neuramark_reel_scripts.voiceover_text` | Medium–High — **TTS input** | Loaded server-side from owned script row; never synthesis-request authority |
| Synthesized voiceover bytes | Medium — tenant content | Storage outside web root; ownership-checked serve; server-generated keys |
| `neuramark_reel_spend_events` (TTS lines) | **High** — margin ledger | Append on success only; `asset_role: "tts"`; server-computed costs |
| Static `public/tts-samples/*.mp3` | Low — marketing samples | Same-origin public; no PII; fixed filenames per catalog id |
| Provider catalog `cost_model` (TTS) | High (inherited US-X.4) | Read via `getProviderCatalog()` only; feeds `estimateCost` |

**Boundaries:**

1. **Browser (Cliente) → Preferencias Server Action** — Untrusted. May send **`voiceId`** ∈ known catalog ids only (validated server-side). CSRF via Server Action origin check. **`requireActive("handler")`**. No `providerVoice`, no `client_id` authority (US-3.1).
2. **Browser (Operator) → `synthesizeVoiceoverForReelScript`** — Untrusted. Sends **`reelScriptId`** only. **`requireOperator("handler")` first**. No text, voice, provider, estimate, or tenant fields.
3. **Orchestrator → policy + budget + adapter → SiliconFlow → Storage → Postgres** — Policy load and budget gate **before** outbound TTS. Adapter downloads/ decodes vendor audio → **download-and-own** in our Storage (SECURITY_BASELINE provider hygiene).
4. **Browser → `GET /api/media/assets/[assetId]`** (voiceover) — Session required; ownership match; **404** on foreign id (no enumeration oracle).
5. **Browser → `/tts-samples/{voiceId}.mp3`** — Public static samples; filenames must match catalog ids only (no user-controlled path segments).
6. **Downstream US-8.4 video job** — Consumes **`voiceoverAssetId`** returned by synthesize; orchestrator verifies asset **`client_id`** + `asset_type = voiceover` before FK write (US-8.4 floor — not weakened here).

---

## Abuse Cases Considered

- *As a malicious actor, I can POST `{ voiceId: "clone_victim_voice_xyz" }` on Preferencias or synthesize* → **Blocked:** upsert rejects ids ∉ `TTS_VOICE_CATALOG`; synthesize ignores client voice — uses prefs/default only.
- *As a malicious actor, I can POST `{ providerKey: "elevenlabs_tts_high" }` or `{ tier: "high" }` on synthesize* → **Blocked:** forbidden fields; server `resolveProviderForJob({ assetRole: "tts" })`.
- *As a malicious actor, I can POST `{ estimatedCostCents: 0 }` to pass the budget check* → **Blocked:** forbidden field; gate uses adapter `estimateCost` on server-loaded text.
- *As a malicious actor, I can call synthesize directly without clicking Operator UI* → **Blocked:** budget gate + `requireOperator` inside handler; no vendor I/O until gate passes.
- *As a Cliente, I can invoke `synthesizeVoiceoverForReelScript` and burn TTS budget* → **Blocked:** `requireOperator` → **403**.
- *As a malicious actor, I can POST `{ reelScriptId: "<victim-uuid>" }`* → **Blocked:** script SELECT includes server-resolved `client_id`; foreign → **404**.
- *As a malicious actor, I can POST `{ text: "..." }` with 1M chars to inflate TTS cost* → **Blocked:** text not in action schema; loaded from script row with existing max; adapter input capped at **50_000** chars.
- *As a malicious actor, I can POST `{ clientId: "<victim-uuid>", reelScriptId: "..." }`* → **Blocked:** synthesis action rejects `clientId` / uses server identity only.
- *As a malicious actor, I can read another client's voiceover via asset UUID* → **Blocked:** serve route auth + `client_id` match → **404**.
- *As a malicious actor, I can fetch `../../etc/passwd` via sample URL* → **Blocked:** static paths from server DTO (`/tts-samples/{catalogId}.mp3`); catalog ids are fixed enums; no user path segments.
- *As a malicious actor, I trigger synthesize on draft script without approved strategy* → **Blocked:** orchestrator requires approved strategy + non-empty `voiceover_text` (PO precondition); reject before vendor I/O.
- *As a malicious actor, I regenerate voiceover 20 times to blow margin while each char estimate is under cap* → **Blocked:** cumulative **`assertReelBudgetAllowsEstimatedSpend`** sums all Reel spend including prior `tts_*` events.
- *As a malicious actor, I import the CosyVoice2 adapter in a Client Component* → **Blocked:** `import "server-only"`.
- *As a malicious actor, I add RLS SELECT on `neuramark_media_assets` for authenticated* → **Blocked:** migration keeps zero policies; review rejects.

---

## Security Acceptance Criteria

Story `[SEC]` items from `plan/USER_STORIES.md` → US-9.3 are binding. Items marked **(added)** are new in this review — paste into the story when the PO next edits USER_STORIES.

**Inherited (still binding — do not weaken adjacent auth / catalog / budget / Preferencias paths):**

- [ ] **[SEC] Every operator-only gate lives inside the Server Action / Route Handler itself** as `requireOperator()` on the `getCurrentUser()` result; middleware and UI hiding are convenience only *(US-14.5)*
- [ ] **[SEC] `requireOperator()` runs `requireActive()` first** — inactive operator has no access *(US-14.5)*
- [ ] **[SEC] RLS stays enabled with zero policies** on `neuramark_media_assets` and `neuramark_visual_preferences`; privileged access via Node service-role only *(US-14.5 / US-3.1)*
- [ ] **[SEC] Service-role key is used only from Node server modules** — never Client Components, never Edge middleware *(US-14.5)*
- [ ] **[SEC] Job-creation / synthesis schemas must not accept client-authoritative `provider_key`, `providerKey`, `providerTier`, `tier`, or `estimatedCostCents`** — server resolves via policy + catalog *(US-X.4 / US-7.2)*
- [ ] **[SEC] The budget check runs server-side inside the job-creation path; a direct call to the generation endpoint with a crafted payload cannot skip it** *(US-7.1 — applies to TTS synthesize orchestrator)*
- [ ] **[SEC] Preferencias mutation is Server Action only with `requireActive("handler")`, Zod `.strict()`, and no `client_id` authority** *(US-3.1)*

**US-9.3 story `[SEC]` (existing in USER_STORIES.md):**

- [ ] **[SEC] `voice_id` is validated server-side against the offered catalog (no arbitrary provider voice IDs from the client — guards against voice-cloning misuse and unexpected billing)** *(USER_STORIES US-9.3)*
- [ ] **[SEC] TTS provider key is server-only, and TTS spend is counted in the Reel's cumulative budget check (US-7.1)** *(USER_STORIES US-9.3)*

**Added in this review (binding for US-9.3 BUILD):**

- [ ] **[SEC] (added) Closed voice catalog module `lib/tts/voice-catalog.ts` uses `import "server-only"`** and exports allowlist helpers (`isAllowedVoiceId`, `getVoiceById`, `listVoicesForLocale`). **`providerVoice`** (vendor param) never appears in Cliente DTOs, Preferencias responses, or browser bundles — only stable catalog **`id`** + i18n label keys + public sample URL
- [ ] **[SEC] (added) Preferencias upsert validates optional `voiceId` with `isAllowedVoiceId`**; unknown id → validation error, no DB write. Reject client `providerVoice`, `providerKey`, `voice_id` snake_case alias smuggling via `.strict()` forbidden-key detection (CONTRACT lists exact forbidden keys)
- [ ] **[SEC] (added) `synthesizeVoiceoverForReelScript` input schema accepts `{ reelScriptId }` only** (UUID). **Reject** (forbidden fields): `voiceId`, `voice_id`, `providerVoice`, `providerKey`, `provider_key`, `tier`, `providerTier`, `estimatedCostCents`, `estimated_cost_cents`, `text`, `voiceoverText`, `clientId`, `client_id`, `skipBudgetCheck`, `overrideBudget`, `policyId`, and equivalents → **`FORBIDDEN_FIELDS`**
- [ ] **[SEC] (added) Synthesis voice resolution is server-only:** load Preferencias `voice_id` for script's `client_id`; if null, apply CONTRACT-frozen locale + tone heuristic → catalog id; map to `providerVoice` inside adapter only. **No per-Reel voice override** in V1
- [ ] **[SEC] (added) `synthesizeVoiceoverForReelScript` calls `requireOperator("handler")` as first await** before script load, estimate, budget gate, or vendor I/O. Cliente/unauthenticated → **403** / **401**, no side effects
- [ ] **[SEC] (added) Orchestrator loads `voiceover_text` from owned `neuramark_reel_scripts` row only** after tenancy + approved-strategy preconditions; empty text → **`EMPTY_VOICEOVER_TEXT`**, no vendor call
- [ ] **[SEC] (added) Provider resolution via `resolveProviderForJob({ assetRole: "tts", productionContext })`** using server policy + catalog — never request `providerKey`. Missing/inactive TTS row or missing env key → **`PROVIDER_UNAVAILABLE`** / **`ProviderAdapterError`** before network
- [ ] **[SEC] (added) `assertReelBudgetAllowsEstimatedSpend` runs immediately before `adapter.synthesize`** with adapter `estimateCost` on resolved input. **`BUDGET_EXCEEDED`** → no SiliconFlow call, no `media_assets` INSERT, no `recordReelSpendEvent`. Uses same cumulative Reel SUM architecture as US-7.1 / US-8.4
- [ ] **[SEC] (added) `recordReelSpendEvent` for TTS only after successful Storage upload + `insertVoiceoverMediaAsset`** with `assetRole: "tts"`, `jobKind: "tts_generate" | "tts_regenerate"`, server-computed `estimatedCostCents` / `actualCostCents`. Extend **`reelSpendJobKindSchema`** — no ad-hoc job kind strings
- [ ] **[SEC] (added) CosyVoice2 adapter `lib/providers/tts/siliconflow-cosyvoice2-adapter.ts` is `import "server-only"`**; reads `SILICONFLOW_API_KEY` from env via catalog; missing key → **`PROVIDER_CONFIG_MISSING`** before fetch; Bearer token never logged, returned, or stored in metadata
- [ ] **[SEC] (added) Adapter uses fixed SiliconFlow TTS URL** (CONTRACT frozen — no client URL parameters); treats response body as untrusted binary with max size cap; uploads via injected Storage helper with server-generated storage key matching migration regex
- [ ] **[SEC] (added) `insertVoiceoverMediaAsset` sets `asset_type = voiceover`, `client_id` from server, metadata allowlist** (`source: "tts_synthesize"`, `reelScriptId`, `voiceId`, `providerKey`, mime/size/duration) — no raw vendor error bodies or API payloads in jsonb
- [ ] **[SEC] (added) Media serve route extension for `voiceover`:** UUID validation; **`requireOperator("handler")`** for synthesized assets in V1 (mirror `generated_video`); **`row.client_id === operator.id`** else **404**; audio MIME allowlist (`audio/mpeg`, `audio/wav`, `audio/mp4`); `Cache-Control: private, no-store`; sanitize `Content-Disposition` filename
- [ ] **[SEC] (added) Static samples under `public/tts-samples/{catalogId}.mp3` only** — catalog ids are fixed enums; FE must not construct sample paths from free-text user input
- [ ] **[SEC] (added) No auto-TTS hook from US-5.1 script generate/regenerate** — synthesis is explicit Operator action only; automated test or static analysis proves script job modules do not call TTS orchestrator
- [ ] **[SEC] (added) Downstream `voiceoverAssetId` handoff:** return id from synthesize action only after INSERT; US-8.4 consumers must re-verify asset ownership server-side (inherited — document in CONTRACT cross-ref)
- [ ] **[SEC] (added) Do not log full `voiceover_text`, API keys, or audio buffers in production** — static codes / ids / char counts only
- [ ] **[SEC] (added) Automated security tests cover at least:** unknown `voiceId` on upsert rejected; synthesize with forbidden `providerKey` / `voiceId` / `text` / `estimatedCostCents` rejected; Cliente **403** on synthesize; foreign `reelScriptId` **404**; budget block prevents mocked fetch; spend row absent on block; spend row present on success; adapter module not importable from client test harness; serve foreign asset **404**; catalog `providerVoice` absent from Preferencias loader DTO

---

## Design Concerns and Required Changes

### Frozen design choices (must land in CONTRACT)

#### 1. Voice catalog — **closed server allowlist** (APPROVE)

| Rule | Detail |
|---|---|
| Source | **`lib/tts/voice-catalog.ts`** — code config V1, not DB, not client-writable |
| Client input | Stable **`voiceId`** tokens only (e.g. `en_warm_female`) |
| Vendor param | **`providerVoice`** mapped inside adapter; never accepted from browser |
| FE exposure | `id`, `labelKey`, `locale`, `sampleUrl` — no vendor strings |

**Condition:** CONTRACT freezes catalog id enum and V1 minimum four voices (2 EN, 2 ES).

#### 2. Synthesis boundary — **Operator + pointer-only input** (APPROVE)

| Rule | Detail |
|---|---|
| Action input | **`{ reelScriptId: uuid }` only** |
| Identity | `clientId` from server session / operator-resolved tenant |
| Text + voice | Loaded server-side from script row + Preferencias |
| Gate order | `requireOperator` → load script → resolve provider → estimate → **`assertReelBudgetAllowsEstimatedSpend`** → synthesize |

**Condition:** Do **not** wire `synthesizeSpeechRequestSchema` (which includes `clientId` + `voiceId`) directly as the Server Action input schema — use a minimal orchestrator schema; internal adapter uses `resolvedSynthesizeSpeechInputSchema`.

#### 3. Budget + spend — **US-7.1 pattern** (APPROVE)

| Rule | Detail |
|---|---|
| Gate | `assertReelBudgetAllowsEstimatedSpend` mandatory before vendor I/O |
| Spend | `recordReelSpendEvent` only after successful asset INSERT |
| Job kinds | `tts_generate`, `tts_regenerate` added to `reelSpendJobKindSchema` |
| Block | `BUDGET_EXCEEDED` → existing budget audit event; no vendor call |

#### 4. Preferencias `voiceId` — **extend US-3.1** (APPROVE WITH CONDITIONS)

| Rule | Detail |
|---|---|
| Mutation | Existing **`upsertVisualPreferences`** Server Action + `.strict()` |
| New field | Optional **`voiceId`** validated ∈ catalog |
| Forbidden | Preserve US-3.1 strip list (`rules`, consent*, `client_id`, …) |
| Side effects | Upsert still **no** job enqueue / TTS / provider calls (US-3.1 no-regen floor) |

**Condition:** Voice picker save must not trigger synthesis — selection only.

#### 5. Media storage + serve — **download-and-own** (APPROVE WITH CONDITIONS)

| Rule | Detail |
|---|---|
| Storage key | Server-generated `neuramark/{clientId}/{reelScriptId}/{uuid}.mp3` |
| Serve | Ownership-checked route; Operator session V1 for synthesized voiceover |
| Samples | Public static files; no tenancy |

**Condition:** CONTRACT documents US-11.1 may widen Cliente read later — V1 Operator-only serve is acceptable.

#### 6. Provider boundary — **mirror SiliconFlow LLM adapter** (APPROVE)

| Rule | Detail |
|---|---|
| HTTP | `fetch` + Bearer; fixed base URL |
| Errors | Sanitized codes; no vendor body echo to client |
| CI | Mocked HTTP only; no live key in CI |

#### 7. Regenerate semantics — **new row, same gate** (APPROVE)

Insert new `media_assets` row; return latest `voiceoverAssetId`; **`tts_regenerate`** when prior voiceover exists for same script (server-detected). Each regenerate runs full budget gate — no bypass for "replace".

#### 8. Forbidden bypass flags — **no debug skips** (APPROVE)

No `SKIP_BUDGET_CHECK`, `NODE_ENV` TTS bypass, or magic query params. Tests mock gate/adapter; production orchestrator always invokes real gate.

---

### Vetoes (would block BUILD)

| If implementers… | Verdict |
|---|---|
| Accept arbitrary `voiceId` / `providerVoice` from browser on upsert or synthesize | **REJECT** |
| Accept client-authoritative `providerKey`, `tier`, or `estimatedCostCents` on synthesize | **REJECT** |
| Skip `assertReelBudgetAllowsEstimatedSpend` before SiliconFlow I/O | **REJECT** |
| Allow Cliente to call `synthesizeVoiceoverForReelScript` | **REJECT** |
| Expose `SILICONFLOW_API_KEY` or Bearer token to client/logs/DB metadata | **REJECT** |
| Use client-supplied `text` or `clientId` on synthesis action | **REJECT** |
| Serve synthesized voiceover without auth + ownership check | **REJECT** |
| Record TTS spend event on failed synthesize or blocked budget | **REJECT** |
| Import adapter/catalog/orchestrator from Client Components | **REJECT** |
| Auto-trigger TTS from script generate (US-5.1) | **REJECT** |
| Store voice catalog in client-writable DB table without Operator-only migration path | **REJECT** (V1) |
| Construct sample URLs from unsanitized user input | **REJECT** |

---

## Future-Proofing Notes

- **US-9.1** assembly consumes `voiceover` assets — must use ownership-verified asset ids only; no URL fetch from vendor at assembly time (SECURITY_BASELINE FFmpeg inputs).
- **US-10.1** QA must flag missing AI disclosure when synthetic voice used — reads persisted assets/metadata; US-9.3 does not accept client "passed" flags.
- **US-11.1** client approval preview may require Cliente-readable voiceover serve — additive auth widening on media route; do not weaken Operator gate on synthesis.
- **US-7.3** actual-cost backfill may refine TTS `actualCostCents` — gate still uses estimate at synthesize time per US-7.1 default.
- **ElevenLabs P1:** when `elevenlabs_tts_high` activates, same floors apply — closed catalog per tier, server provider resolution, budget gate, no client voice params.
- **Multi-tenancy:** all queries scoped by server `client_id`; foreign `reelScriptId` → **404**; enabling RLS later is additive.
- **Real auth (US-14.5):** Operator synthesis and audit use server-resolved identity — never request `actor` field.

---

## CONTRACT Spot-Check Checklist (when CONTRACT.md exists)

Before implementation starts, verify CONTRACT:

- [ ] Synthesis action input is `{ reelScriptId }` only; `FORBIDDEN_FIELDS` documented
- [ ] Preferencias upsert extends with optional `voiceId` + catalog validation; US-3.1 strip list preserved
- [ ] Voice catalog ids frozen; `providerVoice` server-internal only
- [ ] Orchestrator gate order: operator → script → provider → estimate → budget → synthesize → INSERT → spend
- [ ] `assertReelBudgetAllowsEstimatedSpend` + `recordReelSpendEvent` signatures and error codes listed
- [ ] `tts_generate` / `tts_regenerate` in `reelSpendJobKindSchema`
- [ ] Adapter env key, fixed URL, max audio size, storage key regex
- [ ] Media serve auth model for `voiceover` (Operator V1) + MIME allowlist
- [ ] No auto-TTS from US-5.1 documented as non-goal
- [ ] FE DTO allowlist excludes cost fields, vendor params, API internals
- [ ] **Reviewed by FE** line present before BUILD

---

## Open questions — SECURITY resolutions

| # | Question (from TASKS) | Resolution |
|---|---|---|
| 1 | Operator per-Reel voice vs prefs only | **Prefs only V1** — reduces SEC surface; synthesize uses prefs + server default. **No** request override. |
| 2 | `synthesizeSpeechRequestSchema` includes `clientId` | **Do not use as action boundary.** Orchestrator schema is pointer-only; server sets `clientId` internally. CONTRACT must say so explicitly. |
| 3 | Regenerate deletes prior row? | **Insert new row** — security-neutral if serve enforces ownership; latest id returned; **`tts_regenerate`** when prior exists. |
| 4 | Serve auth: Operator vs Cliente | **Operator V1** for synthesized `voiceover` (mirror `generated_video`). Static samples public. US-11.1 may widen later. |
| 5 | ElevenLabs stub in registry? | **Omit until catalog row active** — `getTtsAdapter` throws for unknown keys; no partial client-facing high-tier path. |
| 6 | Profile tone heuristic | **Server-only default when `voice_id` null** — not a security control; must still map to catalog id, never raw vendor string. |

---

## Verdict Rationale

**APPROVE WITH CONDITIONS** — the story correctly centralizes TTS authority on the server (closed catalog, policy-resolved provider, Operator-only synthesis, US-7.1 budget gate, download-and-own storage). **Conditions** are the frozen CONTRACT items above: pointer-only synthesis input (no `synthesizeSpeechRequestSchema` at the browser boundary), catalog allowlist on both Preferencias and synthesize paths, gate-before-I/O ordering, spend-only-on-success, and ownership-checked media serve. Satisfying them closes voice-cloning misuse, spend bypass, and cross-tenant audio exposure without blocking US-8.4 / US-9.1 downstream consumption.

**CONTRACT may proceed:** **Yes** (after FE review line in CONTRACT).
