# Security Design Review — US-4.1

**Story:** US-4.1 — Generate weekly Instagram content strategy  
**Date:** 2026-08-29  
**Reviewer:** security-architect  
**Sources:** `plan/USER_STORIES.md` (US-4.1, all `[SEC]`), `plan/SECURITY_BASELINE.md` (Content Strategy Agent), `plan/stories/US-14.5/SECURITY.md` (`requireOperator` floor), `plan/stories/US-2.3/SECURITY.md` (`getBusinessProfileForAgents` trusted-caller pattern), `plan/stories/US-16.1/SECURITY.md` + `US-16.2/SECURITY.md` (Playbook/Trend agent helpers), `plan/stories/US-X.4/SECURITY.md` (provider catalog / `resolveProvider` floor), `lib/auth/require-user.ts`, `lib/profile/get-business-profile-for-agents.ts`, `lib/providers/get-provider-catalog.ts`, `lib/providers/provider-adapters.ts`, `SPEC.md` §3 Content Strategy Agent  
**Status:** Binding for implementing agents; validated by requirements-validator like any other acceptance criterion. Do not treat this file as CONTRACT.md. Do not check off `USER_STORIES.md` AC here.

---

## Verdict: APPROVE WITH CONDITIONS

The story shape is correct and SPEC-aligned: an **Operator-gated** Server Action (or equivalent handler) triggers a **server-only** Content Strategy LLM job that assembles inputs exclusively from trusted server helpers (`getBusinessProfileForAgents`, `getPlaybookForAgents`, `getTrendSnapshotForWeek`), resolves the LLM provider via **`getProviderCatalog()` + `resolveProvider({ assetRole: "llm", tier, llmVariant: "default" })`** — never client input — reads API keys from **server env only** (via catalog `envKeyName`), wraps all Cliente/Operator-authored text as **delimited untrusted data** in prompts, **Zod-validates** LLM output against a typed brief schema **before** INSERT into `neuramark_content_strategies`, applies **per-`client_id` rate limiting** on generate, and stores rows with **`client_id` server-resolved** under **RLS deny-by-default** (zero policies; service-role Node only).

No REDESIGN. No veto of PO lean defaults (regenerate = new row/version without deleting approved history; Instagram Reels only; draft status on create; Operator-only generate/read in V1). Orchestrator may proceed to **CONTRACT.md** after freezing the items below.

**Inherited floors (US-14.5 / US-2.3 / US-16.1 / US-16.2 / US-X.4 — do not weaken):** `requireOperator()` calls `requireActive()` first; role never from request; middleware is convenience; handler-level gates mandatory; agent input helpers are `import "server-only"` with no HTTP surface; profile read is `getBusinessProfileForAgents(clientId)` only — never raw interview; Playbook/Trend reads via `getPlaybookForAgents()` / `getTrendSnapshotForWeek()` only; provider resolution via catalog + policy tier — no client `provider_key`; RLS enabled with zero named policies; service-role Node only; no `@supabase/supabase-js` in Client Components; no browser Supabase keys.

**This story owns:** `neuramark_content_strategies` migration; Zod brief schema + agent I/O contracts; server-only strategy agent job module (`lib/agents/content/` lean); Operator-gated generate Server Action; Operator-gated strategy brief read (RSC loader or gated action); per-client generate rate limit; security tests for operator gate, prompt delimiter usage, schema reject-before-persist, provider resolution path, rate limit, RLS posture, no key leakage.

**This story does not own:** Operator edit/approve workflow (US-4.2); Video Script jobs (US-5.x); cost-policy engine / cumulative budget enforcement (US-7.1/7.2 — rate limit here is first spend guard); Cliente read UI for strategy brief (SPEC mentions later; US-4.1 AC is Operator-only); automated weekly cycle scheduler (orchestration story); auth redesign.

**Terminology:** **Estrategia semanal** · **Formato de Reel** · **Táctica de tendencia** · **Modalidad de producción** · **Operator** · **Cliente** · **Ficha viva**. Technical names `getBusinessProfileForAgents`, `getPlaybookForAgents`, `getTrendSnapshotForWeek`, `getProviderCatalog`, `resolveProvider` are canonical. Do not use CONTEXT _Evitar_ terms in product-facing docs.

---

### Threat Summary (US-4.1–specific)

