# Security Design Review — US-7.3

**Story:** US-7.3 — Track actual cost per generation job  
**Date:** 2026-08-29  
**Reviewer:** security-architect  
**Sources:** `plan/USER_STORIES.md` (US-7.3 `[SEC]` + AC), `plan/SECURITY_BASELINE.md` (§2 cost visibility `(f)`), `plan/stories/US-7.1/SECURITY.md` + `CONTRACT.md` (spend ledger, gate uses estimates only), `plan/stories/US-7.2/SECURITY.md` (adapter result trust model), `plan/stories/US-14.5/SECURITY.md` (`requireOperator` floor), `lib/cost-policy/record-reel-spend-event.ts`, `lib/contracts/cost-policy.ts` (`FORBIDDEN_BUDGET_SPEND_KEYS`), `lib/contracts/providers.ts` (`llmCompletionResultSchema.actualCostCents`), `supabase/migrations/20260830510000_neuramark_reel_spend_events.sql`  
**Status:** Binding for implementing agents; validated by requirements-validator like any other acceptance criterion. Do not treat this file as CONTRACT.md. Do not check off `USER_STORIES.md` AC here.

---

## Verdict: APPROVE WITH CONDITIONS

The story shape is correct: **`actual_cost_cents` is a server-derived fact** written only when a job completes, sourced from **provider adapter responses** (sync LLM completion today; async video poll/webhook handlers when US-8.x lands), persisted on the **append-only spend ledger** (`neuramark_reel_spend_events`, and `neuramark_video_jobs` when shipped) with **no client write surface**, and surfaced **only through Operator-gated read paths** (production list cost column, weekly per-client aggregate). Cost data remains **margin-sensitive** and must be excluded from every serializer a Cliente session can hit — enforcement at **response-shape** level, not UI hiding.

No REDESIGN. No veto of PO lean defaults (backfill nullable `actual_cost_cents` on existing spend rows; LLM actuals from adapter `usage` math; video actuals deferred to job-completion orchestration wired in US-8.4+; weekly sum is simple SQL `SUM`; Operator-only reads with `requireOperator()`; hardcoded local Operator OK until auth universal). Orchestrator may proceed to **CONTRACT.md** after freezing the items below.

**Primary threats modeled:**

1. **Client forging `actual_cost_cents`** — a malicious actor POSTs `{ actualCostCents: 0 }` (or any value) on generate, regenerate, job-status, webhook callback, or a hypothetical “cost correction” action to deflate reported spend, bypass margin analysis, or poison weekly aggregates.
2. **Operator-only cost visibility breach** — a Cliente session obtains `estimated_cost_cents` / `actual_cost_cents` via a shared Reel payload, dashboard loader, production list API, or weekly aggregate endpoint because cost fields were omitted from UI but left in JSON.

**Inherited floors (US-7.1 / US-7.2 / US-14.5 / SECURITY_BASELINE — do not weaken):** `requireOperator()` calls `requireActive()` first; role never from request; handler-level gates mandatory; RLS deny-by-default on spend ledger; service-role Node only; no `@supabase/supabase-js` in Client Components; budget gate continues to use **`estimated_cost_cents` only** at pre-job time (US-7.1 CONTRACT); `provider_key` / estimates never client-authoritative; cost fields never in Cliente response shapes (US-7.4 floor extends here for actuals).

**This story owns:** Central **actual-cost persistence module** (`import "server-only"`) invoked **only** from job-completion orchestrators (LLM success path, future video poll/webhook complete path); extension of **`FORBIDDEN_*` key lists** with actual-cost aliases; **Operator-only** cost read Server Actions / loaders (production list cost column DTO, weekly per-client sum); **minimal Operator cost DTO allowlist**; optional **`actual_cost_failure_reason`** (sanitized code) when actual stays null; security tests for forgery rejection, Cliente **403**, cross-tenant aggregate isolation, and “no cost fields in shared serializers” grep.

**This story does not own:** Reel-level roll-up UI and variance breakdown (US-7.4); full `neuramark_video_jobs` DDL and vendor HTTP adapters (US-8.x — but **must call** the actual-cost module on terminal job status); webhook signature verification (US-8.4 `[SEC]` — US-7.3 consumes **adapter-parsed** cost after that gate); Cliente cost transparency; manual Operator “edit actual cost” UI; auth redesign; switching cumulative **budget gate** to actuals (remains estimate-based per US-7.1).

**Terminology:** **Actual cost** · **Spend event** · **Job completion handler** · **Operator** · **Cliente**. Technical names `recordReelSpendEvent`, `backfillActualCostOnSpendEvent` (CONTRACT exact), `requireOperator` are canonical.

---

### Threat Summary (US-7.3–specific)

| Threat | Impact | Mitigation in this story |
|---|---|---|
| **`actualCostCents` injection on generate/regenerate** | Forge zero-cost LLM jobs in ledger | Extend **`FORBIDDEN_BUDGET_SPEND_KEYS`** (and provider forbidden lists) with `actualCostCents`, `actual_cost_cents`, `costCents`, `cost_cents`, `durationSec`, `duration_sec`, `failureReason`, `providerCost`. Spend-path schemas **reject** → **`FORBIDDEN_FIELDS`**. Orchestrators pass actual **only** from typed adapter result objects |
| **Dedicated “update cost” Server Action / Route Handler** | Client or Cliente edits ledger rows | **No** HTTP-exposed mutation that accepts `actual_cost_cents`. Actual writes live in **`lib/cost-policy/backfill-actual-cost.ts`** (CONTRACT exact) callable **only** from server orchestrators. Grep CI test: no `actual_cost_cents` in any `z.object` request schema exposed to browser |
| **Smuggled actual on webhook / status callback** | Attacker POSTs fake completion with `{ actualCostCents: 1 }` | Webhook handlers (US-8.4) verify authenticity **first**; cost extracted **only** inside adapter `fetchStatus` / `parseWebhook` — never from raw request JSON fields mapped directly to DB. Unmatched callbacks rejected before any cost write |
| **UPDATE any spend row by id from client-supplied UUID** | IDOR tampering of another Reel’s costs | Backfill UPDATE scoped by **server-resolved** `spend_event_id` or `(client_id, reel_script_id, job_kind, provider_key, created_at window)` derived from in-flight job context — **never** from client id alone. Verify `client_id` matches session tenant on every UPDATE |
| **Cliente reads production list / weekly sum** | Margin leakage | Every cost read path: **`requireOperator("page" \| "handler")` first await**. Cliente → **403**, no partial data |
| **Operator reads another client’s weekly aggregate** | Cross-tenant margin leak | Weekly sum query **parameterized** with server-validated `clientId` (V1: operator’s resolved client unless CONTRACT defines explicit multi-client operator targeting with authorization). Foreign `clientId` in payload → **404/403** uniform |
| **Cost fields in shared Reel / dashboard serializers** | UI-hidden but JSON-visible costs | **Separate DTOs:** Operator cost endpoints return allowlisted fields; **`getReelScriptsForWeek`**, Cliente dashboard, approval package serializers **omit** `estimatedCostCents`, `actualCostCents`, `varianceCents`, `weeklyCostTotalCents`. Contract + grep test |
| **Re-open INSERT with client-supplied actual on `recordReelSpendEvent`** | Bypass backfill module | **`recordReelSpendEvent`** remains INSERT-only for estimates at job start/success boundary; actual backfill via dedicated module. TypeScript: do not widen public params to accept arbitrary `actualCostCents` from callers outside adapter completion layer |
| **Overwrite actual after set (repudiation)** | Operator/system fraud or race corruption | **Immutable once set:** UPDATE … WHERE `actual_cost_cents IS NULL` only; second write with different value → no-op or logged server error; idempotent re-run with **same** value OK |
| **Raw provider error in `failure_reason`** | Secret / stack leakage in Operator UI | Store **sanitized enum/code** only (`ACTUAL_COST_UNAVAILABLE`, `PROVIDER_BILLING_MISSING`, etc.) — never raw webhook body or API key fragments |

