# Security Design Review — US-13.2

**Story:** US-13.2 — Surface top themes for next strategy cycle  
**Date:** 2026-08-31  
**Reviewer:** security-architect  
**Branch:** `feature/US-13.2-strategy-insights`  
**Sources:** `plan/USER_STORIES.md` (US-13.2 AC + `[SEC]`), `plan/SECURITY_BASELINE.md` § Calendar / Metrics (P1), `plan/stories/US-13.2/README.md` + `TASKS.md` + `SPEC-REVIEW.md`, `plan/stories/US-13.1/SECURITY.md` + `CONTRACT.md`, `plan/stories/US-4.1/SECURITY.md` + `lib/agents/content/generate-weekly-strategy.ts`, `lib/content-strategy/generate-content-strategy-for-client.ts`, `lib/content-strategy/find-forbidden-keys.ts`, `lib/contracts/content-strategy.ts` (`contentStrategySlotSchema.tema`)  
**Status:** Binding for implementing agents; validated by requirements-validator like any other acceptance criterion. Do not treat this file as CONTRACT.md. Do not check off `USER_STORIES.md` AC here.  
**Primary implementers:** **nextjs-backend** (aggregator, read action, orchestrator hook, tests). **content-agents-engineer** (prompt delta, agent tests). **nextjs-frontend** (insights snippet — presentation only). **No** media-pipeline-engineer · **No** integrations-engineer · **No DB migration** Phase A.

---

## Verdict: APPROVE WITH CONDITIONS

The story correctly closes the **Metrics Lite → Estrategia semanal** learning loop as a **read-only SQL aggregate** over US-13.1 integer counters, with **Operator-gated** insights read, **server-built** prompt payload injected only from the orchestrator (never from request body), and **`<TRUSTED_METRICS_SUMMARY>`** delimiter containment parallel to US-4.1.

No **REDESIGN**. No veto of PO product defaults (28-day lookback, top 3 by `engagementScore`, graceful empty, no new route, no Cliente read V1, generate rate limits unchanged). Orchestrator may proceed to **CONTRACT.md** after freezing the **16 conditions** below.

**Inherited floors (US-14.5 / US-13.1 / US-4.1 / SECURITY_BASELINE — do not weaken):** `requireOperator()` calls `requireActive()` first; role never from request; handler-level gates mandatory; `neuramark_reel_metrics` is integer-only (US-13.1); aggregator is `import "server-only"`; no `@supabase/supabase-js` in Client Components; no browser Supabase keys; generate path keeps US-4.1 forbidden keys + rate limits; interim hardcoded user sanctioned — not a finding.

**This story owns:** `aggregateReelMetricsByTema` server module; `getStrategyPerformanceInsights` Server Action; orchestrator hook in `generateContentStrategyForClient`; `lib/contracts/strategy-insights.ts`; prompt delta in `buildWeeklyStrategyPrompts` / `generateWeeklyContentStrategy`; security tests for operator gate, tenancy isolation, integer-only prompt serialization, forbidden generate keys, cross-client aggregate filter, graceful empty (no tag when zero rows).

**This story does not own:** Metrics entry UI (`upsertReelMetrics` — US-13.1); Instagram Insights API; pillar rollup charts (Phase B); Cliente insights surface; persisted insights cache; changing US-4.1 generate rate limits; auto-run strategy on metrics save; RBAC beyond `requireOperator()`.

**Terminology:** **Estrategia semanal** · **brief** · **Operator** · **Reel** · **Ensamblado** · **métricas** (Metrics Lite) · **tema**. Do not inject raw calendar URLs, free-text metric notes, or client-supplied aggregate JSON into prompts.

**USER_STORIES `[SEC]` clarification (binding):** The AC line *"no free-text fields"* and *"free of user-authored injection vectors"* targets **metrics-table and request-body injection** — US-13.1 stores five integers only; US-13.2 must never accept operator-supplied summary text on generate. **Optional server-resolved `tema` labels** in the prompt block are **brief-sourced** (strategy JSON via join), not metrics-sourced; they are **Operator-curated planning copy** (same trust tier as brief slot `tema` already consumed by downstream agents). SECURITY **approves** sanitized brief `tema` labels in `<TRUSTED_METRICS_SUMMARY>` per conditions below; rows failing sanitize emit **rank + integers only** (no `tema` key). VALIDATION applies this interpretation over literal "no free-text" wording.