| Threat | Impact | Mitigation in this story |
|---|---|---|
| **Non-operator triggers LLM spend** | Cliente or anonymous user burns vendor budget, writes strategy rows | **Generate** Server Action calls `requireOperator("handler")` as **first** await before validation, rate limit, or LLM I/O. Failure → 401/403, **no side effects**, **no LLM call** |
| **Non-operator reads strategy brief** | Cliente sees Operator planning artifacts or another tenant's brief | **Read** path (RSC loader / detail action) calls `requireOperator("page" \| "handler")` before SELECT. Cliente read is **out of US-4.1 BUILD** |
| **Client-supplied `client_id` / `provider_key` / `tier`** | IDOR, force expensive provider, cross-tenant generation | Request contract **must not** accept authoritative `client_id`, `provider_key`, `tier`, or `envKeyName`. Target `client_id` resolved **server-side** (V1: session `getCurrentUser().id` when Operator acts for self; future: job row / server-side Operator selection — never raw body) |
| **LLM keys in client bundle or DB** | Full vendor account compromise | Keys live in server env only (`process.env[envKeyName]`). Catalog stores **env var names** only (US-X.4). Agent module `import "server-only"`. Responses never include keys, env names, or raw provider payloads |
| **Prompt injection via profile / Playbook / Trend text** | Attacker steers weekly plan ("ignore instructions", exfil, harmful CTAs) | All free-text inputs wrapped in **fixed delimiters** with explicit "untrusted data" system framing; **output** validated with Zod brief schema; malformed / out-of-schema LLM JSON **rejected, not stored**; rule flags (`mustDiscloseNotOwner`, modalidad allowlist) injected **server-side** from profile DTO — never from request |
| **Unvalidated LLM JSON persisted** | Corrupt brief breaks Script agent; hidden instruction payloads in `brief` jsonb | Parse LLM response → Zod `.strict()` brief schema → reject on failure (typed error to Operator UI). No partial persist of slots |
| **Runaway generate clicks / scripted spam** | Runaway LLM spend per client | **Per-`client_id` rate limit** on generate (CONTRACT exact window/count). Over-limit → 429 typed error, **no LLM call**. Optional in-flight guard for same `client_id` + `week_start` |
| **Agent job in client bundle** | Prompt templates, env resolution, spend path exposed | Strategy agent + LLM adapter invocation in **`import "server-only"`** module under `lib/agents/content/`. Never import from `"use client"` trees |
| **Direct interview / raw table reads in prompts** | Over-disclosure, bypass strip lists | Job **must** call `getBusinessProfileForAgents(clientId)` only — **never** `neuramark_interview_sessions` SELECT, never Cliente profile DTO |
| **Direct Playbook/Trend SELECT in agent** | Skip strip rules (`ejemplo_referencia`), stale slugs | Import **`getPlaybookForAgents()`** and **`getTrendSnapshotForWeek(weekStart)`** only — no direct catalog/snapshot table reads from agent module |
| **RLS policy exposing strategies to `authenticated`** | Future browser SDK reads/writes all clients' briefs | RLS **enabled, zero policies** on `neuramark_content_strategies`. All access via service-role Node helpers |
| **IDOR on strategy id** | Operator or future Cliente reads another client's brief by UUID | SELECT/INSERT always filter by **server-resolved** `client_id`. Foreign/missing strategy id → **404** (no existence oracle) |
| **Logging prompts / full brief / keys** | PII and strategy text in logs; key leakage | Log **client_id, week_start, strategy id, provider key slug, error codes** only — never full prompts, profile fields, or env values |

**Residual risk accepted:** Operator role can generate strategy for any **server-resolved** client they are authorized to act on (V1: effectively self). That is product intent — Operator trust model, SQL-promoted role. Playbook/Trend hint text remains **untrusted data** at LLM time; containment is delimiter + output schema, not semantic sanitization. Full cumulative spend cap lands US-7.1/7.2; US-4.1 rate limit is necessary but not sufficient alone.

---

## Assets and Trust Boundaries

