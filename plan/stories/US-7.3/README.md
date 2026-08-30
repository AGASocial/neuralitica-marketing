# US-7.3 — Track actual cost per generation job

**Status:** PREP — story folder + TASKS ready for gates.

**As an** Operator, **I want** real API cost recorded per Reel, **so that** we learn true unit economics.

Ship **server-side actual-cost persistence on the spend ledger + Operator production-list visibility**: after each **completed** generation job, persist **`actual_cost_cents`** on **`neuramark_reel_spend_events`** from **provider adapter responses** (token usage × catalog `cost_model` for LLM; adapter-reported cost when available); **`actual_cost_cents` stays `NULL` until job completion**; Operator **`/operator/scripts`** production list shows **estimated vs actual** per Reel (cumulative across spend events for that slot) plus a **simple weekly actual-cost sum** for the session client. **V1 BUILD scopes LLM jobs only** (script/caption generate/regenerate); **`neuramark_video_jobs` actuals** and **US-8.4 retry UI** stay **out** until video pipeline ships — export completion seam for US-8.x.

**Canonical acceptance criteria:** [`plan/USER_STORIES.md`](../../USER_STORIES.md) → US-7.3 (checked on CLOSE).

**This folder:** [`plan/stories/US-7.3/`](./) — `README.md` · `TASKS.md` · (gates pending) `SPEC-REVIEW.md` · `SECURITY.md` · `CONTRACT.md` · `VALIDATION.md` · `QA.md`.

**Branch:** `feature/US-7.3-actual-cost`

**Depends on:** [US-7.2](../US-7.2/) ✅ policy engine · `recordReelSpendEvent` · `logProviderDecision` · [US-7.1](../US-7.1/) ✅ `neuramark_reel_spend_events` ledger · budget gate · [US-5.1](../US-5.1/) ✅ `/operator/scripts` production list · `getReelScriptsForWeek` · [US-14.5](../US-14.5/) ✅ `requireOperator()`. **Soft:** [US-8.4](../../USER_STORIES.md) (video job completion UI) — **not required for V1 BUILD**; LLM path is synchronous complete-before-persist.

**Unblocks:** [US-7.4](../../USER_STORIES.md) (Reel cost roll-up + variance) · [US-8.x](../../USER_STORIES.md) (video job actual-cost backfill on spend events) · margin analysis on `neuramark_provider_decisions` vs actuals.

---

## Scope in

| Area | What US-7.3 adds |
|------|------------------|
| **FE** | **Estimated vs actual** column on **`/operator/scripts`** production list (per slot / Reel): cumulative **`estimatedCostCents`** and **`actualCostCents`** from spend ledger; **`—`** / pending label when actual is still null; **weekly footer** with simple **`SUM(actual_cost_cents)`** for session `clientId` + `weekStart`. EN/ES (`scripts.cost.actual.*`). **Operator-only** — no cost fields on Cliente routes. |
| **BE** | **`computeActualCostFromLlmResult()`** — derive cents from `llmCompletionResult` (`inputTokens`, `outputTokens`, `actualCostCents` when adapter already computed) + catalog `cost_model` (`per_1m_tokens`). **`recordReelSpendEvent`** extended to accept optional **`actualCostCents`** at INSERT (LLM path: job completes before INSERT). **`updateReelSpendEventActual({ spendEventId, actualCostCents, unavailableReason? })`** — server-only UPDATE for **async** jobs (US-8.x seam; not wired in V1 BUILD). **`getReelCostSummaryForWeek({ clientId, weekStart })`** — per-`reel_script_id` estimated/actual sums + weekly total for list DTO. Wire script/caption orchestrators to pass LLM actual into spend event. Improve **`SiliconFlowLlmAdapter.complete`** to compute token-based actual (replace placeholder `0`). |
| **DB** | Optional migration: **`actual_cost_unavailable_reason`** nullable text on **`neuramark_reel_spend_events`** (CONTRACT freezes enum vs free-text) for AC "null with failure reason". **No** `neuramark_video_jobs` columns in V1 BUILD — USER_STORIES `video_jobs.*` deferred to US-8.x; **canonical V1 store is spend ledger** per PO freeze. |
| **media-pipeline-engineer** | Token→cost math in LLM adapters; `updateReelSpendEventActual` helper; orchestrator wiring. |

## Scope out

| Story / topic | Why out |
|---------------|---------|
| **US-8.4** job status / retry UI | Video jobs may not exist; async completion handler deferred — **seam only** in CONTRACT. |
| **`neuramark_video_jobs` DDL** | USER_STORIES mentions `video_jobs.estimated_cost_cents` / `actual_cost_cents`; V1 uses **`neuramark_reel_spend_events`** until US-8.2+ creates jobs table. |
| **US-7.4** Reel detail cost section | Per-component breakdown, variance highlight, over-budget — needs US-7.3 actuals first. |
| **US-9.3** TTS actual cost | TTS spend events + adapter actuals when TTS ships. |
| **Cumulative budget gate on actuals** | US-7.1 gate continues **`SUM(estimated_cost_cents)`** only — actuals are observability, not blocking math in V1. |
| **Cliente** cost visibility | Margin-sensitive — Operator serializers only ([SEC] baseline). |
| **Historical backfill migration** | One-off SQL backfill of pre-7.3 rows optional P1; BUILD wires forward path only unless CONTRACT adds lean backfill from existing spend rows with null actual. |
| **Dashboard beyond weekly sum** | Full margin dashboard / charts — US-7.4. |

