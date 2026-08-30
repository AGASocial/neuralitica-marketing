# Security Design Review — US-5.1

**Story:** US-5.1 — Generate Reel script package per slot  
**Date:** 2026-08-29  
**Reviewer:** security-architect  
**Sources:** `plan/USER_STORIES.md` (US-5.1 `[SEC]`), `plan/stories/US-4.2/SECURITY.md` (approve gate + lock handoff), `plan/stories/US-4.1/SECURITY.md` (agent job + rate limit + provider floors), `plan/stories/US-3.4/SECURITY.md` (`must_disclose_not_owner` authority), `plan/stories/US-14.5/SECURITY.md` (`requireOperator` floor), `plan/stories/US-X.4/SECURITY.md` (provider catalog), `lib/content-strategy/` (IDOR helpers, rate-limit pattern, `strategyHasScripts` stub), `lib/agents/content/generate-weekly-strategy.ts` (delimiter + disclosure injection pattern), `lib/qa/build-generic-disclosure-prompt-hint.ts`, `lib/profile/get-business-profile-for-agents.ts`, `SPEC.md` §3 Video Script Agent  
**Status:** Binding for implementing agents; validated by requirements-validator like any other acceptance criterion. Do not treat this file as CONTRACT.md. Do not check off `USER_STORIES.md` AC here.

---

## Verdict: APPROVE WITH CONDITIONS

The story shape is correct and continues the Content Strategy trust model: an **Operator-gated** Server Action (batch generate + single-slot regenerate) and/or **trusted system orchestration** invoke a **server-only** Video Script LLM job that loads the target strategy through an **IDOR-safe, status-verifying helper** (`strategyId` + server-resolved `client_id` + **`status = 'approved'`** — never caller assertion alone), assembles inputs from trusted server helpers (`getBusinessProfileForAgents`, approved strategy brief slot, Playbook/Trend hints via existing agent helpers), resolves LLM via **`getProviderCatalog()` + `resolveProvider({ assetRole: "llm", … })`** — never client `provider_key` — **Zod-validates** agent output **before** INSERT/UPDATE into `neuramark_reel_scripts`, persists **`must_disclose_not_owner`** as a **server-injected column** derived from profile DTO (never request input), applies **per-`client_id` rate limiting** on script job creation, and stores rows under **RLS deny-by-default** (zero policies; service-role Node only). US-5.1 **must wire** `strategyHasScripts()` so US-4.2 lock-after-scripts enforcement becomes live.

No REDESIGN. No veto of PO lean defaults (Operator UI for script list + copy; regenerate single slot; system/cron path deferred to orchestration story but job module must accept `invokedBy: "system"` from trusted caller; hardcoded local user OK until auth universal). Orchestrator may proceed to **CONTRACT.md** after freezing the items below.

**Inherited floors (US-4.1 / US-4.2 / US-3.4 / US-14.5 / US-X.4 — do not weaken):** `requireOperator()` calls `requireActive()` first; role never from request; handler-level gates mandatory on Operator-facing mutations; `client_id` server-resolved only; agent input helpers `import "server-only"`; profile read via `getBusinessProfileForAgents(clientId)` only; Playbook/Trend via `getPlaybookForAgents()` / `getTrendSnapshotForWeek()` only; provider resolution via catalog + policy tier — no client `provider_key`; RLS enabled with zero named policies on new `neuramark_*` tables; service-role Node only; no `@supabase/supabase-js` in Client Components; `mustDiscloseNotOwner` / `must_disclose_not_owner` never client-writable.

**This story owns:** `neuramark_reel_scripts` migration (FK `strategy_id`, tenancy columns, script fields, server-set `must_disclose_not_owner`); Zod script package schema + action I/O contracts; server-only script agent job module (`lib/agents/content/` lean sibling); Operator-gated **`generateReelScripts`** (batch) and **`regenerateReelScriptSlot`** Server Actions; Operator-gated script list read (RSC loader or gated action); **`loadApprovedStrategyForScriptJob()`** helper; **real** `strategyHasScripts()` implementation; per-client script job rate limit (reuse `neuramark_agent_rate_limits` with distinct `agent_key`); security tests for operator gate, approved-strategy gate, IDOR, schema reject-before-persist, disclosure injection, provider path, rate limit, RLS posture, forbidden fields.

**This story does not own:** Operator edit/approve strategy (US-4.2); Caption agent (US-6.x); cost-policy cumulative budget (US-7.1 — rate limit here is first spend guard); QA agent job (US-10.1 — consumes persisted `must_disclose_not_owner`); on-screen length warnings UI (US-5.2); automated weekly cycle scheduler (orchestration story); Cliente read UI for scripts; auth redesign.