| Asset | Sensitivity | Trust boundary |
|---|---|---|
| LLM API keys (SiliconFlow / etc.) | Critical — direct financial abuse | Server env only; resolved via catalog `envKeyName`; never DB value, never response, never client |
| `neuramark_content_strategies.brief` jsonb | Medium–High — drives all Reel production for the week | Service-role Node; Zod-validated before write; scoped by `client_id` |
| Profile fields (via agent DTO) | Medium–High — business PII; **LLM fuel** | `getBusinessProfileForAgents(clientId)` only; delimited in prompt |
| Playbook hints (via agent DTO) | Medium — **LLM fuel** (Operator-curated, untrusted at prompt time) | `getPlaybookForAgents()` only; delimited in prompt |
| Trend táctica hints (via agent DTO) | Medium — **LLM fuel** | `getTrendSnapshotForWeek(weekStart)` only; `ejemplo_referencia` already stripped upstream |
| `client_id` on strategy rows | High — tenancy key | Server-resolved only; never request authority |
| `week_start` | Medium — partition key | Server-normalized ISO Monday; validated in action input |
| Provider catalog row (full) | High — margin + env var names | `getProviderCatalog()` server-only; downstream UI gets resolved label only (future US-7.1) |
| Operator session | High — can trigger LLM spend | `requireOperator()` on generate + read |

**Boundaries:**

1. **Browser (Operator) → Generate Server Action / RSC read** — Untrusted. No Supabase SDK. No LLM keys. No `client_id` / `provider_key` as authority. Operator UI sends minimal intent (`weekStart` optional per CONTRACT).
2. **Server Action → `requireOperator()` → rate limit → agent job** — Gate before spend. Rate limit keyed by server-resolved `client_id`.
3. **Agent job → trusted helpers → LLM provider** — Profile/Playbook/Trend via server-only helpers; provider via `getProviderCatalog()` + `resolveProvider()`; tier from server-resolved cost policy (V1: global default `low` from seed until US-7.1).
4. **Agent job → Postgres** — Parameterized INSERT into `neuramark_content_strategies`; brief validated; service-role; RLS deny-by-default.
5. **LLM provider → agent job** — Treat response as **untrusted external input**; schema-validate before persist; never `eval` or execute model output.

---

## Abuse Cases Considered

- *As a Cliente, I can call the generate Server Action and burn LLM budget* → **Blocked:** `requireOperator("handler")` first; 403, no LLM call.
- *As a malicious actor, I can POST `{ clientId: "<victim>" }` and generate/read their strategy* → **Blocked:** request contract **rejects or ignores** browser-supplied `client_id`; target resolved server-side. Reads scoped to same resolved id; foreign strategy UUID → 404.
- *As a malicious actor, I can POST `{ provider_key: "heygen_high" }` or `{ tier: "high" }` to force expensive LLM* → **Blocked:** job input schema has **no** client-authoritative provider fields; server resolves via `getProviderCatalog()` + policy tier + `resolveProvider({ assetRole: "llm", llmVariant: "default" })`.
- *As a malicious actor, I can import the strategy agent module in a Client Component and read prompts/keys* → **Blocked:** `import "server-only"` on agent job module; must not appear in client graphs.
- *As a malicious actor, I put "ignore previous instructions" in interview answers to hijack the strategy* → **Contained:** profile text passed as delimited untrusted data; system instructions separate; output schema-validated; invalid output not stored.
- *As a malicious actor, I put injection payloads in Playbook/Trend hints (Operator-curated)* → **Contained:** same delimiter treatment; hints never executed; output schema bounds slot shape; slug fields must match server-resolved allowlists post-parse.
- *As a malicious actor, I coerce the LLM to return extra JSON keys or 50 Reel slots* → **Blocked:** Zod `.strict()` brief schema with bounded slot count (≥3 per AC, max frozen in CONTRACT); unknown keys rejected.
- *As a malicious actor, I spam "Generate strategy" to drain LLM credits* → **Blocked:** per-`client_id` server rate limit; 429 without LLM call; US-7.x adds cumulative budget later.
- *As a malicious actor, I read strategy brief without Operator role* → **Blocked:** read loader/action uses `requireOperator("page" \| "handler")`; 403.
- *As a malicious actor, I fetch `/api/content-strategies` or poll an unauthenticated job status endpoint* → **Blocked:** no public Route Handler for generate/read/status in US-4.1 BUILD unless explicitly gated — BUILD veto if added without story.
- *As a malicious actor, I store LLM API keys in `brief` jsonb via prompt exfil trick* → **Mitigated:** output schema forbids key-shaped fields; read-time validation; do not persist on schema failure.
- *As a malicious actor, I add RLS policies so `authenticated` users SELECT all strategies* → **Blocked:** migration enables RLS with **zero** named policies.
- *As a malicious actor, I trigger generation without a valid profile* → **Blocked:** if `getBusinessProfileForAgents` returns `{ exists: false }` or `loadFailed`, abort before LLM call with typed Operator error (no empty strategy row).

