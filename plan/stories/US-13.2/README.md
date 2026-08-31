# US-13.2 — Surface top themes for next strategy cycle

**Status:** PREP (2026-08-31) — README + TASKS · gates pending  
**As a** System, **I want** to pass performance signals into the next Content Strategy run, **so that** weekly planning improves over time.

Ship **Strategy Performance Insights V1 (Phase A)**: aggregate **Métricas lite** from the last **4 weeks** by slot **`tema`** (resolved server-side from approved strategy brief via script join); inject a **numeric metrics summary** into the Content Strategy agent prompt when data exists; show an **Insights** snippet (top **3** themes) on `/operator/strategy`. Graceful empty state when no qualifying metrics yet.

**Canonical acceptance criteria:** [`plan/USER_STORIES.md`](../../USER_STORIES.md) → US-13.2 (do **not** check off in PREP).

**This folder:** [`plan/stories/US-13.2/`](./) — `README.md` · `TASKS.md`. Next gates: `SPEC-REVIEW.md` · `SECURITY.md` · `CONTRACT.md` (not created in PREP).

**Branch:** `feature/US-13.2-strategy-insights`

**Depends on:** [US-13.1](../US-13.1/) ✅ CLOSED — `neuramark_reel_metrics`, integer counters, `(client_id, recorded_at DESC)` index · [US-4.1](../US-4.1/) ✅ CLOSED — Content Strategy agent pipeline, `generateContentStrategyForClient`, `/operator/strategy` · [US-5.1](../US-5.1/) ✅ — `neuramark_reel_scripts` + `neuramark_assembled_reels` join path · [US-4.2](../US-4.2/) ✅ — Operator strategy UI (client selector, brief edit) — insights snippet extends same page.

**Upstream contracts:** [US-13.1 CONTRACT](../US-13.1/CONTRACT.md) · [US-13.1 README](../US-13.1/README.md) · [US-4.1 CONTRACT](../US-4.1/CONTRACT.md) · `lib/agents/content/generate-weekly-strategy.ts` · `lib/content-strategy/generate-content-strategy-for-client.ts` · `lib/contracts/reel-metrics.ts` · SPEC §3 S3.M15 Metrics Lite (“System inyecta resumen ~4 semanas en siguiente Estrategia”).

**Unblocks:** Stronger weekly **Estrategia semanal** iterations; future ciclo semanal automation (integrations-engineer) may reuse the same aggregator helper.

---

## Scope in

| Area | What US-13.2 BUILD adds |
|------|-------------------------|
| **FE (Operator)** | **Insights** snippet on `/operator/strategy` (below week/client chrome, above brief): top **3** **`tema`** labels with aggregated counters (views, likes, comments, saves, DMs) and Reel count; **empty state** when no metrics in lookback (“No performance data yet — record metrics on published Reels in the calendar”); loading skeleton while insights load; EN/ES `strategy.insights.*`; refreshes when client or week context changes (read-only — does not block Generate). |
| **BE** | Server-only **`aggregateReelMetricsByTema({ clientId, asOfDate })`** — 28-day lookback on `neuramark_reel_metrics.recorded_at`, join assembled reel → reel script → strategy brief slot **`tema`**; rank by **`engagementScore`** (sum of five counters); return top 3 + window metadata. **`getStrategyPerformanceInsights`** Server Action (Operator read) for FE snippet. Extend **`generateContentStrategyForClient`** to load aggregator output and pass to agent when ≥1 row qualifies. |
| **content-agents-engineer** | Extend **`buildWeeklyStrategyPrompts`** / **`generateWeeklyContentStrategy`**: when insights available, append delimited **`<TRUSTED_METRICS_SUMMARY>`** block — **integer aggregates only** per ranked row; optional server-resolved **`tema`** label per row from aggregator (not from metrics input — SECURITY finalizes). System instruction: use performance signals to favor high-engagement themes and deprioritize weak ones. When no data: omit block (graceful — not an error). |
| **DB** | **No new tables** (USER_STORIES DB row `—`). Read-only SQL joins across existing `neuramark_reel_metrics`, `neuramark_assembled_reels`, `neuramark_reel_scripts`, `neuramark_content_strategies`. |

