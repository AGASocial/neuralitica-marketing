# Security Design Review — US-6.1

**Story:** US-6.1 — Generate Instagram caption per Reel  
**Date:** 2026-08-29  
**Reviewer:** security-architect  
**Sources:** `plan/USER_STORIES.md` (US-6.1 `[SEC]`), `plan/stories/US-5.1/SECURITY.md` + `CONTRACT.md` (Operator gate, script read, approved-strategy loader, rate-limit pattern, RLS posture), `plan/stories/US-4.2/SECURITY.md` (approved gate), `plan/stories/US-4.1/SECURITY.md` (agent job + rate limit + provider floors), `plan/stories/US-2.3/SECURITY.md` (`getBusinessProfileForAgents` trusted-caller pattern), `plan/stories/US-14.5/SECURITY.md` (`requireOperator` floor), `plan/stories/US-X.4/SECURITY.md` (provider catalog; Caption → `llmVariant: "default"`), `plan/SECURITY_BASELINE.md` (Caption Agent module), `SPEC.md` §3 Caption Agent, `plan/DESIGN_PROMPTS.md` §6 (Caption tab UX)  
**Status:** Binding for implementing agents; validated by requirements-validator like any other acceptance criterion. Do not treat this file as CONTRACT.md. Do not check off `USER_STORIES.md` AC here.

---

## Verdict: APPROVE WITH CONDITIONS

The story shape is correct and continues the Content Strategy → Script → Caption trust model: an **Operator-gated** Server Action (batch generate + single-slot regenerate) and/or **trusted system orchestration** invoke a **server-only** Caption LLM job that loads the target script through an **IDOR-safe, ownership-verifying helper** (`reelScriptId` or `weekStart`+`slotIndex` + server-resolved `client_id` + **parent strategy `status = 'approved'`** + script row tenancy match — never caller assertion alone), assembles inputs from trusted server helpers (`getBusinessProfileForAgents`, approved strategy brief slot, persisted script package from `neuramark_reel_scripts`), resolves LLM via **`getProviderCatalog()` + `resolveProvider({ assetRole: "llm", llmVariant: "default", … })`** — never client `provider_key` — **Zod-validates** agent output **before** INSERT/UPDATE into `neuramark_reel_captions` with **plain-text-only** fields (no HTML stored or rendered), applies **per-`client_id` rate limiting** on caption job creation, and stores rows under **RLS deny-by-default** (zero policies; service-role Node only).

No REDESIGN. No veto of PO lean defaults (Caption tab on existing Operator Scripts workspace; batch + single-slot regen; system/cron path deferred to orchestration story but job module must accept `invokedBy: "system"` from trusted caller only; hardcoded local user OK until auth universal; `cta_variants` stored in US-6.1, **selection** deferred to US-6.2). Orchestrator may proceed to **CONTRACT.md** after freezing the items below.

**Inherited floors (US-5.1 / US-4.2 / US-4.1 / US-2.3 / US-14.5 / US-X.4 — do not weaken):** `requireOperator()` calls `requireActive()` first; role never from request; handler-level gates mandatory on Operator-facing mutations; `client_id` server-resolved only; agent input helpers `import "server-only"`; profile read via `getBusinessProfileForAgents(clientId)` only; script read via tenant-scoped helpers only — never raw unscoped SELECT; provider resolution via catalog + policy tier — no client `provider_key`; RLS enabled with zero named policies on new `neuramark_*` tables; service-role Node only; no `@supabase/supabase-js` in Client Components; caption/hashtag/keyword text rendered as **plain text** (never HTML).

**This story owns:** `neuramark_reel_captions` migration (FK `reel_script_id`, tenancy columns, caption fields, JSON arrays); Zod caption package schema + action I/O contracts; server-only caption agent job module (`lib/agents/content/` lean sibling); Operator-gated **`generateReelCaptions`** (batch) and **`regenerateReelCaptionSlot`** Server Actions; caption enrichment on existing Operator script read path (`getReelScriptsForWeek` or CONTRACT-exact extension); **`loadReelScriptForCaptionJob()`** helper (script ownership + approved-strategy chain); per-client caption job rate limit (reuse `neuramark_agent_rate_limits` with distinct `agent_key`); security tests for operator gate, script ownership gate, approved-strategy gate, IDOR, schema reject-before-persist, plain-text enforcement, provider path, rate limit, RLS posture, forbidden fields.

**This story does not own:** Operator inline caption edit/save (regenerate-only in V1, mirroring US-5.1 scripts); **`selected_cta_index` persistence** (US-6.2); cost-policy cumulative budget (US-7.1 — rate limit here is first spend guard); QA agent job (US-10.1 — consumes persisted caption); video assembly (US-9.x); Cliente read UI for captions (US-11.x Aprobación package); automated weekly cycle scheduler (orchestration story); auth redesign.