---

## Security Acceptance Criteria

Story `[SEC]` items from `plan/USER_STORIES.md` → US-4.1 are binding. Items marked **(added)** are new in this review — paste them into the story when the PO next edits USER_STORIES. Do not drop or weaken any existing `[SEC]` line.

**Inherited (still binding — do not weaken adjacent auth / provider paths):**

- [ ] **[SEC] Every operator-only gate lives inside the Server Action / Route Handler itself** as `requireOperator()` on the `getCurrentUser()` result; middleware and UI hiding are convenience only *(US-14.5)*
- [ ] **[SEC] `requireOperator()` runs `requireActive()` first** — inactive operator has no access *(US-14.5)*
- [ ] **[SEC] RLS stays enabled with zero policies** on new `neuramark_*` tables; privileged access via Node service-role only *(US-14.5 / Fase 1)*
- [ ] **[SEC] Service-role key is used only from Node server modules** — never Client Components, never Edge middleware *(US-14.5)*
- [ ] **[SEC] Job-creation / agent input schemas must not accept client-authoritative `provider_key` or `tier`** — server resolves via policy + `getProviderCatalog()` + `resolveProvider` *(US-X.4 / US-7.2 floor)*
- [ ] **[SEC] `getBusinessProfileForAgents` is server-only and the only profile read path for agents** — no raw interview SELECT *(US-2.3)*

**US-4.1 story `[SEC]` (existing):**

- [ ] **[SEC] Agent job runs server-side only; LLM provider keys are read from server env and never reach the client or the DB**
- [ ] **[SEC] Client-authored profile text is passed to the LLM as clearly delimited data, and agent output is validated against a typed brief schema before storage (prompt-injection containment: malformed or out-of-schema output is rejected, not stored)**
- [ ] **[SEC] "Generate strategy" is rate-limited/debounced server-side per client to prevent runaway LLM spend from repeated clicks or scripted calls**

**Added in this review:**

