# Security Design Review — US-7.2

**Story:** US-7.2 — Select provider by economics and quality floor  
**Date:** 2026-08-30  
**Reviewer:** security-architect  
**Sources:** `plan/USER_STORIES.md` (US-7.2 `[SEC]` + AC), `plan/stories/US-X.4/SECURITY.md` (catalog loader + no client `provider_key` floor), `plan/stories/US-7.1/SECURITY.md` (budget gate + forbidden fields), `plan/stories/US-7.1/CONTRACT.md` (7.1 vs 7.2 split), `plan/stories/US-5.1/SECURITY.md` / `US-6.1/SECURITY.md` (generate paths), `plan/stories/US-14.5/SECURITY.md` (`requireOperator` floor), `lib/providers/provider-adapters.ts` (`resolveProvider`, `estimateVideoJobCost`), `lib/providers/get-provider-catalog.ts`, `lib/cost-policy/estimate-llm-job-cost.ts`, `lib/contracts/providers.ts`, `plan/PROVIDER_TIERS.html`  
**Status:** Binding for implementing agents; validated by requirements-validator like any other acceptance criterion. Do not treat this file as CONTRACT.md. Do not check off `USER_STORIES.md` AC here.

---

## Verdict: APPROVE WITH CONDITIONS

The story shape is correct: a **server-only policy engine** maps **`provider_tier` (from `getCostPolicyForClient`) + visual mode + asset role** → **`provider_key` + `estimated_cost_cents`**, ranking only **active** catalog rows at the resolved tier, with **cheapest-active default**, **manual upload** as explicit zero-cost fallback, and **per-job decision logging** for margin analysis. The Operator UI shows **read-only** recommendation + tier + rationale — never a client-authoritative vendor picker.

No REDESIGN. No veto of PO lean defaults (extend existing `resolveProvider` + catalog seed; cheapest row wins when multiple candidates; visual-mode routing via `capabilities`; decision log table; refactor `estimateLlmJobCost` internals to call the shared engine; hardcoded local Operator OK until auth universal). Orchestrator may proceed to **CONTRACT.md** after freezing the items below.

**Primary threat modeled:** **privilege escalation via `provider_key` injection** — a malicious actor supplies `provider_key`, `providerKey`, or equivalent in a job-creation / preview payload to force an expensive high-tier vendor, an inactive catalog row, or an unregistered adapter key while policy tier remains `low`. Mitigation is **structural**: request schemas reject forbidden keys; tier is loaded server-side; `provider_key` is assigned only inside the policy engine after `getProviderCatalog()` + `resolveProvider` / ranked selection; adapters are looked up by server-derived key only.

**Inherited floors (US-X.4 / US-7.1 / US-14.5 — do not weaken):** `requireOperator()` on operator recommendation reads; role never from request; catalog via `getProviderCatalog()` only; **`provider_key` / `tier` / `estimatedCostCents` never client-authoritative** on spend or preview-as-authority paths; **`neuramark_provider_catalog` has no V1 application write surface**; RLS deny-by-default on catalog; service-role Node only; no `@supabase/supabase-js` in Client Components; cost fields never in Cliente response shapes (US-7.4 floor); `assertReelBudgetAllowsSpend` remains mandatory before paid I/O (US-7.1).

**This story owns:** Central **`resolveProviderForJob`** (CONTRACT exact name) policy engine module (`import "server-only"`); per-asset-role ranking (cheapest active row in tier); visual-mode + reference-loop inputs loaded from **trusted server state** (profile, script row, media assets); **`estimateReelPieceCost`** / multi-asset estimate composition; **decision log** persistence (tier, asset role, `provider_key`, estimate, rationale code); Operator **read-only recommendation** Server Action or Server Component loader with **minimal DTO**; refactor **`estimateLlmJobCost`** to delegate to the engine (single estimator for preview + gate); security tests for forbidden fields, tier lock, inactive-row exclusion, injection attempts, catalog write absence.

**This story does not own:** Vendor adapter implementations (US-8.x); `video_jobs` table writes (US-8.x — but engine output is consumed there); actual-cost persistence (US-7.3); full Reel cost roll-up UI (US-7.4); catalog CRUD UI or catalog mutation endpoints; Operator `provider_tier` / cap settings (US-7.1); auth redesign.