---

### Threat Summary (US-13.2–specific)

| Threat | Impact | Mitigation in this story |
|---|---|---|
| **Cliente reads cross-tenant performance aggregates** | Competitive intelligence leak | **`requireOperator("handler")` first** on `getStrategyPerformanceInsights` → **403**; no public Route Handler; page under `/operator/*` layout gate |
| **Cross-tenant aggregate via spoofed `clientId`** | IDOR — victim client's metrics in insights or prompt | **`clientId` UUID + active client row validation** before aggregate; SQL **`WHERE m.client_id = :validatedClientId`**; join path also filters **`cs.client_id = :validatedClientId`** (defense in depth) |
| **Insights read for client A, generate injects client B metrics** | Wrong learning signal / accidental cross-tenant prompt data | **Orchestrator and insights read use the same validated `clientId`** for the selected client on `/operator/strategy`; generate action must pass **that** id into `generateContentStrategyForClient` (US-13.2 extends generate wiring — see Condition 6) |
| **Operator-supplied metrics summary on generate** | Prompt injection / forged performance signal | **Forbidden keys** on `generateContentStrategy` input: `metricsSummary`, `metricsSummaryForPrompt`, `insights`, `topThemes`, `engagementScore`, etc.; summary built **only** inside orchestrator from aggregator output |
| **Free-text from `neuramark_reel_metrics` in prompt** | User-authored injection via metrics columns | Table has **integer columns only** (US-13.1); aggregator reads **views, likes, comments, saves, dms, recorded_at, client_id, assembled_reel_id** — no string columns; prompt payload **integers + optional sanitized `tema`** from brief join only |
| **Prompt injection via `tema` strings in brief** | Operator (or prior LLM) planted "ignore instructions" in slot `tema` | **`tema` sanitized** before prompt (trim, max 200, strip control chars / newlines / `<>`); delimited **`<TRUSTED_METRICS_SUMMARY>`** with system framing: performance **data** for **tema bias only** — must not override modalidad/formato/playbook rules; failed sanitize → rank-only row |
| **LLM treats metrics block as instructions** | Strategy drifts format/modalidad/tactic rules | System addendum: use summary to **bias slot `tema` topics** only; **explicit forbid** overriding allowlist, modalidad, formato, tactica rules (US-4.1 output validation unchanged) |
| **Integer overflow in SUM aggregates** | Bad ranks / DoS in prompt | Counters bounded **`0 … REEL_METRICS_MAX_VALUE`** (US-13.1); max rows per client in window bounded by published Reels; `engagementScore` = sum of five bounded ints; Zod **`.int().min(0)`** on prompt schema; optional sanity cap on `engagementScore` in CONTRACT |
| **Unauthenticated aggregate endpoint** | Data exfiltration | **No** new public Route Handler; Server Action + RSC loader only, Operator-gated |
| **Logging prompts / full brief / aggregate detail** | PII / strategy leakage | Log **`clientId`, window bounds, `topCount`, error codes** only — never full prompts, brief JSON, or per-Reel metric rows (US-4.1 pattern) |
| **SQL injection via `clientId` / `weekStart`** | DB compromise | Parameterized queries only; `clientId` via UUID schema; `weekStart` via `trendWeekStartSchema` |

**Residual risk accepted:** Operator role may read insights for **any** active client (multi-client strategy page — same trust model as US-12.1 calendar and US-13.1 metrics writes). Brief `tema` strings remain **LLM fuel** at aggregate time; containment is delimiter + sanitization + output schema (US-4.1), not semantic erasure. Read action has **no rate limit V1** — acceptable for read-only aggregate (PO + spec-guardian lean). Generate rate limit unchanged (US-4.1).

---

## Assets and Trust Boundaries