**Residual risk accepted:** Adapter-reported `actualCostCents` is trusted as vendor truth (same trust model as estimates from `cost_model`). Wrong vendor billing data is margin/ops risk, not client forgery, as long as **no request path** accepts client cost input. SiliconFlow adapter currently returns `actualCostCents: 0` until usage pricing is implemented — null + failure reason is acceptable per AC; **zero must not be client-supplied**. Operator trust model: Operators can **see** all cost data for authorized clients; they cannot **forge** ledger rows through the app in V1 (no manual edit endpoint).

---

## Assets and Trust Boundaries

| Asset | Sensitivity | Trust boundary |
|---|---|---|
| `neuramark_reel_spend_events.actual_cost_cents` | **Critical** — unit economics / margin | Written only by server job-completion module; RLS deny-by-default; no Cliente SELECT |
| `neuramark_video_jobs.actual_cost_cents` (when US-8.x ships) | **Critical** | Same write path via job-completion orchestrator; no client mutation |
| Adapter `actualCostCents` / billing usage | **High** — sole authority for actuals | Parsed inside adapter implementation; orchestrator reads typed result only |
| Operator production cost column DTO | **High** | `requireOperator`; allowlisted fields; scoped by `client_id` |
| Weekly per-client cost aggregate | **High** | Operator-only; parameterized SUM; tenant-scoped |
| `actual_cost_failure_reason` (if persisted) | Low–Medium | Sanitized codes; Operator-only |
| Shared Reel / dashboard payloads | Medium (by leakage) | **Must not contain** cost fields |

**Boundaries:**

1. **Browser → generate / regenerate / status / webhook** — Untrusted. Payloads carry **intent pointers** (`reelScriptId`, `weekStart`, `jobId` for Operator status UI) — **no** cost fields as authority.
2. **Job-completion orchestrator → adapter → `backfillActualCostOnSpendEvent` → Postgres** — Actual computed or extracted here. Sync LLM: same request after `complete()` returns. Async video: poll/webhook handler after US-8.4 auth gate.
3. **Operator RSC / Server Action → cost read queries** — After `requireOperator()`. Parameterized SUM/SELECT; service-role Node.
4. **Cliente → any cost endpoint or shared serializer** — **403** or field-absent DTO; no “Operator UI hiding” substitute.

---

## Abuse Cases Considered

- *As a malicious actor, I POST `{ actualCostCents: 0 }` on script generate so the ledger shows free LLM usage* → **Blocked:** forbidden field on spend paths; `recordReelSpendEvent` / backfill ignore client input; actual sourced from `llmCompletionResultSchema` only.
- *As a malicious actor, I POST `{ actual_cost_cents: 1 }` on caption regenerate* → **Blocked:** added to `FORBIDDEN_BUDGET_SPEND_KEYS` / caption forbidden helper.
- *As a malicious actor, I call a new `updateSpendEventActualCost` Server Action with a victim `spendEventId`* → **Blocked:** no such public action; backfill module not exported to request handlers; IDOR scope checks on any internal UPDATE.
- *As a malicious actor, I replay a webhook with a crafted body `{ cost: 0 }` without provider signature* → **Blocked:** US-8.4 webhook gate rejects before adapter parsing; cost never read from raw body in route handler.
- *As a malicious actor, I PATCH an existing spend row via Supabase anon key* → **Blocked:** RLS enabled, zero policies; browser never holds keys.
- *As a Cliente, I open the production list API and read `actualCostCents`* → **Blocked:** `requireOperator("handler")` → **403**; Cliente route absent or gated.
- *As a Cliente, I inspect Network tab on `/operator/scripts` Reel expand JSON* → **Mitigated:** Cliente cannot access operator routes (layout gate); shared script list for Cliente (if any) uses DTO **without** cost fields.
- *As a Cliente, I call `getWeeklyClientCostSum({ clientId: "<victim>" })`* → **Blocked:** Operator gate + server-validated `clientId`; cross-tenant → **404/403** uniform.
- *As a malicious actor, I race two completion handlers to flip actual from null → 100 → 0* → **Blocked:** `UPDATE … WHERE actual_cost_cents IS NULL`; second different value does not apply.
- *As an Operator, I need to manually correct a vendor billing mistake in V1* → **Out of scope:** no app UI; correction via Operator SQL outside app (audited ops process). Adding a manual edit action requires a **new story** with audit + `[SEC]` — not US-7.3.

---

## Security Acceptance Criteria

Story `[SEC]` items from `plan/USER_STORIES.md` → US-7.3 are binding. Items marked **(added)** are new in this review — paste into the story when the PO next edits USER_STORIES.

**Inherited (still binding — do not weaken adjacent auth / budget / catalog paths):**

