# Security Design Review — US-7.4

**Story:** US-7.4 — Report real total cost per Reel  
**Date:** 2026-08-29  
**Reviewer:** security-architect  
**Sources:** `plan/USER_STORIES.md` (US-7.4 `[SEC]` + AC), `plan/SECURITY_BASELINE.md` (§2 cost visibility `(f)`), `plan/stories/US-7.1/SECURITY.md` + `CONTRACT.md` (budget cap, gate uses estimates only), `plan/stories/US-7.3/SECURITY.md` + `CONTRACT.md` (spend ledger canonical store, `getReelCostSummaryForWeek`, Operator weekly aggregate), `plan/stories/US-7.2/SECURITY.md` (provider decision trust model), `plan/stories/US-14.5/SECURITY.md` (`requireOperator` floor), `supabase/migrations/20260830510000_neuramark_reel_spend_events.sql`, `lib/cost-policy/get-reel-cost-summary-for-week.ts`, `lib/cost-policy/record-reel-spend-event.ts`, `lib/contracts/reel-script.ts` (`reelScriptListItemSchema` — no cost fields today)  
**Status:** Binding for implementing agents; validated by requirements-validator like any other acceptance criterion. Do not treat this file as CONTRACT.md. Do not check off `USER_STORIES.md` AC here.

---

## Verdict: APPROVE WITH CONDITIONS

The story shape is correct: **full per-Reel unit economics** (estimated vs actual totals, component breakdown, failed attempts included) are **computed exclusively on the server** from the **append-only spend ledger**, surfaced **only through Operator-gated read paths** (Reel detail cost section + reconciliation with the US-7.3 weekly aggregate), and **absent from every serializer a Cliente session can receive**. Margin-sensitive data (`estimated_cost_cents`, `actual_cost_cents`, variance, budget cap used for over-budget highlight, provider keys as operational labels only) must never appear in shared Reel list items, Cliente dashboard payloads, or approval packages — enforcement at **response-shape** level, not UI hiding.

No REDESIGN. No veto of PO lean defaults (PrimeReact cost section on Operator Reel detail; extend US-7.3 aggregation patterns; phased BUILD — LLM components first, video/TTS when US-8.x / US-9.3 land; hardcoded local Operator OK until auth universal). Orchestrator may proceed to **CONTRACT.md** after freezing the items below.

**Primary threats modeled:**

1. **Cliente obtains per-Reel or component cost via shared payload** — cost fields added to `reelScriptListItemSchema`, a Cliente-accessible loader, or a “shared” Reel detail action because the Operator UI already has the data in memory.
2. **IDOR on Reel cost rollup** — attacker supplies another tenant’s `reelScriptId` and receives that Reel’s margin breakdown.
3. **Client-side aggregation as authority** — browser sums line items, recomputes variance, or derives over-budget from smuggled cap hints; server totals become non-authoritative.
4. **Dual-store double counting** — USER_STORIES mentions `video_jobs` + `media_assets.cost_cents`; without a single canonical ledger rule, rollup over-counts or exposes inconsistent totals vs US-7.3 weekly sum.
5. **Catalog / policy leakage in breakdown DTO** — component rows include raw `cost_model`, env key names, or full provider billing payloads alongside cents.

**Inherited floors (US-7.1 / US-7.2 / US-7.3 / US-14.5 / SECURITY_BASELINE — do not weaken):** `requireOperator()` calls `requireActive()` first; role never from request; handler-level gates mandatory; `client_id` server-resolved only; RLS deny-by-default on spend ledger; service-role Node only; no `@supabase/supabase-js` in Client Components; budget gate continues **`SUM(estimated_cost_cents)`** only (US-7.1); actuals and rollups are **reporting-only**; cost fields never in Cliente response shapes; **`neuramark_reel_spend_events`** is the canonical reporting ledger (US-7.3 CONTRACT freeze).