| Asset | Sensitivity | Trust boundary |
|---|---|---|
| `neuramark_reel_metrics` counters | Medium — operational signal; feeds prompt as **aggregated integers** | Operator-only write (US-13.1); read via service-role aggregator; **`client_id` filter server-enforced** |
| Aggregated top-3 by `tema` | Medium — competitive learning signal | Operator-only read; scoped to validated `clientId` |
| Strategy brief slot `tema` (join source) | Medium — Operator/LLM-authored planning text | Resolved **server-side** from `neuramark_content_strategies.brief` JSON; **not** from metrics input or generate request body |
| `<TRUSTED_METRICS_SUMMARY>` prompt block | Medium — **trusted server-built** LLM input | Built in orchestrator from aggregator only; `JSON.stringify` on server object; delimiter + system framing |
| `clientId` (tenancy key) | High | Validated UUID + active client on insights read; orchestrator param on generate — **never unvalidated body alone on generate summary path** |
| Operator session | High — cross-tenant read authority | `requireOperator()` on read action; layout gate on page |

**Boundaries:**

1. **Browser (Operator) → `getStrategyPerformanceInsights`** — Untrusted: `clientId`, `weekStart`. **`requireOperator("handler")` first**. No Supabase SDK. Insights DTO is read-only presentation.
2. **Browser (Operator) → `generateContentStrategy`** — Untrusted: `weekStart` only (V1); **must not** carry metrics summary keys. Operator gate + US-4.1 forbidden keys + rate limit before LLM.
3. **Server Action / RSC loader → `aggregateReelMetricsByTema`** — Trusted caller only (`import "server-only"`). Parameterized SQL; integer aggregates; optional sanitized `tema` from brief join.
4. **`generateContentStrategyForClient` → aggregator → agent** — Same `clientId` as profile load; passes `metricsSummaryForPrompt` into `generateWeeklyContentStrategy`; agent module does not load metrics tables directly.
5. **Agent → LLM** — Metrics block appended after `<UNTRUSTED_*>` blocks; system instructions define trust class and scope limits.

---

## Threat Model — Metrics → Prompt Injection Path

```text
neuramark_reel_metrics (integers only — US-13.1)
        │
        ▼  SQL JOIN (server-only, client_id filter)
neuramark_assembled_reels → neuramark_reel_scripts → neuramark_content_strategies
        │
        ▼  extract brief.slots[slotIndex].tema (brief JSON — Operator/LLM-authored)
aggregateReelMetricsByTema → StrategyPerformanceInsightsDto
        │
        ▼  buildMetricsSummaryForPrompt (integers + optional sanitized tema)
generateContentStrategyForClient (orchestrator — NOT from HTTP body)
        │
        ▼  append <TRUSTED_METRICS_SUMMARY> in buildWeeklyStrategyPrompts
LLM (output still Zod-validated brief — US-4.1)
```

| Stage | Trust class | Injection vector | Control |
|---|---|---|---|
| Metrics row | **Trusted integers** (Operator-entered counters) | Forged counters via direct DB | Operator-only write + published gate (US-13.1); aggregates are sums — no string columns |
| Join / GROUP BY | **Server-computed** | Cross-tenant rows in aggregate | `m.client_id = :clientId` + `cs.client_id = :clientId`; skip orphan joins |
| `tema` label | **Brief-sourced text** (Operator-editable) | "Ignore previous instructions" in slot `tema` | Sanitize + max 200; TRUSTED delimiter with narrow system scope; rank-only fallback; US-4.1 output schema unchanged |
| Prompt assembly | **Server-only** | Client POST `{ metricsSummaryForPrompt: [...] }` | Forbidden keys on generate action; orchestrator-only build |
| LLM output | **Untrusted external** | Model echoes injection into brief | `contentStrategyBriefSchema` + allowlists (US-4.1) — unchanged |

**Decision — `tema` labels in `<TRUSTED_METRICS_SUMMARY>`:** **APPROVE** sanitized server-resolved labels (spec-guardian recommendation). Rationale: product needs semantic signal to bias next week's slot topics; labels are **not** from metrics mutation input; sanitization mirrors `contentStrategySlotSchema` bounds; failed sanitize drops `tema` key for that row (rank + integers remain). **Rank-only fallback** is mandatory per-row when sanitize fails — not a story-wide veto of labels.