- [ ] **[SEC] Every operator-only gate lives inside the Server Action / Route Handler itself** as `requireOperator()` on the `getCurrentUser()` result *(US-14.5)*
- [ ] **[SEC] `requireOperator()` runs `requireActive()` first** *(US-14.5)*
- [ ] **[SEC] RLS stays enabled with zero policies** on `neuramark_reel_spend_events` (and `neuramark_video_jobs` when created); privileged access via Node service-role only *(US-7.1 / US-14.5)*
- [ ] **[SEC] Service-role key is used only from Node server modules** — never Client Components, never Edge middleware *(US-14.5)*
- [ ] **[SEC] Budget gate uses server-resolved estimates only; client never sends estimate or policy on spend paths** *(US-7.1 — actuals do not retroactively bypass gate)*
- [ ] **[SEC] Cost exclusion for Cliente sessions at response-shape level** — shared payloads contain no cost fields *(SECURITY_BASELINE `(f)` / US-7.4 floor)*

**US-7.3 story `[SEC]` (existing in USER_STORIES.md):**

- [ ] **[SEC] `actual_cost_cents` is written only by the server-side job-completion handler from provider responses; no client-facing endpoint can set or edit recorded costs** *(USER_STORIES US-7.3)*

**US-7.3 story AC (operator visibility — security-relevant):**

- [ ] **Operator-only: endpoint/action rejects non-operator sessions server-side (403) — cost data is margin-sensitive and never served to client sessions** *(USER_STORIES US-7.3 AC — binding as `[SEC]` equivalent)*

**Added in this review (binding for US-7.3 BUILD):**

- [ ] **[SEC] (added) Central actual-cost module** (`lib/cost-policy/backfill-actual-cost-on-spend-event.ts` or CONTRACT exact) with `import "server-only"`. **Only** job-completion orchestrators (LLM success, future video terminal status) may call it. **No** Route Handler / Server Action accepts `actualCostCents` from `request.json()` or form data
- [ ] **[SEC] (added) Extend forbidden-key lists** on all spend and job-creation paths: `actualCostCents`, `actual_cost_cents`, `costCents`, `cost_cents`, `durationSec`, `duration_sec`, `billingUsage`, `usage`, `providerCost`, `provider_cost` → **`FORBIDDEN_FIELDS`** reject (merge into `FORBIDDEN_BUDGET_SPEND_KEYS` and provider authority lists)
- [ ] **[SEC] (added) Actual write source chain:** orchestrator reads `actualCostCents` **only** from validated adapter result types (`llmCompletionResultSchema`, future `videoJobCompleteResultSchema`, TTS stored asset schema) — never from handler input, webhook raw body, or query params
- [ ] **[SEC] (added) Backfill immutability:** SQL UPDATE sets `actual_cost_cents` **only where `actual_cost_cents IS NULL`**. Re-completion with same value is idempotent; attempted change after set is ignored and server-logged — no client-visible error oracle
- [ ] **[SEC] (added) Tenant scope on backfill:** UPDATE/WHERE includes `client_id` and `reel_script_id` (and `job_kind` / `spend_event_id`) from **server job context** — verify ownership before write (IDOR → no row updated)
- [ ] **[SEC] (added) Operator cost read endpoints** (`getProductionCostRows`, `getWeeklyClientActualCostSum` — CONTRACT exact) call `requireOperator("handler")` or `requireOperator("page")` as **first** await. Failure → **403**, no query execution
- [ ] **[SEC] (added) Operator cost DTO allowlist** — explicit fields only, e.g. `reelScriptId`, `slotIndex`, `jobKind`, `assetRole`, `providerKey`, `estimatedCostCents`, `actualCostCents`, `actualCostFailureReason`, `durationSec`, `completedAt`. **Forbidden in DTO:** raw catalog `cost_model`, `envKeyName`, full provider billing payloads
- [ ] **[SEC] (added) Shared / Cliente serializers exclude cost fields** — grep or schema test: `getReelScriptsForWeek`, dashboard loaders, approval package types do **not** include `estimatedCostCents`, `actualCostCents`, `weeklyCostTotalCents`, or snake_case equivalents
- [ ] **[SEC] (added) Weekly aggregate query** uses parameterized `client_id` + date range; **no** string-concatenated SQL. Cross-tenant `clientId` in Operator request → **404/403** uniform per CONTRACT tenancy rules
- [ ] **[SEC] (added) Failure reason sanitization:** when actual is null on completed job, persist optional **`actual_cost_failure_reason`** as closed enum / max-length string — never store raw provider JSON, HTTP bodies, or secrets
- [ ] **[SEC] (added) No manual cost edit Server Action in US-7.3** — ledger correction is out-of-band SQL or future audited story
- [ ] **[SEC] (added) Automated security tests cover at least:** generate/regenerate payload with `actualCostCents: 0` → **FORBIDDEN_FIELDS**; Cliente **403** on cost read actions; Operator weekly sum with foreign `clientId` → **403/404**; backfill second write with different value does not change row; shared Reel DTO snapshot test has no cost keys; grep test — no `actual_cost_cents` in exported client request Zod schemas

---

## Design Concerns and Required Changes

### Frozen design choices (must land in CONTRACT)

#### 1. Actual-cost write path — **server-only, adapter-sourced** (APPROVE)

| Rule | Detail |
|---|---|
| Authority | **`actual_cost_cents` is never request authority** |
| Sync LLM | After successful `adapter.complete()`, orchestrator calls backfill with `result.actualCostCents` (or null + reason if adapter cannot compute) |
| Async video (US-8.x) | Terminal status handler parses cost inside adapter; US-8.4 webhook auth runs **before** backfill |
| Public API | **Zero** endpoints accept actual cost input |
| Module | Single backfill helper; orchestrators **must not** inline `UPDATE neuramark_reel_spend_events SET actual_cost_cents = …` in route handlers |

#### 2. Ledger vs job table — **dual persistence, one write module** (APPROVE WITH CONDITIONS)

| Store | Rule |
|---|---|
| `neuramark_reel_spend_events` | Primary for LLM (shipped US-7.1); US-7.3 backfills `actual_cost_cents` |
| `neuramark_video_jobs` | When US-8.x ships, persist `actual_cost_cents` on job row **via same module** or documented twin call — keep single orchestration entry point |

**Condition:** CONTRACT names which table(s) US-7.3 BUILD touches given dependency order (LLM-only first is OK; video path documented as integration hook for US-8.4).