**Terminology:** **Policy engine** · **Provider tier** (`low` \| `high`) · **Asset role** · **Provider key** · **Operator** · **Cliente**. Technical names `resolveProvider`, `getProviderCatalog`, `getCostPolicyForClient`, `resolveProviderForJob` are canonical.

---

### Threat Summary (US-7.2–specific)

| Threat | Impact | Mitigation in this story |
|---|---|---|
| **`provider_key` injection on job creation** | Force `heygen_high` / inactive row while tier is `low`; bypass margin strategy | Job-creation and spend-path schemas **reject** `provider_key`, `providerKey`, `tier`, `providerTier`, `estimatedCostCents`, and aliases → **`FORBIDDEN_FIELDS`**. Engine assigns key **after** `getCostPolicyForClient()` + catalog resolution. Handlers **never** pass client strings to `getVideoAdapter` / LLM adapter factories |
| **`provider_tier` injection alongside omitted `provider_key`** | Upgrade tier without Operator settings | **`provider_tier` is never request authority** — loaded from `getCostPolicyForClient(clientId)` only. Client cannot set tier on generate, preview, or future video job actions |
| **Direct adapter lookup by smuggled key** | Skip catalog `active` / tier filters | Adapters resolved **only** via engine output row (`resolveProvider` or ranked helper). **`getCatalogRowByKey(catalog, clientKey)` forbidden** on untrusted input paths |
| **Catalog write / activation via app API** | Attacker activates high-tier rows or swaps `cost_model` | **No** Server Action, Route Handler, or SQL exec from browser mutates `neuramark_provider_catalog` in V1. Activation remains migration/Operator SQL (US-X.4 [SEC]). Story AC: catalog writes not exposed |
| **Inactive high-tier row selection** | Spend on P1 vendors while policy tier is `low` | Engine ranks **`row.active === true`** candidates only; tier match enforced. Default seed keeps high-tier rows inactive until SQL activation |
| **Cliente reads full catalog / env var names** | Recon + margin leakage | No Cliente catalog API. Operator recommendation DTO is **allowlisted** (display label, tier, estimate, rationale code) — not full row |
| **Duplicate policy engines** | One path validates tier, another trusts client key | **Single module** exports job resolution + estimates. US-7.1 `estimateLlmJobCost` **delegates** here; US-8.x job orchestrators **import same helper** — no forked resolver in route handlers |
| **Manual fallback abuse** | Force zero-cost path to skip quality gates | **`allowManualFallback: true`** only on explicit Operator/server paths (manual upload story), never from client flag. Default engine calls exclude `capabilities.manualFallback` rows |
| **Decision log tampering / cross-tenant leak** | Audit evasion or IDOR | Append-only log; RLS deny-by-default; INSERT from server orchestration only; scoped by `client_id` + job/reel ids server-resolved |
| **Logging full catalog jsonb on decision** | Margin structure in logs | Log decision tuple (**tier, asset_role, provider_key, estimate_cents, rationale_code**) — never full `cost_model`, `capabilities`, or `envKeyName` |

**Residual risk accepted:** Catalog and vendor mappings remain **global** in V1 (US-X.4). Operator can set `provider_tier = high` via US-7.1 settings — that is product intent, not injection. Cheapest-active ranking depends on trusted `cost_model` seed accuracy; wrong estimates are margin/ops risk, not a tier bypass, as long as **the same engine** feeds preview, gate, and job persistence. Visual-mode routing uses server-loaded profile/script state; client may influence **which server loader runs** via `reelScriptId` pointer only, not mode string as authority.

---

## Assets and Trust Boundaries

| Asset | Sensitivity | Trust boundary |
|---|---|---|
| **`provider_key` (resolved)** | **Critical** — selects vendor adapter and spend tier | Assigned **only** inside policy engine; never from browser payload |
| `provider_tier` (effective) | **High** — caps vendor pool | From `getCostPolicyForClient()`; never request authority |
| `neuramark_provider_catalog` (full rows) | **High** — margin config | `getProviderCatalog()` server-only; no V1 app writes |
| `cost_model` / `capabilities` | **High** / Medium | Trusted config; Zod on read; engine input only |
| Policy engine output (estimate + rationale) | **High** — gate input + Operator preview | Server-computed; Operator-only surfaces in V1 |
| Decision log rows | Medium — audit / analytics | Server INSERT only; Operator read; RLS deny-by-default |
| Operator recommendation DTO | Medium | Minimal fields; `requireOperator` on read path |

