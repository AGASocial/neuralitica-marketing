# US-7.4 — Report real total cost per Reel

**Status:** PREP — story folder + PO freeze (2026-08-29). Gates pending.

**As an** Operator, **I want** the full actual cost of each Reel (video jobs, retries, B-roll, TTS) rolled up in one place, **so that** we know true unit economics per piece, not just per API call.

Ship **Operator Reel cost roll-up on `/operator/scripts` expand-row detail**: a **Cost** section showing **estimated vs actual total**, **breakdown by asset role** (`llm`, `talking_head` → video, `broll`, `tts`) sourced from **`neuramark_reel_spend_events`**, **over-budget highlight** against resolved **`max_cost_cents`** (US-7.1), and **variance** (actual − estimated). **Reuse** US-7.3 **`getReelCostSummaryForWeek`** for the **weekly footer** — per-slot totals in the list/detail **must reconcile** with the weekly sum. **V1 BUILD is LLM-only breakdown** when video/TTS spend rows are absent; Phase B extends automatically as US-8.x / US-9.3 insert spend events.

**Canonical acceptance criteria:** [`plan/USER_STORIES.md`](../../USER_STORIES.md) → US-7.4 (checked on CLOSE).

**This folder:** [`plan/stories/US-7.4/`](./) — `README.md` · `TASKS.md` · (gates pending) `SPEC-REVIEW.md` · `SECURITY.md` · `CONTRACT.md` · `VALIDATION.md` · `QA.md`.

**Branch:** `feature/US-7.4-reel-cost-rollup`

**Depends on:** [US-7.3](../US-7.3/) ✅ `getReelCostSummaryForWeek` · spend ledger actuals · `/operator/scripts` weekly footer · [US-7.1](../US-7.1/) ✅ `getCostPolicyForClient()` · `max_cost_cents` · [US-5.1](../US-5.1/) ✅ `/operator/scripts` · `ReelDetailPanel` expand row · [US-14.5](../US-14.5/) ✅ `requireOperator()`. **Soft:** [US-9.3](../../USER_STORIES.md) (TTS spend rows) · [US-8.x](../../USER_STORIES.md) (video/B-roll spend rows) — not required for V1 BUILD closure.

**Unblocks:** Operator margin review per Reel · Sprint 5 economics sign-off · downstream analytics joining `neuramark_provider_decisions` ↔ spend ledger.

---

## Scope in

| Area | What US-7.4 adds |
|------|------------------|
| **FE** | **Cost section** inside **`ReelDetailPanel`** (expand row on `/operator/scripts`): total **estimated vs actual**, **variance** badge, **breakdown table** by role (`llm`, `video`, `broll`, `voiceover`); **over-budget** visual when total exceeds **`maxCostCents`**; empty/pending states when no spend events or actuals pending; EN/ES (`scripts.cost.rollup.*`). **No** new route — detail only. Weekly footer **unchanged** — reads existing `costSummary` from `getReelScriptsForWeek`. |
| **BE** | **`getReelCostDetailForScript({ clientId, reelScriptId })`** — operator-gated; **all spend events** for `reel_script_id` (lifetime of script, all attempts/roles); GROUP BY `asset_role` with estimated/actual sums; totals + variance; attach **`maxCostCents`** from **`getCostPolicyForClient(clientId)`**; **`isOverBudget`** flag. Extend **`getReelScriptsForWeek`** (or lazy load on expand) to include per-slot **`reelCostDetail`** map keyed by `reelScriptId` — CONTRACT picks one round-trip vs on-expand fetch. **Reconciliation:** sum of slot **`actualCostCents`** in `getReelCostSummaryForWeek` equals sum of detail totals for scripts in week scope. |
| **DB** | **No new tables.** Query **`neuramark_reel_spend_events`** only. USER_STORIES `video_jobs` + `media_assets.cost_cents` **deferred** — spend ledger is canonical per US-7.3 freeze. |
| **Implementers** | **nextjs-backend** + **nextjs-frontend** (`docs/development/AGENT-ROSTER.md` Phase 4). **No media-pipeline-engineer** BUILD slice (read-only aggregation). |

## Scope out

| Story / topic | Why out |
|---------------|---------|
| **New `/operator/costs` dashboard** | Weekly sum already on `/operator/scripts` (US-7.3); full charts P2. |
| **Cliente** cost visibility | Margin-sensitive — Operator serializers only ([SEC] baseline). |
| **Cumulative budget gate on actuals** | US-7.1 gate stays **`SUM(estimated_cost_cents)`** only. |
| **Catalog/pricing CRUD** | Out of product scope. |
| **Production list `/operator/production`** | US-8.4 job-level cost column — distinct from Reel roll-up. |
| **Historical backfill** | Pre-7.3 rows show pending/null actual — no migration. |
| **Failed job rows without spend events** | US-7.3: failed LLM = no ledger row; video failures follow US-8.x when shipped. |