## Scope out

| Story / topic | Why out |
|---------------|---------|
| **New metrics entry UI** | US-13.1 |
| **Instagram Insights / Graph API import** | No analytics stack in V1 |
| **Pillar-level rollup charts** | Phase B — slot→pillar mapping not explicit in brief schema V1; Phase A groups by slot **`tema`** only |
| **Cliente insights surface** | Operator-only read; Cliente strategy read deferred |
| **Persisted insights snapshot table / cache row** | Phase B — compute on read/generate in Phase A |
| **Dashboard widgets / calendar metrics charts** | US-13.2 consumes aggregates for strategy only |
| **Changing strategy generation rate limits** | US-4.1 unchanged |
| **Auto-run strategy on metrics save** | Manual Generate only (US-4.1 pattern) |
| **Weight tuning UI / custom scoring formula** | Phase B |
| **Metrics on Reels without resolvable `tema`** | Excluded from aggregate silently (orphan script/strategy rows) |

## Canonical terms (CONTEXT)

Use **Estrategia semanal**, **brief**, **Operator**, **Cliente**, **Reel**, **Ensamblado**, **publicado**, **métricas** (Metrics Lite), **tema** (slot theme from brief).  
_Evitar:_ full analytics stack vocabulary; admin/staff; “viral playbook”; injecting raw Operator calendar URLs or free-text metric notes into agent prompts.

## What upstream stories already shipped (do not duplicate)

| Source | Continuity |
|--------|------------|
| US-13.1 | `neuramark_reel_metrics` — five integer counters, `recorded_at`, `client_id`, UNIQUE `assembled_reel_id`; index `(client_id, recorded_at DESC)` |
| US-4.1 / US-4.2 | `/operator/strategy`, `generateContentStrategy`, `generateContentStrategyForClient`, delimiter prompt pattern (`UNTRUSTED_*` tags) |
| US-5.1 | `neuramark_reel_scripts` (`strategy_id`, `slot_index`) ← join to brief slot `tema` |
| US-9.x | `neuramark_assembled_reels.reel_script_id` — metrics → script link |
| US-12.x | Published Reels on calendar — metrics only exist on published Ensamblados (US-13.1 gate) |

**US-13.2 adds read-only aggregation + prompt injection + Operator insights snippet** — no new metrics writes, no DDL, no separate insights route.

---

## Phased BUILD (PO)

| Phase | Scope | Closes |
|-------|-------|--------|
| **A (US-13.2 BUILD — ship all in this story)** | 28-day aggregator by slot **`tema`** · top 3 ranking · prompt injection when data exists · FE insights snippet + empty state · `[SEC]` integer-only metric values in prompt summary (labels from strategy join, not metrics form) · EN/ES | USER_STORIES § US-13.2 AC (all three) |
| **B (deferred — not US-13.2)** | Explicit **pillar** rollup · persisted insights cache · Cliente read · charts · custom scoring weights · week-over-week trend copy · insights on dashboard/calendar | Backlog / US-13.x polish |

**VALIDATION note (binding):** Phase A closes full US-13.2 AC. FE empty state is UX only — VALIDATION must prove generate path omits metrics block when zero rows and includes it when fixture metrics exist. Prompt tests must assert no string fields from `neuramark_reel_metrics` beyond server-resolved `tema` labels (SECURITY may require rank-only labels).

---

## Upstream / downstream handoffs

| Direction | Artifact | Rule |
|-----------|----------|------|
| **From US-13.1** | `neuramark_reel_metrics` rows | Filter `client_id` + `recorded_at` window; counters are integers only |
| **From US-5.1 / US-9.x** | assembled reel → script → strategy | Resolve `tema` from `brief.slots[slotIndex].tema` (camelCase JSON) |
| **From US-4.1** | `generateContentStrategyForClient` pipeline | Load insights before LLM call; pass to agent module |
| **From US-4.2** | Operator client selector on strategy page | Insights scoped to selected **`clientId`** (server-validated) |
| **Orphan metrics (US-13.1)** | Calendar slot deleted, metrics row retained | **Include** in aggregate if join to script/strategy succeeds |
| **To ciclo semanal (future)** | Same aggregator helper | integrations-engineer may call with `invokedBy: "system"` |

