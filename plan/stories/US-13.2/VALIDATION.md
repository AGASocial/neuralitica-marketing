# Validation Report — US-13.2

**Story:** Surface top themes for next strategy cycle  
**Branch:** `feature/US-13.2-strategy-insights`  
**Gate:** VALIDATE  
**Date:** 2026-08-31  
**Validator:** requirements-validator

### Verdict: PASS WITH NOTES

**AC score:** 3 / 3 (all acceptance criteria satisfied)  
**Tests:** 98 / 98 pass (`npx tsx --test` on metrics + strategy + agent suites)

---

### Acceptance Criteria

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Strategy agent prompt includes last 4 weeks metrics summary when available | **PASS** | Orchestrator loads 28-day aggregate before LLM: `lib/content-strategy/generate-content-strategy-for-client.ts` L120–121, L131–139. Agent appends `<TRUSTED_METRICS_SUMMARY>` after untrusted blocks when summary non-empty: `lib/agents/content/generate-weekly-strategy.ts` L175–178, L250–252. Window constant `STRATEGY_METRICS_LOOKBACK_DAYS = 28` in `lib/contracts/strategy-insights.ts`. Tests: `buildWeeklyStrategyPrompts appends TRUSTED_METRICS_SUMMARY after untrusted blocks` (`lib/agents/content/generate-weekly-strategy.test.ts` L268–298); `aggregates single tema group with correct sums` (`lib/metrics/aggregate-reel-metrics-by-tema.test.ts`); `maps integer fields and includes sanitized tema` (`lib/metrics/build-metrics-summary-for-prompt.test.ts`). |
| Graceful empty state when no metrics yet | **PASS** | Aggregator returns `null` when zero qualifying rows: `lib/metrics/aggregate-reel-metrics-by-tema.ts` (return path validated by test `returns null for empty window`). Orchestrator passes `null` → agent omits block entirely: `buildMetricsSummaryForPrompt` L13–14; `buildWeeklyStrategyPrompts` L175–178, L250–252. Tests: `buildWeeklyStrategyPrompts omits TRUSTED_METRICS_SUMMARY when summary is null/undefined` (`generate-weekly-strategy.test.ts` L240–265); `returns null for empty window` (`aggregate-reel-metrics-by-tema.test.ts`). Action returns `{ ok: true, insights: null }`: `get-strategy-performance-insights.ts` L68. FE empty state: `StrategyInsightsPanel.tsx` L111–119, L282–284 with i18n `strategy.insights.empty` + calendar link. Generate proceeds without error (orchestrator does not branch on empty insights). |
| [SEC] Metrics summary built from aggregated numbers server-side (no free-text from metrics; no user-authored injection vectors) | **PASS** | Integer-only prompt schema: `metricsSummaryForPromptRowSchema` in `lib/contracts/strategy-insights.ts`. Built only in orchestrator via `buildMetricsSummaryForPrompt(insights)` — never from request body. Forbidden smuggling keys on generate: `lib/content-strategy/find-forbidden-keys.ts` (`metricsSummary`, `metricsSummaryForPrompt`, `insights`, `topThemes`, etc.); test `smuggled metricsSummaryForPrompt returns FORBIDDEN_FIELDS` (`content-strategy.test.ts` L658). Optional `tema` brief-sourced + sanitized: `sanitizeTemaForMetricsPrompt` + rank-only fallback (`build-metrics-summary-for-prompt.ts` L17–29); tests in `sanitize-tema-for-metrics-prompt.test.ts` and `build-metrics-summary-for-prompt.test.ts`. Aggregator `import "server-only"` (grep + test `has import server-only`). Insights read: `requireOperator("handler")` first (`get-strategy-performance-insights.ts` L38–45); cross-client isolation test (`aggregate-reel-metrics-by-tema.test.ts` `isolates cross-client metrics`); Cliente → FORBIDDEN (`get-strategy-performance-insights.test.ts` `non-operator returns FORBIDDEN without aggregate`). Tenancy: `m.client_id` + join tables filtered by `client_id` in `aggregate-reel-metrics-by-tema.ts` L124, L177, L219, L263. |

---

### Convention Compliance

