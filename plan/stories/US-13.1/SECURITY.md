# Security Design Review — US-13.1

**Story:** US-13.1 — Record basic post metrics manually  
**Date:** 2026-08-31  
**Reviewer:** security-architect  
**Branch:** `feature/US-13.1-reel-metrics`  
**Sources:** `plan/USER_STORIES.md` (US-13.1 AC + `[SEC]`), `plan/SECURITY_BASELINE.md` § Calendar / Metrics (P1), `plan/stories/US-13.1/README.md` + `TASKS.md` (PREP 2026-08-31), `plan/stories/US-12.2/SECURITY.md` + `CONTRACT.md`, `plan/stories/US-12.1/SECURITY.md`, `lib/calendar/actions/mark-calendar-slot-published.ts`, `lib/contracts/calendar.ts`, `lib/auth/require-user.ts`  
**Status:** Binding for implementing agents; validated by requirements-validator like any other acceptance criterion. Do not treat this file as CONTRACT.md. Do not check off `USER_STORIES.md` AC here.  
**Primary implementers:** **nextjs-backend** (DDL migration, `upsertReelMetrics`, Zod, published gate, edit window, calendar DTO delta, rate limit, security tests). **nextjs-frontend** (Sidebar metrics section, InputNumber form, i18n — presentation only). **No** content-agents-engineer · **No** media-pipeline-engineer · **No** integrations-engineer.

---

## Verdict: APPROVE WITH CONDITIONS

The story correctly introduces **manual Operator metrics persistence** as a **dedicated Server Action** keyed by **`assembledReelId`**, with **server-side published-only gate**, **7-day edit window anchored to `published_at`**, **integer-only counters with upper bound**, **tenancy resolved from the assembled reel row (never request `client_id`)**, and **Operator cross-tenant authority** consistent with US-12.1/12.2 — not a redesign of the operator calendar trust model.

No **REDESIGN**. No veto of PO product defaults (Sidebar-only UI, one row per Ensamblado, UPSERT full snapshot, read-only after window, no separate route, no Instagram API). Orchestrator may proceed to **CONTRACT.md** after freezing the **14 conditions** below.

**Inherited floors (US-14.5 / US-12.2 / US-12.1 / SECURITY_BASELINE — do not weaken):** `requireOperator()` calls `requireActive()` first; role never from request; handler-level gates mandatory; RLS deny-by-default on `neuramark_reel_metrics`; service-role Node only; no `@supabase/supabase-js` in Client Components; no browser Supabase keys; interim hardcoded user sanctioned — not a finding.

**This story owns:** DDL `neuramark_reel_metrics`; `upsertReelMetrics` Server Action + optional `upsertReelMetricsCore`; Zod input/result in `lib/contracts/reel-metrics.ts`; published-only + edit-window gates; calendar read DTO delta (`metrics` snapshot + `editable`); operator mutation rate limit; security tests for operator gate, published-only, window expiry, bounds, forbidden keys, ownership resolution.

**This story does not own:** Instagram Insights / Graph API import; separate `/operator/metrics` route; Cliente metrics surfaces; US-13.2 strategy prompt injection; charts/dashboards; Operator edit-window override; bulk CSV import; RBAC beyond `requireOperator()`; extending `markCalendarSlotPublished` or calendar sync.

**Terminology:** **Calendario de contenido** · **Operator** · **Cliente** · **Reel** · **Ensamblado** · **publicado** · **métricas**. Do not accept `client_id` as mutation authority; do not trust FE `pipelineStatus === 'published'` or `metrics.editable` for write authorization.

**USER_STORIES wording correction (binding):** The AC line *"Metrics writes are scoped to Reels of the current client"* is **misaligned** with the Operator multi-client calendar model (US-12.1/12.2). For US-13.1, **"ownership verification"** means: (a) `assembledReelId` must reference an existing `neuramark_assembled_reels` row; (b) `client_id` on the metrics row is **denormalized from that reel row** on every write; (c) request bodies must **not** carry `client_id` / `clientId`. It does **not** mean the operator session's `client_id` must match the reel's tenant — Operators may record metrics for **any** active client's published Reel (product trust model). VALIDATION and requirements-validator must apply this SECURITY.md interpretation over the ambiguous USER_STORIES phrase.