**Terminology:** **Paquete de guion** · **Estrategia semanal** (approved) · **Formato de Reel** · **Modalidad de producción** · **Operator** · **System**. Technical names `loadApprovedStrategyForScriptJob`, `getBusinessProfileForAgents`, `buildGenericDisclosurePromptHint`, `strategyHasScripts`, `requireOperator` are canonical.

---

### Threat Summary (US-5.1–specific)

| Threat | Impact | Mitigation in this story |
|---|---|---|
| **Non-operator triggers script LLM spend** | Cliente or anonymous user burns vendor budget, writes script rows | Operator-facing Server Actions call `requireOperator("handler")` as **first** await before validation, rate limit, strategy load, or LLM I/O. Failure → 401/403, **no side effects**, **no LLM call** |
| **Script generation against `draft` or foreign strategy** | Scripts produced from unreviewed or cross-tenant plan | **`loadApprovedStrategyForScriptJob({ strategyId, clientId })`** SELECT with `status = 'approved'` **and** `client_id` match — **independent of caller**; missing/wrong status → **`STRATEGY_NOT_APPROVED`** / **404**, **no LLM call** |
| **Caller asserts strategy is approved without server re-check** | Bypass US-4.2 human review gate | Request schema has **no** `approved`, `status`, or `strategyStatus` authority fields; job module **always** re-loads row and verifies `approved` server-side |
| **Client-supplied `provider_key` / `tier`** | Force expensive LLM or inactive adapter | Request contract **rejects** `providerKey`, `provider_key`, `tier`, `envKeyName`, `model`. Job resolves via `getProviderCatalog()` + server tier + `resolveProvider({ assetRole: "llm", … })` |
| **Client forges `must_disclose_not_owner` or script compliance flags** | Generic-avatar owner-claim scripts (legal exposure) | Column **server-set** at persist from `getBusinessProfileForAgents().visualModeSummary.mustDiscloseNotOwner`; request fields **`mustDiscloseNotOwner`**, **`must_disclose_not_owner`**, **`ruleFlags`** → **`FORBIDDEN_FIELDS`**. Prompt injection via `buildGenericDisclosurePromptHint()` — helper is convenience, **profile DTO is authority** |
| **Unvalidated LLM JSON persisted** | Corrupt scripts break Assembly/Caption; hidden payloads | Parse LLM response → Zod **`.strict()`** script schema (hook/body/CTA/on-screen/VO, duration bounds) → reject on failure, **no INSERT/UPDATE** |
| **Client supplies hook/body/CTA to skip agent** | Smuggle harmful or non-compliant copy | Batch/single-slot actions accept **`strategyId`** (+ **`slotIndex`** for regen) only — **no** client script text fields on generate paths |
| **IDOR via `strategyId` or script id** | Read/generate for another tenant | All loads scoped by server-resolved `client_id`; foreign id → **404** uniform |
| **Runaway generate / regen spam** | Runaway LLM spend | **Per-`client_id` rate limit** on script job creation via `neuramark_agent_rate_limits` (distinct `agent_key`); in-flight guard per batch scope; over-limit → **429**, **no LLM call** |
| **Agent job in client bundle** | Prompt templates, keys exposed | Script agent module **`import "server-only"`**; never imported from `"use client"` trees |
| **Prompt injection via strategy brief / profile text** | Hijack script tone, exfil, false owner claims | Delimited untrusted blocks (US-4.1 pattern); disclosure/modalidad rules injected **server-side**; output schema-validated |
| **RLS policy exposing scripts to `authenticated`** | Future browser SDK reads all clients' scripts | RLS **enabled, zero policies** on `neuramark_reel_scripts` |
| **`strategyHasScripts` stub left false** | US-4.2 lock-after-scripts never engages | US-5.1 **must implement** real EXISTS query; INSERT scripts only after approved check |

**Residual risk accepted:** Operator trust model — Operator can generate scripts for server-resolved client (V1: self). V1 disclosure trigger remains **profile allowlist proxy** (US-3.4) — conservative when `generic_avatar` ∈ allowlist even if slot is faceless; per-slot modality refinement deferred to US-4.x/US-10.1. Semantic sanitization of strategy/profile free text not attempted — containment is delimiter + output schema + persisted disclosure flag. Full cumulative spend cap lands US-7.1; US-5.1 rate limit is necessary but not sufficient alone. System/cron auto-script path is out of BUILD scope but job orchestrator must accept `invokedBy: "system"` from trusted server code only — **never** from browser.

---

## Assets and Trust Boundaries