**This story owns:** Server-only **per-Reel cost rollup module** (`import "server-only"`) aggregating **all** spend events for a `reel_script_id` (retries, failed attempts, every `asset_role`); **Operator-only** read Server Action or RSC loader for Reel detail cost section; **minimal Operator rollup DTO allowlist** (totals, variance, component groups, over-budget flag); **reconciliation invariant** with `getReelCostSummaryForWeek`; **forbidden-key** posture on rollup inputs; security tests for Cliente **403**, IDOR, DTO exclusion, server-only aggregation, and weekly reconciliation.

**This story does not own:** Actual-cost persistence / backfill (US-7.3); budget gate or cap settings writes (US-7.1); provider ranking engine (US-7.2); `neuramark_video_jobs` DDL and vendor adapters (US-8.x — rollup **reads** ledger rows those jobs produce); TTS synthesize orchestration (US-9.3); Cliente cost transparency; Operator manual cost edit; auth redesign; full margin dashboard / charts beyond this Reel detail section.

**Terminology:** **Costo estimado** · **Costo real** · **Varianza** · **Desglose por componente** · **Operator** · **Cliente** · **Reel**. Technical names `getReelCostRollup`, `requireOperator`, `neuramark_reel_spend_events` are canonical.

---

### Threat Summary (US-7.4–specific)

| Threat | Impact | Mitigation in this story |
|---|---|---|
| **Cost fields on `reelScriptListItemSchema` or list success payload** | Cliente reads margin via shared list API if route misconfigured | Rollup lives in **separate Operator DTO** loaded via **Operator-gated** action/helper only. **`reelScriptListItemSchema` and Cliente paths remain cost-free**. US-7.3 `costSummary` on `getReelScriptsForWeek` stays on **Operator-only** action — do not reuse that block on any Cliente route |
| **Standalone public rollup action without gate** | Cliente calls `getReelCostRollup({ reelScriptId })` directly | **`requireOperator("handler")` first await** on any browser-invokable rollup action. Internal helper may omit gate only when called from already-gated Operator loader — CONTRACT must name call graph |
| **IDOR: foreign `reelScriptId`** | Cross-tenant margin leak | Before aggregation: **server-verify** `reel_script_id` belongs to **`requireOperator().id`** (V1 operator tenancy). Query always filters **`client_id = serverClientId AND reel_script_id = $id`**. Foreign id → **404** uniform (no “exists but forbidden” oracle) |
| **Client-supplied `clientId` on rollup input** | Operator pivots to victim tenant | Input schema **`{ reelScriptId }` strict only** — **no** `clientId` in request. Tenancy from session |
| **Browser sums component rows** | Tampered display; hidden true total | FE displays **server-computed** `totalEstimatedCostCents`, `totalActualCostCents`, `varianceCents`, `isOverBudget` — **no client-side SUM** of line items for authority. Component rows are display-only breakdown of server totals |
| **Dual query: spend ledger + `video_jobs` + `media_assets.cost_cents`** | Double-count or diverge from US-7.3 | **Canonical source: `neuramark_reel_spend_events` only** for rollup totals (US-7.3 freeze). Optional mirrors on job/media tables are **not** summed separately. CONTRACT veto: rollup SQL that JOIN-counts the same economic event twice |
| **Over-budget uses client hint** | Forge under-budget display | `maxCostCents` for highlight loaded server-side via **`getCostPolicyForClient(serverClientId)`** — never from request. Compare **`totalActualCostCents ?? totalEstimatedCostCents`** (CONTRACT freezes fallback) to cap |
| **Provider catalog leakage in breakdown** | Strategy / unit-price leak | Component DTO allowlist: `assetRole`, `jobKind`, `providerKey` (label), cents fields, attempt count, `costStatus` — **forbidden:** `cost_model`, `envKeyName`, token rates, raw usage blobs |
| **Weekly sum ≠ sum of per-Reel rollups** | Operator distrust; accidental cross-week bleed | Reconciliation rule in CONTRACT: for a given `weekStart` + `clientId`, **`getReelCostSummaryForWeek.weekly*`** equals **SUM of per-slot rollups** for scripts in that week (same event scope). Automated test |
| **SQL injection via `reelScriptId` / filters** | DB compromise | Parameterized Supabase queries only — **no** string-concatenated SQL |
| **Smuggled rollup override keys** | Client sets displayed totals | Reject `estimatedCostCents`, `actualCostCents`, `maxCostCents`, `components`, `varianceCents`, etc. on rollup action input → **`FORBIDDEN_FIELDS`** |