---

### Threat Summary (US-13.1–specific)

| Threat | Impact | Mitigation in this story |
|---|---|---|
| **Cliente writes metrics for any Reel** | Unauthorized performance data / cross-tenant mutation | **`requireOperator("handler")` first** → **403**; zero DB writes on failure |
| **Direct Server Action call on non-published Reel** | Metrics on unapproved/unpublished content | Handler **published-only gate** via calendar slot join (`publish_status = 'published'`) — FE visibility insufficient |
| **`client_id` smuggled to target victim tenant** | Cross-tenant metrics IDOR / wrong tenancy row | Input **`.strict()`**; forbidden-key scan rejects `client_id` / `clientId`; `client_id` resolved **only from assembled reel row** |
| **`assembledReelId` for non-existent or arbitrary UUID** | Oracle / orphan metrics rows | Load reel by PK; missing → **`NOT_FOUND`** (uniform envelope) |
| **Edit after 7-day window via DevTools** | Stale or retroactive metric tampering | Handler compares `now()` to **`published_at + REEL_METRICS_EDIT_WINDOW_DAYS`** → **`EDIT_WINDOW_EXPIRED`**; applies to **initial create and update** |
| **Negative, float, or overflow counters** | Bad aggregates / DB errors / DoS | Zod **integer** `.min(0).max(REEL_METRICS_MAX_VALUE)`; DB NOT NULL integers; optional CHECK duplicate |
| **Free-text metric fields** | Prompt injection surface for US-13.2 downstream | **Five integer fields only** — no strings, notes, or JSON blobs in V1 |
| **`publish_status` / `slotId` / `recorded_at` spoof in body** | Skip published gate or force timestamps | Forbidden keys: `publish_status`, `publishStatus`, `slotId`, `recorded_at`, `recordedAt`, `editable`, `client_id`, etc. |
| **Operator mutation spam** | DB churn / rate-limit table noise | **Rate limit** 30 upserts per operator `client_id` per rolling 60 minutes (`agent_key: reel_metrics_upsert`) |
| **Read path abused as write** | Confused deputy | **Dedicated** `upsertReelMetrics` — do not overload `getOperatorCalendarForWeek` |
| **Metrics on reel with no live published calendar slot (orphan)** | Write when product says published-only | Published gate requires **live** calendar row with `publish_status = published` linked via `reel_script_id`; orphan DB rows from sync DELETE are **not writable** V1 |
| **Session `client_id` mismatch blocks Operator cross-tenant writes** | Broken operator calendar UX | **Do not** filter writes by operator session `client_id`; authority is Operator role + published gate + reel existence |

**Residual risk accepted:** Operator role may record metrics for **any** tenant's published Reel — product trust model (SECURITY_BASELINE § (e), US-12.2). Orphan metrics rows may survive calendar slot hard-delete (US-12.2) — retained for US-13.2 aggregate; Sidebar write path requires live published slot. Hardcoded local user until auth universal is sanctioned.

---

## Assets and Trust Boundaries

| Asset | Sensitivity | Trust boundary |
|---|---|---|
| `neuramark_reel_metrics` counters | Medium — operational learning signal; feeds US-13.2 LLM prompt (aggregates only) | Operator-only mutation; integer-only; server-validated |
| `assembledReelId` | Medium — mutation key | Untrusted input; reel loaded server-side; existence required |
| `client_id` on metrics row | **High** — tenancy denormalization | **Never** from request; copied from `neuramark_assembled_reels.client_id` on write |
| `neuramark_content_calendar_slots.publish_status` / `published_at` | **High** — publish + edit-window anchor | Read-only in this story; gate at write time |
| Calendar DTO `metrics.editable` | Low — UX hint | Server-computed; **not** write authority |

**Boundaries:**