| Asset | Sensitivity | Trust boundary |
|---|---|---|
| LLM API keys | Critical — direct financial abuse | Server env only; catalog `envKeyName`; never response/DB/client |
| `neuramark_reel_scripts` rows | Medium–High — drives video production | Service-role Node; Zod-validated before write; scoped by `client_id` |
| Approved strategy `brief` slot fields | Medium–High — **LLM fuel** | Loaded via `loadApprovedStrategyForScriptJob` only after `approved` + tenancy check |
| Profile fields (agents DTO) | Medium–High — PII; **LLM fuel** | `getBusinessProfileForAgents(clientId)` only |
| `must_disclose_not_owner` on script row | **Highest** — legal disclosure obligation | **Server-derived** from profile DTO at persist; never request authority |
| Playbook/Trend hints | Medium — **LLM fuel** | `getPlaybookForAgents()` / `getTrendSnapshotForWeek()` only |
| `strategyId`, `slotIndex` in action input | Medium — row pointers, not authority | Must pair with server-resolved `client_id` + approved status verification |
| Operator session | High — can trigger LLM spend | `requireOperator()` on generate/regenerate + script read |

**Boundaries:**

1. **Browser (Operator) → generate/regenerate Server Actions / RSC read** — Untrusted. Sends `strategyId` (+ `slotIndex` for regen). No script text, no `provider_key`, no disclosure flags, no `client_id` authority.
2. **Server Action → `requireOperator()` → rate limit → `loadApprovedStrategyForScriptJob()`** — Gate and approved-strategy verification **before** LLM I/O.
3. **Script agent job → trusted helpers → LLM** — Profile, approved brief slot, Playbook/Trend hints; `mustDiscloseNotOwner` from profile; provider via catalog.
4. **Agent job → Postgres** — Parameterized INSERT/UPDATE; set `must_disclose_not_owner` in same statement from server-computed value; RLS deny-by-default.
5. **US-4.2 lock consumer** — First script INSERT for `strategy_id` causes `strategyHasScripts()` → true → blocks brief edits (default locked).

---

## Abuse Cases Considered

- *As a Cliente, I can call generate scripts and burn LLM budget* → **Blocked:** `requireOperator("handler")` first; 403, no LLM call.
- *As a malicious actor, I can POST `{ strategyId: "<draft-uuid>" }` after guessing id* → **Blocked:** `loadApprovedStrategyForScriptJob` requires `status = 'approved'`; draft → **`STRATEGY_NOT_APPROVED`**, no LLM.
- *As a malicious actor, I can POST `{ strategyId, approved: true }` to skip status check* → **Blocked:** forbidden keys; server reloads row status independently.
- *As a malicious actor, I can POST `{ strategyId: "<victim-approved-uuid>" }`* → **Blocked:** SELECT includes server-resolved `client_id`; foreign → **404**.
- *As a malicious actor, I can POST `{ provider_key: "expensive" }` or `{ tier: "high" }`* → **Blocked:** forbidden fields; server resolves provider via catalog.
- *As a malicious actor, I can POST `{ mustDiscloseNotOwner: false }` to generate owner-claim scripts* → **Blocked:** forbidden fields; column set from profile at persist; prompt rules from profile DTO.
- *As a malicious actor, I can POST `{ hook: "...", body: "..." }` to inject script text* → **Blocked:** generate input schema excludes script content fields; only agent output persisted after validation.
- *As a malicious actor, I can regen slot 99 not in approved brief* → **Blocked:** `slotIndex` validated against loaded approved brief slots; invalid → **`VALIDATION_ERROR`**, no LLM.
- *As a malicious actor, I can coerce LLM to return extra keys or 5000-char on-screen text* → **Blocked:** Zod `.strict()` + max length bounds in CONTRACT; reject before persist.
- *As a malicious actor, I spam "Generate scripts" or per-slot regen* → **Blocked:** per-`client_id` rate limit + in-flight guard; 429, no LLM.
- *As a malicious actor, I read another client's scripts by id* → **Blocked:** read path `requireOperator` + `client_id` scope; foreign → 404.
- *As a malicious actor, I import the script agent module in a Client Component* → **Blocked:** `import "server-only"`.
- *As a malicious actor, I add RLS policies so `authenticated` SELECT all scripts* → **Blocked:** migration enables RLS with **zero** named policies.
- *As a malicious actor, I generate scripts then edit approved strategy brief* → **Blocked (US-4.2):** `strategyHasScripts()` true → **`STRATEGY_LOCKED`** on brief UPDATE once US-5.1 wires helper.

---

## Security Acceptance Criteria

Story `[SEC]` items from `plan/USER_STORIES.md` → US-5.1 are binding. Items marked **(added)** are new in this review — paste into the story when the PO next edits USER_STORIES.