**Terminology:** **Caption de Instagram** · **Paquete de guion** · **Estrategia semanal** (approved) · **Operator** · **System**. Technical names `loadReelScriptForCaptionJob`, `loadApprovedStrategyForScriptJob`, `getBusinessProfileForAgents`, `getReelScriptsForWeek`, `requireOperator` are canonical.

---

### Threat Summary (US-6.1–specific)

| Threat | Impact | Mitigation in this story |
|---|---|---|
| **Non-operator triggers caption LLM spend** | Cliente or anonymous user burns vendor budget, writes caption rows | Operator-facing Server Actions call `requireOperator("handler")` as **first** await before validation, rate limit, script load, or LLM I/O. Failure → 401/403, **no side effects**, **no LLM call** |
| **Caption generation against foreign or draft-owned script** | Captions produced for another tenant or unapproved plan | **`loadReelScriptForCaptionJob({ reelScriptId, clientId })`** (or equivalent week+slot resolver) SELECT with **`client_id` match** + JOIN to strategy with **`status = 'approved'`** — **independent of caller**; missing/wrong ownership → **`SCRIPT_NOT_FOUND`** / **`STRATEGY_NOT_APPROVED`** / **404**, **no LLM call** |
| **Caller asserts script/strategy ownership without server re-check** | Bypass US-4.2 human review gate or cross-tenant access | Request schema has **no** `approved`, `status`, `clientId`, or preloaded caption authority fields; job module **always** re-loads script row + parent strategy and verifies chain server-side |
| **Client-supplied `provider_key` / `tier`** | Force expensive LLM or inactive adapter | Request contract **rejects** `providerKey`, `provider_key`, `tier`, `envKeyName`, `model`. Job resolves via `getProviderCatalog()` + server tier + `resolveProvider({ assetRole: "llm", llmVariant: "default", … })` |
| **Client forges caption/hashtag/keyword text to skip agent** | Smuggle harmful copy, XSS payloads, or off-brand hashtags | Batch/single-slot actions accept **`weekStart`** (+ **`slotIndex`** for regen) only — **no** client caption text fields on generate paths. Persist only agent output after Zod validation |
| **Unvalidated LLM JSON persisted** | Corrupt captions break QA/Aprobación; hidden HTML/script payloads | Parse LLM response → Zod **`.strict()`** caption schema (caption, hashtags[], keywords[], ctaVariants[]) with length/count bounds → reject on failure, **no INSERT/UPDATE** |
| **HTML/markdown in caption or hashtag fields** | XSS in Operator browser; Instagram paste surprises; QA false negatives | Schema rejects strings containing HTML-like patterns (lean: strip or reject `<`, `>`, `&lt;`, `javascript:`); FE renders caption/hashtags/keywords as **plain text** only — no `dangerouslySetInnerHTML`, no markdown renderer on caption fields |
| **IDOR via `reelScriptId` or week/slot** | Read/generate captions for another tenant | All loads scoped by server-resolved `client_id`; script SELECT **always** includes tenancy filter; foreign id → **404** uniform |
| **Runaway generate / regen spam** | Runaway LLM spend | **Per-`client_id` rate limit** on caption job creation via `neuramark_agent_rate_limits` (distinct `agent_key`); in-flight guard per batch/slot scope; over-limit → **429**, **no LLM call** |
| **Agent job in client bundle** | Prompt templates, keys exposed | Caption agent module **`import "server-only"`**; never imported from `"use client"` trees |
| **Prompt injection via script text / profile / strategy brief** | Hijack caption tone, exfil, false geo claims | Delimited untrusted blocks (US-4.1/US-5.1 pattern); output schema-validated; local/geo keywords derived from **profile DTO** authority when zone present — not client-supplied keyword list on generate |
| **RLS policy exposing captions to `authenticated`** | Future browser SDK reads all clients' captions | RLS **enabled, zero policies** on `neuramark_reel_captions` |
| **Generating captions before script exists** | Orphan caption rows, broken FK chain | Batch path generates only for slots with **existing** `neuramark_reel_scripts` rows for approved strategy; missing script → skip or typed **`SCRIPT_PENDING`** (CONTRACT picks); **no** caption row without valid `reel_script_id` FK |