**Residual risk accepted:** Rollup accuracy depends on spend ledger completeness (US-7.3 / US-8.x / US-9.3 writers). Missing rows are ops/data risk, not client forgery, as long as **no read path accepts client cost input** and **Cliente serializers stay clean**. Adapter-reported actuals are trusted vendor truth (US-7.3 model). Operator trust model: Operators **see** authorized clients’ economics; they cannot **forge** ledger rows through rollup endpoints in V1.

---

## Assets and Trust Boundaries

| Asset | Sensitivity | Trust boundary |
|---|---|---|
| Per-Reel rollup totals (`estimated`, `actual`, `variance`) | **Critical** — unit economics | Server-computed from spend ledger; Operator-only DTO |
| Component breakdown by `asset_role` / `job_kind` | **Critical** | Same query scope; includes failed attempts; no Cliente SELECT |
| Over-budget flag + resolved `maxCostCents` | **High** — cap leakage | Operator-only; from `getCostPolicyForClient`; not in Cliente shapes |
| `provider_key` per line item | Medium | Operational label OK; not catalog pricing |
| `neuramark_reel_spend_events` rows | **Critical** | Read via service-role Node; RLS deny-by-default |
| `reelScriptListItemSchema` / approval package | Medium (by leakage) | **Must not gain** cost keys |
| US-7.3 `ReelWeekCostSummary` | **High** | Operator-only; must reconcile with rollups |

**Boundaries:**

1. **Browser (Operator) → rollup Server Action** — Untrusted. May send **`reelScriptId` pointer only** (optional `weekStart` for tenancy cross-check if CONTRACT requires — must not be authority for totals). **No** cost or cap fields.
2. **Operator action → `requireOperator()` → ownership check → `getReelCostRollup()` → Postgres** — Aggregation runs here. Service-role; parameterized `client_id` + `reel_script_id`.
3. **Operator RSC (Reel detail) → gated loader** — May call rollup helper after gate; cost section data never fetched on Cliente layouts.
4. **Cliente → any rollup endpoint or shared serializer** — **403** or field-absent DTO; Reel detail for Cliente (if any future route) **must not** import rollup loader.

---

## Abuse Cases Considered

- *As a Cliente, I call `getReelCostRollup({ reelScriptId: "<my-reel>" })`* → **Blocked:** `requireOperator("handler")` → **403**.
- *As a Cliente, I inspect `getReelScriptsForWeek` items for cost fields* → **Blocked today:** list items cost-free; US-7.4 **must not** add cost to `items[]`. Cost stays in Operator-only `costSummary` (list) and separate rollup (detail).
- *As a malicious actor, I call rollup with a victim `reelScriptId`* → **Blocked:** ownership check + `client_id` filter → **404** uniform.
- *As a malicious actor, I POST `{ reelScriptId, clientId: "<victim>" }`* → **Blocked:** `clientId` forbidden or stripped; tenancy from session only.
- *As a malicious actor, I POST `{ reelScriptId, maxCostCents: 999999 }` to show under-budget* → **Blocked:** forbidden field; cap from server policy.
- *As a malicious actor, I tamper with component rows in DevTools and claim total is lower* → **Bounded:** display tampering only; authoritative totals are server fields; no Cliente billing impact. Operator sees server values on refresh.
- *As a malicious actor, I rely on duplicate rows in spend ledger + video_jobs mirror* → **Blocked by design:** rollup reads **ledger only**; CONTRACT forbids double-source SUM.
- *As a malicious actor, I omit failed-attempt spend rows from the query* → **Blocked:** aggregation **includes all** events for `reel_script_id` (no `status = completed` filter on spend ledger — failures still cost money when recorded).
- *As a Cliente, I obtain costs via approval-package or dashboard shared loader* → **Blocked:** grep/schema tests — forbidden keys list extended for rollup field names on shared types.
- *As a malicious actor, I use rollup response to harvest another Reel’s existence via timing* → **Mitigated:** **404 uniform** for foreign / missing reel; no distinct error bodies.

