# Validation Report — US-13.1

**Story:** Record basic post metrics manually  
**Branch:** `feature/US-13.1-reel-metrics`  
**Date:** 2026-08-31  
**Validator:** requirements-validator  

### Verdict: PASS WITH NOTES

**AC score:** 5/5  
**Tests run:** `npx tsx --test lib/metrics/upsert-reel-metrics.test.ts lib/calendar/calendar.test.ts` — **37 passed, 0 failed**

---

## Acceptance Criteria

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Metrics only on published Reels | **PASS** | **FE:** Metrics section gated to `pipelineStatus === 'published'` and `assembledReelId != null` in `components/calendar/OperatorCalendarView.tsx` (lines 332–334, 575–581). **BE:** `loadPublishedSlotGateForReelScript` requires ≥1 `neuramark_content_calendar_slots` row with `publish_status = 'published'` (`lib/metrics/load-published-slot-for-reel.ts` lines 27–66). `upsertReelMetricsCore` returns `NOT_PUBLISHED` when gate fails (`lib/metrics/upsert-reel-metrics.ts` lines 121–126). **Test:** `non-published reel → NOT_PUBLISHED` in `lib/metrics/upsert-reel-metrics.test.ts`. |
| Edit allowed within 7 days (configurable) | **PASS** | **Constant:** `REEL_METRICS_EDIT_WINDOW_DAYS = 7` in `lib/contracts/reel-metrics.ts` line 9. **Configurable:** `resolveReelMetricsEditWindowDays()` reads `process.env.REEL_METRICS_EDIT_WINDOW_DAYS` (`lib/metrics/reel-metrics-edit-window.ts` lines 5–15). **Handler:** `isWithinReelMetricsEditWindow` checked before UPSERT (`lib/metrics/upsert-reel-metrics.ts` lines 128–134); expired → `EDIT_WINDOW_EXPIRED`. **Read DTO:** `editable` computed server-side in `buildReelMetricsDtoForPublishedReel` (`lib/metrics/load-reel-metrics.ts` lines 85–88). **FE:** Save hidden and inputs disabled when `!editable` (`components/calendar/ReelMetricsSection.tsx` lines 71, 98, 161–163, 188, 201–210). **Test:** `expired edit window → EDIT_WINDOW_EXPIRED without UPSERT`. |
| Operator-only: endpoint/action rejects non-operator sessions server-side (403) | **PASS** | `requireOperator("handler")` is the first `await` in `upsertReelMetrics` (`lib/metrics/actions/upsert-reel-metrics.ts` lines 35–43); 403 mapped to `reelMetricsForbiddenError()`. **Test:** `Cliente session → FORBIDDEN with no UPSERT`; grep test confirms `requireOperator` precedes side effects. |
| [SEC] Metrics inputs validated server-side as non-negative integers with sane upper bound; published-only and 7-day rules enforced in handler | **PASS** | **Zod:** `reelMetricCounterSchema` `.int().min(0).max(REEL_METRICS_MAX_VALUE)` with `REEL_METRICS_MAX_VALUE = 99_999_999` (`lib/contracts/reel-metrics.ts` lines 12, 23–30); action parses via `upsertReelMetricsInputSchema.safeParse` (`lib/metrics/actions/upsert-reel-metrics.ts` lines 49–54). **DB:** CHECK constraints 0–99999999 per column (`supabase/migrations/20260831070000_neuramark_reel_metrics.sql` lines 8–12). **Handler gates:** published join + edit window in `upsertReelMetricsCore` (not FE-only). **Tests:** contract rejects negative/float/over-max; action tests `NOT_PUBLISHED`, `EDIT_WINDOW_EXPIRED`, `VALIDATION_ERROR`. |
| [SEC] Metrics writes scoped to Reels of the current client (`assembled_reel_id` verified for ownership) | **PASS** *(per SECURITY.md clarification)* | USER_STORIES wording is ambiguous for Operator multi-client calendar; **SECURITY.md** and **CONTRACT.md** bind: ownership = reel exists + `client_id` denormalized from `neuramark_assembled_reels` — never from request; Operator cross-tenant writes allowed. **Implementation:** `loadAssembledReelById` → missing reel `NOT_FOUND` (`lib/metrics/upsert-reel-metrics.ts` lines 116–119); UPSERT sets `client_id: reel.clientId` (line 146); `findForbiddenReelMetricsKeys` rejects `client_id`/`clientId` (`lib/contracts/reel-metrics.ts` lines 74–76). **Tests:** `forbidden client_id → FORBIDDEN_FIELDS`; `Operator cross-tenant write succeeds when published slot exists`. |