- [ ] **[SEC] (added) Generate strategy Server Action** calls `requireOperator("handler")` as its **first** await before rate-limit check, validation, helper loads, or LLM I/O; failure → 401/403, **no side effects**, **no LLM call**
- [ ] **[SEC] (added) Strategy brief read path** (RSC loader and/or gated read action) calls `requireOperator("page" \| "handler")` before SELECT; Cliente sessions → **403**, not empty brief masquerading as success. Cliente read UI is **out of US-4.1 BUILD**
- [ ] **[SEC] (added) Target `client_id` is server-resolved only** — V1 lean: `getCurrentUser().id` after `requireOperator()`. Request body/query **must not** carry authoritative `client_id`. Invalid/missing profile for resolved id → typed error, **no LLM call**, **no INSERT**
- [ ] **[SEC] (added) Strategy agent job module uses `import "server-only"`** (lean: `lib/agents/content/strategy/` or CONTRACT exact). Content Strategy LLM invocation, prompt assembly, and provider adapter call **must not** live in Client Components or shared FE barrels
- [ ] **[SEC] (added) Agent inputs assembled only via trusted helpers:** `getBusinessProfileForAgents(clientId)`, `getPlaybookForAgents()`, `getTrendSnapshotForWeek(weekStart)` — **no** direct SELECT on `neuramark_interview_sessions`, `neuramark_content_playbooks`, or `neuramark_trend_snapshots` from the agent module
- [ ] **[SEC] (added) LLM provider resolution:** load catalog with `getProviderCatalog()`; resolve tier from server-side cost policy (V1: seeded global `low` row until US-7.1); call `resolveProvider(catalog, { assetRole: "llm", tier, llmVariant: "default" })`. Read API key with `process.env[row.envKeyName]` inside server adapter only. **Reject** request fields named `providerKey`, `provider_key`, `tier`, `envKeyName`, or equivalent
- [ ] **[SEC] (added) Prompt-injection containment — delimited untrusted blocks:** wrap profile fields, Playbook hints, and Trend hints in fixed delimiter markers (CONTRACT names e.g. `<UNTRUSTED_BUSINESS_PROFILE>…</UNTRUSTED_BUSINESS_PROFILE>`). System/developer instructions **outside** delimiters state that delimited content is data, not instructions. Playbook/Trend `ejemplo_referencia` must not enter prompts (already stripped upstream — agent DTO must not reintroduce)
- [ ] **[SEC] (added) Prompt-injection containment — server-injected rules:** modalidad allowlist, `mustDiscloseNotOwner`, Instagram-only channel constraint, and slot-count bounds are computed **server-side** from profile DTO + CONTRACT rules and passed as trusted instruction text — **never** accepted from request body or LLM output
- [ ] **[SEC] (added) Output validation before persist:** parse LLM response → map to brief object → Zod **`.strict()`** schema (slots, slugs, modalidad enums, optional `tactica_tendencia_slug`). On failure: return typed error to Operator, **do not INSERT** partial rows. Post-parse: validate `formato_playbook_slug` ∈ active Playbook slugs and optional `tactica_tendencia_slug` ∈ active Trend slugs for `week_start` (server allowlists, not LLM authority)
- [ ] **[SEC] (added) Per-`client_id` generate rate limit:** server-enforced window and max attempts frozen in CONTRACT (lean: **max 3 successful generate attempts per `client_id` per rolling 60 minutes**, plus **max 1 in-flight** generate per `client_id`+`week_start`). Over-limit → **429** with typed error code, **no LLM call**. Track via dedicated table (e.g. `neuramark_agent_rate_limits`) or equivalent server-side store — **not** client debounce alone
- [ ] **[SEC] (added) `neuramark_content_strategies` migration:** includes `client_id` FK NOT NULL, `week_start`, `brief` jsonb, `status`, versioning fields per CONTRACT (`version` / `supersedes_id` lean); index on `(client_id, week_start)`; parameterized queries only
- [ ] **[SEC] (added) RLS deny-by-default on `neuramark_content_strategies`:** `ENABLE ROW LEVEL SECURITY` with **zero** named policies; all reads/writes via service-role Node helpers
- [ ] **[SEC] (added) IDOR-safe reads:** strategy fetch by id **always** includes `WHERE client_id = $serverResolvedClientId`; missing/forbidden → **404** uniform response
- [ ] **[SEC] (added) Regenerate semantics:** new row/version on regenerate; **never** DELETE approved history. Prior rows remain for audit; status/version frozen in CONTRACT
- [ ] **[SEC] (added) Response shapes minimal:** Operator read DTO exposes brief fields needed for UI — **no** LLM raw response, provider env names, prompt text, token usage secrets, or service-role artifacts. Error payloads: codes + safe messages only
- [ ] **[SEC] (added) Do not log** full prompts, profile `fields`, Playbook/Trend jsonb, LLM raw output, or env var values — log ids, `week_start`, provider **key slug**, error codes only
- [ ] **[SEC] (added) Automated security tests cover at least:** non-operator generate → 403 no LLM/no INSERT; non-operator read → 403; request with smuggled `client_id` / `provider_key` ignored or rejected; rate limit → 429 no LLM; invalid LLM output → no INSERT; agent module has `server-only`; profile helper mocked path proves no interview SELECT; provider resolution uses catalog not request; RLS enabled zero policies; read IDOR returns 404 for foreign id

---

## Design Concerns and Required Changes

### Frozen design choices (must land in CONTRACT)

#### 1. Operator gate — generate and read (APPROVE)

| Surface | Gate |
|---|---|
| Generate strategy Server Action | `requireOperator("handler")` **first** |
| Strategy brief RSC loader / read action | `requireOperator("page" \| "handler")` |
| Strategy agent job module | No session gate inside (trusted caller = gated action) |
| Cliente brief read | **Out of US-4.1 BUILD** — future story uses `requireActive()` + server `client_id`, not Operator gate |

Middleware route match for Operator strategy pages is UX only. Direct Server Action invocation must remain gated.

#### 2. Server-only LLM job (APPROVE)

| Rule | Detail |
|---|---|
| Module | `import "server-only"` under `lib/agents/content/` |
| Invocation | Only from gated Server Action or trusted server orchestration |
| Keys | `process.env[envKeyName]` in adapter layer only; missing env → typed failure, no retry loop burning alternates |
| HTTP | **No** public generate/status Route Handler in V1 BUILD |

#### 3. Trusted input helpers only (APPROVE)

| Input | Source |
|---|---|
| Business profile | `getBusinessProfileForAgents(clientId)` |
| Playbook formatos | `getPlaybookForAgents()` |
| Trend tácticas | `getTrendSnapshotForWeek(weekStart)` — safe empty if no snapshot |
| Visual/modalidad rules | From profile DTO `visualModeSummary` — not request body |
| Interview / raw profile row | **Forbidden** in agent module |