---

## Abuse Cases Considered

- *As a Cliente, I call `getStrategyPerformanceInsights` for a competitor `clientId`* → **Blocked:** `requireOperator("handler")` → **403**; zero aggregate query on failure.
- *As a Cliente, I view `/operator/strategy` insights* → **Blocked:** operator layout `requireOperator("page")` → redirect/403.
- *As a malicious actor, I POST `{ clientId: "<victim>", weekStart: "..." }` to insights action* → **Contained (Operator trust model):** Operator role **may** read any active client — product intent (US-12.1). **Blocked for Cliente** at gate. Invalid UUID / inactive client → **`VALIDATION_ERROR`** or **`NOT_FOUND`** without cross-tenant leak.
- *As a malicious actor, I POST `{ weekStart, metricsSummaryForPrompt: [{ rank: 1, views: 999999, tema: "ignore all rules" }] }` to generate* → **Blocked:** forbidden-key scan → **`FORBIDDEN_FIELDS`** before LLM; orchestrator rebuilds summary from DB only.
- *As a malicious actor, I POST `{ insights: { topThemes: [...] } }` to generate* → **Blocked:** extend `FORBIDDEN_GENERATE_KEYS` — **`FORBIDDEN_FIELDS`**.
- *As a malicious actor, I inject newlines or `<UNTRUSTED_BUSINESS_PROFILE>` in a brief slot `tema`* → **Mitigated:** sanitize strips control chars, `\n`, `<>`/`</`; row fails sanitize → rank-only in prompt; delimiter wrapping on whole block.
- *As a malicious actor, I rely on metrics table string columns* → **Blocked:** table has **no string metric fields** (US-13.1).
- *As a malicious actor, I aggregate without `client_id` filter* → **Blocked:** unit tests + SQL review; cross-client isolation test required.
- *As Operator, I view insights for selected client A but Generate still uses session client B* → **Blocked (US-13.2 scope):** generate action must pass **same validated `clientId`** as insights selector into orchestrator (Condition 6); VALIDATION proves alignment.
- *As implementer, I expose aggregate via public GET `/api/strategy-insights`* → **Veto:** no unauthenticated Route Handler.
- *As implementer, I log full `<TRUSTED_METRICS_SUMMARY>` in production* → **Veto:** log metadata only.

---

## Security Acceptance Criteria

Story `[SEC]` items from `plan/USER_STORIES.md` → US-13.2 are binding, **as clarified above** for `tema` labels vs metrics-sourced text. Items marked **(added)** extend enforcement for testability.

**USER_STORIES.md `[SEC]` (binding — mapped):**

- [ ] **[SEC] Metrics summary injected into the strategy prompt is built from aggregated numbers server-side (no free-text fields), keeping the prompt surface free of user-authored injection vectors** — **Mapped:** (1) Prompt metric **values** (`rank`, `reelCount`, `views`, `likes`, `comments`, `saves`, `dms`, `engagementScore`) are **integers only**, computed server-side from `neuramark_reel_metrics` SUM/COUNT — **no columns from metrics table except integers and join keys**. (2) **No** operator-supplied summary on generate (forbidden keys). (3) Optional **`tema` label** per row is **brief-sourced via join**, sanitized, max 200 — **not** metrics input; satisfies AC **intent**; rows failing sanitize omit `tema` key (rank-only). (4) When zero qualifying rows, **omit** `<TRUSTED_METRICS_SUMMARY>` entirely — no placeholder injection surface.

**Added in this review (binding for US-13.2 BUILD):**