**Inherited (still binding — do not weaken adjacent auth / provider / disclosure paths):**

- [ ] **[SEC] Every operator-only gate lives inside the Server Action / Route Handler itself** as `requireOperator()` on the `getCurrentUser()` result; middleware and UI hiding are convenience only *(US-14.5)*
- [ ] **[SEC] `requireOperator()` runs `requireActive()` first** — inactive operator has no access *(US-14.5)*
- [ ] **[SEC] RLS stays enabled with zero policies** on new `neuramark_*` tables; privileged access via Node service-role only *(US-14.5 / US-4.1)*
- [ ] **[SEC] Service-role key is used only from Node server modules** — never Client Components, never Edge middleware *(US-14.5)*
- [ ] **[SEC] Job-creation / agent input schemas must not accept client-authoritative `provider_key` or `tier`** — server resolves via policy + `getProviderCatalog()` + `resolveProvider` *(US-X.4 / US-7.2 floor)*
- [ ] **[SEC] `getBusinessProfileForAgents` is server-only and the only profile read path for agents** — no raw interview SELECT *(US-2.3)*
- [ ] **[SEC] `mustDiscloseNotOwner` is read from `getBusinessProfileForAgents` only** — never from request body, job client JSON, or LLM output authority *(US-3.4)*

**US-5.1 story `[SEC]` (existing in USER_STORIES.md):**

- [ ] **[SEC] Script generation verifies server-side that the referenced strategy is `approved` and belongs to the current client before invoking the agent** *(USER_STORIES US-5.1)*
- [ ] **[SEC] Agent output is schema-validated (hook/body/CTA/on-screen/VO fields, duration bounds) before persistence; rule flags like `must_disclose_not_owner` are injected from the server-side profile, never from request input** *(USER_STORIES US-5.1)*

**Added in this review (binding for US-5.1 BUILD):**