**Boundaries:**

1. **Browser → job creation / preview / recommendation read** — Untrusted. Payloads carry **intent pointers** (`reelScriptId`, `jobKind`, slot index) — **no** `provider_key`, tier, estimate, or catalog id as authority.
2. **Handler → `getCostPolicyForClient()` → `getProviderCatalog()` → policy engine → adapter registry** — Tier and key resolved here. Budget gate (US-7.1) runs **after** engine estimate, **before** vendor I/O.
3. **Postgres catalog → engine** — Only through `getProviderCatalog()`; parameterized SELECT; service-role Node.
4. **Catalog mutation** — Migration / Operator SQL only in V1; **no** HTTP write surface.
5. **Cliente → recommendation / catalog / decision log** — **403** or route absent; no cost or vendor detail in shared serializers.

---

## Abuse Cases Considered

- *As a malicious actor, I POST `{ providerKey: "heygen_high" }` on script generate to force expensive video later* → **Blocked:** forbidden field on all spend paths (extends US-4.1 / US-5.1 / US-6.1 / US-7.1 lists); LLM path uses engine with tier from policy only.
- *As a malicious actor, I POST `{ provider_key: "heygen_high", providerTier: "low" }` hoping the key wins* → **Blocked:** both rejected; server ignores unknown keys even if validation were bypassed — engine overwrites with resolved key.
- *As a malicious actor, I POST `{ tier: "high" }` without provider_key to upgrade vendor pool silently* → **Blocked:** tier forbidden on spend paths; `getCostPolicyForClient` is sole tier source.
- *As a malicious actor, I POST `{ estimatedCostCents: 0 }` with injected provider_key* → **Blocked:** estimate forbidden; gate uses engine output only (US-7.1).
- *As a malicious actor, I call `getCatalogRowByKey` path with a crafted key in a new Route Handler* → **Veto in BUILD:** no handler accepts raw key from request; code review + grep test for `getCatalogRowByKey(.*input` / `getVideoAdapter(.*req`.
- *As a malicious actor, I activate `heygen_high` via catalog UPDATE Server Action* → **Blocked:** no catalog write endpoints in US-7.2 or V1 generally.
- *As a malicious actor, I pass `{ allowManualFallback: true }` to skip paid providers* → **Blocked:** flag is engine-internal only; not in client schemas.
- *As a Cliente, I GET operator recommendation and read env var names* → **Blocked:** `requireOperator("handler")`; DTO allowlist excludes `envKeyName`, raw `cost_model`.
- *As a malicious actor, I replay a decision-log id to bind a job to another tenant's resolution* → **Blocked:** log INSERT uses server-resolved `client_id`; job rows verify reel/script ownership before persist.
- *As a malicious actor, I rely on `resolveProvider` returning first candidate when cheaper inactive row exists* → **Blocked:** inactive filtered; US-7.2 AC requires **cheapest active** in tier — CONTRACT must define sort key from `cost_model` (not array order alone).

---

## Security Acceptance Criteria

Story `[SEC]` items from `plan/USER_STORIES.md` → US-7.2 are binding. Items marked **(added)** are new in this review — paste into the story when the PO next edits USER_STORIES. Do not drop or weaken any existing `[SEC]` line.

**Inherited (still binding — do not weaken adjacent auth / catalog / budget paths):**

- [ ] **[SEC] Every operator-only gate lives inside the Server Action / Route Handler itself** as `requireOperator()` on the `getCurrentUser()` result *(US-14.5)*
- [ ] **[SEC] `requireOperator()` runs `requireActive()` first** *(US-14.5)*
- [ ] **[SEC] RLS stays enabled with zero policies** on `neuramark_provider_catalog` and decision-log table; privileged access via Node service-role only *(US-X.4 / US-14.5)*
- [ ] **[SEC] Service-role key is used only from Node server modules** — never Client Components, never Edge middleware *(US-14.5)*
- [ ] **[SEC] Catalog loaded only via `getProviderCatalog()`** — no direct `neuramark_provider_catalog` SELECT from handlers, agents, or adapters *(US-X.4)*
- [ ] **[SEC] Budget gate runs server-side inside job-creation; client never sends estimate or policy** *(US-7.1 — engine estimate feeds gate)*