| Check | Status | Evidence |
|-------|--------|----------|
| EN + ES user-facing strings | **PASS** | `messages/en.json` + `messages/es.json` § `strategy.insights.*` (title, empty, lookbackLabel, calendarHint, columns, errors). Page wires copy in `app/(app)/operator/strategy/page.tsx` L181–195. |
| Server Components default; minimal `"use client"` | **PASS** | RSC page loader fetches initial insights (`page.tsx` L107–114). `StrategyInsightsPanel.tsx` is client island for refetch/loading only. Aggregator and prompt builders are `server-only`. |
| PrimeReact-first UI | **PASS** | `Panel`, `DataTable`, `Message`, `Skeleton` in `StrategyInsightsPanel.tsx`. |
| Loading / empty / error states | **PASS** | Skeleton L102–108, empty L111–119, inline error Message L270–275; panel errors do not block brief editor (CONTRACT § FE appendix). |
| Auth / identity | **PASS** | Operator layout gate + `requireOperator("handler")` on actions. No Supabase in client components. |
| Backend maps to frontend consumer | **PASS** | `getStrategyPerformanceInsights` → `StrategyInsightsPanel`; orchestrator hook → generate button flow. No public insights Route Handler (grep `app/**` — no matches). |
| Contract frozen shapes | **PASS** | DTOs, forbidden keys, window bounds, and prompt tag match `CONTRACT.md`. Generate optional validated `clientId` aligned with insights selector (`StrategyPageView.tsx` L323–326, L499–505). |

---

### Dependencies

| Dependency | Status |
|------------|--------|
| US-13.1 (Metrics Lite) | **Satisfied** — reads `neuramark_reel_metrics` integer columns; reuses index per TASKS. |
| US-4.1 (Content Strategy generate) | **Satisfied** — orchestrator extended; US-4.1 validation/allowlists unchanged. |

---

### Gaps (what blocks PASS)

None. All three USER_STORIES acceptance criteria are met with automated test coverage.

---

### Scope Creep

None identified. Implementation stays within CONTRACT Phase A: tema grouping (not pillar), top 3, Operator-only read, no DDL, no public HTTP, no Cliente insights surface.

---

### Notes (non-blocking — PASS WITH NOTES rationale)

1. **Brief read vs selected client (multi-client selector):** `getLatestContentStrategy` accepts optional `clientId` (`get-latest-content-strategy.ts` L63–72), but `app/(app)/operator/strategy/page.tsx` still calls `getLatestContentStrategy({ weekStart })` without the resolved `selectedClientId` (L77–78). When an operator picks a different client, **insights and generate inject** use `selectedClientId`, but the **brief editor** may still show the session client's strategy until a full navigation/refresh path loads the correct brief. CONTRACT § FE appendix §3 flagged this as a known V1 coordination gap — not an AC failure, but QA should exercise multi-client selector explicitly.

2. **TASKS.md agent checklist unchecked:** `plan/stories/US-13.2/TASKS.md` § Agents still shows open boxes, but implementation and tests in `generate-weekly-strategy.ts` / `generate-weekly-strategy.test.ts` are complete. Documentation drift only.

3. **`StrategyInsightsPanel` refetch deps:** Client-side refetch `useEffect` depends on `[clientId, copy]` but not `weekStart`; week changes rely on RSC `router.refresh()` updating `initialInsights` (works per CONTRACT frozen FE pattern). No failure observed in code review.

---

### Recommended Next Actions

| Action | Owner |
|--------|-------|
| QA: verify insights panel empty/data states on `/operator/strategy`; generate with fixture metrics shows tag in prompt (staging/manual or mock LLM capture) | **qa-engineer** |
| QA: multi-client selector — confirm insights + generate use same client; document brief mismatch if selector ≠ session client | **qa-engineer** |
| Optional follow-up: pass `selectedClientId` to `getLatestContentStrategy` on strategy page RSC load | **nextjs-backend** + **nextjs-frontend** |
| Sync TASKS.md agent section checkboxes to match shipped code | **implementing agent** or **product-owner** |
| PO: check off AC in `USER_STORIES.md` after reviewing this report | **product-owner** |

---

### Test command (reproducible)

```bash
npx tsx --test \
  lib/metrics/aggregate-reel-metrics-by-tema.test.ts \
  lib/metrics/build-metrics-summary-for-prompt.test.ts \
  lib/metrics/sanitize-tema-for-metrics-prompt.test.ts \
  lib/metrics/get-strategy-performance-insights.test.ts \
  lib/agents/content/generate-weekly-strategy.test.ts \
  lib/content-strategy/content-strategy.test.ts
```

**Result:** 98 pass, 0 fail (2026-08-31).