---

## Security Acceptance Criteria

Story `[SEC]` items from `plan/USER_STORIES.md` → US-7.4 are binding. Items marked **(added)** are new in this review — paste into the story when the PO next edits USER_STORIES.

**Inherited (still binding — do not weaken adjacent auth / budget / actual-cost paths):**

- [ ] **[SEC] Every operator-only gate lives inside the Server Action / Route Handler itself** as `requireOperator()` on the `getCurrentUser()` result *(US-14.5)*
- [ ] **[SEC] `requireOperator()` runs `requireActive()` first** *(US-14.5)*
- [ ] **[SEC] RLS stays enabled with zero policies** on `neuramark_reel_spend_events`; privileged access via Node service-role only *(US-7.1 / US-7.3)*
- [ ] **[SEC] Service-role key is used only from Node server modules** — never Client Components, never Edge middleware *(US-14.5)*
- [ ] **[SEC] Budget gate uses server-resolved estimates only; rollups do not change gate inputs** *(US-7.1 — reporting-only)*
- [ ] **[SEC] `actual_cost_cents` remains adapter-sourced / server backfill only; rollup endpoints are read-only** *(US-7.3)*

**US-7.4 story `[SEC]` (existing in USER_STORIES.md):**

- [ ] **[SEC] Cost roll-up queries are parameterized and scoped to the requested client's Reels; cost data for other clients is never included in a response (multi-tenancy readiness)** *(USER_STORIES US-7.4)*
- [ ] **[SEC] Cost exclusion is enforced at the response-shape level, not by UI hiding: shared payloads that client sessions can receive (Reel detail, dashboard, approval package) contain NO cost fields (`estimated_cost_cents`, `actual_cost_cents`, provider pricing, budget caps); cost fields appear only in operator-gated endpoints/serializers, so a client session cannot obtain cost data from any endpoint in the system** *(USER_STORIES US-7.4)*

**US-7.4 story AC (operator visibility — security-relevant):**

- [ ] **Operator-only: endpoint/action rejects non-operator sessions server-side (403) — cost data is margin-sensitive and never served to client sessions** *(USER_STORIES US-7.4 AC — binding as `[SEC]` equivalent)*

**Added in this review (binding for US-7.4 BUILD):**