**US-7.2 story `[SEC]` (existing in USER_STORIES.md):**

- [ ] **[SEC] `provider_key` for a job is chosen by the server-side policy engine; a client-supplied provider key is never accepted at job creation** *(USER_STORIES US-7.2)*
- [ ] **[SEC] `provider_catalog.cost_model` and `capabilities` are trusted config maintained server-side only; no endpoint exposes writes to the catalog in V1** *(USER_STORIES US-7.2)*

**Added in this review (binding for US-7.2 BUILD):**

- [ ] **[SEC] (added) Central policy engine module** (`lib/providers/resolve-provider-for-job.ts` or CONTRACT exact) uses `import "server-only"`. **Single** export path for: asset role + server-resolved tier + server-loaded visual context → `{ providerKey, providerTier, estimatedCostCents, rationaleCode }`. US-7.1 `estimateLlmJobCost`, US-8.x job creators, and Operator preview **must** call this module — no inline `resolveProvider` + adapter wiring in route handlers
- [ ] **[SEC] (added) Forbidden client authority fields** on every job-creation, regenerate, preview, and future video-job schema (extend US-4.1 / US-7.1 lists): `providerKey`, `provider_key`, `provider`, `selectedProvider`, `tier`, `providerTier`, `provider_tier`, `estimatedCostCents`, `estimated_cost_cents`, `catalogKey`, `catalogRowId`, `allowManualFallback`, `envKeyName`, `costModel`, `capabilities` → **`FORBIDDEN_FIELDS`** (strip-only is **insufficient** on spend paths — reject)
- [ ] **[SEC] (added) Tier lock:** engine **always** receives `providerTier` from `getCostPolicyForClient(serverClientId)` (or explicit Operator SQL override path outside client requests). Engine **must not** accept tier from job input types exposed to handlers
- [ ] **[SEC] (added) Active + tier enforcement:** resolved row **must** satisfy `row.active === true` and `row.tier === policyTier`. High-tier keys (`heygen_high`, etc.) **unreachable** when effective tier is `low` even if client tampered other fields
- [ ] **[SEC] (added) Adapter binding:** `registry.getVideoAdapter` / LLM factory **only** receives `providerKey` from engine output. Grep/security test: no `getVideoAdapter(` / `createSiliconFlowLlmAdapter(` call sites fed from `request`, `formData`, or unvalidated JSON body
- [ ] **[SEC] (added) No catalog write surface:** US-7.2 BUILD adds **zero** INSERT/UPDATE/DELETE on `neuramark_provider_catalog`. No Operator UI to edit catalog rows. Regression test or checklist documents absence
- [ ] **[SEC] (added) Operator recommendation read** uses `requireOperator("handler")` first; response DTO allowlist only: `providerLabel`, `providerTier`, `estimatedCostCents`, `rationaleCode`, optional `breakdown[]` with `{ assetRole, providerLabel, estimatedCostCents }` — **no** `providerKey` to Cliente; Operator may see `providerKey` in CONTRACT if needed for support, but **never** `envKeyName`, full `cost_model`, or raw `capabilities`
- [ ] **[SEC] (added) Visual mode / reference loop** for routing loaded from trusted server helpers (`getBusinessProfileForAgents`, script row, media asset existence) — not from client-supplied `visualMode`, `hasReferenceLoop`, or `modalidad` as authority. Client may send `reelScriptId` only
- [ ] **[SEC] (added) Decision log append-only** (`neuramark_provider_decisions` or CONTRACT exact): columns include `client_id`, `reel_script_id` (nullable until job bound), `job_kind` / `asset_role`, `provider_tier`, `provider_key`, `estimated_cost_cents`, `rationale_code`, `created_at`. RLS deny-by-default. INSERT from engine orchestration only; no Cliente SELECT in V1
- [ ] **[SEC] (added) Decision log content:** never store full catalog jsonb or secrets; rationale is enum/code (e.g. `cheapest_active`, `reference_loop_prefers_musetalk`, `manual_fallback_operator`)
- [ ] **[SEC] (added) Cheapest-active ranking** uses deterministic sort from validated `cost_model` fields (CONTRACT freezes comparator — e.g. `unitCostCents` within same `billingUnit`, tie-break by `key` lexicographic). Prevents ambiguous “first seed row wins” bypass of economics AC
- [ ] **[SEC] (added) Manual fallback isolation:** rows with `capabilities.manualFallback === true` excluded unless CONTRACT documents explicit server-only call site (US-8.3 manual upload); never client-triggered
- [ ] **[SEC] (added) Automated security tests cover at least:** payload with `provider_key: "heygen_high"` → `FORBIDDEN_FIELDS`; payload with only `tier: "high"` → forbidden or ignored with tier still `low` from policy; engine never returns inactive row; engine never returns high-tier row when policy tier is `low`; no Route Handler mutating catalog (grep); recommendation endpoint Cliente → 403; adapter factory not called with request-derived key (static analysis or integration test)