### Join path (frozen for CONTRACT)

```text
neuramark_reel_metrics m
  JOIN neuramark_assembled_reels ar ON m.assembled_reel_id = ar.id
  JOIN neuramark_reel_scripts rs ON ar.reel_script_id = rs.id
  JOIN neuramark_content_strategies cs ON rs.strategy_id = cs.id
  → tema = cs.brief.slots[rs.slot_index].tema (server JSON extract + Zod trim/max 200)
WHERE m.client_id = :clientId
  AND m.recorded_at >= :windowStart
  AND m.recorded_at < :windowEnd
GROUP BY normalized_tema_key
```

---

## PO decisions frozen (2026-08-31)

| # | Topic | Decision |
|---|-------|----------|
| 1 | **Lookback window** | **4 weeks = 28 days** rolling, anchored to **`recorded_at`** on metrics rows (US-13.1 authority timestamp). At generate/read time: `windowEnd = start of ISO Monday for target weekStart` (exclusive upper bound — do not include metrics recorded on/after the week being planned); `windowStart = windowEnd - 28 days`. If `weekStart` omitted on read, use current ISO Monday as `windowEnd`. |
| 2 | **Grouping key** | **Slot `tema`** from strategy brief via script join — **not** free-text from metrics. Normalize for grouping: `trim().toLowerCase()` on server-resolved `tema`; display label = first seen trimmed `tema` (max 200 chars). **Pillar** rollup deferred Phase B (no stable slot→pillar FK in brief V1). |
| 3 | **Ranking metric** | **`engagementScore = views + likes + comments + saves + dms`** (all integers from DB). Sort **`engagementScore DESC`**, tie-break **`views DESC`**, then **`reelCount DESC`**. Return **top 3** groups. |
| 4 | **Minimum data** | **≥1 metrics row** in window with resolvable `tema` → insights **available**. Zero rows → **`available: false`** (empty state); generate proceeds without metrics block (not an error). |
| 5 | **Prompt injection** | When available: append **`<TRUSTED_METRICS_SUMMARY>`** to user prompt after untrusted blocks. Payload: JSON array (max 3) of `{ rank, reelCount, views, likes, comments, saves, dms, engagementScore }` plus **`tema`** label per row **loaded server-side from strategy brief** (never from metrics mutation input). Metric **values** are integers only — satisfies `[SEC]`. SECURITY may veto `tema` strings in prompt → fallback rank-only integers (CONTRACT documents both). |
| 6 | **Agent instruction delta** | System prompt addendum (locale-aware EN/ES): when summary present, bias next week's **`tema`** / slot topics toward high **`engagementScore`** themes and avoid repeating weak performers — **do not** treat summary as instructions to change modalidad/formato rules. |
| 7 | **FE surface** | **`StrategyInsightsPanel`** (or inline block) on **`/operator/strategy`** — PrimeReact **`Panel`** or **`Message`**; show top 3 with counter columns; link hint to **`/operator/calendar`** for metrics entry. **No** new route. |
| 8 | **Read API** | New Server Action **`getStrategyPerformanceInsights({ clientId, weekStart })`** — `requireOperator("handler")` first; **`clientId`** validated UUID + active client row (same pattern as strategy generate client selector); returns `{ ok: true, insights: StrategyPerformanceInsightsDto }` or `{ ok: true, insights: null }` when empty. |
| 9 | **Contract module** | New **`lib/contracts/strategy-insights.ts`** — Zod DTOs, window constants (`STRATEGY_METRICS_LOOKBACK_DAYS = 28`), prompt summary schema (integers + optional sanitized label). |
| 10 | **Aggregator module** | **`lib/metrics/aggregate-reel-metrics-by-tema.ts`** — `import "server-only"`; unit-tested with mocked joins. |
| 11 | **Orchestrator hook** | **`generateContentStrategyForClient`** calls aggregator after profile load, before LLM; passes result into **`generateWeeklyContentStrategy`**. |
| 12 | **Auth / tenancy** | Operator may read insights for **any** active client (multi-client strategy page — same trust model as US-4.2 client selector). **`clientId` never from unvalidated body alone** — UUID + existence check. |
| 13 | **DB changes** | **None Phase A** — optional supporting index already shipped US-13.1 `(client_id, recorded_at DESC)`. |
| 14 | **Implementers** | **nextjs-backend** (aggregator, action, orchestrator wiring, tests) + **content-agents-engineer** (prompt delta, agent tests) + **nextjs-frontend** (insights snippet, i18n). |
| 15 | **i18n namespace** | **`strategy.insights.*`** EN + ES (title, empty, columns, calendarHint, lookbackLabel). |
| 16 | **Logging** | Log `clientId`, window bounds, `topCount`, error codes — **never** full brief JSON or LLM prompts (US-4.1 pattern). |
| 17 | **Excluded rows** | Metrics rows failing script/strategy join or missing `tema` in brief slot → **skip row** (no partial fake tema). Rows with all-zero counters **included** (valid Operator entry). |