1. **Browser (Operator) → `upsertReelMetrics`** — Untrusted: `assembledReelId`, five integer counters. **`requireOperator` first**. No Supabase SDK. No `client_id` authority.
2. **Browser (Cliente) → same action** — **Blocked:** `requireOperator("handler")` → **403**; zero DB writes.
3. **Server Action → Postgres UPSERT** — Service-role; parameterized; `client_id` from reel row only.
4. **Server Action → calendar slot join** — Read-only SELECT; require ≥1 row with `publish_status = 'published'` for reel's `reel_script_id`; window from **latest `published_at` DESC** when multiple published slots exist (PO #3).
5. **Browser (Operator) → Sidebar form** — `metrics.editable === false` disables Save (UX); handler still enforces window on every write.

---

## Abuse Cases Considered

- *As a Cliente, I call `upsertReelMetrics` for my published Reel* → **Blocked:** `requireOperator("handler")` → **403**; no UPSERT.
- *As a Cliente, I enable the metrics form via DevTools on a published slot* → **Blocked:** action still **403**; FE gating is non-authoritative.
- *As a malicious actor, I POST `{ assembledReelId, client_id: "<victim>" }`* → **Blocked:** forbidden-key scan → **`FORBIDDEN_FIELDS`** before parse.
- *As a malicious actor, I POST `{ assembledReelId, publish_status: "published" }`* → **Blocked:** forbidden keys → **`FORBIDDEN_FIELDS`**.
- *As a malicious actor, I POST `{ assembledReelId, slotId: "<uuid>" }`* → **Blocked:** `slotId` not in allowlist → **`.strict()` Zod failure** or forbidden keys per CONTRACT.
- *As a malicious actor, I POST `{ assembledReelId, recorded_at: "2099-01-01" }`* → **Blocked:** forbidden keys → **`FORBIDDEN_FIELDS`**; server sets `recorded_at = now()` on write.
- *As a malicious actor, I POST metrics for an approved-but-not-published Reel* → **Blocked:** published gate → **`NOT_PUBLISHED`**; no UPSERT.
- *As a malicious actor, I POST metrics 8 days after `published_at`* → **Blocked:** edit window → **`EDIT_WINDOW_EXPIRED`**; no UPSERT (including first-time entry V1).
- *As a malicious actor, I send `views: -1` or `views: 1.5` or `views: 1e308`* → **Blocked:** Zod integer bounds → **`VALIDATION_ERROR`**.
- *As a malicious actor, I send `views: "999; DROP TABLE--"`* → **Blocked:** Zod rejects non-integer / strict object; parameterized SQL only.
- *As a malicious actor, I spam metric saves* → **Blocked:** rate limit → **`RATE_LIMITED`**.
- *As a malicious actor, I use a random `assembledReelId` UUID* → **Blocked:** **`NOT_FOUND`** (uniform envelope).
- *As implementer, I trust FE `pipelineStatus === 'published'` without server gate* → **Veto:** handler must join calendar slot.
- *As implementer, I trust FE `metrics.editable === false` to skip server window check* → **Veto:** handler must enforce window on every write.
- *As implementer, I accept `client_id` from the form hidden field* → **Veto:** forbidden authority key.
- *As implementer, I scope writes to `operator.clientId === reel.client_id`* → **Veto:** breaks Operator multi-client calendar; contradicts US-12.1/12.2 trust model.
- *As Operator, I record metrics for another client's published Reel* → **Allowed (product intent)** — Operator role + published gate + reel existence; not session tenant match.

---

## Security Acceptance Criteria

Story `[SEC]` items from `plan/USER_STORIES.md` → US-13.1 are binding, **as clarified above** for ownership scope. Items marked **(added)** extend enforcement for testability. Do not drop or weaken inherited operator/auth floors.

**USER_STORIES.md `[SEC]` (binding — with ownership clarification):**