---

## Design Concerns and Required Changes

### Frozen design choices (must land in CONTRACT)

#### 1. Provider key authority — **server engine only** (APPROVE)

| Rule | Detail |
|---|---|
| Assignment | `provider_key` set **only** inside policy engine after policy + catalog load |
| Client input | **Forbidden** on all job/preview schemas (explicit list in CONTRACT freeze table) |
| Adapter lookup | Engine output → registry only |
| Injection test | CONTRACT security matrix includes `provider_key` / `providerKey` smuggle cases |

#### 2. Catalog writes — **none in V1** (APPROVE)

| Surface | V1 rule |
|---|---|
| `neuramark_provider_catalog` | Read via `getProviderCatalog()` only; mutations migration/SQL |
| US-7.2 BUILD | **No** new write Server Actions or Route Handlers |
| Future CRUD | Separate story + `requireOperator()` on every mutation |

#### 3. Policy engine module — **single estimator** (APPROVE WITH CONDITIONS)

| Consumer | Rule |
|---|---|
| US-7.1 `estimateLlmJobCost` | Refactor to call engine (`assetRole: "llm"`, correct `llmVariant`) |
| US-7.1 `assertReelBudgetAllowsSpend` | Uses engine estimate — no duplicate resolver |
| US-8.x job creation | **Must** call same engine before `createJob` |
| Operator preview FE | Reads server-computed recommendation — display non-authoritative |

**Condition:** CONTRACT names exact file path, input type (server-resolved ids only), and output type.

#### 4. Tier and ranking — **policy-bound, cheapest active** (APPROVE WITH CONDITIONS)

| Input | Source |
|---|---|
| `providerTier` | `getCostPolicyForClient(clientId)` |
| Visual / loop context | Server loaders from profile + script + assets |
| Candidate set | `active && tier === policyTier && assetRole match` |
| Winner | Cheapest by CONTRACT comparator; tie-break documented |

**Condition:** CONTRACT documents visual-mode → asset role routing table (talking_head vs broll) aligned with USER_STORIES AC and `PROVIDER_TIERS.html`.

#### 5. Operator read DTO — **minimal exposure** (APPROVE WITH CONDITIONS)

| Allowed | Forbidden |
|---|---|
| Human label, tier, estimate, rationale code, breakdown labels | `envKeyName`, raw `cost_model`, full catalog row, vendor API hints |
| Optional `providerKey` for Operator support (CONTRACT decides) | Cliente routes; full catalog list endpoints |

#### 6. Decision logging — **append-only audit** (APPROVE)

| Rule | Detail |
|---|---|
| When | On each engine resolution tied to a job or preview-confirm path (CONTRACT lists call sites) |
| Fields | tier, asset_role, provider_key, estimate, rationale_code, client_id |
| Mutability | INSERT only in V1 |

---

## Future-Proofing Notes

- **US-8.x** video/TTS job handlers consume engine output for `provider_key` + estimate persistence on `video_jobs` — do not reintroduce client key fields when those tables land.
- **US-7.3** records `actual_cost_cents` server-side from adapter responses — decision log remains estimate-time audit; actuals are separate write path.
- **US-7.4** cost roll-up excludes Cliente serializers — engine/decision data must not leak through shared Reel DTOs.
- **Real auth:** Operator recommendation reads use `requireOperator()`; decision log actor optional until multi-user audit needed.
- **Multi-tenancy:** `client_id` on decision log and previews server-resolved; `reelScriptId` ownership verified before resolution (mirror US-7.1 IDOR pattern → uniform **404**).
- **Catalog activation (P1):** SQL `active = true` on high-tier rows is intentional tier unlock — not client-callable; engine still respects `getCostPolicyForClient().providerTier`.