**Residual risk accepted:** Operator trust model — Operator can generate captions for server-resolved client (V1: self). Semantic sanitization of script/profile/strategy free text not attempted — containment is delimiter + output schema + plain-text enforcement. Full cumulative spend cap lands US-7.1; US-6.1 rate limit is necessary but not sufficient alone. System/cron auto-caption path is out of BUILD scope but job orchestrator must accept `invokedBy: "system"` from trusted server code only — **never** from browser. Hashtag "configured max" is a **server-frozen constant** (lean: **30** hashtags, Instagram platform max) — not client-writable.

---

## Assets and Trust Boundaries

| Asset | Sensitivity | Trust boundary |
|---|---|---|
| LLM API keys | Critical — direct financial abuse | Server env only; catalog `envKeyName`; never response/DB/client |
| `neuramark_reel_captions` rows | Medium–High — published-facing copy | Service-role Node; Zod-validated before write; scoped by `client_id` |
| Parent `neuramark_reel_scripts` package | Medium–High — **LLM fuel** | Loaded via `loadReelScriptForCaptionJob` only after ownership + approved-strategy check |
| Approved strategy `brief` slot fields | Medium — **LLM fuel** (context) | Loaded via approved-strategy helper chained from script row |
| Profile fields (agents DTO) | Medium–High — PII; **LLM fuel**; geo/zone for local keywords | `getBusinessProfileForAgents(clientId)` only |
| `reelScriptId`, `weekStart`, `slotIndex` in action input | Medium — row pointers, not authority | Must pair with server-resolved `client_id` + script ownership + approved parent strategy |
| Operator session | High — can trigger LLM spend | `requireOperator()` on generate/regenerate + caption read enrichment |

**Boundaries:**

1. **Browser (Operator) → generate/regenerate Server Actions / RSC read** — Untrusted. Sends `weekStart` (+ `slotIndex` for regen). No caption text, no hashtags, no `provider_key`, no `client_id` authority.
2. **Server Action → `requireOperator()` → rate limit → `loadReelScriptForCaptionJob()`** — Gate and script ownership + approved-strategy verification **before** LLM I/O.
3. **Caption agent job → trusted helpers → LLM** — Profile, script package, approved brief slot; provider via catalog.
4. **Agent job → Postgres** — Parameterized INSERT/UPDATE on `neuramark_reel_captions`; RLS deny-by-default.
5. **Operator read path** — Caption fields returned only through existing **`requireOperator`-gated** `getReelScriptsForWeek` (or CONTRACT-exact extension); Cliente read **out of US-6.1 BUILD**.

---

## Abuse Cases Considered

- *As a Cliente, I can call generate captions and burn LLM budget* → **Blocked:** `requireOperator("handler")` first; 403, no LLM call.
- *As a malicious actor, I can POST `{ weekStart, slotIndex: 0 }` for a week whose strategy is still `draft`* → **Blocked:** script load chains to strategy with `status = 'approved'`; draft parent → **`STRATEGY_NOT_APPROVED`**, no LLM.
- *As a malicious actor, I can POST `{ reelScriptId: "<victim-script-uuid>" }` if CONTRACT exposes id* → **Blocked:** SELECT includes server-resolved `client_id`; foreign script → **404**.
- *As a malicious actor, I can POST `{ provider_key: "expensive" }` or `{ tier: "high" }`* → **Blocked:** forbidden keys; server resolves provider via catalog.
- *As a malicious actor, I can POST `{ caption: "...", hashtags: ["#evil"] }` to inject caption text* → **Blocked:** generate input schema excludes caption content fields; only agent output persisted after validation.
- *As a malicious actor, I can coerce LLM to return `<script>alert(1)</script>` in caption* → **Blocked:** Zod plain-text validation rejects HTML-like content; FE renders plain text only.
- *As a malicious actor, I can POST `{ keywords: ["fake city"] }` to forge geo targeting* → **Blocked:** keywords on generate path come from agent output validated against schema; profile zone injected server-side in prompt — not client keyword list on mutation.
- *As a malicious actor, I can generate 50 hashtags to spam or break IG limits* → **Blocked:** schema max array length (server-frozen `maxHashtags`, lean **30**); reject before persist.
- *As a malicious actor, I spam "Generate captions" or per-slot regen* → **Blocked:** per-`client_id` rate limit + in-flight guard; 429, no LLM.
- *As a malicious actor, I read another client's captions by script id* → **Blocked:** read path `requireOperator` + `client_id` scope; foreign → 404.
- *As a malicious actor, I import the caption agent module in a Client Component* → **Blocked:** `import "server-only"`.
- *As a malicious actor, I add RLS policies so `authenticated` SELECT all captions* → **Blocked:** migration enables RLS with **zero** named policies.
- *As a malicious actor, I generate captions for slots without scripts to pre-seed harmful copy* → **Blocked:** no script row → no caption job for that slot; FK requires valid `reel_script_id`.

---