- [ ] **[SEC] Operator-only:** `upsertReelMetrics` rejects non-operator sessions server-side (**403** on action; page already gated by `requireOperator("page")` on `/operator/calendar`)
- [ ] **[SEC] Published-only at write:** "Metrics only on published Reels" is enforced **server-side in the upsert handler** (calendar slot join with `publish_status = 'published'`); FE Sidebar visibility is insufficient alone
- [ ] **[SEC] Integer bounds:** metrics inputs validated server-side as **non-negative integers** with sane upper bound **`REEL_METRICS_MAX_VALUE`** (lean **99_999_999** per field); rejects floats, strings, and out-of-range values
- [ ] **[SEC] Edit window at write:** 7-day edit rule enforced **server-side** from linked slot **`published_at`** (configurable **`REEL_METRICS_EDIT_WINDOW_DAYS`**, default **7**); applies to create and update; after expiry → **`EDIT_WINDOW_EXPIRED`**
- [ ] **[SEC] Ownership / tenancy (clarified):** `assembledReelId` must reference an existing assembled reel; **`client_id` on the metrics row is set from `neuramark_assembled_reels.client_id`** — never from request; **`client_id` / `clientId` forbidden** on input; **no** session-tenant match requirement for Operator cross-client writes

**Added in this review (binding for US-13.1 BUILD):**

- [ ] **[SEC] (added) `requireOperator("handler")` is the first await** in `upsertReelMetrics` before forbidden-key scan, validation, rate limit, reel load, published gate, edit window, or UPSERT; failure → typed **403** envelope, **zero side effects**
- [ ] **[SEC] (added) Request contract is `assembledReelId` + five counters only:** Zod input `.strict()` with fields `assembledReelId`, `views`, `likes`, `comments`, `saves`, `dms`; `findForbiddenReelMetricsKeys` (or shared helper) rejects authority keys including `client_id`, `clientId`, `slotId`, `slot_id`, `publish_status`, `publishStatus`, `pipelineStatus`, `status`, `recorded_at`, `recordedAt`, `editable`, `created_at`, `updated_at`, `role`, `auth_user_id`, `weekStart`, `strategyId`, cost/provider keys → **`FORBIDDEN_FIELDS`**
- [ ] **[SEC] (added) Reel load by `assembledReelId` only:** missing assembled reel → **`NOT_FOUND`** (uniform envelope); resolve `reel_script_id` and `client_id` from row — never from request
- [ ] **[SEC] (added) Published gate join path:** assembled reel → `reel_script_id` → ≥1 `neuramark_content_calendar_slots` row with **`publish_status = 'published'`**; else **`NOT_PUBLISHED`**; no UPSERT
- [ ] **[SEC] (added) Edit window anchor:** among qualifying published slots, use **`published_at` from row with latest `published_at` DESC** for window calculation; reject when **`now() > published_at + REEL_METRICS_EDIT_WINDOW_DAYS`** → **`EDIT_WINDOW_EXPIRED`**
- [ ] **[SEC] (added) Counter schema:** each field `z.number().int().min(0).max(REEL_METRICS_MAX_VALUE)` (or coerced integer equivalent); all five required on every save (full snapshot replace); blank FE inputs may coalesce to **0** on submit per CONTRACT — server still validates integers
- [ ] **[SEC] (added) UPSERT semantics:** one row per `assembled_reel_id` (UNIQUE); INSERT/UPDATE set `client_id` from reel row; set **`recorded_at = now()`** and bump `updated_at` on every successful write; server owns timestamps — client cannot set `recorded_at`
- [ ] **[SEC] (added) Success DTO from persisted state:** `{ ok: true, metrics: ReelMetricsDto }` built from post-write row; counters must satisfy read schema
- [ ] **[SEC] (added) Calendar read DTO delta:** extend `CalendarSlotDetailDto` with optional `metrics: { views, likes, comments, saves, dms, recordedAt, editable } | null`; **`editable` computed server-side** from published gate + edit window; integers only on read schema; loaded in **`getOperatorCalendarForWeek`** for published slots — single-fetch Sidebar pattern
- [ ] **[SEC] (added) Rate limit:** reuse `neuramark_agent_rate_limits` with **`agent_key: 'reel_metrics_upsert'`**; **max 30 attempts per operator `client_id` per rolling 60 minutes**; check after operator gate + before reel load; over-limit → **`RATE_LIMITED`**; record attempt on successful UPSERT only (lean — failed validation/gates do not consume budget)
- [ ] **[SEC] (added) Dedicated mutation surface:** `upsertReelMetrics` under `lib/metrics/actions/` — **non-goal:** write branch on `getOperatorCalendarForWeek`
- [ ] **[SEC] (added) RLS / access path:** `neuramark_reel_metrics` deny-by-default RLS unchanged; all reads/writes via service-role Node in handler helpers only
- [ ] **[SEC] (added) Automated security tests cover at least:** Cliente session → action **403**; Operator happy path on published reel within window → **200** + persisted counters; non-published reel → **`NOT_PUBLISHED`**; expired window (create + update) → **`EDIT_WINDOW_EXPIRED`**; missing reel → **`NOT_FOUND`**; body with `client_id` → **`FORBIDDEN_FIELDS`**; body with `publish_status` → **`FORBIDDEN_FIELDS`**; negative / float / over-max counter → **`VALIDATION_ERROR`**; Operator cross-tenant write succeeds when published slot exists for victim tenant; rate limit → **`RATE_LIMITED`**; grep — read action has no metrics UPSERT