- [ ] **[SEC] (added) `generateReelScripts` Server Action** (batch — all slots for approved strategy) calls `requireOperator("handler")` as its **first** await before rate-limit check, validation, strategy load, or LLM I/O; failure → 401/403, **no side effects**, **no LLM call**
- [ ] **[SEC] (added) `regenerateReelScriptSlot` Server Action** calls `requireOperator("handler")` as its **first** await before rate-limit check, validation, strategy load, or LLM I/O; failure → 401/403, **no side effects**, **no LLM call**
- [ ] **[SEC] (added) Script list read path** (RSC loader and/or gated read action) calls `requireOperator("page" \| "handler")` before SELECT; Cliente sessions → **403**. Cliente read UI **out of US-5.1 BUILD**
- [ ] **[SEC] (added) Approved-strategy verification — independent of caller:** server helper `loadApprovedStrategyForScriptJob({ strategyId, clientId })` performs `SELECT … WHERE id = $strategyId AND client_id = $clientId AND status = 'approved'`. Used by **every** generate/regenerate path. Null / non-approved → **`STRATEGY_NOT_APPROVED`** or **`NOT_FOUND`** (uniform 404 for cross-tenant), **no LLM call**. **Never** trust client `approved`, `status`, or preloaded strategy DTO without this reload
- [ ] **[SEC] (added) Target `client_id` is server-resolved only** — V1 lean: `getCurrentUser().id` after `requireOperator()`. Request body/query **must not** carry authoritative `client_id`
- [ ] **[SEC] (added) Client request schemas exclude authoritative fields:** `clientId`, `client_id`, `providerKey`, `provider_key`, `tier`, `envKeyName`, `model`, `status`, `approved`, `mustDiscloseNotOwner`, `must_disclose_not_owner`, `ruleFlags`, `hook`, `body`, `cta`, `onScreenText`, `voiceoverText`, `voiceover_text`, `on_screen_text`, `targetDurationSec`, `brief`, and all US-4.1 forbidden provider/auth keys. Presence → **`FORBIDDEN_FIELDS`**
- [ ] **[SEC] (added) Batch generate input (lean):** `{ strategyId }` only — `.strict()`. **Regenerate input (lean):** `{ strategyId, slotIndex }` — `.strict()`. `slotIndex` must exist on loaded approved brief; else **`VALIDATION_ERROR`**, no LLM
- [ ] **[SEC] (added) Script agent job module uses `import "server-only"`** (lean: `lib/agents/content/generate-reel-script.ts` or CONTRACT exact). LLM invocation, prompt assembly, provider call **must not** live in Client Components
- [ ] **[SEC] (added) Agent inputs assembled only via trusted helpers:** approved strategy slot from `loadApprovedStrategyForScriptJob`; `getBusinessProfileForAgents(clientId)`; `getPlaybookForAgents()`; `getTrendSnapshotForWeek(strategy.weekStart)` — **no** direct SELECT on profile/strategy/playbook/trend tables from agent module
- [ ] **[SEC] (added) LLM provider resolution:** `getProviderCatalog()` → server-resolved tier (V1: global default `low` until US-7.1) → `resolveProvider(catalog, { assetRole: "llm", tier, llmVariant: "default" })`. API key via `process.env[row.envKeyName]` in adapter only
- [ ] **[SEC] (added) Prompt-injection containment — delimited untrusted blocks:** wrap strategy slot text (tema, angle, ctaHint), profile fields, Playbook/Trend hints in fixed delimiters (same family as US-4.1). System instructions outside delimiters state delimited content is data, not instructions
- [ ] **[SEC] (added) Prompt-injection containment — server-injected rules:** `mustDiscloseNotOwner` (via `buildGenericDisclosurePromptHint` + trusted instruction block), per-slot `modalidad` from **approved brief** (not client), duration target bounds, Instagram Reels channel — computed server-side; **never** from request or LLM output authority
- [ ] **[SEC] (added) Output validation before persist:** parse LLM response → map to script package → Zod **`.strict()`** schema with bounded fields: `hook`, `body`, `cta`, `onScreenText`, `voiceoverText`, `targetDurationSec` (CONTRACT frozen min/max, lean **15–45** inclusive). On failure: typed error to Operator, **no INSERT/UPDATE**. Batch path: **no partial persist** — all slots succeed validation or entire batch rolls back (single transaction or compensating delete — CONTRACT picks one)
- [ ] **[SEC] (added) `must_disclose_not_owner` persist rule:** on INSERT/UPDATE set column `must_disclose_not_owner = (profile.visualModeSummary.mustDiscloseNotOwner === true)` in the **same SQL statement** as script fields; value **never** read from request body or LLM JSON. Column exposed in Operator read DTO as boolean for QA/US-5.2 consumers
- [ ] **[SEC] (added) Per-`client_id` script job rate limit:** reuse `neuramark_agent_rate_limits` with distinct `agent_key` (lean: `video_script_generate`). CONTRACT frozen limits (lean: **max 5 successful batch/regen job attempts per `client_id` per rolling 60 minutes**, plus **max 1 in-flight** batch per `client_id`+`strategy_id`, plus **max 1 in-flight** single-slot regen per `client_id`+`strategy_id`+`slot_index`). Over-limit → **`RATE_LIMITED`**, **no LLM call**. UI debounce is UX only
- [ ] **[SEC] (added) `neuramark_reel_scripts` migration:** includes `client_id` FK NOT NULL, `strategy_id` FK NOT NULL → `neuramark_content_strategies(id)`, `slot_index` NOT NULL, script text columns, `target_duration_sec`, `must_disclose_not_owner` boolean NOT NULL, timestamps; **UNIQUE** `(strategy_id, slot_index)`; index on `(client_id, strategy_id)`; parameterized queries only
- [ ] **[SEC] (added) RLS deny-by-default on `neuramark_reel_scripts`:** `ENABLE ROW LEVEL SECURITY` with **zero** named policies; all reads/writes via service-role Node helpers
- [ ] **[SEC] (added) IDOR-safe script reads:** SELECT by script id or strategy id **always** includes `WHERE client_id = $serverResolvedClientId`; missing/forbidden → **404** uniform
- [ ] **[SEC] (added) Wire `strategyHasScripts()`:** replace US-4.2 stub with `EXISTS (SELECT 1 FROM neuramark_reel_scripts WHERE strategy_id = $1)` when table exists; US-4.2 lock path must begin enforcing after US-5.1 migration lands
- [ ] **[SEC] (added) INSERT/UPDATE scripts only when strategy verified `approved`:** even regen path re-runs `loadApprovedStrategyForScriptJob` immediately before persist
- [ ] **[SEC] (added) Trusted system invocation seam:** job orchestrator function accepts `invokedBy: "operator" \| "system"`; **`invokedBy: "system"`** callable only from server modules (cron/orchestration — future story), **never** from browser-exposed action without `requireOperator`. Public Operator Server Actions always gate at handler
- [ ] **[SEC] (added) Response shapes minimal:** Operator read DTO exposes script fields for UI — **no** LLM raw response, prompt text, provider env names, or keys. Script text rendered as plain text (no HTML)
- [ ] **[SEC] (added) Logging:** log `strategyId`, `clientId`, `slotIndex`, action, error **codes**, provider **key slug** only — never full prompts, script bodies, or env values
- [ ] **[SEC] (added) Automated security tests cover at least:** non-operator generate/regen/read → 403 no LLM/no write; draft strategy id → `STRATEGY_NOT_APPROVED` no LLM; foreign `strategyId` → 404; smuggled `provider_key` / `mustDiscloseNotOwner` / script text fields → `FORBIDDEN_FIELDS`; invalid LLM output → no persist; `must_disclose_not_owner` column matches profile mock on insert; rate limit → 429 no LLM; `strategyHasScripts` true after insert; RLS enabled zero policies; agent module has `server-only`