## Security Acceptance Criteria

Story `[SEC]` items from `plan/USER_STORIES.md` → US-6.1 are binding. Items marked **(added)** are new in this review — paste into the story when the PO next edits USER_STORIES.

**Inherited (still binding — do not weaken adjacent auth / provider / script paths):**

- [ ] **[SEC] Every operator-only gate lives inside the Server Action / Route Handler itself** as `requireOperator()` on the `getCurrentUser()` result; middleware and UI hiding are convenience only *(US-14.5)*
- [ ] **[SEC] `requireOperator()` runs `requireActive()` first** — inactive operator has no access *(US-14.5)*
- [ ] **[SEC] RLS stays enabled with zero policies** on new `neuramark_*` tables; privileged access via Node service-role only *(US-14.5 / US-4.1)*
- [ ] **[SEC] Service-role key is used only from Node server modules** — never Client Components, never Edge middleware *(US-14.5)*
- [ ] **[SEC] Job-creation / agent input schemas must not accept client-authoritative `provider_key` or `tier`** — server resolves via policy + `getProviderCatalog()` + `resolveProvider` *(US-X.4 / US-7.2 floor)*
- [ ] **[SEC] `getBusinessProfileForAgents` is server-only and the only profile read path for agents** — no raw interview SELECT *(US-2.3)*

**US-6.1 story `[SEC]` (existing in USER_STORIES.md):**

- [ ] **[SEC] Caption/hashtag/keyword output is schema-validated and length-bounded before storage; captions are rendered as plain text everywhere (never as HTML)** *(USER_STORIES US-6.1)*

**Added in this review (binding for US-6.1 BUILD):**