---

## Design Concerns and Required Changes

### Frozen design choices (must land in CONTRACT)

#### 1. Operator gate on handler (APPROVE — PO #9, USER_STORIES AC)

Mirror US-12.2 `markCalendarSlotPublished`: **`requireOperator("handler")`** first in `upsertReelMetrics`.

**Condition 1:** CONTRACT documents gate order: `requireOperator` → forbidden keys → Zod → rate limit → reel load → published gate → edit window → UPSERT; typed 401/403 envelopes; zero side effects on 403.

#### 2. No `client_id` on mutation (APPROVE — PO #3, #9, SECURITY_BASELINE)

**Condition 2:** CONTRACT freezes `upsertReelMetricsInputSchema` as `{ assembledReelId, views, likes, comments, saves, dms }` `.strict()` plus `FORBIDDEN_REEL_METRICS_AUTHORITY_KEYS` including `client_id` / `clientId`.

#### 3. Tenancy from assembled reel row — not session match (APPROVE — PO #9, US-12.1 Operator model)

Operator cross-client writes are **intentional**. "Ownership verification" = reel exists + `client_id` denormalized from reel.

**Condition 3:** CONTRACT documents: **`client_id` never in input**; UPSERT always sets `client_id` from `neuramark_assembled_reels`; **no** filter `operator.clientId === reel.client_id`; amend USER_STORIES ownership AC wording in VALIDATION notes.

#### 4. Published-only server gate (APPROVE — PO #4, USER_STORIES `[SEC]`)

**Condition 4:** CONTRACT documents join: assembled reel → `reel_script_id` → calendar slot(s) with `publish_status = 'published'`; error code **`NOT_PUBLISHED`**.

#### 5. 7-day edit window from `published_at` (APPROVE — PO #5, USER_STORIES AC)

**Condition 5:** CONTRACT freezes `REEL_METRICS_EDIT_WINDOW_DAYS = 7` (env-overridable server constant only — not client input); window uses **latest `published_at` DESC** among published slots; error code **`EDIT_WINDOW_EXPIRED`**; initial create also requires within window V1.

#### 6. Integer bounds (APPROVE — PO #6, USER_STORIES `[SEC]`)

**Condition 6:** CONTRACT freezes `REEL_METRICS_MAX_VALUE = 99_999_999`; Zod per-field integer min 0 max; optional DB CHECK mirrors Zod.

#### 7. Forbidden status / identity / timestamp spoof keys (APPROVE)

**Condition 7:** CONTRACT lists forbidden keys beyond US-12.2 set: `slotId`, `slot_id`, `recorded_at`, `recordedAt`, `editable`, `created_at`, `updated_at`, `pipelineStatus`, plus calendar authority keys not in allowlist.

#### 8. Dedicated mutation surface (APPROVE — PO #11)

**Condition 8:** CONTRACT names `upsertReelMetrics` under `lib/metrics/actions/`; **non-goal:** write branch on `getOperatorCalendarForWeek`.

#### 9. Calendar DTO delta + server `editable` (APPROVE — PO #8)

**Condition 9:** CONTRACT extends `CalendarSlotDetailDto` with `metrics` snapshot; `editable: boolean` computed server-side from window + published state; read mapper joins `neuramark_reel_metrics` for published slots with `assembledReelId`.