#### 3. INSERT vs UPDATE timing — **estimate first, actual on complete** (APPROVE)

| Phase | Rule |
|---|---|
| Pre-job / success INSERT | `estimated_cost_cents` from engine (US-7.1/7.2); `actual_cost_cents` null |
| Complete | Backfill actual on matching spend event (match key: CONTRACT freezes — recommend `spend_event_id` returned from INSERT or deterministic `(reel_script_id, job_kind, provider_key, operator_client_id, created_at)` server-side) |
| Alternative | Single INSERT after complete with both estimate + actual for sync LLM only — **only if** CONTRACT preserves “no client-supplied actual” and audit timing requirements |

**Condition:** CONTRACT freezes correlation key between in-flight job and spend row.

#### 4. Operator-only visibility — **response-shape enforcement** (APPROVE)

| Surface | Rule |
|---|---|
| Production list cost column | Operator route + Operator Server Action / loader only |
| Weekly per-client sum | Operator-only; tenant-scoped |
| Cliente | **No** cost fields in any JSON shape they can receive |
| UI | Hiding columns is **not** a control — serializer omission is |

#### 5. Forbidden fields — **extend existing lists** (APPROVE)

Merge actual-cost aliases into `FORBIDDEN_BUDGET_SPEND_KEYS`, caption/script forbidden helpers, and future video job schemas. Reject, do not strip silently, on spend paths (match US-7.2 `FORBIDDEN_PROVIDER_AUTHORITY_KEYS` posture).

#### 6. Immutability + idempotency — **fail safe** (APPROVE)

Once `actual_cost_cents` is non-null, application code does not change it. Retry/idempotent completion may re-apply the **same** value.

#### 7. Manual correction — **out of scope V1** (APPROVE)

No Operator “edit actual” UI or Server Action in US-7.3. Prevents repudiation without audit story.

#### 8. Cumulative budget gate — **unchanged** (APPROVE)

US-7.1 gate continues **`SUM(estimated_cost_cents)`** only. Actuals are for **reporting** (US-7.3/7.4), not client-controlled gate bypass.

---

## Future-Proofing Notes

- **US-7.4** roll-up reads actuals from same ledger/job tables — must reuse Operator DTO allowlist; never add cost fields to shared Reel detail for Cliente.
- **US-8.4** webhook `[SEC]` is prerequisite for **trusted** async completion; US-7.3 backfill runs **after** webhook verification, consuming adapter output only.
- **US-9.3** TTS actuals follow same backfill module with `asset_role: "tts"`.
- **Multi-tenancy:** all cost queries include `client_id`; backfill verifies reel ownership; weekly sum cannot aggregate across tenants in one Operator call unless explicit authorized multi-client story lands.
- **Real auth (US-14.5):** Operator reads use server-resolved identity; cost writes record `operator_client_id` from session where applicable — never request-supplied actor id.
- **RLS later:** enabling policies on spend events must deny Cliente UPDATE/SELECT on `actual_cost_cents`; design now avoids client Supabase access entirely.

---

## CONTRACT Spot-Check Checklist (when CONTRACT.md exists)

Before implementation starts, verify CONTRACT:

- [ ] Freezes **`backfillActualCostOnSpendEvent`** (or exact name), signature, `import "server-only"`, and **exclusive** call-site list (LLM orchestrators + documented US-8.x hook)
- [ ] Documents **no** public mutation accepting `actualCostCents` / `actual_cost_cents`
- [ ] Extends **`FORBIDDEN_*`** lists with actual-cost aliases; **`FORBIDDEN_FIELDS`** reject behavior on spend paths
- [ ] Freezes spend-row **correlation key** for backfill UPDATE
- [ ] Freezes **immutability** rule (`WHERE actual_cost_cents IS NULL`)
- [ ] Names Operator read actions/loaders with **`requireOperator` first await**
- [ ] Defines **Operator cost DTO allowlist** and explicitly lists serializers that **omit** cost fields
- [ ] Weekly aggregate: parameterized SQL, `client_id` scope, error shape for cross-tenant attempt
- [ ] **`actual_cost_failure_reason`** enum / max length when actual null
- [ ] States **budget gate unchanged** (estimates only)
- [ ] Security test matrix rows for forgery, Cliente 403, immutability, DTO exclusion

---

## Verdict for CONTRACT

**Pre-CONTRACT (this review): APPROVE WITH CONDITIONS** — nextjs-backend may author `plan/stories/US-7.3/CONTRACT.md`. Proceed only if CONTRACT encodes the frozen items in **Design Concerns** and **Security Acceptance Criteria** above.

**Post-CONTRACT spot-check (binding):**

| CONTRACT outcome | When |
|---|---|
| **APPROVE WITH CONDITIONS** | CONTRACT includes: (1) **no** client-facing write for `actual_cost_cents`; (2) single server-only backfill module sourced from adapter results; (3) extended **`FORBIDDEN_*`** lists with actual-cost keys; (4) immutability `WHERE actual_cost_cents IS NULL`; (5) tenant-scoped backfill + weekly SUM; (6) Operator-only read paths with `requireOperator` first; (7) explicit **Cliente serializer exclusion** list; (8) sanitized failure reason; (9) security test matrix for forgery + visibility |
| **REDESIGN** | CONTRACT accepts optional client-supplied `actualCostCents`; exposes `updateActualCost` Server Action; allows backfill from webhook raw body without adapter parsing; includes cost fields in shared Reel/dashboard DTOs “for Operator convenience”; or switches budget gate to client-influenced actuals |
| **VETO (do not BUILD)** | Any Route Handler / Server Action whose input schema includes `actualCostCents` / `actual_cost_cents`; any UPDATE that sets actual without `IS NULL` guard; Cliente-accessible endpoint returning cost fields; string-concatenated SQL for weekly aggregate |

**Conditions that must be satisfied before BUILD (not optional polish):**

1. **Anti-forgery:** No request path sets `actual_cost_cents`; forbidden keys rejected on all spend/job actions.
2. **Anti-leakage:** Cost reads Operator-gated; shared DTOs cost-free by schema/grep.
3. **Single write module:** Orchestrators call one backfill helper — no ad-hoc ledger UPDATEs in handlers.
4. **Immutability:** Actuals write-once per spend row/job.
5. **Tenancy:** Backfill and aggregates scoped by server-validated `client_id`.