#### 4. Provider resolution — catalog, not client (APPROVE WITH CONDITIONS)

| Rule | Detail |
|---|---|
| Catalog load | `getProviderCatalog()` |
| Tier | Server-resolved from `neuramark_cost_policies` (V1 global default `low`) |
| Resolve | `resolveProvider(catalog, { assetRole: "llm", tier, llmVariant: "default" })` |
| Client input | **No** `provider_key`, `tier`, `model`, or vendor id in request schema |
| Key material | Never returned in API responses or stored in `brief` |

**Condition:** US-7.1 may add operator tier edits later — generate handler must read tier from policy row at call time, not cache client-side.

#### 5. Prompt-injection containment (APPROVE)

| Layer | Control |
|---|---|
| Input wrapping | Fixed delimiters around all untrusted text blocks; explicit non-instruction framing |
| Rule injection | Allowlist modalidad, disclosure flags, channel=Instagram Reels, slot bounds — server-side only |
| Output | Zod `.strict()` brief schema; reject before INSERT |
| Slugs | Post-parse validation against Playbook/Trend server allowlists |

Do **not** rely on "sanitizing" Cliente meaning in profile text. Do **not** persist LLM output on schema failure "for debugging" in production paths.

#### 6. Rate limit — per client (APPROVE WITH CONDITIONS)

| Rule | Detail |
|---|---|
| Key | Server-resolved `client_id` |
| Lean limits | Max **3** generates / client / **60 min** rolling; max **1 in-flight** per (`client_id`, `week_start`) |
| Over-limit | 429, no LLM call |
| Storage | Server-side table or equivalent — UI debounce is UX only, not control |

**Condition:** CONTRACT may tune numbers but must keep per-client server enforcement. US-7.x cumulative budget complements but does not replace this floor.

#### 7. RLS — deny-by-default on `neuramark_content_strategies` (APPROVE)

```sql
ALTER TABLE public.neuramark_content_strategies ENABLE ROW LEVEL SECURITY;
-- Zero named policies → deny-by-default for anon/authenticated roles.
```

Do **not** add `authenticated` SELECT/INSERT policies. All access via service-role Node helpers.

#### 8. Tenancy — server-resolved `client_id` (APPROVE WITH CONDITIONS)

| Rule | Detail |
|---|---|
| INSERT | Always set `client_id` from server resolution |
| SELECT | Always filter by same resolved id |
| Request | No authoritative `client_id` from browser |

**Condition:** When Operator multi-client UI lands, resolution must come from **server-side job context** (selected client row validated Operator may act), not raw POST body — extend CONTRACT then without weakening this floor.

---

## Future-Proofing Notes

- **US-4.2** owns edit/approve state machine — do not allow Cliente or generate action to set `approved` in US-4.1.
- **US-5.1** must verify `approved` status server-side — US-4.1 should create **`draft`** (or CONTRACT exact) only.
- **US-7.1/7.2** adds cumulative spend caps — rate limit here remains binding minimum.
- **Cliente read** (SPEC) requires `requireActive()` + `getCurrentUser().id` scoping — separate from Operator read; do not reuse Operator DTO without review.
- **Automated weekly cycle** must call the same gated server job entrypoint — no unauthenticated cron URL with shared secret unless a dedicated story adds signature-verified internal trigger.
- **Multi-tenancy:** `client_id` column and server resolution now avoid rewrite when real Operator client picker ships.

---

## CONTRACT.md Checklist (pre-implementation)

When `plan/stories/US-4.1/CONTRACT.md` exists, spot-check before BUILD:

- [ ] Generate action name frozen; starts with `requireOperator("handler")`
- [ ] Read loader/action frozen; `requireOperator("page" \| "handler")`
- [ ] **No** public unauthenticated generate/status Route Handler
- [ ] Request schema: minimal (`weekStart` optional/normalized); **no** `client_id`, `provider_key`, `tier`
- [ ] Server `client_id` resolution rule documented (V1 session id)
- [ ] Table `neuramark_content_strategies`: columns, indexes, version/regenerate semantics frozen
- [ ] RLS enabled, zero policies
- [ ] Brief Zod schema `.strict()` frozen (slot shape, slug fields, modalidad enum, bounds)
- [ ] Delimiter marker names frozen in prompt builder
- [ ] Agent module path + `server-only`
- [ ] Helper imports only: profile, playbook, trend, provider catalog
- [ ] `resolveProvider` context frozen: `{ assetRole: "llm", tier, llmVariant: "default" }`
- [ ] Rate limit table/window/counts frozen
- [ ] Operator read DTO vs raw LLM response distinction explicit
- [ ] Error codes: 403 operator, 429 rate limit, 422 validation/LLM output fail
- [ ] Out of scope: US-4.2 edit/approve, US-5.x scripts, Cliente read, US-7.x budget engine, scheduler