- [ ] **[SEC] (added) `generateReelCaptions` Server Action** (batch — all generated scripts for approved strategy week) calls `requireOperator("handler")` as its **first** await before rate-limit check, validation, script load, or LLM I/O; failure → 401/403, **no side effects**, **no LLM call**
- [ ] **[SEC] (added) `regenerateReelCaptionSlot` Server Action** calls `requireOperator("handler")` as its **first** await before rate-limit check, validation, script load, or LLM I/O; failure → 401/403, **no side effects**, **no LLM call**
- [ ] **[SEC] (added) Caption read enrichment** on Operator script list/detail stays behind existing **`getReelScriptsForWeek`** gate (`requireOperator("handler")` first) or CONTRACT-exact gated extension — **no** standalone ungated caption Route Handler; Cliente caption read **out of US-6.1 BUILD**
- [ ] **[SEC] (added) Script ownership verification — caller-independent:** server helper **`loadReelScriptForCaptionJob({ reelScriptId, clientId })`** (CONTRACT exact name) performs SELECT on `neuramark_reel_scripts` with `id = $reelScriptId AND client_id = $clientId`, JOINs parent `neuramark_content_strategies` with **`status = 'approved'`**. Used by **every** generate/regenerate path. Null / wrong tenancy / non-approved parent → **`SCRIPT_NOT_FOUND`** / **`STRATEGY_NOT_APPROVED`** or uniform **404**, **no LLM call**. **Never** trust client `approved`, `status`, or preloaded script DTO without this reload
- [ ] **[SEC] (added) Batch resolver alternative:** when input is `{ weekStart }` only, resolve approved strategy via **`getApprovedStrategyForWeek({ weekStart, clientId })`** then load scripts with **`listReelScriptsForStrategy({ clientId, strategyId })`** — each caption job still verifies script row exists and parent strategy remains `approved` immediately before persist
- [ ] **[SEC] (added) Target `client_id` is server-resolved only** — V1 lean: `getCurrentUser().id` after `requireOperator()`. Request body/query **must not** carry authoritative `client_id`
- [ ] **[SEC] (added) Client request schemas exclude authoritative fields:** `clientId`, `client_id`, `providerKey`, `provider_key`, `tier`, `envKeyName`, `model`, `status`, `approved`, `caption`, `hashtags`, `keywords`, `ctaVariants`, `cta_variants`, `selectedCtaIndex`, `selected_cta_index`, `maxHashtags`, `hook`, `body`, `onScreenText`, `voiceoverText`, and all US-5.1/US-4.1 forbidden provider/auth keys. Presence → **`FORBIDDEN_FIELDS`**
- [ ] **[SEC] (added) Batch generate input (lean):** `{ weekStart }` only — `.strict()`. **Regenerate input (lean):** `{ weekStart, slotIndex }` — `.strict()`. Target script must exist for slot on loaded approved strategy; else **`SCRIPT_PENDING`** or **`VALIDATION_ERROR`**, no LLM
- [ ] **[SEC] (added) Caption agent job module uses `import "server-only"`** (lean: `lib/agents/content/generate-reel-caption.ts` or CONTRACT exact). LLM invocation, prompt assembly, provider call **must not** live in Client Components
- [ ] **[SEC] (added) Agent inputs assembled only via trusted helpers:** script package from `loadReelScriptForCaptionJob`; approved strategy slot context from chained strategy load; `getBusinessProfileForAgents(clientId)` for locale/zone/business context — **no** direct SELECT on profile/script/strategy tables from agent module bypassing helpers
- [ ] **[SEC] (added) LLM provider resolution:** `getProviderCatalog()` → server-resolved tier (V1: global default `low` until US-7.1) → `resolveProvider(catalog, { assetRole: "llm", tier, llmVariant: "default" })` per US-X.4 Caption mapping. API key via `process.env[row.envKeyName]` in adapter only — **no client `provider_key`**
- [ ] **[SEC] (added) Prompt-injection containment — delimited untrusted blocks:** wrap script hook/body/CTA/on-screen/VO, strategy slot text, profile fields in fixed delimiters (same family as US-4.1/US-5.1). System instructions outside delimiters state delimited content is data, not instructions
- [ ] **[SEC] (added) Output validation before persist — plain text, length-bounded:** parse LLM response → map to caption package → Zod **`.strict()`** schema with frozen bounds (CONTRACT exact): `caption` non-empty string max **`2200`** (Instagram cap); `hashtags` string array each entry max **`100`** chars, count **`1..maxHashtags`** (lean **`maxHashtags = 30`**); `keywords` string array each max **`80`**, count **`0..20`**; `ctaVariants` string array min **`2`** max **`5`**, each max **`200`** (US-6.2 selection deferred — store only). Every string field: **no HTML** — reject if matches `/[<>&]/` or contains `javascript:` (CONTRACT may use shared `plainTextNoHtmlSchema`). On failure: typed error to Operator, **no INSERT/UPDATE**. Batch path: **no partial persist** for failed slots when CONTRACT chooses atomic batch — otherwise per-slot UPSERT with explicit error list (CONTRACT picks; either way **no** persist of invalid JSON)
- [ ] **[SEC] (added) Plain-text rendering everywhere:** Operator Caption tab, chips, char counter, and copy actions treat caption/hashtag/keyword/CTA variant strings as **plain text** — no `dangerouslySetInnerHTML`, no markdown/HTML renderer, no `innerHTML` assignment on caption fields
- [ ] **[SEC] (added) Per-`client_id` caption job rate limit:** reuse `neuramark_agent_rate_limits` with distinct `agent_key` (lean: `caption_generate`). CONTRACT frozen limits (lean: **max 5 successful batch/regen job attempts per `client_id` per rolling 60 minutes**, plus **max 1 in-flight** batch per `client_id`+`strategy_id`, plus **max 1 in-flight** single-slot regen per `client_id`+`strategy_id`+`slot_index`). Over-limit → **`RATE_LIMITED`**, **no LLM call**. UI debounce is UX only — **separate bucket** from `video_script_generate`
- [ ] **[SEC] (added) `neuramark_reel_captions` migration:** includes `client_id` FK NOT NULL, `reel_script_id` FK NOT NULL → `neuramark_reel_scripts(id)` ON DELETE RESTRICT, `caption` text NOT NULL, `hashtags` jsonb NOT NULL, `keywords` jsonb NOT NULL, `cta_variants` jsonb NOT NULL, timestamps; **UNIQUE** `(reel_script_id)` (one caption row per script in V1); index on `(client_id)`; parameterized queries only
- [ ] **[SEC] (added) RLS deny-by-default on `neuramark_reel_captions`:** `ENABLE ROW LEVEL SECURITY` with **zero** named policies; all reads/writes via service-role Node helpers
- [ ] **[SEC] (added) IDOR-safe caption reads:** SELECT by caption id or script id **always** includes `WHERE client_id = $serverResolvedClientId`; missing/forbidden → **404** uniform
- [ ] **[SEC] (added) INSERT/UPDATE captions only when script ownership + approved strategy verified:** even regen path re-runs `loadReelScriptForCaptionJob` immediately before persist
- [ ] **[SEC] (added) Trusted system invocation seam:** job orchestrator function accepts `invokedBy: "operator" | "system"`; **`invokedBy: "system"`** callable only from server modules (cron/orchestration — future story), **never** from browser-exposed action without `requireOperator`. Public Operator Server Actions always gate at handler
- [ ] **[SEC] (added) Response shapes minimal:** Operator read DTO exposes caption fields for UI — **no** LLM raw response, prompt text, provider env names, or keys
- [ ] **[SEC] (added) Logging:** log `reelScriptId`, `clientId`, `slotIndex`, `weekStart`, action, error **codes**, provider **key slug** only — never full prompts, caption bodies, or env values
- [ ] **[SEC] (added) Automated security tests cover at least:** non-operator generate/regen/read → 403 no LLM/no write; caption generate for script under draft strategy → `STRATEGY_NOT_APPROVED` no LLM; foreign script/week → 404; smuggled `provider_key` / caption text / hashtag arrays → `FORBIDDEN_FIELDS`; invalid LLM output (HTML, overlong caption, 31 hashtags) → no persist; rate limit → 429 no LLM; RLS enabled zero policies; agent module has `server-only`; plain-text FE regression (no dangerouslySetInnerHTML on caption paths)

