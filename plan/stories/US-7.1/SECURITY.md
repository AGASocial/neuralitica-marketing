# Security Design Review — US-7.1

**Story:** US-7.1 — Configure max budget per Reel  
**Date:** 2026-08-30  
**Reviewer:** security-architect  
**Sources:** `plan/USER_STORIES.md` (US-7.1 `[SEC]` + AC), `plan/SECURITY_BASELINE.md` (Cost Policy Engine module), `plan/stories/US-X.4/SECURITY.md` (catalog + cost policy seed floor), `plan/stories/US-5.1/SECURITY.md` / `US-6.1/SECURITY.md` (generate paths, forbidden provider fields), `plan/stories/US-14.5/SECURITY.md` (`requireOperator` floor), `supabase/migrations/20260829260100_neuramark_cost_policies.sql`, `lib/providers/get-default-cost-policy.ts`, `lib/contracts/providers.ts`, `lib/providers/provider-adapters.ts` (`estimateVideoJobCost`), `plan/PROVIDER_TIERS.html`  
**Status:** Binding for implementing agents; validated by requirements-validator like any other acceptance criterion. Do not treat this file as CONTRACT.md. Do not check off `USER_STORIES.md` AC here.

---

## Verdict: APPROVE WITH CONDITIONS

The story shape is correct: **Operator-gated** settings for `max_cost_cents` and `provider_tier` (global default + optional per-client override), a **server-only** cost-policy resolver that loads policy and catalog rows without client authority, **server-computed** pre-generation estimates shown to the Operator before confirm, and a **mandatory budget gate** inside every spend/job-creation path so cumulative Reel cost (retries + B-roll + TTS + video + tracked LLM where applicable) cannot exceed the resolved cap unless an **explicit Operator override** is recorded. Policy and estimate values are **never** accepted from the browser as authority.

No REDESIGN. No veto of PO lean defaults (seed `max_cost_cents = 150`, global `provider_tier = low`, PrimeReact settings card, extend `getDefaultCostPolicy` pattern to per-client resolution, hardcoded local Operator OK until auth universal). Orchestrator may proceed to **CONTRACT.md** after freezing the items below.

**Inherited floors (US-X.4 / US-14.5 / US-7.2 — do not weaken):** `requireOperator()` calls `requireActive()` first; role never from request; handler-level gates mandatory on settings writes and cost-bearing confirms; `client_id` server-resolved only on spend paths; catalog via `getProviderCatalog()` only; `provider_key` / `tier` never client-authoritative at job creation; RLS deny-by-default on `neuramark_cost_policies`; service-role Node only; no `@supabase/supabase-js` in Client Components; cost fields never in Cliente response shapes (US-7.4 floor).

**This story owns:** Server-only **`getCostPolicyForClient(clientId)`** (global fallback); lean **Reel cost estimator + resolver** (visual mode, duration, b-roll flag → tier + component estimates); **`assertReelBudgetAllowsSpend()`** (or CONTRACT-exact name) shared gate; Operator settings **read minimal DTO** + **write Server Actions** for global and per-client policy rows; **pre-generation estimate** surface (Operator-only); **`neuramark_budget_events`** (or CONTRACT-exact) audit table for blocks and overrides; Zod bounds on `max_cost_cents` / `provider_tier` / `rules`; security tests for operator gate, forbidden fields, bypass attempts, global-vs-client privilege, overflow-safe math, fail-closed policy load.

**This story does not own:** Full provider ranking engine (US-7.2); `video_jobs` table and vendor adapters (US-8.x — but **must call** the shared budget gate when those stories land); actual-cost persistence (US-7.3); Reel cost roll-up UI (US-7.4); catalog CRUD; Cliente-facing cost or tier UI; auth redesign.

**Terminology:** **Política de costos** · **Presupuesto máximo por Reel** · **Nivel de proveedor** (`low` \| `high`) · **Operator** · **Cliente**. Technical names `getCostPolicyForClient`, `assertReelBudgetAllowsSpend`, `requireOperator` are canonical.

---

### Threat Summary (US-7.1–specific)