When CONTRACT.md lands, security-architect re-runs the spot-check checklist; **expected result: APPROVE WITH CONDITIONS** if all rows pass. Any **REDESIGN** finding blocks BUILD until CONTRACT revision.

---

## Verdict Rationale

**APPROVE WITH CONDITIONS** — not REDESIGN because USER_STORIES already states the correct trust model (server-side job-completion writes, no client cost endpoints, Operator-only visibility) and US-7.1 pre-provisioned the ledger column with null actuals for this backfill. **Conditions** are the CONTRACT freezes above: centralized adapter-sourced backfill, forbidden-field extension, immutability, Operator-gated reads with response-shape exclusion for Cliente, and tenant-scoped aggregates. Satisfying them closes **client forging of `actual_cost_cents`** and **margin leakage to Cliente sessions** without blocking LLM-first BUILD or US-8.x async integration.

---

## Security Design Review — US-7.3 Phase B (video/TTS/B-roll spend backfill)

**Story:** US-7.3 Phase B — persist **Costo real** for completed video / TTS / B-roll **Jobs de generación**  
**Sprint:** `US-7.3-B` · **Branch:** `feature/US-7.3-phase-b-spend-backfill`  
**Date:** 2026-08-31  
**Reviewer:** security-architect  
**Sources:** `plan/SECURITY_BASELINE.md` §(f); Phase A section above (**in force — not replaced**); `plan/stories/US-7.3/PHASE-B.md` (PO **B1–B18**); `plan/stories/US-7.3/SPEC-REVIEW.md` Phase B (ALIGNED, 3 High); `plan/stories/US-7.3/CONTRACT.md` Phase A (historical `/operator/production`; sole writer `finalizeGenerationCost`); `plan/USER_STORIES.md` § US-7.3 `[SEC]`; live: `lib/cost-policy/finalize-generation-cost.ts`, TTS `recordReelSpendEvent` call sites, `GET` `app/api/video-jobs/[jobId]/route.ts`, `apply-video-job-status-update.ts`, `map-operator-video-job-dto.ts`  
**Status:** Binding **amendment**. Phase A floors remain in force. Do not treat this file as CONTRACT.md. Do not check off `USER_STORIES.md` AC here.  
**Primary implementers:** **media-pipeline-engineer** + **nextjs-backend** + thin **nextjs-frontend**.

---

## Verdict: APPROVE WITH CONDITIONS

Phase B shape is correct: **canonical reporting remains `neuramark_reel_spend_events`**; **`neuramark_video_jobs.actual_cost_cents` is a job-UI mirror only**; **async video actuals** go through **`finalizeGenerationCost({ mode: "async_update" })`** (`import "server-only"`) after persist; **TTS success INSERT with actual via `recordReelSpendEvent`** is a **named exception** that still satisfies `[SEC]` (trusted orchestrator = job-completion handler); **Operator** job cost lives on **`OperatorVideoJobSummaryPanel`** (`/operator/scripts`) plus Operator **`GET /api/video-jobs/[jobId]`** carrying **`OperatorProductionJobCostDto`** — **do not invent `/operator/production`**; **Cliente** poll/serializers stay **cost-free** at response-shape; **fail/cancel** do **not** UPDATE spend; **missing `spendEventId`** is **log only** (no late actual-only INSERT); **budget gate stays estimate-only**.

No REDESIGN. **No veto** of PO **B3/B7** (leave TTS INSERT) or **B11** (no production route) — both are compatible with `[SEC]` if CONTRACT encodes the conditions below. Phase A “sole writer `finalizeGenerationCost`” is **narrowed**, not abandoned: actuals still have **no client write surface**.

**Condition count (Phase B):** **12** binding conditions (must land in CONTRACT Phase B + BUILD; see § Conditions before BUILD — Phase B).

**Primary threats modeled (Phase B delta):**

1. **TTS exception abused as a second public writer** — a Route Handler / Server Action widens `recordReelSpendEvent` (or TTS Zod) to accept client `actualCostCents`, defeating `[SEC]`.
2. **Poll / shared serializer leakage** — extending job poll with cost on a Cliente-reachable or shared DTO (or inventing `/operator/production` that Cliente can hit) leaks margin data.
3. **Unofficial ledger path** — missing `spendEventId` late INSERT, or US-7.4 SUMming `video_jobs`, splits truth and enables unscoped actuals.
4. **Invented billed cost on fail/cancel** — spend UPDATE with guessed `0` / estimate-as-actual poisons weekly economics.

**Inherited floors (Phase A + US-7.1 / 7.2 / 7.4 / 14.5 / SECURITY_BASELINE — do not weaken):** `requireOperator()` first await on cost reads; role never from request; RLS deny-by-default on spend ledger; service-role Node only; no browser Supabase; **forbidden request keys** for actual/estimate/duration; **immutability** `WHERE actual_cost_cents IS NULL`; **Cliente response-shape exclusion**; **gate = `SUM(estimated_cost_cents)` only**; webhook/poller cost never from raw request JSON.

**Live spot-check (evidence, not BUILD complete):** `finalize-generation-cost.ts` is `server-only`; poller `apply-video-job-status-update.ts` calls `async_update` on **completed** when `spendEventId` present (omits `durationSec`; skip if null id — **no log today**); fail/cancel **do not** call finalize; TTS Operator + trusted paths INSERT actuals via `recordReelSpendEvent` (`server-only`; Operator path sets `durationSec`, trusted omits); `GET /api/video-jobs/[jobId]` is `requireOperator` but maps **status-only** (`mapOperatorVideoJobStatusDto` — **no `cost`**); summary mapper already attaches `OperatorProductionJobCostDto`; panel `mergePolledStatus` **drops** cost refresh. Status-only poll is a **BUILD fix**, not a new page.

---

### Threat Summary (US-7.3 Phase B–specific)