- [ ] **[SEC] (added) `getStrategyPerformanceInsights` calls `requireOperator("handler")` as its first await** before forbidden-key scan, validation, or aggregate query; failure → typed **403** envelope, **zero side effects**
- [ ] **[SEC] (added) Insights read input:** `{ clientId, weekStart }` — Zod `.strict()`; **`clientId`** via UUID schema + **active** `neuramark_clients` row existence check (same pattern as strategy page client selector); **`weekStart`** via `trendWeekStartSchema`; forbidden keys on read action: `role`, `auth_user_id`, `topThemes`, `metrics`, `brief`, etc. → **`FORBIDDEN_FIELDS`**
- [ ] **[SEC] (added) Aggregate SQL tenancy:** `WHERE m.client_id = :validatedClientId` **and** linked strategy row **`cs.client_id = :validatedClientId`**; cross-client test proves client A metrics never appear in client B aggregate
- [ ] **[SEC] (added) Aggregator module `import "server-only"`** — `lib/metrics/aggregate-reel-metrics-by-tema.ts`; no HTTP export; not imported from Client Components
- [ ] **[SEC] (added) Prompt path isolation:** `metricsSummaryForPrompt` built only in **`generateContentStrategyForClient`** (or `buildMetricsSummaryForPrompt(insights)` called there); **never** parsed from `generateContentStrategy` request body
- [ ] **[SEC] (added) Forbidden generate keys extended** in `findForbiddenContentStrategyKeys` (or dedicated helper): at minimum `metricsSummary`, `metricsSummaryForPrompt`, `metrics_summary`, `insights`, `topThemes`, `top_themes`, `engagementScore`, `engagement_score`, `available`, `windowStart`, `windowEnd`, `reelCount`, `reel_count` — presence → **`FORBIDDEN_FIELDS`** before rate limit / LLM
- [ ] **[SEC] (added) Integer-only prompt metric fields:** Zod schema for prompt summary rows — `rank`, `reelCount`, `views`, `likes`, `comments`, `saves`, `dms`, `engagementScore` all **`.int().min(0)`**; array **max length 3**; serialize with **`JSON.stringify`** on server-built object only — no string concat from request input
- [ ] **[SEC] (added) `tema` sanitize for prompt (when label included):** apply **`sanitizeTemaForMetricsPrompt(raw: string): string | null`** — trim; reject empty; max **200** chars; strip ASCII control chars (`\x00-\x1F`, `\x7F`); replace/remove `\n`/`\r`; strip `<` and `>`; reject if result empty → **omit `tema` key** for that row (rank + integers remain). Mirror `contentStrategySlotSchema` bounds; do not accept unsanitized brief text in prompt
- [ ] **[SEC] (added) `<TRUSTED_METRICS_SUMMARY>` delimiter:** constant `TRUSTED_METRICS_SUMMARY_TAG`; wrap JSON array; system prompt addendum states block is **trusted server-built performance data** for **tema topic bias only** — **must not** change modalidad, formato playbook slugs, tactica slugs, slot count bounds, or disclosure rules
- [ ] **[SEC] (added) Graceful empty:** when zero qualifying metrics rows, aggregator returns `available: false` / `null`; generate **omits** metrics block — **not an error**; no empty tag placeholder (prevents injection into "empty" template)
- [ ] **[SEC] (added) `clientId` alignment — insights read vs generate inject:** **`generateContentStrategyForClient({ clientId })`** receives the **same validated `clientId`** used for insights on `/operator/strategy` for the selected client; US-13.2 **extends** generate action wiring to pass selector value (validated UUID + active client) instead of only `operator.id` when selector differs — until wired, CONTRACT documents FE must not show misleading cross-client insights (or default selector to session client)
- [ ] **[SEC] (added) No new public Route Handler** exposing strategy performance aggregates
- [ ] **[SEC] (added) Logging:** log `clientId`, `windowStart`, `windowEnd`, `topCount`, error **codes** — **never** full prompts, brief JSON, `<TRUSTED_METRICS_SUMMARY>` body, or per-Reel metric dumps (US-4.1 pattern)
- [ ] **[SEC] (added) Read action rate limit:** **none V1** — read-only aggregate; acceptable residual risk; **do not** skip generate rate limit (US-4.1 unchanged)
- [ ] **[SEC] (added) Automated security tests cover at least:** Cliente → `getStrategyPerformanceInsights` **403**; Operator happy path; invalid `clientId` → validation/not-found without leak; cross-client aggregate isolation; generate with smuggled `metricsSummaryForPrompt` → **`FORBIDDEN_FIELDS`**; generate with fixture metrics includes tag + integer fields only; generate with empty window omits tag; prompt test asserts no unsanitized `<`/`>` in serialized block; grep — aggregator has `server-only`; no public insights route

