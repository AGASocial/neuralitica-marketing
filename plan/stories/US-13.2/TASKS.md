# US-13.2 — Surface top themes for next strategy cycle

**Priority:** P1  
**Depends on:** US-13.1 ✅ · US-4.1 ✅ · US-5.1 ✅ (join path) · US-4.2 ✅ (strategy page / client selector)  
**Acceptance criteria:** `plan/USER_STORIES.md` § US-13.2 (source of truth — do **not** redefine; do **not** check off in PREP)  
**Implementers:** **nextjs-backend** (aggregator, Server Action, orchestrator wiring, tests) + **content-agents-engineer** (prompt injection delta, agent unit tests) + **nextjs-frontend** (insights snippet, i18n). Per `docs/development/AGENT-ROSTER.md` Phase 5 Operación semanal + Fase 3 agent module. **No** media-pipeline-engineer · **No** integrations-engineer · **No DB migration** Phase A.  
**Canonical terms:** **Estrategia semanal** · **brief** · **Operator** · **Reel** · **Ensamblado** · **métricas** · **tema**.

**Reference:** [US-13.2 README](./README.md) · [US-13.1 CONTRACT](../US-13.1/CONTRACT.md) · [US-4.1 CONTRACT](../US-4.1/CONTRACT.md) · [US-4.1 TASKS](../US-4.1/TASKS.md) · `lib/agents/content/generate-weekly-strategy.ts` · `lib/content-strategy/generate-content-strategy-for-client.ts` · `lib/contracts/reel-metrics.ts`

## Out of scope (do not implement here)

- New metrics entry UI or `upsertReelMetrics` changes (US-13.1).
- Instagram Insights / Graph API auto-import.
- DDL / new `neuramark_*` tables (Phase A).
- Pillar-level charts or explicit pillar rollup (Phase B).
- Cliente insights surface.
- Dashboard / calendar analytics widgets.
- Persisted insights cache table (Phase B).
- Auto-trigger strategy generate on metrics save.
- Changing US-4.1 generate rate limits or brief schema.

## Scope split

| Concern | Owner |
|---------|--------|
| 28-day metrics aggregation by slot **`tema`** | **BE** |
| Prompt `<TRUSTED_METRICS_SUMMARY>` injection | **content-agents-engineer** (+ BE orchestrator pass-through) |
| Operator insights snippet on `/operator/strategy` | **FE** |
| Empty state when no metrics | **FE** + **BE** (`available: false`) |
| `[SEC]` integer-only metric values in prompt summary | **BE** + **content-agents-engineer** |
| EN/ES `strategy.insights.*` | **FE** |
| DB migration | **—** (none Phase A) |

## Implementer routing

| Agent | Owns |
|-------|------|
| **nextjs-backend** | `lib/contracts/strategy-insights.ts` · `aggregate-reel-metrics-by-tema.ts` · `getStrategyPerformanceInsights` action · orchestrator hook in `generate-content-strategy-for-client.ts` · join tests |
| **content-agents-engineer** | `buildWeeklyStrategyPrompts` / `generateWeeklyContentStrategy` params + delimited metrics block · system prompt addendum · `generate-weekly-strategy.test.ts` cases |
| **nextjs-frontend** | `StrategyInsightsPanel` on strategy page · empty/loading states · i18n · wire to server loader or action |

---

## PO decisions (freeze in CONTRACT unless SECURITY / SPEC vetoes)

| Topic | Decision |
|-------|----------|
| Branch | **`feature/US-13.2-strategy-insights`** |
| Lookback | **`STRATEGY_METRICS_LOOKBACK_DAYS = 28`** on `recorded_at`; `windowEnd` = ISO Monday of target `weekStart` (exclusive); `windowStart = windowEnd - 28d` |
| Group key | Slot **`tema`** from `neuramark_content_strategies.brief` via `reel_script` join — normalize lowercase for GROUP BY |
| Rank | Top **3** by `engagementScore = views+likes+comments+saves+dms`; tie-break views DESC |
| Prompt tag | **`<TRUSTED_METRICS_SUMMARY>`** — JSON array; metric fields integers only; `tema` label server-resolved (SECURITY may require rank-only fallback) |
| Read surface | **`getStrategyPerformanceInsights({ clientId, weekStart })`** Server Action — Operator gate |
| FE surface | Insights snippet on **`/operator/strategy`** — no new route |
| Empty | **`insights: null`** or `available: false` — not an error; generate still works |
| DB | **No migration** Phase A |