| Threat | Impact | Mitigation in Phase B |
|---|---|---|
| **Client `actualCostCents` on TTS / job create / poll POST** | Forge zero-cost video/TTS | Forbidden keys on request Zod; TTS input remains `{ reelScriptId }` (or trusted server params — **no** cost fields); GET poll has **no body** |
| **TTS INSERT treated as “not [SEC]” → migrate or dual HTTP writer** | Duplicate mutators / client-callable finalize | Named exception: trusted TTS orchestrator INSERT **is** the job-completion handler; **do not** add a public cost action |
| **Invent `/operator/production`** | Disconnected API; extra leakage surface | **Forbidden as BUILD target.** Surface = panel + Operator GET |
| **Cost on Cliente poll / shared status DTO** | Margin leak despite Operator UI | Cost **only** on Operator summary/poll after `requireOperator`; Cliente serializers omit cost keys |
| **Late INSERT when `spendEventId` null** | Orphan actual-only ledger row; skip tenant/job link | **Log only**; no INSERT |
| **Fail/cancel spend UPDATE** | Fake billed amount | **No** finalize / no spend UPDATE |
| **US-7.4 SUM `video_jobs`** | Double-count / miss LLM/TTS | Ledger-only reporting; job row = mirror |
| **Job-row actual as reporting truth while ledger lags** | Operator UI vs weekly SUM diverge | DTO **ledger-wins** when `spendEventId` present |
| **Gate switched to actuals** | Client-influenced spend bypass | Non-goal — estimates only |

**Residual risk accepted (Phase B):** Adapter/`fetchAsset.actualCostCents` remains vendor truth (same as Phase A). TTS trusted path may fall back to **server** estimate when adapter actual is null — ops/margin risk, not client forgery, as long as **no request field** supplies it. Historical Phase A CONTRACT naming `/operator/production` is **not** a live route; Phase B addendum strikes it as BUILD target.

---

## Assets and Trust Boundaries

| Asset | Sensitivity | Trust boundary |
|---|---|---|
| `neuramark_reel_spend_events` (all `asset_role`) | **Critical** — canonical reporting | Server writers only; RLS deny-by-default |
| `neuramark_video_jobs.actual_cost_cents` | **High** — denormalized **mirror** | Same complete pass as ledger UPDATE; **not** US-7.4 SUM source |
| TTS `storedAsset.actualCostCents` / `durationSec` | **High** | Parsed in adapter; orchestrator INSERT only |
| Video `persistVideoJobOutputAsset` → `actualCostCents` | **High** | Adapter `fetchAsset` after poller persist — **not** poll query params |
| `OperatorProductionJobCostDto` | **High** | Operator GET/summary only |
| Operator TTS success DTO cost fields | **High** | Existing Operator-gated synthesize action only |
| Cliente video/TTS/media poll or approval payloads | Medium (by leakage) | **Must not contain** cost fields |

**Boundaries:**

1. **Browser → Operator GET `/api/video-jobs/[jobId]`** — Untrusted `jobId` path param only. Identity via `requireOperator("handler")` + scoped load. **No** cost in request. Response **may** include `OperatorProductionJobCostDto` **after** this gate (Phase B BUILD).
2. **Browser → TTS synthesize** — `{ reelScriptId }` intent only; forbidden keys; Operator `requireOperator`. Trusted/revision path: **server params only**, no client cost.
3. **Poller / webhook → `applyVideoJobStatusUpdate` → `finalizeGenerationCost(async_update)`** — Trusted server. Cost from persisted adapter asset, **not** raw webhook/status JSON. Fail/cancel: status write **without** spend actual UPDATE.
4. **TTS orchestrator → `recordReelSpendEvent` (actual on INSERT)** — Trusted job-completion handler (exception). `server-only`. Write-once (no later client edit).
5. **Cliente → any poll / shared serializer** — Field-absent DTO or **403**; UI hiding is **not** a control.

---

## Abuse Cases Considered

- *As a malicious actor, I POST `{ actualCostCents: 0 }` on TTS synthesize* → **Blocked:** forbidden keys; input schema has no cost fields; INSERT uses adapter `storedAsset` only.
- *As a malicious actor, I POST `{ actualCostCents: 1 }` on video job create or poll* → **Blocked:** create remains estimate-only INSERT; GET poll has no body; forbidden keys on mutation schemas.
- *As a Cliente, I GET `/api/video-jobs/{id}` and read `cost`* → **Blocked:** `requireOperator` → **403**; no Cliente poll route carrying `OperatorProductionJobCostDto`.
- *As a Cliente, I share a “status” serializer that grew cost keys for Operator convenience* → **Blocked:** status-only vs summary split; cost keys **forbidden** on any Cliente poll/serializer (BUILD if a shared type is reused).
- *As a malicious actor, I omit `spendEventId` then trigger a late actual-only INSERT* → **Blocked:** log; **no** INSERT (B5).
- *As a malicious actor, I fail the job then force spend actual = 0* → **Blocked:** fail/cancel ∉ finalize path (B6).
- *As an Operator UI, I invent `/operator/production` that returns all clients’ jobs* → **Forbidden:** disconnected surface; B11. Existing panel + scoped GET only.
- *As a weekly roll-up, I SUM `video_jobs.actual_cost_cents` and miss TTS/LLM or double-count* → **Blocked:** reporting = ledger only (B2).
- *As a generate caller, I send a huge `durationSec` to inflate/deflate per-second cost* → **Blocked:** duration from adapter/asset/probe only; request `durationSec` stays forbidden.
- *As a budget attacker, I complete a cheap actual then generate more because the gate now uses actuals* → **Blocked:** gate unchanged — estimates only (B14).

---

## Security Acceptance Criteria (checkbox format, ready for VALIDATION — Phase B additive)

Phase A `[SEC]` criteria above remain binding. Story `[SEC]` in USER_STORIES.md **must be re-validated** on video / TTS / B-roll paths. Items below are **additive** for Phase B BUILD. Do **not** uncheck Phase A USER_STORIES AC.

**Inherited (still binding):**

- [ ] **[SEC] `actual_cost_cents` is written only by the server-side job-completion handler from provider responses; no client-facing endpoint can set or edit recorded costs** *(USER_STORIES US-7.3 — Phase B: handler = `finalizeGenerationCost` **or** named TTS `recordReelSpendEvent` INSERT)*
- [ ] **Operator-only: endpoint/action rejects non-operator sessions server-side (403)** *(USER_STORIES US-7.3 AC — includes Operator job poll with cost)*
- [ ] **[SEC] Cost exclusion for Cliente sessions at response-shape level** — shared payloads contain no cost fields *(SECURITY_BASELINE `(f)` / US-7.4 — **includes poll routes**)*
- [ ] **[SEC] Budget gate uses server-resolved estimates only** *(US-7.1 — Phase B non-goal: do not switch to actuals)*
- [ ] **[SEC] Every operator-only gate lives inside the handler** as `requireOperator()` *(US-14.5)*
- [ ] **[SEC] RLS stays enabled with zero policies** on `neuramark_reel_spend_events`; service-role Node only

