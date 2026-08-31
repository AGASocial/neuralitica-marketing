# Integration Report — PLAN Fase 5 (Operación semanal / Sprint 7)

**Date:** 2026-08-31  
**Branch reviewed:** `main` (US-12.1 · US-12.2 · US-13.1 · US-13.2 CLOSED)  
**Checker:** integration-checker  
**Flow scope:** Operator calendar week view → mark published → Metrics Lite upsert (7-day window) → strategy insights → Content Strategy prompt injection · auth/tenancy (`requireOperator`, no `client_id` spoof, RLS)

> **Numbering note:** `SPRINT-STATE.md` and this report label the Sprint 7 calendar/metrics slice as **Fase 5 — Operación semanal**. In root `PLAN.md`, the same modules are **Fase 8 — P2 (Content Calendar + Metrics Lite)**; `PLAN.md` Fase 5 is QA + Aprobación (already CLOSED via Sprint 6 US-10/US-11). Deliverable judgment follows the Sprint 7 story set requested for this gate.

---

## Verdict: CONNECTED

Sprint 7 modules hand off correctly through shared calendar/metrics/strategy-insights contracts, Operator gates, RLS deny-by-default tables, and server-only aggregation → prompt injection. All four stories report **PASS WITH NOTES** / **APPROVE** (or APPROVE WITH CONDITIONS) with **0 Critical/High** QA findings and **0 validation blockers**. Residual items are non-blocking: multi-client brief-read parity (Phase B), mark-published unit-test fixture drift after US-13.1 DTO delta, no live browser E2E, and PLAN/TASKS numbering doc drift. **Phase (Sprint 7 Operación semanal) may close.**

| Metric | Value |
|--------|-------|
| **Verdict** | CONNECTED |
| **Blocking gaps** | 0 |
| **Non-blocking / expected gaps** | 7 |
| **Phase may close** | Yes |
| **Recommended next** | US-8.7 (HeyGen) or US-8.5 (Wan B-roll) |

---

## Deliverable claimed vs observed

| Claimed deliverable (Sprint 7 / PLAN F8 P2) | Observed |
|--------------------------------------------|----------|
| Operator weekly calendar with gap warnings (&lt;3 Reels) | **Yes.** `/operator/calendar` · `getOperatorCalendarForWeek` · sync-on-read · `gapWarnings` · EN/ES · migration `20260831050000_neuramark_content_calendar_slots.sql` |
| Slot detail workflow + mark published (approved-only) | **Yes.** Sidebar + `MarkPublishedDialog` · `markCalendarSlotPublished` · publish metadata migration `20260831060000_…_publish_metadata.sql` |
| Metrics Lite on published Reels (7-day edit window) | **Yes.** `ReelMetricsSection` · `upsertReelMetrics` · `REEL_METRICS_EDIT_WINDOW_DAYS=7` · table `neuramark_reel_metrics` (`20260831070000_…`) |
| Metrics → next strategy cycle (top themes / ~4 weeks) | **Yes.** `aggregateReelMetricsByTema` (28-day lookback) · `StrategyInsightsPanel` · orchestrator injects `metricsSummaryForPrompt` → `<TRUSTED_METRICS_SUMMARY>` |
| Operator-only + no client_id spoof + RLS | **Yes.** `requireOperator` first on actions/layouts; forbidden-key scans; RLS ENABLE + zero policies on calendar + metrics tables |

---

## Flow traces

### 1. Operator calendar week → slot detail → mark published