## Canonical terms (CONTEXT)

Use **Operator**, **Reel**, **Paquete de guion**, **coste real**, **coste estimado**, **presupuesto máximo**, **desglose por componente**.  
_Evitar:_ exposing raw provider pricing or budget caps to Cliente; client-editable cost fields.

## What prior stories already shipped (do not duplicate)

| Source | Continuity |
|--------|------------|
| US-7.3 | **`getReelCostSummaryForWeek`** · **`reelWeekCostSummarySchema`** · list cost column · weekly footer · **`neuramark_reel_spend_events.actual_cost_cents`**. |
| US-7.1 | **`getCostPolicyForClient()`** · **`max_cost_cents`** (default 150) · budget confirm dialog — roll-up **reads** cap, does not change gate. |
| US-7.2 | **`ProviderRecommendationPanel`** in same expand row — Cost section sits **below** recommendations, above script/caption tabs. |
| US-5.1 | **`ReelDetailPanel`** · expand-row pattern on `/operator/scripts`. |

**US-7.4 adds per-Reel detail roll-up + variance + over-budget highlight** — not new spend writes or weekly aggregate logic.

## PO decisions frozen (2026-08-29)

1. **Surface:** **Cost section** on **`/operator/scripts` `ReelDetailPanel`** (expand row) — not a standalone Reel route.
2. **Data store:** **`neuramark_reel_spend_events`** only — **no** `video_jobs` or `media_assets.cost_cents` reads in V1 BUILD; USER_STORIES DB row reconciled to spend ledger (US-7.3 canonical).
3. **Scope of totals:** Per-Reel detail sums **all events** for `reel_script_id` (all attempts, all roles). Weekly footer remains **week-scoped** via US-7.3 — reconciliation AC = sum of **week's slot totals** matches **`weeklyActualCostCents`**, not lifetime totals.
4. **Breakdown roles:** GROUP BY `asset_role` — UI labels: `llm` → LLM · `talking_head` → Video · `broll` → B-roll · `tts` → Voiceover. Hide rows with **zero events**; show **"—"** for roles with estimate-only pending actual.
5. **V1 phased BUILD:** When only LLM spend rows exist, breakdown shows **LLM line only** + optional muted note that video/voiceover appear when pipeline ships — **AC satisfied** for LLM-tracked Reels.
6. **Actual vs estimate display:** Total **actual** = `SUM(actual_cost_cents)` where not null; **null total actual** when all events pending (match US-7.3). **Variance** = `(actualTotal ?? estimatedTotal) − estimatedTotal` for display; show explicit variance only when actual known.
7. **Over-budget highlight:** Compare against **`getCostPolicyForClient(clientId).maxCostCents`**. **`isOverBudget: true`** when **`actualTotal > maxCostCents`** if any actual recorded; else when **`estimatedTotal > maxCostCents`**. Visual: PrimeReact **`Message`** severity `warn` or row border — CONTRACT picks token.
8. **Weekly reuse:** **Do not reimplement** weekly SUM — consume **`costSummary`** from **`getReelScriptsForWeek`**. Detail totals for a slot **must equal** `costSummary.slots[slotIndex]` for estimated/actual (detail query scoped to same `reel_script_id` as slot).
9. **Operator-only:** All cost reads via **`requireOperator()`**; extend forbidden-key regression matrix (US-7.3 / US-7.1). **No cost fields** on Cliente/shared serializers.
10. **Load pattern:** PO lean — **batch attach** `reelCostDetails: Record<reelScriptId, ReelCostDetail>` on **`getReelScriptsForWeek`** success (one round-trip, mirror US-7.3 cost block) — CONTRACT may choose lazy Server Action on first expand if payload size is a concern.
11. **Implementers:** **nextjs-backend** + **nextjs-frontend** only.
12. **Module placement (lean):** `lib/cost-policy/get-reel-cost-detail-for-script.ts`; extend `lib/contracts/actual-cost.ts` with `ReelCostDetail` / `ReelCostRoleBreakdown` Zod; FE `components/scripts/ReelCostSection.tsx`.
13. **i18n:** EN + ES under **`scripts.cost.rollup.*`** (section title, totals, variance, over-budget, role labels, empty/pending, phase-B note).

---

## Gates (orchestrator)

- [ ] SPEC-REVIEW.md (spec-guardian)
- [ ] SECURITY.md (security-architect)
- [ ] CONTRACT.md (nextjs-backend — **Reviewed by FE** before BUILD)
- [ ] BUILD (nextjs-backend + nextjs-frontend)
- [ ] VALIDATION.md (requirements-validator)
- [ ] QA.md (qa-engineer)

**Status:** PREP. **Next:** spec-guardian SPEC-REVIEW → security-architect SECURITY → nextjs-backend CONTRACT.