#### 10. Rate limit (APPROVE — PO #12)

**Condition 10:** CONTRACT freezes `REEL_METRICS_UPSERT_AGENT_KEY = 'reel_metrics_upsert'`, window **60 minutes**, max **30** per operator `client_id`; error code **`RATE_LIMITED`**.

#### 11. UPSERT + timestamp authority (APPROVE — PO #7)

**Condition 11:** CONTRACT documents full five-field snapshot replace; `recorded_at = now()` on every write; client cannot supply timestamps.

#### 12. Error envelope consistency (APPROVE)

**Condition 12:** CONTRACT error union includes: `FORBIDDEN`, `FORBIDDEN_FIELDS`, `VALIDATION_ERROR`, `NOT_FOUND`, `NOT_PUBLISHED`, `EDIT_WINDOW_EXPIRED`, `RATE_LIMITED`, `INTERNAL_ERROR` — same `{ ok: false, error: { code, fields?, messageKey? } }` house pattern as calendar actions.

#### 13. DDL constraints (APPROVE — PO #1, TASKS DB)

**Condition 13:** CONTRACT DDL: UNIQUE `assembled_reel_id`; FK to `neuramark_assembled_reels` ON DELETE CASCADE; FK `client_id` → `neuramark_clients`; integer NOT NULL columns; RLS deny-by-default; optional index `(client_id, recorded_at DESC)` for US-13.2.

#### 14. Security tests (APPROVE)

**Condition 14:** CONTRACT § security tests lists minimum cases from criteria above.

---

### Open questions — SECURITY resolutions

| # | Question (PREP) | Resolution |
|---|---|---|
| 1 | `REEL_METRICS_MAX_VALUE` | **99_999_999** per field — Zod authoritative; DB CHECK optional duplicate |
| 2 | `EDIT_WINDOW_EXPIRED` vs `FORBIDDEN` | **Dedicated `EDIT_WINDOW_EXPIRED`** + `messageKey` — not generic 403 |
| 3 | Multiple published slots same script | **Latest `published_at` DESC** for window calc; gate passes if **any** published slot links |
| 4 | Zero-value UX | **Coalesce blank → 0** on submit acceptable if server Zod still validates integers |
| 5 | Return shape | **`{ ok: true, metrics: ReelMetricsDto }`** + FE week refresh |
| 6 | `editable` server-side | **Yes** — FE disables Save; handler still enforces |
| 7 | FK ON DELETE CASCADE | **CASCADE** from `assembled_reel_id` — acceptable; orphan slot case keeps both rows until reel deleted |
| 8 | Rate limit key | **`reel_metrics_upsert`** in `neuramark_agent_rate_limits` |
| 9 | Orphan metrics after slot DELETE | **No Sidebar write** without live published slot; row may remain for US-13.2 — not a security issue |

---

### Vetoes (would block BUILD)

| If implementers… | Verdict |
|---|---|
| Skip `requireOperator` on upsert action or allow Cliente to call it | **REJECT** |
| Accept `client_id` / `clientId` on mutation input | **REJECT** |
| Trust FE published visibility without server published gate | **REJECT** |
| Trust FE `editable` without server edit-window check | **REJECT** |
| Allow metrics write when no published calendar slot links to reel | **REJECT** |
| Accept `publish_status`, `slotId`, `recorded_at`, or `editable` spoof keys | **REJECT** |
| Store floats, strings, or unbounded integers | **REJECT** |
| Scope writes to operator session `client_id === reel.client_id` | **REJECT** |
| Overload `getOperatorCalendarForWeek` with write behavior | **REJECT** |
| Skip rate limit entirely on upsert mutation | **REJECT** |
| Expose Supabase client or service-role key to browser for metrics | **REJECT** |

None of the PO product defaults trigger a redesign veto.

---

## Future-Proofing Notes