| Step | Expected | Found | Owner |
|------|----------|-------|-------|
| 1. Route gate | Operator session; inactive denied | `(app)/layout` `requireActive` → `operator/layout` `requireOperator("page")` | nextjs-backend |
| 2. Week load | Aggregate slots for active clients; sync-on-read | `app/(app)/operator/calendar/page.tsx` → `getOperatorCalendarForWeek` → `syncCalendarSlotsForWeek` + `get-operator-calendar-for-week.ts` | nextjs-backend / nextjs-frontend |
| 3. Gap warnings | Approved-strategy clients with `scheduledCount < 3` | `gapWarnings` computed server-side; PrimeReact `Message` in `OperatorCalendarView` | nextjs-backend / nextjs-frontend |
| 4. Slot detail | Click opens Reel detail workflow | Sidebar: tema, goal, scheduled date, pipeline status, CTAs | nextjs-frontend |
| 5. Mark CTA | Only when `pipelineStatus === "approved"` (UX) | `showMarkPublishedCta` in `OperatorCalendarView` | nextjs-frontend |
| 6. Mark mutation | Operator-only; approved-only re-check; IG URL allowlist | `markCalendarSlotPublished` → `requireOperator` → forbidden keys → Zod → `markCalendarSlotPublishedCore` → `verifySlotReadyForPublish` → UPDATE `publish_status='published'` | nextjs-backend |
| 7. Sync preserve | Sync must not escalate/clear publish metadata | Sync UPDATE only strategy/date/script fields; INSERT defaults `ready` / null metadata | nextjs-backend |

### 2. Published slot → metrics upsert → 7-day edit window

| Step | Expected | Found | Owner |
|------|----------|-------|-------|
| 1. Metrics UI gate | Only published + `assembledReelId` | `showMetricsSection` when `pipelineStatus === "published"` | nextjs-frontend |
| 2. Read DTO | Server emits `metrics` snapshot + `editable` | Calendar read loads `neuramark_reel_metrics`; `buildReelMetricsDtoForPublishedReel` | nextjs-backend |
| 3. Upsert | Operator-only; published-only; integer bounds | `upsertReelMetrics` → `requireOperator` → forbidden keys → Zod → published-slot gate → edit window → UPSERT | nextjs-backend |
| 4. Edit window | 7 days from latest `published_at` (env-configurable) | `REEL_METRICS_EDIT_WINDOW_DAYS`; expired → `EDIT_WINDOW_EXPIRED`; FE Save hidden when `editable !== true` | nextjs-backend / nextjs-frontend |
| 5. Tenancy | `client_id` from assembled reel row, never request | Forbidden `client_id`/`clientId`; UPSERT sets `client_id: reel.clientId`; Operator cross-tenant allowed | nextjs-backend |

### 3. Metrics → strategy insights → Content Strategy prompt injection

| Step | Expected | Found | Owner |
|------|----------|-------|-------|
| 1. Aggregate | Last ~4 weeks by tema; top themes; empty → null | `aggregateReelMetricsByTema` · `STRATEGY_METRICS_LOOKBACK_DAYS = 28` · `import "server-only"` | nextjs-backend |
| 2. Operator UI | Insights panel on strategy page; empty state graceful | `StrategyInsightsPanel` + `getStrategyPerformanceInsights`; empty copy + calendar link | nextjs-frontend / nextjs-backend |
| 3. Orchestrator | Load aggregate before LLM; build integer-only summary | `generate-content-strategy-for-client.ts` L120–139: aggregate → `buildMetricsSummaryForPrompt` | content-agents-engineer / nextjs-backend |
| 4. Prompt inject | Trusted block after untrusted; omit when null | `buildWeeklyStrategyPrompts` appends `<TRUSTED_METRICS_SUMMARY>`; system addendum when present | content-agents-engineer |
| 5. No smuggling | Request cannot supply metrics summary | Forbidden keys on generate (`metricsSummary*`, `insights`, …); summary built server-side only | content-agents-engineer / nextjs-backend |
| 6. Tema safety | No free-text injection from metrics | Integer counters only; `sanitizeTemaForMetricsPrompt` + rank fallback | nextjs-backend |

### 4. Auth / tenancy / RLS

| Control | Expected | Found | Status |
|---------|----------|-------|--------|
| Operator layout | All `/operator/*` gated | `requireOperator("page")` | OK |
| Action gate order | `requireOperator` first await | Calendar get/mark · metrics upsert · insights read | OK |
| No `client_id` spoof | Forbidden keys → `FORBIDDEN_FIELDS` | Calendar aggregate, mark-published, metrics upsert, insights | OK |
| Future Cliente calendar | Separate endpoint; never filter operator aggregate | Documented `FUTURE_CLIENT_CALENDAR_ACTION`; no Cliente import of operator action | OK |
| RLS | Deny-by-default; service-role Node only | Calendar slots + reel_metrics: `ENABLE ROW LEVEL SECURITY`, zero policies | OK |
| No browser Supabase | Client islands types/actions only | Grep clean under `components/calendar/`, `components/strategy/` | OK |