---

## Convention Compliance

| Check | Status | Notes |
|-------|--------|-------|
| EN + ES user-facing strings | **PASS** | `messages/en.json` and `messages/es.json` under `calendar.metrics.*`; wired from `app/(app)/operator/calendar/page.tsx` lines 117–129. |
| Server Components default; minimal `"use client"` | **PASS** | Calendar page is RSC; interactive metrics form isolated in `ReelMetricsSection.tsx` (`"use client"`). |
| PrimeReact-first UI | **PASS** | `InputNumber`, `Button`, `Message` in `ReelMetricsSection.tsx`. |
| Loading / empty / error / pending states | **PASS** | `useTransition` pending + disabled form; server/field errors via `mapReelMetricsError`; read-only expired copy; success `Message`; defaults counters to 0 when no row. |
| Auth: `requireOperator`, no browser Supabase | **PASS** | Server Action only; no `@supabase` imports under `components/calendar/`. |
| `neuramark_` DB prefix | **PASS** | Table `neuramark_reel_metrics`, index, trigger per migration. |
| Concrete frontend consumer | **PASS** | `upsertReelMetrics` consumed by calendar Sidebar only; calendar read extended in `getOperatorCalendarForWeek`. |
| Contract alignment | **PASS** | Gate order, error codes, DTO shape, forbidden keys, rate limit, and DDL match frozen `CONTRACT.md`. |

---

## Dependency Check

| Dependency | Status |
|------------|--------|
| US-12.2 (published slots, `publishedAt`, `assembledReelId` in DTO) | **Satisfied** — metrics UI and published gate consume existing calendar DTO fields and `publish_status` / `published_at` columns. US-12.2 folder shows prior VALIDATION/QA artifacts. |

---

## Gaps (what blocks PASS)

**None blocking.** All five USER_STORIES acceptance criteria are satisfied in code and tests.

### Non-blocking notes

1. **CONTRACT § security tests** lists separate cases for expired window on **create** vs **update existing row**. Implementation uses one handler path; only a single expired-window action test exists (old `published_at`, no UPSERT). Behavior is equivalent — not an AC gap.
2. **USER_STORIES AC #5 wording** ("current client") differs from Operator multi-tenant model; implementation correctly follows **SECURITY.md** / **CONTRACT.md** tenancy rules. Documented here for product-owner CLOSE.
3. **README gate checklist** still shows VALIDATION pending — update on CLOSE.

---

## Scope Creep

**None identified.** Delivered scope matches README Phase A: migration, `upsertReelMetrics`, calendar DTO `metrics` delta, Sidebar form, EN/ES, security tests. No separate `/operator/metrics` route, no Instagram API, no US-13.2 aggregation, no Cliente metrics surface.

---

## Recommended Next Actions

| Action | Owner |
|--------|-------|
| Run **QA** gate (`plan/stories/US-13.1/QA.md`) — manual UAT on `/operator/calendar` published slot | qa-engineer |
| **CLOSE** — product-owner checks off 5/5 AC in `plan/USER_STORIES.md` after QA | product-owner |
| Optional: add explicit test for expired-window **update** of existing metrics row (CONTRACT hygiene) | nextjs-backend |

---

## Test Summary

```
lib/metrics/upsert-reel-metrics.test.ts + lib/calendar/calendar.test.ts
ℹ tests 37 | pass 37 | fail 0
```

Relevant US-13.1 coverage includes: Cliente FORBIDDEN, Operator happy path, cross-tenant write, NOT_FOUND, NOT_PUBLISHED, EDIT_WINDOW_EXPIRED, FORBIDDEN_FIELDS, RATE_LIMITED, validation, calendar DTO `metrics` null vs snapshot, read path has no UPSERT, forbidden keys / integer bounds in contracts.