| Threat | Impact | Mitigation in this story |
|---|---|---|
| **Client sends `estimatedCostCents`, `maxCostCents`, or `providerTier` in generate/confirm payload** | Skip or inflate budget; force high tier | Request schemas **reject** estimate/policy authority fields (`FORBIDDEN_FIELDS`). Server reloads policy via `getCostPolicyForClient(serverClientId)` and recomputes estimate internally. UI display is non-authoritative |
| **Direct call to generation endpoint bypasses budget check** | Uncontrolled vendor spend | **`assertReelBudgetAllowsSpend()`** runs **inside** the job-creation / generation handler **after** identity + policy load, **before** any vendor/LLM I/O. No alternate code path to providers without passing the gate. Disabling confirm UI does not matter |
| **Cliente calls Operator settings write action** | Raise own cap; switch tier to `high` | Settings mutations call `requireOperator("handler")` as **first** await. Cliente → **403**, no UPDATE. Reads of caps/tier/estimates are Operator-gated only |
| **Privilege escalation: write global policy via per-client action or vice versa** | One client change affects all tenants; or global cap lowered for everyone via client-scoped endpoint | **Separate** Server Actions (or explicit `scope: "global" \| "client"` with server validation): global UPDATE targets **only** `client_id IS NULL` row; per-client UPDATE requires Operator + **validated** `clientId` (server allowlist / operator tenancy rules — V1: operator's resolved client or explicit operator target per CONTRACT). Request **cannot** set `client_id = NULL` on a client-scoped action or inject another tenant's UUID without Operator authorization |
| **Integer overflow on cumulative sum or estimate addition** | `spent + estimate` wraps negative → budget check passes | Use **safe integer arithmetic**: all money fields `number` int with Zod `.int().nonnegative()`; cumulative sum via SQL `SUM` on `bigint`/`integer` columns or a helper that throws if `!Number.isSafeInteger(total)`; compare with `total + estimate > maxCostCents` only after safe-add guard. **`max_cost_cents` write ceiling** enforced in Zod (e.g. **1–1_000_000** cents — CONTRACT freezes exact max) |
| **Stale cached policy after Operator edit** | Spend uses old cap | Policy loader **must not** cross-request cache mutable policy (React `cache()` OK per-request only). After settings write, revalidate settings path; spend handlers **always** read fresh policy row for the decision |
| **Policy row missing or corrupt** | Silent unlimited spend | **Fail closed:** missing global default or invalid row → block spend with operator-visible error (`COST_POLICY_UNAVAILABLE`), **no** vendor/LLM call. Mirror `getDefaultCostPolicy` error codes |
| **Override without audit** | Margin loss untraceable | Budget block and explicit override append **`neuramark_budget_events`** with actor, timestamp, `reel_script_id`, `estimate_cents`, `cumulative_cents`, `cap_cents`, `outcome` |
| **Cliente reads budget cap / estimates via settings or generate API** | Margin-sensitive leakage | Operator-only serializers; Cliente sessions **403** on policy read and estimate endpoints. No cost fields in shared Reel payloads (US-7.4) |
| **Smuggled `rules` JSON overrides engine** | Client-defined routing bypasses tier | `rules` column is **Operator-maintained trusted config** only; **not** accepted from generate requests. Writes validated with Zod schema (closed keys); corrupt rules excluded at read like catalog jsonb |
| **RLS policy exposing `neuramark_cost_policies` to authenticated** | Direct DB tampering of caps | Keep RLS **enabled, zero policies**; all access via service-role Node helpers + Operator-gated writes |

**Residual risk accepted:** Operator trust model — Operator can set global cap and per-client overrides and can record budget overrides (product intent). V1 per-client override UI may target operator's own client only until multi-tenant operator tooling exists; **privilege boundary** is still `requireOperator()` + no Cliente write path. Full component-level estimate accuracy depends on catalog `cost_model` (trusted config); wrong estimates are a margin/ops risk, not a bypass, as long as the **same server estimator** is used for display and gate. Semantic tampering of `rules` JSON is bounded by Operator-only writes + Zod. US-7.2 may refine ranking; US-7.1 must not fork a second estimator that skips the gate.

---

## Assets and Trust Boundaries

| Asset | Sensitivity | Trust boundary |
|---|---|---|
| `neuramark_cost_policies` rows | **High** — margin cap + tier switch | Service-role Node; Operator-gated UPDATE only; RLS deny-by-default |
| `max_cost_cents`, `provider_tier` | **High** — direct spend authority | Loaded server-side per client; never request authority on spend paths |
| `rules` JSON | Medium–High — routing hints (avatar vs faceless, b-roll) | Operator writes only; Zod-validated; not client-writable on generate |
| Pre-generation **estimates** | **High** — margin preview | Computed server-side from catalog + policy; Operator-only API; display ≠ authority |
| Cumulative Reel spend | **High** — gate input | SUM from persisted job/ledger rows scoped by `reel_script_id` + `client_id`; server-only |
| `neuramark_budget_events` | Medium — audit | Append-only; Operator/system writes; no Cliente read in V1 |
| Provider catalog `cost_model` | High (inherited US-X.4) | Read via `getProviderCatalog()` only; feeds estimator |

**Boundaries:**

1. **Browser (Operator) → settings / estimate / confirm generate** — Untrusted. May send `{ maxCostCents, providerTier }` on **settings save** only (validated). Generate/confirm payloads carry **intent** (`reelScriptId`, optional `confirmGeneration: true`) — **no** estimate, cap, tier, or policy id as authority.
2. **Settings Server Action → `requireOperator()` → Zod → UPDATE policy row** — First gate before any policy mutation. Global vs client scope enforced server-side.
3. **Generate handler → `getCostPolicyForClient()` → estimator → `assertReelBudgetAllowsSpend()` → vendor/LLM** — Policy load and budget gate **before** external spend. Override path requires separate explicit Operator action + audit row.
4. **Postgres → server** — Parameterized SELECT/UPDATE; service-role; no browser Supabase.
5. **Cliente → any cost policy / estimate / override endpoint** — **403**; cost data excluded from Cliente serializers (US-7.4).

---

## Abuse Cases Considered

- *As a malicious actor, I can POST `{ estimatedCostCents: 0 }` on video/script generate to pass the budget check* → **Blocked:** forbidden field; server recomputes estimate; gate uses server values only.
- *As a malicious actor, I can POST `{ maxCostCents: 999999 }` or `{ providerTier: "high" }` on generate* → **Blocked:** forbidden on spend paths; policy loaded from DB via `getCostPolicyForClient`.
- *As a malicious actor, I can call the generate Route Handler / Server Action directly and skip the settings UI confirm step* → **Blocked:** budget gate is **inside** the handler, not in UI; no vendor/LLM I/O until `assertReelBudgetAllowsSpend` passes (or documented override action succeeds).
- *As a Cliente, I can invoke `updateCostPolicy` and raise my cap* → **Blocked:** `requireOperator("handler")` first → **403**.
- *As a Cliente, I can read global `max_cost_cents` via a settings API* → **Blocked:** policy read endpoint Operator-only; Cliente **403**.
- *As a malicious actor, I can POST `{ clientId: "<victim-uuid>", maxCostCents: 1 }` to sabotage another tenant's override* → **Blocked:** per-client writes require Operator + server-validated target client (V1 operator tenancy rules); cross-tenant without authorization → **404/403** uniform.
- *As a malicious actor, I can POST `{ clientId: null }` on a client-scoped update to overwrite the global row* → **Blocked:** global and client mutations are separate code paths; client action rejects null/missing client id; global action rejects non-null client id in payload.
- *As a malicious actor, I can POST `{ policyId: "<global-uuid>" }` to bind generate to a crafted row* → **Blocked:** spend paths ignore client policy ids; resolve by server `clientId` + global fallback query only.
- *As a malicious actor, I craft cumulative spend so `spent + estimate` overflows JS integer* → **Blocked:** safe-add / `Number.isSafeInteger` guard; SQL SUM on integer/bigint; overflow → treat as **over budget** or **policy error** (fail closed), never pass.
- *As a malicious actor, I set `max_cost_cents` to `2147483647` via settings* → **Blocked:** Zod ceiling (CONTRACT max, e.g. 1_000_000 cents); DB CHECK remains `> 0`; application ceiling is stricter.
- *As a malicious actor, I retry generation 50 times to blow margin while each attempt is under cap* → **Blocked:** cumulative check sums **all attempts** for the Reel (retries, B-roll, TTS, video jobs as they exist); partial V1 must still implement ledger/SUM architecture even if only LLM rows exist initially.
- *As a malicious actor, I use budget override without leaving a trail* → **Blocked:** override is a **separate** Operator-gated action that INSERTs audit row before allowing the gated spend to proceed.
- *As a malicious actor, I add RLS SELECT on `neuramark_cost_policies` for authenticated* → **Blocked:** migration keeps zero policies; review rejects.

---

## Security Acceptance Criteria

Story `[SEC]` items from `plan/USER_STORIES.md` → US-7.1 are binding. Items marked **(added)** are new in this review — paste into the story when the PO next edits USER_STORIES.

**Inherited (still binding — do not weaken adjacent auth / catalog paths):**

- [ ] **[SEC] Every operator-only gate lives inside the Server Action / Route Handler itself** as `requireOperator()` on the `getCurrentUser()` result; middleware and UI hiding are convenience only *(US-14.5)*
- [ ] **[SEC] `requireOperator()` runs `requireActive()` first** — inactive operator has no access *(US-14.5)*
- [ ] **[SEC] RLS stays enabled with zero policies** on `neuramark_cost_policies`; privileged access via Node service-role only *(US-14.5 / US-X.4)*
- [ ] **[SEC] Service-role key is used only from Node server modules** — never Client Components, never Edge middleware *(US-14.5)*
- [ ] **[SEC] Job-creation schemas must not accept client-authoritative `provider_key`, `providerTier`, `tier`, or `estimatedCostCents`** — server resolves via policy + catalog *(US-X.4 / US-7.2 floor)*
- [ ] **[SEC] Cost exclusion for Cliente sessions** — budget caps and estimates appear only in operator-gated serializers *(US-7.4 floor)*

**US-7.1 story `[SEC]` (existing in USER_STORIES.md):**

- [ ] **[SEC] The budget check runs server-side inside the job-creation path; a direct call to the generation endpoint with a crafted payload cannot skip it (the client never sends the estimate or the policy — both are resolved server-side)** *(USER_STORIES US-7.1)*
- [ ] **[SEC] `max_cost_cents` and policy rules are editable only by the Operator role (hardcoded user OK locally), through a dedicated settings endpoint with validated bounds (positive integers, sane ceiling)** *(USER_STORIES US-7.1)*
- [ ] **[SEC] Every budget-exceeded block and every override is recorded (who, when, estimate vs cap) so margin decisions are auditable** *(USER_STORIES US-7.1)*

**Added in this review (binding for US-7.1 BUILD):**

- [ ] **[SEC] (added) Central budget gate module uses `import "server-only"`** (lean: `lib/cost-policy/assert-reel-budget-allows-spend.ts` or CONTRACT exact). **Every** spend path in scope (pre-generation confirm, future video/TTS/LLM job creation, retry handlers per US-8.4) **must** call it immediately before vendor/LLM I/O — no duplicate ad-hoc comparisons in route handlers
- [ ] **[SEC] (added) `getCostPolicyForClient(clientId)`** is the **only** application path that resolves effective policy: SELECT per-client row if present, else global `client_id IS NULL` default. Uses service-role Node client; Zod `costPolicyRowSchema`; fail closed on missing/invalid. Extends `getDefaultCostPolicy` — do not duplicate SELECT logic in handlers
- [ ] **[SEC] (added) Spend-path request schemas reject policy/estimate authority fields:** `maxCostCents`, `max_cost_cents`, `providerTier`, `provider_tier`, `tier`, `estimatedCostCents`, `estimated_cost_cents`, `cumulativeCostCents`, `policyId`, `policy_id`, `rules`, `clientId`, `client_id` (when authoritative on spend), `overrideBudget`, `override_budget`, `skipBudgetCheck`, and equivalents → **`FORBIDDEN_FIELDS`**
- [ ] **[SEC] (added) Settings write Server Actions** (`updateGlobalCostPolicy`, `updateClientCostPolicy` — or CONTRACT exact) call `requireOperator("handler")` as **first** await before validation or UPDATE. Failure → **403**, no row change
- [ ] **[SEC] (added) Settings write input validation:** `maxCostCents`: integer, **1 ≤ n ≤ MAX_COST_CENTS_CEILING** (CONTRACT freezes, recommended **1_000_000**); `providerTier`: enum `low` \| `high` only; optional `rules`: Zod object with **closed key set** (no arbitrary client-defined engine). Reject floats, strings, negative, zero, above ceiling
- [ ] **[SEC] (added) Global vs client write separation:** global action updates **only** the row where `client_id IS NULL` (exactly one row per partial unique index). Client action updates/inserts **only** rows with **non-null** `client_id` equal to server-validated target. Actions **must not** accept both scopes in one ambiguous payload
- [ ] **[SEC] (added) Per-client policy target `clientId` is server-validated** — never trust raw UUID without Operator authorization check (V1: operator-resolved client or explicit operator target per CONTRACT). Cross-tenant target → **404** uniform
- [ ] **[SEC] (added) Operator-only policy read / estimate endpoint** returns **minimal DTO** only: `maxCostCents`, `providerTier`, `scope` (`global` \| `client`), optional breakdown labels — **not** full catalog `cost_model`, `envKeyName`, or raw `rules` jsonb unless CONTRACT explicitly allowlists operator settings fields
- [ ] **[SEC] (added) Pre-generation estimate** is computed **only** on the server from `getCostPolicyForClient` + `getProviderCatalog()` + resolved visual mode / duration / b-roll inputs loaded from trusted server state (profile, script row) — **not** from client-supplied mode, duration, or flags as authority. Client may send `reelScriptId` (and similar pointers) only
- [ ] **[SEC] (added) `assertReelBudgetAllowsSpend({ reelScriptId, clientId, additionalEstimateCents, … })`** loads cumulative spent for that Reel (SUM of persisted `estimated_cost_cents` / ledger — CONTRACT exact sources), adds `additionalEstimateCents` via **overflow-safe** arithmetic, compares to resolved `maxCostCents`. If `cumulative + estimate > cap` → **`BUDGET_EXCEEDED`**, **no** vendor/LLM call, INSERT audit event `outcome = 'blocked'`
- [ ] **[SEC] (added) Explicit budget override** is a **separate** Operator-gated Server Action (not a hidden query flag on generate). Requires `requireOperator`, non-empty `reason` (max length per CONTRACT), INSERT audit `outcome = 'override'`, then allows **one** subsequent gated operation identified by idempotency key or short-lived server-issued token — **never** a permanent `skipBudgetCheck` flag on the client
- [ ] **[SEC] (added) Audit table `neuramark_budget_events`** (or CONTRACT exact): append-only; columns include `client_id`, `reel_script_id`, `actor_client_id` (operator), `event_type` (`blocked` \| `override`), `estimate_cents`, `cumulative_cents`, `cap_cents`, `provider_tier`, optional `reason`, `created_at`. RLS deny-by-default. No Cliente SELECT in V1
- [ ] **[SEC] (added) Fail closed when policy unavailable:** if global default missing or load fails, spend paths return **`COST_POLICY_UNAVAILABLE`** (or internal error) and **do not** call vendors/LLMs. Settings read may show error state to Operator
- [ ] **[SEC] (added) No cross-request cache of mutable policy** — spend decisions read fresh DB row (per-request `cache()` OK). Document in CONTRACT
- [ ] **[SEC] (added) Catalog/policy loader modules remain server-only** — settings UI consumes Operator Server Actions only; no `@supabase/supabase-js` in Client Components
- [ ] **[SEC] (added) Automated security tests cover at least:** Cliente **403** on settings write/read; generate payload with `estimatedCostCents: 0` rejected or ignored with gate still using server estimate; direct handler call without UI confirm still runs gate; global write cannot set `client_id`; client write cannot null `client_id`; `maxCostCents` above ceiling rejected; overflow-safe sum edge case (large spent + estimate); audit row inserted on block; override requires Operator + audit; forbidden-fields list on spend schemas

---

## Design Concerns and Required Changes

### Frozen design choices (must land in CONTRACT)

#### 1. Spend authority — **server-only estimator + gate** (APPROVE)

| Rule | Detail |
|---|---|
| Estimator | Single server module composes component estimates (LLM, TTS, talking_head, broll as applicable) from catalog `cost_model` + resolved tier + script/profile inputs |
| Gate | `assertReelBudgetAllowsSpend` mandatory before any paid I/O |
| Client | May show estimate returned by Operator API; **never** sends estimate/cap/tier on generate |
| UI confirm | Convenience; disabling button is not a control |

#### 2. Policy resolution — **global + optional per-client override** (APPROVE WITH CONDITIONS)

| Query | Rule |
|---|---|
| Effective policy | Per-client row if exists for `clientId`, else global `client_id IS NULL` |
| Writes | Separate Operator actions; validated bounds |
| Privilege | Cliente cannot create/update either scope |

**Condition:** CONTRACT must freeze V1 operator target rules for per-client overrides (single-tenant operator vs multi-client operator UI).

#### 3. `max_cost_cents` bounds — **positive integer with ceiling** (APPROVE)

| Layer | Rule |
|---|---|
| Zod (writes) | `.int().min(1).max(MAX_COST_CENTS_CEILING)` — recommend **1_000_000** ($10,000/Reel) |
| DB | Existing `CHECK (max_cost_cents > 0)` retained |
| Display | Format as currency in UI; store integer cents only |

#### 4. Cumulative spend — **Reel-scoped SUM** (APPROVE WITH CONDITIONS)

| Source | Rule |
|---|---|
| Primary | `SUM(estimated_cost_cents)` from jobs linked to `reel_script_id` when `neuramark_video_jobs` exists |
| Interim | If job table absent at BUILD time, introduce **`neuramark_budget_events` + optional ledger column** or documented SUM source so cumulative logic is real, not stubbed `0` |
| Retries | US-8.4 retry handler **must** call same gate (binding on downstream; US-7.1 exports the helper) |

**Condition:** Do not ship a budget gate that always sees `cumulative = 0` once any paid job type exists.

#### 5. Integer overflow — **fail closed** (APPROVE)

| Operation | Rule |
|---|---|
| `safeAddCents(a, b)` | Return `null` or throw if result exceeds `Number.MAX_SAFE_INTEGER` or application ceiling |
| Comparison | If safe-add fails → treat as over budget / policy error |
| SQL | Use integer/bigint SUM; cast to number only after range check |

#### 6. Audit — **append-only events** (APPROVE)

Mirror QA override pattern (US-10.2): blocks and overrides are immutable audit rows; no UPDATE/DELETE on events in V1.

#### 7. Operator settings surface — **minimal exposure** (APPROVE WITH CONDITIONS)

| Allowed to Operator UI | Forbidden |
|---|---|
| `maxCostCents`, `providerTier`, scope label, estimate breakdown totals | Full catalog rows, `envKeyName`, raw vendor pricing tables |
| EN/ES labels per story | Cliente settings route |

**Condition:** CONTRACT defines operator settings DTO allowlist (inherits US-X.4 minimal DTO rule).

#### 8. Forbidden bypass flags — **no debug skips** (APPROVE)

No `SKIP_BUDGET_CHECK`, `NODE_ENV` spend bypass, or magic query params in production paths. Tests may mock the gate module; production handlers always invoke the real gate.

---

## Future-Proofing Notes

- **US-7.2** adds full provider ranking — must **reuse** US-7.1 estimator/gate inputs; do not introduce a second client-trusted estimate path.
- **US-8.x / US-8.4** wire video job creation and retries to `assertReelBudgetAllowsSpend` — export stable helper + types from US-7.1 CONTRACT.
- **US-7.3 / US-7.4** use actual costs for reporting; gate may use estimates pre-job and actuals post-job for cumulative — CONTRACT should state whether cumulative gate uses estimated, actual, or max(actual, estimated) per job; **default: sum of estimated at gate time, actuals for reporting** unless PO revises.
- **Multi-tenancy:** per-client policy rows already scoped by `client_id`; spend gate always verifies `reel_script_id` belongs to same `client_id` as policy resolution (IDOR → **404**).
- **Real auth (US-14.5):** Operator settings and override audit use server-resolved operator identity from `getCurrentUser()` — never request `actor` field.

---

## CONTRACT Spot-Check Checklist (when CONTRACT.md exists)

Before implementation starts, verify CONTRACT:

- [ ] Spend-path input schemas omit estimate/policy/tier/bypass fields; document `FORBIDDEN_FIELDS`
- [ ] Settings write schemas include ceiling and enum bounds matching this review
- [ ] Global vs client mutation paths are distinct with frozen table targets
- [ ] Operator settings/read DTO is an explicit allowlist
- [ ] `assertReelBudgetAllowsSpend` signature, error codes (`BUDGET_EXCEEDED`, `COST_POLICY_UNAVAILABLE`), and call sites listed
- [ ] Override flow documents idempotency / single-use token — no permanent skip
- [ ] Cumulative spend SQL/ledger sources named; no stub always-zero after paid jobs exist
- [ ] Audit table name and required columns match **[SEC] (added) audit** criterion

---

## Verdict Rationale

**APPROVE WITH CONDITIONS** — not REDESIGN because the story already encodes the correct trust model (server-resolved policy, server-side gate, Operator-only writes, audit). **Conditions** are the frozen CONTRACT items above: centralized gate module, separated global/client writes, overflow-safe math, non-stub cumulative sum, minimal operator DTO, and explicit override mechanics. Satisfying them keeps margin authority server-side and ready for US-7.2/8.x without rework.