### Handoffs table (contracts / boundaries)

| From → To | Contract / entrypoint | Schema alignment | Status |
|-----------|----------------------|------------------|--------|
| US-11.3 / US-4.1 → US-12.1 | Approved strategy + scripts → calendar sync | `neuramark_content_calendar_slots`; pipeline derived at read | OK |
| US-12.1 → US-12.2 | Slot DTO + Sidebar → mark published | Publish metadata columns; sole `published` writer | OK |
| US-12.2 → US-13.1 | `pipelineStatus=published` + `assembledReelId` + `publishedAt` | `metrics` nullable on slot DTO; published-slot gate | OK |
| US-13.1 → US-13.2 | `neuramark_reel_metrics` integers | Aggregator by `client_id` + `recorded_at`; no DDL in 13.2 | OK |
| US-13.2 → US-4.1 generate | Orchestrator + agent prompts | `strategy-insights.ts` + `TRUSTED_METRICS_SUMMARY_TAG` | OK |
| Fase 1 auth → all | `requireOperator` / `requireActive` | Role never from body | OK |

---

## SPEC §4 error paths — Fase scope

S4.1–S4.4 (onboarding, auto cycle, IG Graph publish) and S4.Q1 generation/QA/IG failures remain **out of this slice** — correct deferral (no Graph auto-mark; mark published is manual fallback per SPEC §3 M15).

In-scope / adjacent error paths verified in code + unit tests:

| Error path | Expected behavior | Found |
|------------|-------------------|-------|
| Non-operator calendar/metrics/insights | 403 `FORBIDDEN`; no side effects | Action tests |
| Smuggled `client_id` / authority keys | `FORBIDDEN_FIELDS` | Contracts + tests |
| Mark non-approved / no assembly | `NOT_APPROVED` / `SLOT_NOT_READY` | Core tests |
| Invalid IG URL | `VALIDATION_ERROR` / invalidIgUrl | Zod allowlist hostname |
| Metrics on non-published | `NOT_PUBLISHED` | Upsert tests |
| Metrics after edit window | `EDIT_WINDOW_EXPIRED`; FE read-only | Window helpers + FE `editable === true` |
| Empty metrics for strategy | Insights `null`; generate omits trusted tag | Aggregate + agent tests |
| Rate limit mark/metrics | `RATE_LIMITED` | 30/60 min helpers (fail-open on RL table error — known Low) |

---

## VALIDATION / QA sample (Sprint 7 stories)

| Story | VALIDATION | QA | Integration-relevant notes |
|-------|------------|-----|----------------------------|
| US-12.1 Calendar | PASS WITH NOTES (5/5 AC; 18/18) | APPROVE WITH CONDITIONS (0 Crit/High) | Operator aggregate; gap warnings; no publish write |
| US-12.2 Mark published | PASS WITH NOTES (4/4 AC; 39/39 at CLOSE) | APPROVE (0 Crit/High) | Approved-only server gate; IG URL re-validated on read |
| US-13.1 Metrics | PASS WITH NOTES (5/5 AC; 37/37) | APPROVE WITH CONDITIONS (0 Crit/High; 4 Low) | Published-only + 7-day window; `editable` default fixed `d544a47` |
| US-13.2 Insights | PASS WITH NOTES (3/3 AC; 98/98) | APPROVE WITH CONDITIONS (0 Crit/High; 1 Medium) | Prompt injection wired; brief-read `clientId` parity → Phase B |

**Cross-cutting:** No sampled story ran live browser + Supabase E2E this gate. Unit/security coverage is the primary evidence.

---

## Automated check summary (this gate)

```
npx tsx --test \
  lib/calendar/calendar.test.ts \
  lib/calendar/mark-calendar-slot-published.test.ts \
  lib/metrics/upsert-reel-metrics.test.ts \
  lib/metrics/aggregate-reel-metrics-by-tema.test.ts \
  lib/metrics/build-metrics-summary-for-prompt.test.ts \
  lib/metrics/sanitize-tema-for-metrics-prompt.test.ts \
  lib/metrics/get-strategy-performance-insights.test.ts \
  lib/agents/content/generate-weekly-strategy.test.ts
→ 89 pass / 3 fail (92 total)
```