### Aggregator sketch (CONTRACT freezes names)

```ts
// Server-only — lib/metrics/aggregate-reel-metrics-by-tema.ts
aggregateReelMetricsByTema({
  clientId,
  weekStart, // ISO Monday — anchors windowEnd
}): Promise<StrategyPerformanceInsightsDto | null>;

// StrategyPerformanceInsightsDto (lean):
// {
//   available: true,
//   windowStart: string, // ISO date
//   windowEnd: string,
//   topThemes: Array<{
//     rank: 1|2|3,
//     tema: string,       // display label, max 200
//     reelCount: number,
//     views, likes, comments, saves, dms: number,
//     engagementScore: number,
//   }>, // length 1..3
// }
```

### Prompt payload sketch (CONTRACT freezes)

```ts
// Passed into generateWeeklyContentStrategy when insights?.available
metricsSummaryForPrompt: Array<{
  rank: number;
  reelCount: number;
  views: number;
  likes: number;
  comments: number;
  saves: number;
  dms: number;
  engagementScore: number;
  tema?: string; // SECURITY decides required vs omitted
}> | null;
```

---

## Contract-first checklist (before BUILD)

- [ ] `SPEC-REVIEW.md` — spec-guardian
- [ ] `SECURITY.md` — security-architect
- [ ] `CONTRACT.md` frozen — Zod in `lib/contracts/strategy-insights.ts` · prompt block schema · **Reviewed by FE**
- [ ] Open questions in README § resolved in CONTRACT

---

## Frontend (nextjs-frontend)

**Consumer:** `/operator/strategy` · `components/strategy/StrategyPageView.tsx` (or sibling panel)

- [x] Add **Insights** section above brief / below client+week controls.
- [x] When insights available: show **top 3** **`tema`** rows with aggregated counters (views, likes, comments, saves, DMs) + Reel count.
- [x] Show lookback label (e.g. “Last 4 weeks”) from DTO `windowStart` / `windowEnd`.
- [x] **Empty state** when `insights === null` — friendly copy + hint to record metrics on published Reels in **Calendario de contenido** (link `/operator/calendar`).
- [x] **Loading** skeleton while insights load (match strategy page pending pattern).
- [x] Re-load when **client selector** or **weekStart** changes (props from page / action refetch).
- [x] i18n EN + ES under **`strategy.insights.*`**.
- [x] Do **not** add a separate insights route.
- [x] Do **not** expose Supabase in Client Components.
- [x] Insights block is **read-only** — no edit/save CTAs.

**FE satisfies:** USER_STORIES § US-13.2 AC — insights snippet on strategy page; empty state; client selector parity for insights read + generate `clientId`.

---

## Backend (nextjs-backend)

**Consumers:** Strategy page loader (insights snippet); `generateContentStrategyForClient` (prompt injection).