---

## Design Concerns and Required Changes

### Frozen design choices (must land in CONTRACT)

#### 1. Operator gate on insights read (APPROVE — PO #8, README)

Mirror US-13.1 / US-4.1: **`requireOperator("handler")` first** in `getStrategyPerformanceInsights`.

**Condition 1:** CONTRACT documents gate order: `requireOperator` → forbidden keys → Zod → active client check → aggregate; typed 401/403; zero side effects on 403.

#### 2. Tenancy — validated `clientId` on aggregate (APPROVE — PO #12, SPEC-REVIEW Medium)

Operator may read **any** active client (calendar-like). Authority is **Operator role + validated UUID + active row**, not session tenant match.

**Condition 2:** CONTRACT freezes: `clientId` validated before query; SQL filters **`m.client_id`** and **`cs.client_id`**; invalid/inactive → typed error without revealing other tenants' data.

#### 3. Insights read vs generate `clientId` alignment (APPROVE WITH CONDITIONS — SPEC-REVIEW Medium)

Shipped generate uses `operator.id`; insights uses selector `clientId`. Misalignment leaks wrong product signal (not necessarily cross-tenant DB leak if generate still scoped to session).

**Condition 3:** CONTRACT + BUILD: **`generateContentStrategy` accepts validated `clientId` from strategy page selector** (same validation as insights read) **OR** documents interim constraint that insights `clientId` must match session until selector parity ships. **SECURITY requires** orchestrator inject path uses **same validated `clientId` as insights display** by US-13.2 CLOSE. Extend generate input schema to allow **`clientId`** only when validated against active clients list (Operator supervisor model) — **remove `clientId` from forbidden keys for generate** only when accompanied by server validation module shared with insights read. Until then, keep forbidden on unvalidated smuggling.

**Recommended CONTRACT shape:** Add optional `clientId` to generate input **only if** present in server-validated active client set; default fallback `operator.id` when omitted; forbidden keys still block `metricsSummary*`.

#### 4. Integer-only aggregates from `neuramark_reel_metrics` (APPROVE — PO #3, [SEC])

**Condition 4:** CONTRACT documents: SUM/COUNT of five integer columns; `engagementScore = views + likes + comments + saves + dms`; all prompt numeric fields Zod integers; no reads of non-integer metrics columns (none exist).

#### 5. Forbidden client-supplied metrics summary on generate (APPROVE — TASKS checklist)

**Condition 5:** CONTRACT extends `FORBIDDEN_GENERATE_KEYS` list (see criteria above); generate gate order unchanged: `requireOperator` → forbidden keys → Zod → rate limit → orchestrator.

#### 6. Prompt injection — `<TRUSTED_METRICS_SUMMARY>` (APPROVE WITH CONDITIONS)

**Condition 6:** CONTRACT freezes tag name, JSON array shape (max 3 rows), integer fields, optional `tema?: string` after sanitize, system addendum text (EN/ES), omission when `available: false`.

#### 7. `tema` label policy (APPROVE — spec-guardian recommendation)

**Condition 7:** CONTRACT documents **`sanitizeTemaForMetricsPrompt`** rules and **rank-only fallback** per row when sanitize returns null. **Do not** source `tema` from metrics table, request body, or Operator free-text metrics notes.

#### 8. Window bounds (APPROVE — PO #1, spec-guardian Q3)

**Condition 8:** `STRATEGY_METRICS_LOOKBACK_DAYS = 28`; `windowEnd` = ISO Monday of target `weekStart` (**exclusive**); `windowStart = windowEnd - 28d`; filter on `recorded_at`.

#### 9. Join path — skip unresolvable rows (APPROVE — README)

**Condition 9:** Orphan metrics without script/strategy/tema → **skip silently**; no synthetic `tema`; all-zero counters **included**.

#### 10. Strategy `status` filter (APPROVE — spec-guardian Q4 lean)

**Condition 10:** **No `status = 'approved'` filter V1** on join — any linked strategy row supplies `tema`. Optional tighten in VALIDATION if join noise appears.