**Added for Phase B (binding):**

- [ ] **[SEC] (Phase B) TTS exception:** Operator `synthesize-voiceover-for-reel-script` and trusted `synthesize-voiceover-for-client-trusted` may INSERT `actual_cost_cents` via **`recordReelSpendEvent`** from **typed adapter/stored-asset results only**. This **counts as** the `[SEC]` job-completion handler. Modules keep **`import "server-only"`**. **Forbidden:** request/Zod `actualCostCents` / `actual_cost_cents` / `durationSec` from the client; any Client Component call. **Write-once:** no TTS “correct actual” mutation. **Do not** migrate TTS to `finalizeGenerationCost` in this slice (B3/B7)
- [ ] **[SEC] (Phase B) Exclusive actual writers (CONTRACT table):** (1) **`finalizeGenerationCost` `async_update`** — video poller complete (SadTalker / MuseTalk / HeyGen / Wan B-roll); (2) **`finalizeGenerationCost` `sync_insert`** — manual upload `actual = 0`; (3) **TTS exception** above. Video **create** `recordReelSpendEvent` remains **estimate-only** (`actualCostCents: null`) — **not** an actual writer. **Forbidden:** ad-hoc `UPDATE neuramark_reel_spend_events SET actual_cost_cents` in Route Handlers; **forbidden:** new HTTP mutation accepting actuals
- [ ] **[SEC] (Phase B) FE surface:** **Do not invent `/operator/production`.** Job-level estimated vs actual = **`OperatorVideoJobSummaryPanel`** on **`/operator/scripts`** + Operator **`GET /api/video-jobs/[jobId]`** (already `requireOperator`) carrying **`OperatorProductionJobCostDto`** (or equivalent Operator-only refetch). Status-only poll that drops `cost` is **in-scope BUILD**, not a new page (B11/B12)
- [ ] **[SEC] (Phase B) Poll DTO Operator-only:** cost fields (`estimatedCostCents`, `actualCostCents`, `costStatus`, `unavailableReasonKey`, snake_case equivalents) appear **only** on Operator summary/poll after `requireOperator`. **Zero** cost keys on any **Cliente** video-job / TTS / media **poll or serializer**. Cliente session **cannot** obtain `OperatorProductionJobCostDto`
- [ ] **[SEC] (Phase B) Ledger canonical vs job-row mirror:** reporting SUM / US-7.4 = **`neuramark_reel_spend_events` only**. `neuramark_video_jobs.actual_cost_cents` is a **denormalized UI mirror** from the same complete pass. Operator DTO **ledger-wins** when `spendEventId` is present. **No US-7.4 BUILD** / no SUM of `video_jobs` (B2/B13)
- [ ] **[SEC] (Phase B) Fail / cancel:** poller **must not** call `finalizeGenerationCost` or otherwise UPDATE spend actuals. Leave estimate-only row. **Do not** invent billed cost or a “job failed” unavailable-reason unless an adapter reports a billed amount (none today) (B6)
- [ ] **[SEC] (Phase B) Missing `spendEventId`:** on complete, **log** (no secrets / raw vendor body); **do not** INSERT a late actual-only spend row in V1 (B5)
- [ ] **[SEC] (Phase B) Successful complete never null/null:** if `spendEventId` present and job **completed**, persist actual **or** closed **`actualCostUnavailableReason`** — do not leave completed ledger row with both actual and reason null (B5)
- [ ] **[SEC] (Phase B) `durationSec`:** pass on video `async_update` and TTS **trusted** path when adapter/asset/probe knows it; else omit/null. **Never** from client request. LLM remains null. Not required for weekly SUM (B5/B7/B10)
- [ ] **[SEC] (Phase B) Operator TTS success DTO** may keep cost fields **only** because the action is Operator-gated. **Cliente-facing** revision/approval/dashboard payloads **omit** TTS cost keys even if the trusted synthesizer ran
- [ ] **[SEC] (Phase B) Webhook / poller:** US-8.4 authenticity gate **before** persist; cost from **adapter `fetchAsset` / typed persist result** — never map raw request/webhook `actualCostCents` to ledger or job row
- [ ] **[SEC] (Phase B) Automated security tests cover at least:** (1) TTS/video-create payload with `actualCostCents: 0` → **FORBIDDEN_FIELDS**; (2) Cliente **403** on `GET /api/video-jobs/[jobId]`; (3) Operator GET after complete includes `cost` / `OperatorProductionJobCostDto` without exposing catalog `cost_model`; (4) grep/schema: no cost keys on Cliente poll/serializers; (5) complete with null `spendEventId` → **no** new spend INSERT; (6) fail/cancel → spend `actual_cost_cents` unchanged; (7) second `async_update` with different actual does not overwrite; (8) weekly/rollup queries do not `SUM` `neuramark_video_jobs.actual_cost_cents`; (9) budget helper still sums **estimates only**

---

## Design Concerns and Required Changes

### Frozen design choices (must land in CONTRACT Phase B)

#### 1. TTS exception — **job-completion handler, not a client API** (APPROVE — no veto of B3/B7)

Phase A CONTRACT “sole writer `finalizeGenerationCost`” is **amended**: TTS success INSERT with actual via `recordReelSpendEvent` is the **only** named exception for **actuals**. It remains server-only, adapter-sourced, write-once. Estimate-only video create INSERTs stay non-actual writers.

#### 2. FE surface — **do not invent `/operator/production`** (APPROVE — no veto of B11)

Strike historical Phase A FE route as a **BUILD target**. Keep DTO **type name** `OperatorProductionJobCostDto`. Live consumer: `OperatorVideoJobSummaryPanel` + Operator GET poll (B12).

#### 3. Poll cost — **Operator-only; Cliente exclusion is response-shape** (APPROVE WITH CONDITIONS)

Extending `operatorVideoJobStatusDtoSchema` with cost **and reusing it for Cliente** would be a **[SEC] breach**. Prefer: Operator poll returns summary-with-cost **or** status + optional `cost` **only** on the Operator route. Status-only poll that drops cost is a **BUILD fix**, not a new story/page.

#### 4. Dual store — **ledger canonical, job row mirror** (APPROVE WITH CONDITIONS)

Mirror may update on the same complete transaction for panel/poll UX. Reporting and US-7.4 stay ledger-only. Missing link → log, no invented ledger row.