---

## Design Concerns and Required Changes

### Frozen design choices (must land in CONTRACT)

#### 1. Operator gate — generate, regen, read (APPROVE)

| Surface | Gate |
|---|---|
| `generateReelCaptions` Server Action | `requireOperator("handler")` **first** |
| `regenerateReelCaptionSlot` Server Action | `requireOperator("handler")` **first** |
| Caption fields on script list/detail | Existing `getReelScriptsForWeek` → `requireOperator("handler")` **first** (extend success DTO) |
| Caption agent job module | No session gate inside (trusted caller = gated action or system orchestrator) |
| Cliente caption read | **Out of US-6.1 BUILD** |

#### 2. Script ownership loader — caller-independent (APPROVE)

```ts
// Frozen pattern — CONTRACT exact helper name
async function loadReelScriptForCaptionJob(params: {
  reelScriptId: string;
  clientId: string; // server-resolved
}): Promise<ReelScriptForCaption | null> {
  // SELECT script WHERE id = reelScriptId AND client_id = clientId
  // JOIN strategy WHERE strategy.id = script.strategy_id AND status = 'approved'
  // null → SCRIPT_NOT_FOUND / STRATEGY_NOT_APPROVED / 404
}
```

| Rule | Detail |
|---|---|
| Used by | Batch generate (per script id), single-slot regen, future system orchestrator |
| Not sufficient | Caller passing `scriptId` from UI without reload — must verify row + approved parent |
| Script missing for slot | Batch skips or errors **`SCRIPT_PENDING`** — **no** caption row without FK target |

#### 3. Server-only caption agent job (APPROVE)

| Rule | Detail |
|---|---|
| Module | `import "server-only"` under `lib/agents/content/` |
| Invocation | Gated Server Action or trusted `invokedBy: "system"` orchestrator only |
| Keys | Server env via catalog adapter; never in responses or `neuramark_reel_captions` |
| HTTP | **No** public generate/status Route Handler in V1 BUILD |

#### 4. Schema validation before persist — plain text, no HTML (APPROVE)

| Field | Constraint (lean — CONTRACT freezes exact bounds) |
|---|---|
| `caption` | Non-empty; max **2200**; plain text only |
| `hashtags` | Array length **1..30**; each entry non-empty, max **100** chars, plain text; normalize leading `#` server-side optional |
| `keywords` | Array length **0..20**; each max **80** chars, plain text |
| `ctaVariants` | Array length **2..5**; each max **200** chars, plain text |
| Unknown keys | Zod `.strict()` reject |
| HTML / script injection | Reject strings matching plain-text guard (see `[SEC]` above) |

On validation failure: **no row written**.

#### 5. Provider resolution — catalog, not client (APPROVE)

Same stack as US-4.1/US-5.1: `getProviderCatalog()` → tier from policy → `resolveProvider({ assetRole: "llm", llmVariant: "default", … })` per US-X.4. Extend forbidden-key list on caption actions mirroring `findForbiddenReelScriptKeys`.

#### 6. Rate limit — per client, distinct bucket (APPROVE WITH CONDITIONS)

| Rule | Detail |
|---|---|
| Storage | Reuse `neuramark_agent_rate_limits` with `agent_key = 'caption_generate'` (CONTRACT exact) |
| Key | Server-resolved `client_id` |
| Lean limits | **5** job attempts / client / **60 min**; in-flight guards on batch and single-slot keys |
| Over-limit | `RATE_LIMITED`, no LLM |
| Distinct from US-5.1 | Separate `agent_key` — script limits do not share bucket with caption limits |

**Condition:** CONTRACT may tune numbers but must keep per-client server enforcement.

#### 7. RLS — deny-by-default on `neuramark_reel_captions` (APPROVE)