- [ ] **[SEC] (added) Central rollup module** (`lib/cost-policy/get-reel-cost-rollup.ts` or CONTRACT exact) with `import "server-only"`. **All** per-Reel totals and component breakdowns computed here — **no** inline aggregation in Client Components or route handlers
- [ ] **[SEC] (added) Operator rollup read action** (`getReelCostRollupForDetail` — CONTRACT exact) calls `requireOperator("handler")` as **first** await. Failure → **403**, no query. **Not** callable from Cliente layouts
- [ ] **[SEC] (added) Rollup input schema strict:** `{ reelScriptId: uuid }` only (plus optional `weekStart` if CONTRACT uses cross-check — never `clientId`, cost fields, or cap). Smuggled keys → **`FORBIDDEN_FIELDS`**
- [ ] **[SEC] (added) Tenancy before read:** verify `neuramark_reel_scripts.id = reelScriptId` AND `client_id = serverOperatorClientId` before SELECT on spend events. Foreign or missing → **404** uniform
- [ ] **[SEC] (added) Canonical aggregation source:** **`neuramark_reel_spend_events` only** for totals and components. **Forbidden:** summing `video_jobs` / `media_assets.cost_cents` in parallel without dedup; mirrors are display/join helpers at most, not second totals
- [ ] **[SEC] (added) Include all attempts:** query **all** spend rows for `reel_script_id` (retries, failed jobs when recorded). **No** filter that drops failure economics from Operator view
- [ ] **[SEC] (added) Server-side totals authority:** response includes server-computed `totalEstimatedCostCents`, `totalActualCostCents`, `varianceCents`, `isOverBudget`. FE **must not** re-sum components for displayed totals or budget flag
- [ ] **[SEC] (added) Over-budget cap server-resolved:** `maxCostCents` from **`getCostPolicyForClient(serverClientId)`** only; never request input. Raw `rules` / catalog **`cost_model`** not in rollup DTO
- [ ] **[SEC] (added) Operator rollup DTO allowlist** — e.g. `reelScriptId`, totals, `varianceCents`, `isOverBudget`, `maxCostCents`, `components[]` with `{ assetRole, jobKind, providerKey, attemptCount, estimatedCostCents, actualCostCents, hasPendingActual, unavailableReasonKeys, costStatus }`. **Forbidden:** catalog internals, env keys, billing usage blobs, spend event UUID lists unless CONTRACT explicitly needs for Operator support (default **omit**)
- [ ] **[SEC] (added) Shared / Cliente serializers exclude rollup fields** — `reelScriptListItemSchema`, dashboard loaders, approval package types do **not** include `totalActualCostCents`, `costRollup`, `varianceCents`, `maxCostCents`, or snake_case equivalents. **`items[]` on any Cliente-accessible endpoint stays cost-free**
- [ ] **[SEC] (added) Reconciliation test:** for fixture week, **SUM** of per-Reel rollup totals for slotted scripts **equals** `getReelCostSummaryForWeek` slot/weekly fields (same cents rules as US-7.3 CONTRACT)
- [ ] **[SEC] (added) Parameterized queries only** — Supabase client `.eq()` / `.filter()`; no concatenated SQL
- [ ] **[SEC] (added) Automated security tests cover at least:** Cliente **403** on rollup action; foreign `reelScriptId` → **404**; rollup payload with `actualCostCents` → **FORBIDDEN_FIELDS**; shared Reel list DTO snapshot has no cost keys; reconciliation test passes; grep — rollup action input schema has no cost keys

---

## Design Concerns and Required Changes

### Frozen design choices (must land in CONTRACT)

#### 1. Server-only aggregation — **ledger canonical** (APPROVE WITH CONDITIONS)

| Rule | Detail |
|---|---|
| Authority | **All rollup math on server** — browser is display-only |
| Source | **`neuramark_reel_spend_events`** is the **single** reporting store (US-7.3 freeze). USER_STORIES mention of `video_jobs` + `media_assets.cost_cents` is **not** a second SUM source |
| Scope | `WHERE client_id = $serverClientId AND reel_script_id = $reelScriptId` — all rows, all attempts |
| Components | Group by `asset_role` (+ `job_kind` / `provider_key` as CONTRACT freezes). LLM script + caption rows appear as separate lines or grouped `llm` — CONTRACT picks one, test both paths |
| Phase | **Phase A:** LLM-only components. **Phase B:** video/TTS rows when US-8.x / US-9.3 write spend events |

**Condition:** CONTRACT explicitly vetoes dual-store totals and documents event scope (all rows vs week-scoped — **recommend all rows for Reel lifetime** on detail; weekly footer remains US-7.3 week filter).

#### 2. Operator-only read surface — **separate from list items** (APPROVE)