---

## Design Concerns and Required Changes

### Frozen design choices (must land in CONTRACT)

#### 1. Operator gate — generate, regen, read (APPROVE)

| Surface | Gate |
|---|---|
| `generateReelScripts` Server Action | `requireOperator("handler")` **first** |
| `regenerateReelScriptSlot` Server Action | `requireOperator("handler")` **first** |
| Script list RSC loader / read action | `requireOperator("page" \| "handler")` |
| Script agent job module | No session gate inside (trusted caller = gated action or system orchestrator) |
| Cliente script read | **Out of US-5.1 BUILD** |

#### 2. Approved-strategy loader — caller-independent (APPROVE)

```ts
// Frozen pattern — CONTRACT exact helper name
async function loadApprovedStrategyForScriptJob(params: {
  strategyId: string;
  clientId: string; // server-resolved
}): Promise<ApprovedStrategyForScript | null> {
  // SELECT ... WHERE id = strategyId AND client_id = clientId AND status = 'approved'
  // Parse brief with contentStrategyBriefSchema; null → NOT_FOUND / STRATEGY_NOT_APPROVED
}
```

| Rule | Detail |
|---|---|
| Used by | Batch generate, single-slot regen, and any future system orchestrator |
| Not sufficient | `getApprovedStrategyForWeek({ weekStart })` alone when UI passes explicit `strategyId` — must verify **that row** is approved |
| Multiple approved rows | Allowed per US-4.2; caller must pass explicit `strategyId`; loader enforces status on that id |

#### 3. Server-only script agent job (APPROVE)

| Rule | Detail |
|---|---|
| Module | `import "server-only"` under `lib/agents/content/` |
| Invocation | Gated Server Action or trusted `invokedBy: "system"` orchestrator only |
| Keys | Server env via catalog adapter; never in responses or `neuramark_reel_scripts` |
| HTTP | **No** public generate/status Route Handler in V1 BUILD |

#### 4. Schema validation before persist (APPROVE)

| Field | Constraint (lean — CONTRACT freezes exact max lengths) |
|---|---|
| `hook` | Non-empty string; max length frozen in CONTRACT |
| `body` | Non-empty string; max length frozen |
| `cta` | Non-empty string; max length frozen |
| `onScreenText` | String; max length frozen (US-5.2 adds UI warnings) |
| `voiceoverText` | String; max length frozen |
| `targetDurationSec` | Integer **15–45** inclusive |
| Unknown keys | Zod `.strict()` reject |

On validation failure: **no row written**. Batch: atomic all-slots or explicit rollback — no orphaned partial scripts.

#### 5. `must_disclose_not_owner` — server-injected (APPROVE)

| Layer | Rule |
|---|---|
| Authority | `getBusinessProfileForAgents(clientId).visualModeSummary.mustDiscloseNotOwner` |
| Prompt | Optional `buildGenericDisclosurePromptHint(mustDisclose, locale)` — **not** authority |
| Persist | Column `must_disclose_not_owner boolean NOT NULL` set in INSERT/UPDATE from authority |
| Request | **Forbidden:** `mustDiscloseNotOwner`, `must_disclose_not_owner`, `ruleFlags` |
| LLM output | Must not include a client-writable rule flag field; if model returns one, strip before validation or reject via `.strict()` |

V1 trigger remains allowlist proxy (US-3.4) — conservative legal posture.

#### 6. Provider resolution — catalog, not client (APPROVE)

Same stack as US-4.1: `getProviderCatalog()` → tier from policy → `resolveProvider({ assetRole: "llm", … })`. Extend forbidden-key list on script actions mirroring `findForbiddenContentStrategyKeys`.

#### 7. Rate limit — per client (APPROVE WITH CONDITIONS)

| Rule | Detail |
|---|---|
| Storage | Reuse `neuramark_agent_rate_limits` with `agent_key = 'video_script_generate'` (CONTRACT exact) |
| Key | Server-resolved `client_id` |
| Lean limits | **5** job attempts / client / **60 min**; in-flight guards on batch and single-slot keys |
| Over-limit | `RATE_LIMITED`, no LLM |
| Distinct from US-4.1 | Separate `agent_key` — strategy generate limits do not share bucket with script limits |