#### 11. No DDL Phase A (APPROVE)

**Condition 11:** Read-only queries; reuse US-13.1 index `(client_id, recorded_at DESC)`.

#### 12. RSC loader + action (APPROVE — spec-guardian Q6)

**Condition 12:** Page loader may call aggregator helper directly for initial paint; action for client/week changes — **both** paths call same gated helper; **no** ungated export.

#### 13. Rate limits (APPROVE)

**Condition 13:** **No rate limit** on insights read V1. **Generate unchanged** — US-4.1 `checkGenerationRateLimit` + in-flight guard.

#### 14. Cliente insights (APPROVE — out of scope)

**Condition 14:** Non-goal — future client-scoped read requires `requireActive()` + `getCurrentUser().id` filter — separate story.

#### 15. Logging (APPROVE — PO #16)

**Condition 15:** Metadata-only logging in CONTRACT non-goals for full prompts/brief.

#### 16. Security tests (APPROVE)

**Condition 16:** CONTRACT § security tests lists minimum cases from criteria above.

---

### Open questions — SECURITY resolutions

| # | Question (PREP / SPEC-REVIEW) | Resolution |
|---|---|---|
| 1 | Include **`tema`** labels in prompt or rank-only integers? | **Include sanitized brief-sourced `tema`** paired with integer aggregates; **rank-only fallback** per row when sanitize fails |
| 2 | Sanitize **`tema`** for prompt? | **Yes** — trim, max 200, strip control chars / newlines / `<>`; Zod on prompt payload |
| 3 | `windowEnd` exclusive on target `weekStart` Monday? | **Approve PO freeze** |
| 4 | Approved-only strategies for `tema` source? | **Lean: any linked strategy row** — no status filter V1 |
| 5 | Duplicate `tema` casing | **Lowercase GROUP BY**; display first-seen casing in FE DTO |
| 6 | FE load: RSC loader vs action | **Approve both** — shared server helper; Operator gate on action |
| 7 | Re-fetch insights after Generate | **Optional** — non-security |
| 8 | Rate limit on read action? | **No V1** — read-only; documented residual risk |
| 9 | Generate `clientId` vs insights `clientId` | **Must align by CLOSE** — validated selector `clientId` passed to orchestrator (Condition 3) |

---

### Vetoes (would block BUILD)

| If implementers… | Verdict |
|---|---|
| Skip `requireOperator` on insights read action | **REJECT** |
| Accept `metricsSummaryForPrompt` / `insights` / `topThemes` on generate input | **REJECT** |
| Build prompt summary from request body or Client Component props without server aggregate | **REJECT** |
| Include unsanitized brief `tema` in prompt (raw JSON extract without sanitize) | **REJECT** |
| Read string columns from `neuramark_reel_metrics` for prompt | **REJECT** |
| Omit `client_id` filter on aggregate query | **REJECT** |
| Add public unauthenticated Route Handler for insights | **REJECT** |
| Log full prompts or `<TRUSTED_METRICS_SUMMARY>` in production | **REJECT** |
| Let metrics block override modalidad/formato/tactica rules in system prompt | **REJECT** |
| Import aggregator from Client Components | **REJECT** |
| Expose Supabase client for insights in browser | **REJECT** |

None of the PO product defaults trigger a redesign veto.

---

## Future-Proofing Notes

- **Real auth / RLS:** Aggregator remains service-role with explicit `client_id` filter — RLS on metrics/strategies tables stays deny-by-default; future Cliente insights needs new client-scoped read, not Operator action reuse.
- **Phase B pillar rollup / cache / charts:** Separate security review if persisted cache or Cliente read added.
- **Automated ciclo semanal:** May call `aggregateReelMetricsByTema({ clientId, weekStart, invokedBy: "system" })` — trusted internal caller only; no new HTTP surface without review (ADR-0001).
- **Generate `clientId` supervisor model:** Aligns with US-4.1 SECURITY Condition 8 (multi-client Operator) — validated picker, not raw POST trust.
- **Rank-only global fallback:** If product later removes `tema` from prompt entirely, sanitize helper and tests still valuable for FE DTO labels.