- [x] Add **`lib/contracts/strategy-insights.ts`**: constants, Zod DTOs, prompt summary schema, message keys.
- [x] Implement **`aggregateReelMetricsByTema`** — server-only SQL/query builder:
  - [x] Filter `neuramark_reel_metrics` by `client_id` + `recorded_at` window (28 days, see PO #1).
  - [x] Join `neuramark_assembled_reels` → `neuramark_reel_scripts` → `neuramark_content_strategies`.
  - [x] Extract slot **`tema`** from `brief` JSON at `slot_index` (camelCase `slots[].tema`).
  - [x] Skip rows with missing join or missing `tema`.
  - [x] GROUP BY normalized tema; SUM counters; COUNT reels.
  - [x] Rank and return top 3.
- [x] Implement **`getStrategyPerformanceInsights`** Server Action — `requireOperator("handler")` first.
  - [x] Validate `clientId` UUID + active client (mirror strategy generate client validation).
  - [x] Validate `weekStart` with `trendWeekStartSchema`.
  - [x] Return `{ ok: true, insights: StrategyPerformanceInsightsDto | null }`.
- [x] Extend **`generateContentStrategyForClient`**: call aggregator before LLM; pass `metricsSummaryForPrompt` into agent module.
- [x] Export pure **`buildMetricsSummaryForPrompt(insights)`** for tests (integer fields only).
- [x] Unit tests: empty window → null; single tema; tie-break; excluded orphan join failure; cross-client isolation (`client_id` filter).
- [ ] Integration test: generate with fixture metrics includes `<TRUSTED_METRICS_SUMMARY>` in prompt (mock LLM adapter). — **content-agents-engineer** (agent prompt delta)

---

## Agents (content-agents-engineer)

**Consumer:** `generateContentStrategyForClient` → `generateWeeklyContentStrategy` (US-4.1 pattern).

- [ ] Extend **`WeeklyStrategyPromptInput`** / **`GenerateWeeklyContentStrategyParams`** with optional `metricsSummaryForPrompt`.
- [ ] Add **`TRUSTED_METRICS_SUMMARY_TAG`** constant (parallel to `UNTRUSTED_*` tags).
- [ ] Update **`buildWeeklyStrategyPrompts`**: when summary non-null, append delimited JSON block + locale-aware system instruction (favor high engagement themes).
- [ ] When summary null/empty: **omit block entirely** — no placeholder error (graceful empty AC).
- [ ] Ensure prompt serialization uses **`JSON.stringify`** on server-built object only — no string concat from request input.
- [ ] Unit tests in **`generate-weekly-strategy.test.ts`**:
  - [ ] With summary → user prompt contains tag + integer fields.
  - [ ] Without summary → tag absent.
  - [ ] Metric values in prompt are numbers only (no free-text from metrics table columns).
- [ ] Do **not** change brief output Zod schema or allowlist validation (US-4.1 / US-4.2).

---

## Database (nextjs-backend / migrations)

**Phase A: no migration tasks.**

- [x] Confirm existing **`neuramark_reel_metrics_client_recorded_idx`** sufficient for window query (US-13.1).
- [x] Document join path in CONTRACT — no new `neuramark_*` objects Phase A.
- [ ] Phase B backlog only: optional materialized aggregate table / pillar mapping column — **not US-13.2 Phase A**.

---

## Dependencies and sequence

```text
US-13.1 CLOSED + US-4.1 CLOSED
    → PREP (this) → SPEC-REVIEW → SECURITY → CONTRACT (+ FE signoff)
    → BE aggregator + action + orchestrator hook
    → content-agents-engineer prompt delta (parallel after CONTRACT)
    → FE insights snippet (parallel after CONTRACT)
    → VALIDATION → QA → CLOSE
```

| Gate | Owner |
|------|-------|
| SPEC-REVIEW | spec-guardian |
| SECURITY | security-architect |
| CONTRACT | nextjs-backend; FE reviews |
| BUILD BE | nextjs-backend |
| BUILD agents | content-agents-engineer |
| BUILD FE | nextjs-frontend |
| VALIDATION | requirements-validator |
| QA | qa-engineer |
| CLOSE | product-owner (AC check-off only after validator) |

---

## Security checklist (for security-architect — expand in SECURITY.md)

- [ ] `[SEC]` Prompt metrics summary built server-side from aggregated **integers** only — no free-text fields from `neuramark_reel_metrics` (only integer columns exist).
- [ ] If `tema` labels included in prompt: sourced from strategy brief JSON via join — not from metrics mutation input; sanitized/truncated.
- [ ] `requireOperator` on read action; Cliente → 403.
- [ ] `clientId` validated server-side — no cross-tenant leak via body spoof (filter aggregate by resolved client).
- [ ] No new public Route Handler exposing aggregate data.
- [ ] Logging excludes full prompts and brief JSON (US-4.1 pattern).
- [ ] Generate path cannot accept operator-supplied metrics summary in request body (forbidden keys).
- [ ] Rank-only fallback documented if labels vetoed.

---

## Open questions for CONTRACT (from README)

See [README § Open questions](./README.md#open-questions-for-security--contract--not-prep-blockers) — prompt label policy, window bounds, strategy status filter, FE load pattern, read rate limit.