## Canonical terms (CONTEXT)

Use **Operator**, **Reel**, **Paquete de guion**, **coste real**, **coste estimado**, **evento de gasto**.  
_Evitar:_ exposing raw provider pricing or budget caps to Cliente; client-editable cost fields.

## What prior stories already shipped (do not duplicate)

| Source | Continuity |
|--------|------------|
| US-7.1 | **`neuramark_reel_spend_events`** with **`actual_cost_cents` NULL** today; **`recordReelSpendEvent`** INSERT after successful LLM; cumulative gate uses **estimate only**. |
| US-7.2 | **`logProviderDecision`** stores **estimate-time** audit; actuals are a **separate write** on spend events (SECURITY handoff). |
| US-5.1 | **`getReelScriptsForWeek`** · **`reelScriptListItemSchema`** · **`/operator/scripts`** list — extend DTO with cost summary block. |
| `lib/contracts/providers.ts` | **`llmCompletionResultSchema`** already includes **`inputTokens`**, **`outputTokens`**, **`actualCostCents`**. |

**US-7.3 adds actual-cost persistence from adapter responses, list-column visibility, and weekly actual sum** — not video job table or Reel detail roll-up.

## PO decisions frozen (2026-08-29)

1. **V1 data store:** Backfill **`actual_cost_cents`** on **`neuramark_reel_spend_events`** from **LLM adapter responses** where available — **not** new `video_jobs` columns until US-8.x ships.
2. **Completion semantics:** **`actual_cost_cents` is NULL until the job completes**; LLM jobs complete synchronously — persist actual on the **same INSERT** as the spend event (or immediate UPDATE if INSERT already happened — prefer single INSERT with actual in V1 refactor).
3. **LLM-first scope:** Wire **script + caption** generate/regenerate orchestrators only in BUILD; **document `updateReelSpendEventActual` seam** for US-8.x async video/TTS completion — no `neuramark_video_jobs` dependency in V1.
4. **Operator production list:** **`/operator/scripts`** shows **estimated vs actual** column per slot (cumulative sums for that `reel_script_id`); pending/null actual shows **"—"** or i18n **pending** label.
5. **Weekly aggregate:** Simple **`SUM(actual_cost_cents)`** for **client + weekStart** on the scripts page (footer or header stat) — satisfies AC "dashboard aggregate" without a new route in V1.
6. **Unavailable actual:** When adapter cannot derive cost (missing usage, provider omits billing), keep **`actual_cost_cents` NULL** and set **`actual_cost_unavailable_reason`** (CONTRACT freezes enum, e.g. `usage_missing`, `provider_no_billing`) — satisfies AC "null with failure reason".
7. **Failed jobs:** No spend event today on LLM failure — **out of scope** for "completed job" AC; only **successful** jobs get ledger rows with actual or null+reason.
8. **Token math:** Prefer **catalog `cost_model.unitCostCents` + `billingUnit: per_1m_tokens`** over hardcoded rates; adapter may set **`actualCostCents`** directly when vendor returns billed amount.
9. **No client authority:** **[SEC]** `actual_cost_cents` written **only** by server job-completion path; reject client-supplied cost fields on all mutations (extend US-7.1 forbidden-key list).
10. **Operator-only reads:** Cost summary DTO only on **`requireOperator()`** paths; **`getReelScriptsForWeek`** Operator branch includes cost block — Cliente/shared serializers **omit** cost fields entirely.
11. **Budget gate unchanged:** Cumulative check remains **`estimated_cost_cents`** — actuals do not retroactively block past generations in V1.
12. **Implementers:** **media-pipeline-engineer** + **nextjs-backend** + **nextjs-frontend** (`docs/development/AGENT-ROSTER.md` Phase 4). **No content-agents-engineer** prompt changes.
13. **Module placement (lean):** `lib/cost-policy/compute-llm-actual-cost.ts`, `lib/cost-policy/update-reel-spend-event-actual.ts`, `lib/cost-policy/get-reel-cost-summary-for-week.ts`; extend `record-reel-spend-event.ts`; contracts in `lib/contracts/cost-policy.ts`.
14. **i18n:** EN + ES under **`scripts.cost.actual.*`** (column headers, pending, unavailable reason labels, weekly total).

---

## Gates (orchestrator)

- [ ] SPEC-REVIEW.md (spec-guardian)
- [ ] SECURITY.md (security-architect)
- [ ] CONTRACT.md (nextjs-backend — **Reviewed by FE** before BUILD)
- [ ] BUILD (media-pipeline-engineer + nextjs-backend + nextjs-frontend)
- [ ] VALIDATION.md (requirements-validator)
- [ ] QA.md (qa-engineer)

**Status:** PREP. **Next gate:** SPEC-REVIEW → SECURITY → CONTRACT.