```sql
CREATE TABLE public.neuramark_reel_captions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.neuramark_clients(id),
  reel_script_id uuid NOT NULL REFERENCES public.neuramark_reel_scripts(id) ON DELETE RESTRICT,
  caption text NOT NULL,
  hashtags jsonb NOT NULL,
  keywords jsonb NOT NULL,
  cta_variants jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT neuramark_reel_captions_reel_script_unique UNIQUE (reel_script_id),
  CONSTRAINT neuramark_reel_captions_caption_length_check
    CHECK (char_length(caption) <= 2200)
);

ALTER TABLE public.neuramark_reel_captions ENABLE ROW LEVEL SECURITY;
-- Zero named policies → deny-by-default for anon/authenticated roles.
```

Do **not** add `authenticated` SELECT/INSERT policies. JSON array element bounds enforced in app-layer Zod **before** INSERT (DB CHECK on jsonb array length optional — app layer is minimum bar).

#### 8. Single-slot regenerate (APPROVE)

| Rule | Detail |
|---|---|
| Input | `{ weekStart, slotIndex }` only |
| Preconditions | Approved strategy loaded; script exists for slot; rate limit ok; `loadReelScriptForCaptionJob` passes |
| Persist | UPSERT on `reel_script_id` — replaces one caption row |
| Scope | Does **not** delete sibling slot captions |

#### 9. No client caption edit in V1 (APPROVE — binding veto)

| Rule | Detail |
|---|---|
| Persist surfaces | **`generateReelCaptions`**, **`regenerateReelCaptionSlot`** only |
| Forbidden | `updateReelCaption*`, PATCH caption fields, Operator free-text save |
| US-6.2 | **`selected_cta_index`** mutation is **US-6.2** — not US-6.1 BUILD |

---

## Future-Proofing Notes

- **US-6.2 CTA selection** adds bounded index write — must not accept free-text CTA substitution; builds on `cta_variants` stored here.
- **US-10.1 QA** reads persisted caption + script disclosure flag — do not duplicate rule authority from client input.
- **US-11.1 Aprobación** Cliente read of caption package — reuse same plain-text rendering rule; IDOR guard on package lookup.
- **US-7.1 budget** complements rate limit; do not skip rate limit when budget story lands.
- **System/cron auto-caption** after scripts (SPEC auto-avance) — orchestration story calls same job module with `invokedBy: "system"`; must still run script ownership + approved-strategy checks (Operator manual path **always** requires approved parent strategy).
- **Multi-client Operator picker:** `client_id` from server-validated context, not POST body.
- **Real auth:** same patterns survive; `requireOperator` + server-resolved tenancy unchanged.

---

## CONTRACT.md Checklist (pre-implementation)

When `plan/stories/US-6.1/CONTRACT.md` exists, spot-check before BUILD:

- [ ] `generateReelCaptions` + `regenerateReelCaptionSlot` frozen; both start with `requireOperator("handler")`
- [ ] Input schemas: batch `{ weekStart }`; regen `{ weekStart, slotIndex }` — `.strict()`, no caption text, no provider fields
- [ ] `loadReelScriptForCaptionJob({ reelScriptId, clientId })` with approved parent strategy guard
- [ ] Forbidden-key list + `FORBIDDEN_FIELDS` envelope
- [ ] `reelCaptionPackageSchema.strict()` field bounds + plain-text guard + hashtag max
- [ ] Migration + RLS deny-by-default on `neuramark_reel_captions`
- [ ] Rate limit `agent_key = caption_generate` + limits frozen
- [ ] Provider resolution via catalog `llmVariant: "default"`; no client `provider_key`
- [ ] `invokedBy: "operator" | "system"` on orchestrator; public actions gated
- [ ] Read IDOR pattern; extend `getReelScriptsForWeek` DTO with caption block; plain-text FE contract
- [ ] Out of scope: `selected_cta_index` (US-6.2), cost engine, QA job, Cliente read, cron scheduler, inline caption edit

---

## CONTRACT freeze list (binding `[SEC]` summary)

Paste into CONTRACT **Security** section — do not reopen without security-architect review.