**Condition:** CONTRACT may tune numbers but must keep per-client server enforcement.

#### 8. RLS — deny-by-default on `neuramark_reel_scripts` (APPROVE)

```sql
CREATE TABLE public.neuramark_reel_scripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.neuramark_clients(id),
  strategy_id uuid NOT NULL REFERENCES public.neuramark_content_strategies(id),
  slot_index integer NOT NULL,
  hook text NOT NULL,
  body text NOT NULL,
  cta text NOT NULL,
  on_screen_text text NOT NULL,
  voiceover_text text NOT NULL,
  target_duration_sec integer NOT NULL,
  must_disclose_not_owner boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT neuramark_reel_scripts_strategy_slot_unique UNIQUE (strategy_id, slot_index),
  CONSTRAINT neuramark_reel_scripts_duration_check
    CHECK (target_duration_sec >= 15 AND target_duration_sec <= 45)
);

ALTER TABLE public.neuramark_reel_scripts ENABLE ROW LEVEL SECURITY;
-- Zero named policies → deny-by-default for anon/authenticated roles.
```

Do **not** add `authenticated` SELECT/INSERT policies.

#### 9. `strategyHasScripts()` — wire real implementation (APPROVE WITH CONDITIONS)

| Rule | Detail |
|---|---|
| Owner | US-5.1 replaces stub in `lib/content-strategy/strategy-has-scripts.ts` |
| Query | `EXISTS (SELECT 1 FROM neuramark_reel_scripts WHERE strategy_id = $1)` |
| Effect | US-4.2 `updateContentStrategyBrief` begins returning **`STRATEGY_LOCKED`** when scripts exist (default env locked) |
| Test | US-5.1 tests prove insert → `strategyHasScripts(id) === true` |

**Condition:** US-4.2 tests using stub may need update when table exists — coordinate in BUILD.

#### 10. Single-slot regenerate (APPROVE)

| Rule | Detail |
|---|---|
| Input | `{ strategyId, slotIndex }` only |
| Preconditions | Approved strategy loaded; slot exists in brief; rate limit ok |
| Persist | UPSERT on `(strategy_id, slot_index)` — replaces one row; re-set `must_disclose_not_owner` from fresh profile read |
| Scope | Does **not** delete sibling slot scripts |

---

## Future-Proofing Notes

- **US-4.2 lock** becomes live when this story ships — document in release notes for Operator workflow.
- **US-6.1 Caption** references `reel_script_id` — FK and tenancy inherit from script row.
- **US-7.1 budget** complements rate limit; do not skip rate limit when budget story lands.
- **US-10.1 QA** reads persisted `must_disclose_not_owner` + runs `generic_avatar_not_owner` check — do not duplicate rule authority in QA input from client.
- **System/cron auto-script** after strategy (SPEC auto-avance) — orchestration story calls same job module with `invokedBy: "system"`; must still run `loadApprovedStrategyForScriptJob` (or auto-approve path from US-4.2 SPEC interpretation — if system accepts `draft`, that is a **separate CONTRACT decision**; Operator manual path **always** requires `approved`).
- **Multi-client Operator picker:** `client_id` from server-validated context, not POST body.
- **Real auth:** same patterns survive; `requireOperator` + server-resolved tenancy unchanged.

---

## CONTRACT.md Checklist (pre-implementation)

When `plan/stories/US-5.1/CONTRACT.md` exists, spot-check before BUILD:

- [ ] `generateReelScripts` + `regenerateReelScriptSlot` frozen; both start with `requireOperator("handler")`
- [ ] Input schemas: batch `{ strategyId }`; regen `{ strategyId, slotIndex }` — `.strict()`, no script text, no provider/disclosure fields
- [ ] `loadApprovedStrategyForScriptJob({ strategyId, clientId })` with `status = 'approved'` guard
- [ ] Forbidden-key list + `FORBIDDEN_FIELDS` envelope
- [ ] `reelScriptPackageSchema.strict()` field bounds + duration 15–45
- [ ] `must_disclose_not_owner` column server-set; prompt authority from profile DTO
- [ ] Migration + RLS deny-by-default on `neuramark_reel_scripts`
- [ ] `strategyHasScripts()` real implementation + US-4.2 cross-ref
- [ ] Rate limit `agent_key` + limits frozen
- [ ] Provider resolution via catalog; no client `provider_key`
- [ ] `invokedBy: "operator" \| "system"` on orchestrator; public actions gated
- [ ] Read IDOR pattern; minimal Operator DTO; plain-text script fields
- [ ] Out of scope: Caption, cost engine, QA job, US-5.2 warnings, Cliente read, cron scheduler