| Surface | Rule |
|---|---|
| Reel detail cost section | Operator route only; data from **`getReelCostRollupForDetail`** (or RSC loader with same gate) |
| Scripts list | US-7.3 **`costSummary`** on **`getReelScriptsForWeek`** remains valid; **do not** embed full component breakdown in list payload (detail lazy-load) |
| Cliente | **Zero** cost fields in any JSON they can receive |
| UI hiding | **Not** a control — serializer omission is |

#### 3. Tenancy and IDOR — **server-resolved client** (APPROVE)

| Rule | Detail |
|---|---|
| Input | `reelScriptId` pointer only |
| Resolve | `serverClientId = requireOperator().id` (V1) |
| Verify | Reel row ownership before spend SELECT |
| Error | Foreign / missing → **404** uniform |

#### 4. Over-budget highlight — **policy from server** (APPROVE)

| Rule | Detail |
|---|---|
| Cap | `getCostPolicyForClient(serverClientId).maxCostCents` |
| Compare | CONTRACT freezes: **`totalActualCostCents ?? totalEstimatedCostCents`** vs cap (actual-first with estimate fallback when actual null — align US-7.3 display posture) |
| Leakage | Cap appears **only** in Operator rollup DTO, not Cliente shapes |

#### 5. Reconciliation with US-7.3 — **testable invariant** (APPROVE)

| Rule | Detail |
|---|---|
| Invariant | Weekly/slot totals from **`getReelCostSummaryForWeek`** match **SUM** of **`getReelCostRollup`** totals for Reels in that week (same client, same cents aggregation rules) |
| Test | Automated in BUILD — prevents week-scope bugs and duplicate math |

#### 6. Forbidden input keys — **extend existing lists** (APPROVE)

Merge rollup-specific aliases into forbidden helpers on the rollup action: `totalActualCostCents`, `varianceCents`, `maxCostCents`, `components`, `clientId`, `client_id`, `estimatedCostCents`, `actualCostCents`, etc.

#### 7. No rollup write surface — **read-only story** (APPROVE)

US-7.4 **must not** add endpoints that INSERT/UPDATE spend rows or caps. Corrections remain US-7.3 / ops SQL.

#### 8. USER_STORIES DB row correction — **no new tables required** (APPROVE WITH CONDITIONS)

**Condition:** CONTRACT updates story implementation note: query spend ledger (existing indexes `client_id, reel_script_id`); **`media_assets.cost_cents`** only if US-9.3 defines a **mirror** written by the same **`finalizeGenerationCost`** path — never a parallel client-readable column used for rollup authority.

---

## Future-Proofing Notes

- **US-8.x / US-9.3:** video/TTS spend rows land on the same ledger; rollup module **automatically** includes new `asset_role` values when present — no Cliente serializer change.
- **Multi-tenancy:** when Operators serve multiple clients, rollup ownership check must follow CONTRACT operator-target rules (explicit authorized `clientId` resolution — never raw request `clientId` without authorization story).
- **Real auth (US-14.5):** rollup uses session-backed `requireOperator()`; no header/query identity.
- **Cliente Reel detail (future):** if a Cliente-facing detail route is added, it **must** use a **different loader** that does not call `getReelCostRollup` — shared types must remain cost-free.
- **RLS later:** Cliente policies on spend events must deny SELECT; design now avoids browser Supabase access entirely.

---

## CONTRACT Spot-Check Checklist (when CONTRACT.md exists)

Before implementation starts, verify CONTRACT:

- [ ] Freezes **`getReelCostRollup`** (or exact name), `import "server-only"`, aggregation rules, and **ledger-only** source
- [ ] Names **`getReelCostRollupForDetail`** (or exact) with **`requireOperator` first await**
- [ ] Input schema **`{ reelScriptId }` strict** — no `clientId`, no cost authority fields
- [ ] Documents **ownership check** before read and **404** uniform for IDOR
- [ ] Defines **OperatorReelCostRollupDto** allowlist and **explicit forbidden** catalog/policy fields
- [ ] States **server-computed totals** — FE must not re-sum for authority
- [ ] Freezes **over-budget** cap source (`getCostPolicyForClient`) and comparison rule
- [ ] Documents **reconciliation** with **`getReelCostSummaryForWeek`**
- [ ] Lists serializers that **omit** cost/rollup fields (`reelScriptListItemSchema`, approval package, Cliente dashboard)
- [ ] **Vetoes** dual-store SUM (`video_jobs` + ledger) without dedup
- [ ] Phased acceptance (LLM Phase A; video/TTS Phase B) aligned with US-7.3
- [ ] Security test matrix: Cliente 403, IDOR 404, forbidden keys, DTO exclusion, reconciliation