#### 5. Fail/cancel and budget gate — **non-goals** (APPROVE)

No fail-row billed actual. Gate remains `SUM(estimated_cost_cents)`.

### Conditions before BUILD — Phase B (binding — condition count = 12)

1. **TTS exception encoded** as `[SEC]` job-completion handler: `server-only`, adapter-sourced actual, **no** request/Zod client `actualCostCents`, write-once; **do not** migrate TTS this slice.
2. **Exclusive actual-writer table** in CONTRACT: `finalizeGenerationCost` (`async_update` video complete, `sync_insert` manual 0) **plus** TTS `recordReelSpendEvent` with actual; create-path INSERT = estimate-only.
3. **Zero HTTP mutations** accepting `actualCostCents` / `actual_cost_cents` / client `durationSec` (Phase A forbidden lists remain).
4. **FE surface freeze:** no `/operator/production` BUILD; panel + Operator `GET /api/video-jobs/[jobId]` + `OperatorProductionJobCostDto`.
5. **Poll DTO Operator-only;** **zero** cost keys on Cliente poll/serializers; tests that Cliente cannot obtain the cost DTO.
6. **Ledger = reporting canonical;** `video_jobs.actual_cost_cents` = mirror; Operator DTO **ledger-wins** when `spendEventId` present; US-7.4 must not SUM `video_jobs`.
7. **Fail/cancel:** no spend actual UPDATE.
8. **Missing `spendEventId`:** log only; **no** late actual-only INSERT.
9. **Completed success + spendEventId:** actual **or** closed `actualCostUnavailableReason` — never null/null.
10. **`durationSec`** server-derived on video `async_update` + TTS trusted path when known; never from client.
11. **Budget gate unchanged** (estimates only); no gate-on-actuals.
12. **Security test matrix** (forgery, Cliente 403, poll cost Operator-only, no late INSERT, fail/cancel immutability, no `video_jobs` SUM, estimate-only gate).

### Vetoes (Phase B — would block BUILD)

**Not vetoed:** B3/B7 TTS leave; B11 no production route.

**Would be REDESIGN / VETO if CONTRACT or BUILD did them:**

- Any Route Handler / Server Action input schema including `actualCostCents` / `actual_cost_cents`.
- Cost fields on a serializer a **Cliente** session can receive (including poll).
- Late INSERT of actual-only spend when `spendEventId` is missing.
- Switching cumulative budget gate to actuals.
- Inventing `/operator/production` as a disconnected Operator (or worse, shared) cost API **without** a new story and `[SEC]` review — **not** a viable alternative to B11; scoped GET + existing panel **is** the alternative.

---

## Future-Proofing Notes

- **US-7.4** automatic expand by `asset_role` is the consumer — do not add Cliente cost fields “for roll-up convenience.”
- **US-8.4** webhook `[SEC]` remains prerequisite for trusted async complete; Phase B consumes persist/adapter output after that gate.
- **Multi-tenancy:** GET already scopes `loadVideoJobScoped({ clientId: operator.id })`; keep uniform **404** for foreign `jobId`. Weekly/slot sums stay parameterized `client_id`.
- **Real auth:** Operator poll/TTS/cost reads stay handler-gated; writes record `operator_client_id` from session/trusted caller — never request actor id.
- **TTS later migration** to `finalizeGenerationCost` is a **future story**; Phase B exception must not grow a third actual writer (e.g. media_assets as a second ledger).

---

## CONTRACT Spot-Check Checklist (Phase B section)

Before Phase B BUILD, verify CONTRACT Phase B **amendment** (do **not** rewrite Phase A except addenda):

- [ ] Names TTS `recordReelSpendEvent` actual INSERT as **only** exception; `server-only`; no request actuals; write-once
- [ ] Exclusive call-site table: video `async_update` (+ `durationSec`); manual `0`; TTS exception; create estimate-only
- [ ] Strikes `/operator/production` as BUILD target; freezes `OperatorVideoJobSummaryPanel` + Operator GET + `OperatorProductionJobCostDto`
- [ ] Poll DTO Operator-only; explicit Cliente serializer **exclusion** (poll/status/TTS/approval)
- [ ] Ledger canonical vs `video_jobs` mirror; US-7.4 ledger-only; DTO ledger-wins
- [ ] Fail/cancel ∉ finalize; missing `spendEventId` = log, no INSERT; completed success not null/null
- [ ] Budget gate non-goal (estimates only); no new DDL
- [ ] Security test matrix rows for Phase B threats above

---

## Verdict for CONTRACT (Phase B)

**Pre-CONTRACT (this review): APPROVE WITH CONDITIONS** — nextjs-backend may author **CONTRACT.md Phase B** (append). Proceed only if CONTRACT encodes the **12 conditions** and SPEC-REVIEW High freezes.

| CONTRACT outcome | When |
|---|---|
| **APPROVE WITH CONDITIONS** | Amendment includes TTS exception + writer table, no `/operator/production`, Operator poll cost DTO, Cliente exclusion, ledger vs mirror, fail/cancel + missing-id rules, estimate-only gate, tests |
| **REDESIGN** | Client-supplied actuals; cost on Cliente poll; late INSERT as “repair”; gate-on-actuals; new production route as the **only** cost API without Operator GET/panel |
| **VETO (do not BUILD)** | HTTP input schema with `actualCostCents`; Cliente-accessible cost JSON; spend UPDATE on fail with invented billed cents |

---

## Verdict Rationale (Phase B)

**APPROVE WITH CONDITIONS** — not REDESIGN because SPEC §3 and USER_STORIES `[SEC]` already require server job-completion writes and Operator-only cost visibility. PO B3/B7/B11 are **story-floor amendments** (TTS leave; no invented production route), not security vetoes: the TTS path is still a trusted orchestrator with `server-only` and no client actuals; the FE consumer already exists on `/operator/scripts`. Conditions close **exception abuse**, **poll leakage**, and **unofficial ledger paths**.

**CONTRACT Phase B may proceed:** **Yes** (after this amendment). **Do not start CONTRACT from this agent.** **Next gate:** nextjs-backend CONTRACT Phase B section + FE Reviewed line → BUILD.

### Gate summary (Phase B)

| Item | Value |
|------|--------|
| **Verdict** | APPROVE WITH CONDITIONS |
| **Condition count** | 12 |
| **Veto of B3/B7 or B11** | None |
| **Next gate** | CONTRACT.md Phase B amendment |