**Failing tests (non-blocking harness drift — production paths intact):**

1. `markCalendarSlotPublishedCore` happy path — mock slot DTO omits US-13.1 `metrics` field; Zod `calendarSlotDetailDtoSchema` parse fails after ok return.
2. Re-mark clear IG URL / re-mark after revoke — when today is Monday (`2026-08-31`), fixture `publishedAt = today-1` is before `weekStart`, so bounds check returns `VALIDATION_ERROR` before approval re-check (date-edge fixture, not product regression).

Action-level mark-published tests, calendar read, metrics upsert, aggregate, insights, and agent prompt suites **pass**.

---

## Gaps (blocks next phase)

**None.**

---

## Non-blocking gaps / expected partial MVP

| # | Gap | Severity | Owner | Notes |
|---|-----|----------|-------|-------|
| 1 | **Brief editor vs insights/generate client mismatch** | Medium | nextjs-backend / nextjs-frontend | `getLatestContentStrategy({ weekStart })` ignores `selectedClientId` on strategy RSC. Insights + generate use selector correctly. Flagged US-13.2 QA Phase B. |
| 2 | **Mark-published unit tests stale after metrics DTO** | Low | nextjs-backend | Mock must include `metrics: null` (or full snapshot); fix Monday re-mark fixtures to keep `publishedAt >= weekStart`. |
| 3 | **No live E2E Operator calendar → metrics → generate walk** | Low | QA / nextjs-frontend | Validators/QA relied on static + unit evidence. |
| 4 | **Rate-limit helpers fail open on DB error** | Low | nextjs-backend | Inherited pattern (mark + metrics); gates still enforce Operator + business rules. |
| 5 | **Sync orphan DELETE of published slots** | Known V1 residual | nextjs-backend | Carried from US-12.2; metrics/published UX should tolerate missing slot gracefully. |
| 6 | **IG Graph auto-mark / unpublish** | Expected defer | integrations-engineer | Manual mark is SPEC fallback until Fase 6 / ADR-0002 publish. |
| 7 | **`PLAN.md` / `TASKS.md` Fase numbering vs Sprint State** | Doc drift | product-owner | Sprint 7 labeled Fase 5 in SPRINT-STATE; PLAN maps calendar/metrics to Fase 8 P2. |

---

## Recommended fixes (by agent)

| Agent | Action |
|-------|--------|
| **nextjs-backend** + **nextjs-frontend** | Phase B: pass `selectedClientId` into `getLatestContentStrategy` on `/operator/strategy` RSC; refresh brief on selector change. |
| **nextjs-backend** | Repair `mark-calendar-slot-published.test.ts` mocks (`metrics`) + Monday-safe re-mark dates. |
| **QA / nextjs-frontend** | One staging smoke: calendar week → mark published → upsert metrics → strategy insights → generate (confirm trusted tag / empty omit). |
| **product-owner** | Close Sprint 7 / Fase 5 Operación semanal in `SPRINT-STATE.md`; clarify PLAN F5 vs F8 numbering for future gates. |
| **media-pipeline-engineer** / catalog owners | Next P1 media work: **US-8.7** (HeyGen) or **US-8.5** (Wan B-roll) per Sprint backlog. |

---

## Recommended next work

Per `SPRINT-STATE.md` post–US-13.2 CLOSE and Sprint 7 completion:

1. **Close Phase integration** (this report) — done.
2. **US-8.7 — HeyGen adapter** (high tier / operator fallback), **or**
3. **US-8.5 — Wan B-roll adapter** (faceless / low-tier stitch residual).

Calendar → metrics → strategy feedback loop is connected; remaining Sprint 7 backlog items are provider adapters, not calendar/metrics integration.

---

## Sign-off

| Question | Answer |
|----------|--------|
| Can Sprint 7 / Operación semanal phase close? | **Yes** |
| Blocking gap count | **0** |
| Calendar → mark published connected? | **Yes** |
| Published → metrics (7-day) connected? | **Yes** |
| Metrics → strategy insights → prompt injection connected? | **Yes** |
| `requireOperator` + no `client_id` spoof + RLS? | **Yes** |
| Blocks US-8.7 / US-8.5? | **No** |