---

## CONTRACT freeze list (binding summary)

1. **Gate:** `requireOperator()` on **generate** (`handler`) and **read** (`page`/`handler`); 401/403, no side effects on failure; **no LLM call** when gate fails.
2. **Tenancy:** `client_id` **server-resolved only**; all SELECT/INSERT scoped; IDOR → 404.
3. **Agent job:** `import "server-only"`; invoked only from gated server paths.
4. **Inputs:** `getBusinessProfileForAgents` + `getPlaybookForAgents` + `getTrendSnapshotForWeek` only — no raw interview/catalog/snapshot SELECT in agent module.
5. **Provider:** `getProviderCatalog()` + server tier + `resolveProvider({ assetRole: "llm", llmVariant: "default" })` — **no** client provider/tier input.
6. **Keys:** Server env via `envKeyName` only — never client, never DB value, never response.
7. **Prompts:** Delimited untrusted blocks; server-injected rules outside untrusted sections.
8. **Output:** Zod `.strict()` brief validation **before** persist; slug allowlist re-check; failure → no INSERT.
9. **Rate limit:** Per-`client_id` server enforcement (lean 3/hour + in-flight guard); 429 without LLM.
10. **DB:** `neuramark_content_strategies` with RLS deny-by-default; regenerate preserves history.
11. **Logging:** Codes/ids only — no full prompts or brief bodies in production logs.
12. **Out of scope:** US-4.2 approve flow, Cliente read UI, cumulative budget (US-7.x), public job HTTP API.

---

## BUILD vetoes (summary)

1. **Generate or read without `requireOperator()`** (including dev bypass).
2. **Accepting authoritative `client_id`, `provider_key`, or `tier` from the request.**
3. **LLM invocation or key resolution in Client Components** or without `server-only` agent module.
4. **Raw interview / direct Playbook or Trend table reads** in the strategy agent.
5. **Persisting LLM output without Zod `.strict()` brief validation.**
6. **Missing per-`client_id` server rate limit** (UI debounce only).
7. **API keys or `envKeyName` values in responses, `brief` jsonb, or DB columns.**
8. **RLS policies granting `authenticated` access** to `neuramark_content_strategies`.
9. **Public unauthenticated generate/status Route Handler.**
10. **Logging full prompts, profile text, or LLM raw output in production.**
11. **Cliente read path smuggled into US-4.1 without `requireActive()` + tenancy review.**

---

## Open questions — SECURITY resolutions

| # | Question | Resolution |
|---|---|---|
| 1 | Which `client_id` when Operator generates in V1? | **Server-resolved from `getCurrentUser().id` after `requireOperator()`** — no body arg. Multi-client Operator picker = future story; must use server job context, not POST `client_id` |
| 2 | Rate limit exact numbers? | **Lean APPROVED:** 3 generates / client / 60 min + 1 in-flight per (`client_id`, `week_start`). CONTRACT may adjust ±1 if documented; must remain server-side per client |
| 3 | Store failed LLM output for Operator debug? | **Reject only in production path.** Optional non-production logging of failure **codes** OK; never persist invalid brief rows. No full prompt logging in prod |
| 4 | Cliente brief read in US-4.1? | **Out of BUILD** — USER_STORIES AC is Operator-only. SPEC Cliente read is a follow-on with `requireActive()` scoping |
| 5 | Cost policy tier in V1 before US-7.1? | **Read seeded global `neuramark_cost_policies` row** (`provider_tier = low`) server-side — same as US-X.4 default. No client tier input |

---

## Recommended action

**APPROVE WITH CONDITIONS.** Proceed to **CONTRACT.md** (nextjs-backend + content-agents-engineer coordination). Binding floors above must appear in CONTRACT before BUILD. FE signoff after CONTRACT (Operator UI consumes gated generate/read only).