---

## CONTRACT freeze list (binding `[SEC]` summary)

Paste into CONTRACT **Security** section — do not reopen without security-architect review.

1. **Gate:** `requireOperator("handler")` **first** on **`generateReelScripts`** and **`regenerateReelScriptSlot`**; script read via `requireOperator("page" \| "handler")`; 401/403, no LLM/write on failure.
2. **Approved strategy (caller-independent):** **`loadApprovedStrategyForScriptJob({ strategyId, clientId })`** requires `status = 'approved'` + tenancy match **before every** agent invoke and persist; **`STRATEGY_NOT_APPROVED`** / **404** on failure; never trust client status flags.
3. **Tenancy:** `client_id` **server-resolved only**; every SELECT/INSERT/UPDATE includes tenancy filter; IDOR → **404**.
4. **Forbidden input:** no `provider_key`, `tier`, `mustDiscloseNotOwner`, script text fields, or authority smuggles — **`FORBIDDEN_FIELDS`**.
5. **Schema validation:** Zod **`.strict()`** on agent output (hook/body/CTA/on-screen/VO, duration **15–45**) **before** persist; batch atomic — no partial orphan scripts.
6. **Disclosure:** `must_disclose_not_owner` column **server-injected** from **`getBusinessProfileForAgents`** at persist; prompt hint optional; **never** from request.
7. **Provider:** catalog + `resolveProvider({ assetRole: "llm", … })`; keys server-env only.
8. **Rate limit:** `neuramark_agent_rate_limits` with script `agent_key`; per-`client_id` server enforcement; **429** over limit, no LLM.
9. **RLS:** `neuramark_reel_scripts` **enabled, zero policies**; service-role Node only.
10. **Lock handoff:** implement **`strategyHasScripts()`** EXISTS query; US-4.2 brief lock engages when scripts exist.
11. **Agent module:** `import "server-only"`; trusted helpers only; delimited untrusted prompt data.
12. **Logging:** ids + codes only — no full prompts/script bodies in prod logs.
13. **Tests:** operator gate, approved gate, IDOR, forbidden fields, schema reject, disclosure column, rate limit, RLS, `strategyHasScripts` wiring.

---

## BUILD vetoes (summary)

1. **Generate or regen without `requireOperator()`** on Operator-facing actions (including dev bypass).
2. **Invoking agent without `loadApprovedStrategyForScriptJob` approved + tenancy check** — including trusting caller-supplied status.
3. **Accepting `provider_key`, `tier`, `mustDiscloseNotOwner`, or script text fields from the request.**
4. **Persisting LLM output without Zod `.strict()` validation** or persisting partial batch on slot failure.
5. **Setting `must_disclose_not_owner` from request body or LLM JSON** instead of profile DTO at persist.
6. **SELECT/UPDATE by `strategyId` or script id without server-resolved `client_id` filter.**
7. **Public Route Handler for script generate/status without operator gate.**
8. **RLS policies granting `authenticated` access** to `neuramark_reel_scripts`.
9. **Leaving `strategyHasScripts()` as unconditional `false`** after table migration.
10. **Importing script agent module from Client Components** or exposing LLM keys in responses/logs.
11. **Logging full prompts or script bodies in production.**

---

## Open questions — SECURITY resolutions

| # | Question | Resolution |
|---|---|---|
| 1 | Operator vs System actor? | **Both.** Public Server Actions = Operator-gated. Job module accepts `invokedBy: "system"` from trusted server orchestrator only. Browser never calls system path directly. |
| 2 | Verify approved via week vs explicit id? | **Explicit `strategyId`** in action input; loader verifies **that row** is `approved` + tenant-scoped. |
| 3 | Batch partial failure? | **No partial persist** — transaction or rollback; CONTRACT picks mechanism. |
| 4 | Rate limit separate from US-4.1? | **Yes** — distinct `agent_key`; same table, separate bucket. |
| 5 | Store `must_disclose_not_owner` on row? | **Yes** — NOT NULL column, server-set at write; QA/downstream read without re-deriving from stale profile. |
| 6 | System path without Operator approve (SPEC auto-avance)? | **Out of US-5.1 BUILD** — Operator manual path **requires `approved`**. Cron/orchestration story must align with US-4.2 dual-path CONTRACT; do not weaken Operator gate in this story. |

---

## Recommended action

**APPROVE WITH CONDITIONS.** Proceed to **CONTRACT.md** (nextjs-backend). Binding floors above must appear in CONTRACT before BUILD. FE signoff after CONTRACT (script list + expand/copy consume gated read DTO only; generate/regen buttons call gated actions with `strategyId` / `slotIndex` only — no script fields in request).