- **US-13.2 strategy injection:** Aggregates only — this story stores integers; no free-text metric fields. US-13.2 must build prompt summary server-side from aggregated numbers (existing US-13.2 `[SEC]`).
- **Real auth / RLS:** `client_id` on metrics table from day one; Operator mutation remains service-role with explicit published join — RLS policies additive at multi-tenancy time.
- **Instagram API import (Phase B):** Separate story; must not bypass published gate or edit window without new security review.
- **Operator edit-window override (Phase B):** Requires dedicated security review — V1 hard cutoff stands.
- **Future Cliente metrics view:** Must be a **new** client-scoped read endpoint filtering by server-resolved `getCurrentUser().id` — never Operator action + client-side filter.

---

## CONTRACT.md Checklist (pre-implementation)

When `plan/stories/US-13.1/CONTRACT.md` exists, verify before coding proceeds:

- [ ] `requireOperator` gate order + error codes (incl. `NOT_FOUND`, `NOT_PUBLISHED`, `EDIT_WINDOW_EXPIRED`, `RATE_LIMITED`)
- [ ] Input `{ assembledReelId, views, likes, comments, saves, dms }` `.strict()` + forbidden keys list
- [ ] Published gate join path + latest `published_at` window rule
- [ ] `REEL_METRICS_EDIT_WINDOW_DAYS`, `REEL_METRICS_MAX_VALUE` constants
- [ ] Tenancy: `client_id` from reel row only; no session-tenant filter on writes
- [ ] Success `{ ok: true, metrics: ReelMetricsDto }` from persisted row
- [ ] DTO delta `metrics` + server-computed `editable`
- [ ] Rate limit constants + `neuramark_agent_rate_limits` agent_key
- [ ] Non-goals: Instagram API, Cliente mutation, read-action write overload, session-tenant write filter
- [ ] Security tests list matches SEC criteria
- [ ] **Reviewed by FE** line present before BUILD

---

## CONTRACT freeze list (binding summary)

1. **`requireOperator` first** — zero side effects on 403.  
2. **`assembledReelId` + five counters only** — forbidden `client_id` and status/timestamp spoof keys.  
3. **Tenancy from reel row** — not session match; Operator cross-tenant allowed.  
4. **Published-only gate** — calendar join; `NOT_PUBLISHED`.  
5. **Edit window** — `published_at + REEL_METRICS_EDIT_WINDOW_DAYS`; `EDIT_WINDOW_EXPIRED`.  
6. **Integer bounds** — 0 … `REEL_METRICS_MAX_VALUE`.  
7. **Dedicated action** — not read-action overload.  
8. **DTO delta** — `metrics` snapshot + server `editable`.  
9. **Rate limit** — 30 / 60 min / operator via `reel_metrics_upsert`.  
10. **UPSERT semantics** — full snapshot; server `recorded_at`.  
11. **Error codes** — metrics envelope aligned with calendar house pattern.  
12. **DDL** — UNIQUE `assembled_reel_id`, FKs, deny-by-default RLS.  
13. **Security tests + grep** — gate, forbidden fields, published, window, bounds, cross-tenant, rate limit.  
14. **Non-goals** — Instagram API, Cliente write, session-tenant filter, read-action write.

---

## Recommended action

**APPROVE WITH CONDITIONS.** Proceed to **CONTRACT.md** (nextjs-backend). Binding floors above must appear in CONTRACT before BUILD. FE signoff required after CONTRACT.

**CONTRACT may proceed:** **Yes.**

**Conditions (14 — non-blocking for CONTRACT start):** See § Design Concerns — frozen choices #1–#14. Highest priority: **`requireOperator` + published gate + edit window**, **forbidden authority keys**, **integer bounds**, **tenancy from reel row (not request)**, **rate limit**.

---

## BUILD vetoes (summary)

1. Missing `requireOperator` or Cliente-accessible upsert action.  
2. `client_id` or `publish_status` / `slotId` / `recorded_at` accepted on mutation input.  
3. Metrics write without server-side published gate.  
4. Edit window enforced only in FE.  
5. Unvalidated or unbounded counter types.  
6. Session-tenant filter blocking legitimate Operator cross-client writes.  
7. `publish_status` or timestamps client-writable.  
8. Read action overloaded with write behavior.  
9. No rate limit on upsert mutation.