---

## Gates (orchestrator)

- [x] PREP — README + TASKS + PO freezes
- [ ] SPEC-REVIEW.md (spec-guardian)
- [ ] SECURITY.md (security-architect)
- [ ] CONTRACT.md (nextjs-backend) — Reviewed by FE
- [ ] BUILD (nextjs-backend + content-agents-engineer + nextjs-frontend)
- [ ] VALIDATION.md
- [ ] QA.md
- [ ] CLOSE — 3/3 AC checked in USER_STORIES.md (product-owner)

**Next:** SPEC-REVIEW → SECURITY → CONTRACT (freeze aggregator + DTO + prompt block) → BUILD.

---

## Open questions (for SECURITY / CONTRACT — not PREP blockers)

| # | Question | PO lean |
|---|----------|---------|
| 1 | Include **`tema`** labels in prompt or rank-only integers? | **Include server-resolved `tema`** paired with integers — product needs semantic signal; labels not from metrics input |
| 2 | Sanitize **`tema`** for prompt (control chars, length)? | **Trim, max 200, strip `\n`/`<>`** — mirror brief slot schema bounds |
| 3 | **`windowEnd` exclusive on weekStart Monday** vs rolling from `now()`? | **Exclusive on target `weekStart` Monday** — metrics for the week being planned excluded |
| 4 | Approved-only strategies for `tema` source? | **Any strategy row linked by script** (typically approved before scripts exist); do not filter `status` in V1 unless SECURITY requires |
| 5 | Duplicate `tema` strings different casing | **Normalize lowercase for GROUP BY**; display first-seen casing |
| 6 | FE load: separate action vs page loader | **RSC page calls aggregator helper directly** + optional Client refresh after generate — CONTRACT picks (lean **server helper in page loader** + action for client selector changes) |
| 7 | Insights after Generate success | **Re-fetch insights** on `router.refresh()` — new week strategy does not change lookback set materially; optional |
| 8 | Rate limit on read action? | **No** — read-only; generate rate limit unchanged |

---

## SPEC alignment / blockers for spec-guardian

| Item | Assessment |
|------|------------|
| Inject ~4-week metrics summary into next Estrategia | **ALIGNED** with SPEC §3 S3.M15 Metrics Lite |
| Operator insights on strategy screen | **ALIGNED** with USER_STORIES FE row + US-4.1 Operator hub |
| Integer metrics only in prompt summary | **ALIGNED** with US-13.1 handoff + `[SEC]` AC |
| No new analytics stack | **ALIGNED** — read-only aggregation of US-13.1 manual counters |
| SPEC P2 label vs USER_STORIES P1 | **FLAG** (same as US-12.x / US-13.1) — sprint source of truth; no scope reduction |
| DB row `—` | **ALIGNED** — no migration required Phase A |
| Pillar aggregation in USER_STORIES BE row | **PARTIAL Phase A** — **`tema`** grouping only; pillar rollup Phase B (document in SPEC-REVIEW) |