---

## CONTRACT Spot-Check Checklist (when CONTRACT.md exists)

Before implementation starts, verify CONTRACT:

- [ ] Freeze table lists **forbidden client fields** including all `provider_key` / tier / estimate aliases
- [ ] Policy engine module path, signature, and **`import "server-only"`** documented
- [ ] `providerTier` input to engine documented as **server-only** (from `getCostPolicyForClient`)
- [ ] Visual-mode / reference-loop inputs documented as **server-loaded** — not request authority
- [ ] Cheapest-active comparator defined on validated `cost_model`
- [ ] **`resolveProvider` vs ranked wrapper** relationship clear — no duplicate selection logic
- [ ] Decision log table name, columns, RLS posture, INSERT call sites listed
- [ ] Operator recommendation DTO **field allowlist** explicit
- [ ] **Explicit out-of-scope:** catalog write endpoints = **none**
- [ ] US-7.1 handoff: `estimateLlmJobCost` delegates to engine; forbidden-field lists merged
- [ ] Security test matrix rows for **`provider_key` injection**, tier smuggle, inactive row, Cliente 403

---

## Verdict for CONTRACT

**Pre-CONTRACT (this review): APPROVE WITH CONDITIONS** — nextjs-backend may author `plan/stories/US-7.2/CONTRACT.md`. Proceed only if CONTRACT encodes the frozen items in **Design Concerns** and **Security Acceptance Criteria** above.

**Post-CONTRACT spot-check (binding):**

| CONTRACT outcome | When |
|---|---|
| **APPROVE WITH CONDITIONS** | CONTRACT includes: (1) forbidden client `provider_key` / tier / estimate list with **`FORBIDDEN_FIELDS` reject** on spend paths; (2) single server-only policy engine module as sole assigner of `provider_key`; (3) tier exclusively from `getCostPolicyForClient`; (4) **no** catalog write routes; (5) minimal Operator DTO allowlist; (6) decision log DDL + append-only INSERT; (7) cheapest-active ranking spec; (8) security test matrix covering injection cases |
| **REDESIGN** | CONTRACT accepts client-supplied `providerKey` / `provider_key` (even optional), allows catalog mutation without a new gated story, omits forbidden-field reject on job creation, splits tier resolution into client-trusted input, or documents adapter lookup from request body |
| **VETO (do not BUILD)** | Any Route Handler / Server Action that UPDATEs `neuramark_provider_catalog`; any job schema that strips but does not **reject** smuggled `provider_key` on spend paths; any `getVideoAdapter(clientInput)` pattern |

**Conditions that must be satisfied before BUILD (not optional polish):**

1. **Anti-injection:** CONTRACT freeze list + merged forbidden keys on all existing generate/regenerate actions (scripts, captions, strategy) and future video job actions.
2. **Anti-escalation:** Engine enforces `row.tier === policyTier` and `row.active`; ranking within that set only.
3. **Catalog integrity:** Zero application write surface for catalog in US-7.2 scope.
4. **Single path:** One engine module — US-7.1 estimator refactor listed as in-scope dependency, not parallel logic.

When CONTRACT.md lands, security-architect re-runs the spot-check checklist; **expected result: APPROVE WITH CONDITIONS** if all rows pass. Any REDESIGN finding blocks BUILD until CONTRACT revision.

---

## Verdict Rationale

**APPROVE WITH CONDITIONS** — not REDESIGN because USER_STORIES already states the correct trust model (server-side policy engine, no client `provider_key`, no catalog writes in V1) and US-X.4 / US-7.1 established the loader, gate, and forbidden-field precedent. **Conditions** are the CONTRACT freezes above: centralized engine, explicit injection test matrix, tier lock, cheapest-active ranking, decision log, minimal Operator DTO, and catalog read-only posture. Satisfying them closes the **privilege-escalation via `provider_key` injection** abuse class without blocking US-8.x adapter work.