---

## CONTRACT.md Checklist (pre-implementation)

When `plan/stories/US-13.2/CONTRACT.md` exists, verify before BUILD:

- [ ] `requireOperator` gate order on `getStrategyPerformanceInsights`
- [ ] Read input schema `{ clientId, weekStart }` `.strict()` + forbidden keys
- [ ] Active client validation module shared with generate selector path
- [ ] `aggregateReelMetricsByTema` join path + window bounds + top 3 rank frozen
- [ ] SQL tenancy: `m.client_id` + `cs.client_id` filters
- [ ] `StrategyPerformanceInsightsDto` + `buildMetricsSummaryForPrompt` shapes
- [ ] `sanitizeTemaForMetricsPrompt` rules + rank-only fallback
- [ ] `TRUSTED_METRICS_SUMMARY_TAG` + system addendum (tema bias only)
- [ ] Extended `FORBIDDEN_GENERATE_KEYS` for metrics summary smuggling
- [ ] Generate / orchestrator `clientId` alignment rule documented
- [ ] Graceful empty — omit tag, not error
- [ ] No new public Route Handler
- [ ] Logging non-goals
- [ ] Read rate limit: none V1; generate rate limit unchanged
- [ ] Security tests list matches SEC criteria
- [ ] **Reviewed by FE** line present before BUILD

---

## CONTRACT freeze list (binding summary)

1. **`requireOperator` first** on insights read — zero side effects on 403.  
2. **Validated `clientId`** + active client — aggregate filtered by tenant (defense in depth on join).  
3. **Generate inject uses same validated `clientId`** as insights selector (align by CLOSE).  
4. **Integer-only metric values** in prompt — from DB aggregates only.  
5. **Sanitized brief `tema` optional** in TRUSTED block — rank-only fallback per row on failure.  
6. **Forbidden generate keys** — no client-supplied metrics summary.  
7. **`<TRUSTED_METRICS_SUMMARY>`** — server-built JSON; omit when empty.  
8. **System addendum** — tema bias only; US-4.1 rules unchanged.  
9. **Aggregator `server-only`** — no browser / public HTTP.  
10. **28-day window** — exclusive `weekStart` Monday upper bound.  
11. **No DDL Phase A** — read-only SQL.  
12. **No read rate limit V1** — generate limits unchanged.  
13. **Logging metadata only** — no prompts/brief dumps.  
14. **Non-goals:** Cliente insights, Graph API, pillar Phase B, cache table, auto-generate on metrics save.  
15. **Security tests + grep** — gate, forbidden fields, tenancy, prompt integers, tag presence/absence.  
16. **[SEC] USER_STORIES mapped** — see criteria section with `tema` clarification.

---

## Recommended action

**APPROVE WITH CONDITIONS.** Proceed to **CONTRACT.md** (nextjs-backend). Binding floors above must appear in CONTRACT before BUILD. FE signoff required after CONTRACT.

**CONTRACT may proceed:** **Yes.**

**Conditions (16 — non-blocking for CONTRACT start):** See § Design Concerns — frozen choices #1–#16. Highest priority: **`requireOperator` on read**, **forbidden metrics summary keys on generate**, **integer-only prompt values**, **sanitize + TRUSTED delimiter**, **`clientId` tenancy on aggregate + generate alignment**, **server-only aggregator**.

---

## BUILD vetoes (summary)

1. Missing `requireOperator` on insights read or Cliente-accessible aggregate action.  
2. Client-supplied `metricsSummary*` / `insights` / `topThemes` on generate input.  
3. Prompt summary not built exclusively in orchestrator from aggregator output.  
4. Unsanitized `tema` strings in `<TRUSTED_METRICS_SUMMARY>`.  
5. Non-integer metric values in prompt serialization.  
6. Aggregate query without `client_id` filter (metrics and strategy join).  
7. Public unauthenticated insights endpoint.  
8. Full prompt / metrics block logging in production.  
9. Metrics block system instructions that override US-4.1 modalidad/formato/tactica rules.  
10. Insights displayed for client A while generate injects client B metrics at CLOSE (misalignment).
