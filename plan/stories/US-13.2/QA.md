# QA Report — US-13.2 Surface top themes for next strategy cycle

**Story:** US-13.2  
**Branch:** `feature/US-13.2-strategy-insights`  
**Gate:** QA  
**Date:** 2026-08-31  
**Reviewer:** qa-engineer

### Verdict: APPROVE WITH CONDITIONS

Security posture meets CONTRACT and SECURITY.md requirements for Operator-gated, server-built metrics injection. Automated test suite (98/98) passes. One documented multi-client coordination gap remains before full operator supervisor UX is trustworthy end-to-end.

**Finding counts:** Critical 0 · High 0 · Medium 1 · Low 2

**Fix loop needed:** No — for US-13.2 merge. Optional follow-up story recommended for brief-read `clientId` parity (see Medium finding).

---

### Findings

#### Medium — Brief editor vs insights/generate client mismatch (multi-client selector)

**Files:** `app/(app)/operator/strategy/page.tsx:77-78`, `components/strategy/StrategyPageView.tsx:301-312, `323-326`

**What is wrong:** RSC loader calls `getLatestContentStrategy({ weekStart })` without the resolved `selectedClientId`. When the operator selects a different client, **insights** (`aggregateReelMetricsByTema`, `getStrategyPerformanceInsights`) and **generate** (`generateContentStrategy({ weekStart, clientId: selectedClientId })`) use the selector value, but the **brief editor** continues to show the session client's strategy until a follow-up wires `clientId` into the read path.

**Why it matters:** Operator sees Client B performance insights while editing/viewing Client A's brief. Generate correctly injects Client B metrics and creates strategy for Client B, but post-refresh the brief panel may still load session client data. Save/approve operate on the displayed (session) brief — creating operational confusion and wrong mental model, though not a cross-tenant data leak (actions still scope to the strategy row loaded).

**Recommended fix:** Pass validated `selectedClientId` to `getLatestContentStrategy({ weekStart, clientId: selectedClientId })` on RSC load; call `router.refresh()` (or equivalent) on client selector change so brief reloads with selector. Already flagged in VALIDATION.md note #1 and CONTRACT § FE appendix §3.

---

#### Low — `StrategyInsightsPanel` refetch omits `weekStart` dependency

**File:** `components/strategy/StrategyInsightsPanel.tsx:266`

**What is wrong:** Client-side refetch `useEffect` depends on `[clientId, copy]` but not `weekStart`.

**Why it matters:** Week-only changes rely entirely on RSC `router.refresh()` updating `initialInsights` via the separate `useEffect` on `initialInsights`. If RSC refresh were skipped or delayed, panel could show stale window data.

**Recommended fix:** Add `weekStart` to refetch deps, or document invariant that week navigation always triggers RSC refresh (current `navigateWeek` does). Non-blocking per VALIDATION note #3.

---

#### Low — RSC insights loader skips explicit `validateActiveOperatorClientId`

**File:** `app/(app)/operator/strategy/page.tsx:107-114`

**What is wrong:** Page calls `aggregateReelMetricsByTema` directly after `resolveSelectedClientId` heuristics, without the shared `validateActiveOperatorClientId` helper used by the Server Action.

**Why it matters:** Edge case where `sessionClientId` is inactive and `clients` is empty could attempt aggregate for an inactive id (action path would return `NOT_FOUND`). Blast radius is low — page is Operator-layout-gated and `resolveSelectedClientId` prefers active list entries.

**Recommended fix:** Call `validateActiveOperatorClientId(selectedClientId)` before aggregate on RSC path for parity with action gate order.

---

### Security audit summary

| Control | Status | Evidence |
|---------|--------|----------|
| `requireOperator("handler")` first on insights read | **PASS** | `get-strategy-performance-insights.ts:38-45` |
| Forbidden keys on insights read + generate smuggling | **PASS** | `strategy-insights.ts:146-179`; `find-forbidden-keys.ts:1-15`; test `smuggled metricsSummaryForPrompt returns FORBIDDEN_FIELDS` |
| Tenancy — `m.client_id` + join `cs.client_id` filters | **PASS** | `aggregate-reel-metrics-by-tema.ts:124,177,219,263`; test `isolates cross-client metrics` |
| Aggregator `import "server-only"` | **PASS** | `aggregate-reel-metrics-by-tema.ts:1`; test `has import server-only` |
| No public insights Route Handler | **PASS** | grep `app/**/route.ts` — no matches |
| No Supabase in client strategy components | **PASS** | grep `components/strategy/**` — no `@supabase/supabase-js` |
| Integer-only prompt metrics + sanitized `tema` | **PASS** | `build-metrics-summary-for-prompt.ts`; `sanitize-tema-for-metrics-prompt.ts`; agent tests |
| `<TRUSTED_METRICS_SUMMARY>` delimiter + system addendum | **PASS** | `generate-weekly-strategy.ts:127-143,250-252` |
| Generate inject uses same `clientId` as insights selector | **PASS** | `StrategyPageView.tsx:323-326,499-505` |
| Orchestrator-only summary build (not request body) | **PASS** | `generate-content-strategy-for-client.ts:120-121` |
| Metadata-only logging (no prompt dumps) | **PASS** | `aggregate-reel-metrics-by-tema.ts:396-401`; `generate-content-strategy-for-client.ts:123-127` |
| Graceful empty — omit tag | **PASS** | tests in `generate-weekly-strategy.test.ts`, `aggregate-reel-metrics-by-tema.test.ts` |
| Operator page layout gate | **PASS** | `app/(app)/operator/layout.tsx:14` |

No injection vectors, back doors, or trust-boundary violations identified in US-13.2 scope.

---

### VALIDATION cross-reference

| VALIDATION note | QA disposition |
|-----------------|----------------|
| Brief read vs selected client mismatch | **Confirmed Medium** — see finding above |
| TASKS.md agent checkboxes unchecked | Documentation drift only — not a QA finding |
| `StrategyInsightsPanel` refetch deps | **Confirmed Low** — mitigated by current week navigation pattern |

---

### Checks Run

| Command | Result |
|---------|--------|
| `npx tsx --test lib/metrics/aggregate-reel-metrics-by-tema.test.ts lib/metrics/build-metrics-summary-for-prompt.test.ts lib/metrics/sanitize-tema-for-metrics-prompt.test.ts lib/metrics/get-strategy-performance-insights.test.ts lib/agents/content/generate-weekly-strategy.test.ts lib/content-strategy/content-strategy.test.ts` | **98 pass, 0 fail** |
| `npm run lint` | Exit 0 with pre-existing repo-wide test-file `no-require-imports` warnings (includes US-13.2 test files — same pattern as rest of codebase) |
| `npx tsc --noEmit` | Pre-existing errors in unrelated modules (`video-jobs`, `visual-preferences`); no US-13.2 production-file errors observed |
| grep: no public insights route | **PASS** |
| grep: no Supabase in `components/strategy/**` | **PASS** |
| grep: aggregator not imported from client components | **PASS** |

---

### What Was Not Covered

- Manual browser verification of `/operator/strategy` empty/data states and multi-client selector UX (code review + unit tests only).
- Staging verification that live LLM prompt capture includes `<TRUSTED_METRICS_SUMMARY>` with fixture metrics (covered by agent unit tests with mock adapter).
- Load/race testing of insights read under concurrent generate (generate rate limit unchanged from US-4.1).
- Full-repo `tsc` / lint cleanliness (out of US-13.2 scope; pre-existing debt).

---

### Recommended next actions

| Action | Owner | Blocks merge? |
|--------|-------|---------------|
| Optional: pass `selectedClientId` to `getLatestContentStrategy` on strategy page RSC load | nextjs-backend + nextjs-frontend | No |
| Optional: add `weekStart` to panel refetch deps or enforce RSC-only week refresh | nextjs-frontend | No |
| PO: check off AC in `USER_STORIES.md` after reviewing VALIDATION + QA | product-owner | No |