---

## Verdict for CONTRACT

**Pre-CONTRACT (this review): APPROVE WITH CONDITIONS** — nextjs-backend may author `plan/stories/US-7.4/CONTRACT.md`. Proceed only if CONTRACT encodes the frozen items in **Design Concerns** and **Security Acceptance Criteria** above.

**Post-CONTRACT spot-check (binding):**

| CONTRACT outcome | When |
|---|---|
| **APPROVE WITH CONDITIONS** | CONTRACT includes: (1) **server-only** rollup module reading **`neuramark_reel_spend_events` only**; (2) **`requireOperator` first** on browser-invokable rollup read; (3) **strict input** — `reelScriptId` only, forbidden cost/cap/client keys; (4) **ownership check** + parameterized tenant-scoped query; (5) **OperatorReelCostRollupDto allowlist** without catalog/policy leakage; (6) **server totals authority** — no client-side SUM; (7) **over-budget** via server policy cap; (8) **reconciliation** with US-7.3 weekly/slot sums; (9) **explicit Cliente serializer exclusion** list; (10) security test matrix for 403, IDOR, forbidden keys, DTO grep, reconciliation |
| **REDESIGN** | CONTRACT embeds rollup fields in `reelScriptListItemSchema` or any Cliente loader; accepts `clientId` or cost fields on rollup input; sums `video_jobs` + ledger without dedup; exposes `cost_model` / env keys / raw caps to Cliente paths; allows client-side aggregation as source of truth; or adds write/mutation surface for costs |
| **VETO (do not BUILD)** | Any Cliente-accessible endpoint returning rollup DTO; rollup action without `requireOperator`; query without `client_id` filter; string-concatenated SQL; public action that returns another tenant’s costs on foreign UUID; dual-store totals that break US-7.3 reconciliation |

**Conditions that must be satisfied before BUILD (not optional polish):**

1. **Anti-leakage:** Rollup data Operator-gated; shared DTOs cost-free by schema/grep; list `items[]` unchanged for Cliente paths.
2. **Anti-IDOR:** Reel ownership verified; parameterized tenant-scoped reads; 404 uniform.
3. **Server authority:** All totals, variance, and over-budget computed server-side from ledger.
4. **Single source:** Spend ledger canonical; no double-count from job/media mirrors.
5. **Reconciliation:** Weekly US-7.3 sums match per-Reel rollups for the same scope.

When CONTRACT.md lands, security-architect re-runs the spot-check checklist; **expected result: APPROVE WITH CONDITIONS** if all rows pass. Any **REDESIGN** finding blocks BUILD until CONTRACT revision.

---

## Verdict Rationale

**APPROVE WITH CONDITIONS** — not REDESIGN because USER_STORIES already states the correct trust model (Operator-only margin data, parameterized client-scoped queries, response-shape exclusion for Cliente) and US-7.3 established the spend ledger, weekly aggregation, and Operator gate patterns this story extends. **Conditions** are the CONTRACT freezes above: ledger-only server aggregation, separate Operator rollup DTO (not list item pollution), strict tenancy/IDOR handling, no client-side math as authority, policy-sourced over-budget only, and reconciliation with US-7.3. Satisfying them closes **margin leakage to Cliente sessions** and **cross-tenant rollup IDOR** without blocking LLM-first Phase A BUILD.