1. **Gate:** `requireOperator("handler")` **first** on **`generateReelCaptions`** and **`regenerateReelCaptionSlot`**; caption read via existing **`getReelScriptsForWeek`** gate (`requireOperator("handler")`); 401/403, no LLM/write on failure.
2. **Script ownership (caller-independent):** **`loadReelScriptForCaptionJob({ reelScriptId, clientId })`** requires script **`client_id` match** + parent strategy **`status = 'approved'`** **before every** agent invoke and persist; **`SCRIPT_NOT_FOUND`** / **`STRATEGY_NOT_APPROVED`** / **404** on failure; never trust client status flags or unscoped script ids.
3. **Tenancy:** `client_id` **server-resolved only**; every SELECT/INSERT/UPDATE includes tenancy filter; IDOR → **404**.
4. **Forbidden input:** no `provider_key`, `tier`, `caption`, `hashtags`, `keywords`, `ctaVariants`, `selected_cta_index`, or script text fields — **`FORBIDDEN_FIELDS`**.
5. **Schema validation:** Zod **`.strict()`** on agent output **before** persist — caption max **2200**, hashtags **1..30**, keywords **0..20**, ctaVariants **2..5**; **plain text only** (reject HTML-like content); batch failure handling per CONTRACT (no invalid rows persisted).
6. **Rendering:** caption/hashtag/keyword/CTA strings **plain text everywhere** — no HTML rendering in Operator UI.
7. **Provider:** catalog + `resolveProvider({ assetRole: "llm", llmVariant: "default", … })`; keys server-env only; **no client `provider_key`**.
8. **Rate limit:** `neuramark_agent_rate_limits` with **`caption_generate`** key; per-`client_id` server enforcement; **429** over limit, no LLM; distinct from `video_script_generate`.
9. **RLS:** `neuramark_reel_captions` **enabled, zero policies**; service-role Node only.
10. **Agent module:** `import "server-only"`; trusted helpers only; delimited untrusted prompt data.
11. **FK integrity:** one caption row per `reel_script_id`; no caption without existing script row.
12. **Logging:** ids + codes only — no full prompts/caption bodies in prod logs.
13. **Tests:** operator gate, script ownership gate, approved gate, IDOR, forbidden fields, schema reject (HTML/overlength/hashtag count), rate limit, RLS, plain-text FE.

---

## BUILD vetoes (summary)

1. **Generate or regen without `requireOperator()`** on Operator-facing actions (including dev bypass).
2. **Invoking agent without `loadReelScriptForCaptionJob` ownership + approved-strategy check** — including trusting caller-supplied script/strategy status.
3. **Accepting `provider_key`, `tier`, or caption/hashtag/keyword/CTA text fields from the request.**
4. **Persisting LLM output without Zod `.strict()` validation** or persisting HTML-bearing strings.
5. **Rendering caption fields as HTML** (`dangerouslySetInnerHTML`, markdown renderer on caption content).
6. **SELECT/UPDATE by `reelScriptId` or caption id without server-resolved `client_id` filter.**
7. **Public Route Handler for caption generate/status without operator gate.**
8. **RLS policies granting `authenticated` access** to `neuramark_reel_captions`.
9. **Caption row without valid `reel_script_id` FK** or script under non-approved strategy.
10. **Importing caption agent module from Client Components** or exposing LLM keys in responses/logs.
11. **Sharing rate-limit bucket with script generation** without distinct `agent_key`.
12. **Adding Operator inline caption edit/save** or **`selected_cta_index` write** (US-6.2 scope).

---

## Open questions — SECURITY resolutions

| # | Question | Resolution |
|---|---|---|
| 1 | Operator vs System actor? | **Both.** Public Server Actions = Operator-gated. Job module accepts `invokedBy: "system"` from trusted server orchestrator only. Browser never calls system path directly. |
| 2 | Input: `weekStart` vs `reelScriptId`? | **Lean V1:** batch `{ weekStart }`; regen `{ weekStart, slotIndex }`. Internal job uses resolved `reelScriptId` from ownership loader. CONTRACT may expose id only in **response** DTOs, not as generate input authority without reload. |
| 3 | Batch when some slots lack scripts? | **Skip or error per slot** — never generate caption without script row. CONTRACT documents `SCRIPT_PENDING` behavior; **no** orphan caption rows. |
| 4 | Hashtag max? | **Server-frozen `maxHashtags = 30`** (Instagram platform max). Not client-configurable in V1 BUILD. |
| 5 | CTA variants count? | Store **`2..5`** variants in US-6.1; **selection** is US-6.2. Variants are plain text, schema-validated. |
| 6 | Rate limit separate from US-5.1? | **Yes** — distinct `agent_key = caption_generate`; same table, separate bucket. |
| 7 | Local keywords when profile has zone? | Profile zone/city injected **server-side** into prompt from `getBusinessProfileForAgents`; agent output keywords validated by schema — client cannot POST keyword list on generate. |

---

## Recommended action

**APPROVE WITH CONDITIONS.** Proceed to **CONTRACT.md** (nextjs-backend). Binding floors above must appear in CONTRACT before BUILD. FE signoff after CONTRACT (Caption tab on `/operator/scripts` consumes gated read DTO only; generate/regen buttons call gated actions with `weekStart` / `slotIndex` only — no caption fields in request; char counter and hashtag chips are display-only over plain-text DTO fields).
