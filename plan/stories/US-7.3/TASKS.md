# US-7.3 — Track actual cost per generation job

**Priority:** P0  
**Depends on:** US-7.2 ✅ spend events + policy engine · US-7.1 ✅ `neuramark_reel_spend_events` · US-5.1 ✅ `/operator/scripts` · US-14.5 ✅ `requireOperator()` · US-8.4 ⏳ soft (video UI deferred)  
**Acceptance criteria:** `plan/USER_STORIES.md` § US-7.3 (source of truth — do **not** redefine; do **not** check off in PREP)  
**Implementers:** **media-pipeline-engineer** + **nextjs-backend** + **nextjs-frontend** (`docs/development/AGENT-ROSTER.md` Phase 4). DB migrations under BE. **No content-agents-engineer** BUILD slice.  
**Canonical terms:** **Operator** · **Reel** · **Paquete de guion** · **coste real** · **coste estimado**. Avoid CONTEXT _Evitar_ list in product-facing copy.

## Out of scope (do not implement here)

- **`neuramark_video_jobs` table / columns** — USER_STORIES DB row references `video_jobs.*`; V1 canonical store is **`neuramark_reel_spend_events`** until US-8.2+.
- **US-8.4** status badges, retry UI, stale-job timeout — async completion wiring is **seam export only**.
- **US-8.x** video/TTS/B-roll spend event INSERT + actual backfill on poll/webhook — CONTRACT documents **`updateReelSpendEventActual`**; no adapter I/O in BUILD.
- **US-7.4** Reel detail cost section, variance highlight, component breakdown.
- **US-9.3** TTS actual cost persistence.
- **Cumulative budget gate on actuals** — US-7.1 continues **`SUM(estimated_cost_cents)`** only.
- **Cliente** routes — no cost fields on shared payloads ([SEC] response-shape exclusion).
- **Full margin dashboard / charts** — weekly sum on scripts page only in V1.
- **One-off historical SQL backfill** — optional P1 unless CONTRACT adds lean forward-only scope.

## Scope split

| Concern | Owner |
|---------|--------|
| Token → cents from LLM result + catalog | **US-7.3** BE (media-pipeline-engineer) |
| `recordReelSpendEvent` with `actualCostCents` | **US-7.3** BE |
| `updateReelSpendEventActual` async seam | **US-7.3** BE (exported, not wired) |
| `getReelCostSummaryForWeek` Operator read | **US-7.3** BE |
| Estimated vs actual column on `/operator/scripts` | **US-7.3** FE |
| Weekly actual sum footer | **US-7.3** FE |
| Spend ledger DDL + optional `actual_cost_unavailable_reason` | **US-7.3** DB |
| Policy engine + decision log | **US-7.2** (unchanged) |
| Budget gate + cumulative estimate | **US-7.1** (unchanged) |
| Video job create + completion handler | **US-8.x** (calls `updateReelSpendEventActual`) |

## PO decisions (freeze in CONTRACT unless SECURITY / SPEC vetoes)

| Topic | Decision |
|-------|----------|
| V1 data store | **`neuramark_reel_spend_events.actual_cost_cents`** — backfill from adapter responses; **no** `video_jobs` columns in BUILD. |
| NULL until complete | **`actual_cost_cents` NULL** until job completes; LLM = synchronous → persist on spend INSERT. |
| LLM-first | Script + caption orchestrators only in BUILD; video/TTS deferred with exported completion helper. |
| Production list | **`/operator/scripts`** — per-slot **estimated vs actual** (cumulative per `reel_script_id`). |
| Weekly aggregate | **`SUM(actual_cost_cents)`** for `clientId` + `weekStart` on scripts page (simple footer/header). |
| Unavailable actual | NULL + **`actual_cost_unavailable_reason`** enum when usage/billing missing (AC: null with reason). |
| Failed LLM | No spend row — only successful jobs in ledger. |
| Token math | Catalog **`cost_model`** (`per_1m_tokens`) × tokens; adapter may override with vendor-reported cents. |
| Budget gate | **Estimate-only** cumulative — actuals observability only in V1. |
| Forbidden client fields | Extend US-7.1 list: reject **`actualCostCents`**, **`actual_cost_cents`**, **`estimatedCostCents`** on mutations. |
| Operator DTO | **`estimatedCostCents`**, **`actualCostCents`**, **`actualPending`**, **`unavailableReasonKey?`** per slot — no raw catalog pricing. |
| Implementers | **media-pipeline-engineer** + **nextjs-backend** + **nextjs-frontend**. |
| i18n | **`scripts.cost.actual.*`** EN + ES. |

### LLM actual-cost sketch (CONTRACT freezes Zod + exact names)

```ts
export type ComputeLlmActualCostInput = {
  providerKey: string;
  inputTokens: number;
  outputTokens: number;
  adapterReportedCents?: number; // when adapter already computed
};

export async function computeLlmActualCost(
  input: ComputeLlmActualCostInput,
): Promise<
  | { ok: true; actualCostCents: number }
  | { ok: false; reason: ActualCostUnavailableReason }
> {
  // Load catalog row for providerKey; if billingUnit per_1m_tokens:
  //   ceil((inputTokens + outputTokens) / 1_000_000 * unitCostCents)
  // Prefer adapterReportedCents when > 0 and trustworthy (CONTRACT freezes)
}

export type ActualCostUnavailableReason =
  | "usage_missing"
  | "catalog_cost_model_unsupported"
  | "provider_no_billing";
```

### Spend event persist sketch (LLM synchronous path)

```ts
// After successful LLM + persist script/caption:
const actual = await computeLlmActualCost({
  providerKey: gate.providerKey,
  inputTokens: llmResult.inputTokens,
  outputTokens: llmResult.outputTokens,
  adapterReportedCents: llmResult.actualCostCents,
});

await recordReelSpendEvent({
  clientId,
  reelScriptId,
  assetRole: "llm",
  jobKind: spendJobKind,
  estimatedCostCents: gate.estimatedCostCents,
  actualCostCents: actual.ok ? actual.actualCostCents : null,
  actualCostUnavailableReason: actual.ok ? null : actual.reason,
  operatorClientId,
  providerKey: gate.providerKey,
});
```

### Async completion seam (US-8.x — not wired in V1 BUILD)

```ts
export async function updateReelSpendEventActual(params: {
  spendEventId: string;
  actualCostCents: number | null;
  actualCostUnavailableReason?: ActualCostUnavailableReason | null;
}): Promise<{ ok: true } | { ok: false; code: "NOT_FOUND" }> {
  // Server-only UPDATE by id; called from video job completion poller (US-8.x)
}
```

### Cost summary DTO sketch (FE production list)

```ts
export type ReelSlotCostSummary = {
  reelScriptId: string | null;
  slotIndex: number;
  estimatedCostCents: number; // SUM(estimated) for reel_script_id
  actualCostCents: number | null; // SUM(actual) where not null; null if all events pending
  hasPendingActual: boolean; // any event with actual_cost_cents IS NULL
  unavailableReasonKeys: ActualCostUnavailableReason[]; // distinct reasons when actual null
};

export type ReelWeekCostSummary = {
  weekStart: string;
  clientId: string;
  slots: ReelSlotCostSummary[];
  weeklyEstimatedCostCents: number;
  weeklyActualCostCents: number | null; // null when no actuals recorded yet
};
```

## Carry-forwards / reuse (do not reinvent)

- Spend ledger: `lib/cost-policy/record-reel-spend-event.ts` · migration `20260830510000_neuramark_reel_spend_events.sql`.
- Cumulative sum: `lib/cost-policy/sum-reel-cumulative-cost-cents.ts` (estimate path — add parallel actual sum helper).
- Orchestrators: `lib/reel-scripts/generate-reel-scripts-for-client.ts` · `lib/reel-captions/generate-reel-captions-for-client.ts`.
- LLM adapters: `lib/providers/siliconflow-llm-adapter.ts` · `lib/providers/llm/stub-llm-adapter.ts`.
- LLM result schema: `lib/contracts/providers.ts` → `llmCompletionResultSchema`.
- List load: `getReelScriptsForWeek` · `reelScriptListItemSchema` in `lib/contracts/reel-script.ts`.
- Scripts UI: `components/scripts/ScriptsPageView.tsx`.
- Operator gate: `requireOperator()` from US-14.5.
- Forbidden keys: US-7.1 cost-policy action helpers.

---

## FE checklist

Concrete BE consumers: **`getReelCostSummaryForWeek`** (or cost block on **`getReelScriptsForWeek`**) · extended list DTO.

- [x] **Estimated vs actual column** on `/operator/scripts` production list — per slot: show cumulative estimate + actual (formatted cents → currency); **pending** when `hasPendingActual`.
- [x] **Unavailable reason** — when actual null with reason, show subdued i18n label (not raw enum string to Operator).
- [x] **Weekly actual total** — footer or header stat: `weeklyActualCostCents` with estimate alongside for context.
- [x] **Empty / pending states** — slots without spend events show **—**; generated but pre-7.3 rows may have null actual until regenerated.
- [x] **Loading / error** states for cost summary fetch (if separate from list load).
- [x] **EN + ES** `scripts.cost.actual.*` (column header, estimate label, actual label, pending, weekly total, unavailable reasons).
- [x] **No Supabase in Client Components**; no client-side cost math.
- [x] **No Cliente** cost fields on any shared route or serializer.
- [x] **Read-only** — no inline edit of actual costs.

---

## BE checklist

Concrete FE consumers: production list column · weekly footer.

- [ ] **Migration (if needed):** `actual_cost_unavailable_reason` nullable text + CHECK enum on **`neuramark_reel_spend_events`** (CONTRACT freezes values).
- [ ] **`lib/contracts/cost-policy.ts`** — Zod for `ActualCostUnavailableReason`, `ReelSlotCostSummary`, `ReelWeekCostSummary`, extended `recordReelSpendEvent` params.
- [ ] **`computeLlmActualCost(input)`** — catalog-driven token math; fail with reason when usage missing.
- [ ] **Fix `SiliconFlowLlmAdapter.complete`** — compute `actualCostCents` from usage + catalog (replace placeholder `0`).
- [ ] **Extend `recordReelSpendEvent`** — accept `actualCostCents` + `actualCostUnavailableReason`; remove `actualCostCents?: null` restriction.
- [ ] **`updateReelSpendEventActual(params)`** — server-only UPDATE by `spendEventId`; export for US-8.x; **not called** in V1 BUILD except tests.
- [ ] **`sumReelActualCostCents(reelScriptId)`** — SUM where not null; handle all-null → null aggregate.
- [ ] **`getReelCostSummaryForWeek({ clientId, weekStart })`** — operator-gated; join spend events to week's scripts by `reel_script_id`; return `ReelWeekCostSummary`.
- [ ] **Wire orchestrators** — pass LLM `inputTokens`/`outputTokens`/`actualCostCents` through to `computeLlmActualCost` + `recordReelSpendEvent`.
- [ ] **Extend `getReelScriptsForWeek`** (or companion loader) — attach cost summary to Operator response only.
- [ ] **[SEC] Forbidden fields** — reject `actualCostCents`, `actual_cost_cents` on generate/regenerate actions.
- [ ] **[SEC] Operator-only** — `requireOperator()` on cost summary reads; strip cost from any Cliente code path.
- [ ] **Export seam** — document **`updateReelSpendEventActual`** in CONTRACT for US-8.2+ job completion handler.
- [ ] **Automated tests:** `computeLlmActualCost` token math; spend INSERT with actual; null+reason when usage missing; forbidden client `actualCostCents`; operator-only summary; weekly SUM; `updateReelSpendEventActual` unit test (seam).

---

## DB checklist

All objects keep `neuramark_` prefix. Migrations via Supabase migrations only.

- [ ] **ALTER** **`neuramark_reel_spend_events`** — add **`actual_cost_unavailable_reason`** nullable (CONTRACT freezes enum CHECK) if column not present.
- [ ] **No CREATE** **`neuramark_video_jobs`** — deferred to US-8.2.
- [ ] RLS deny-by-default unchanged; service-role Node only.
- [ ] Index: consider `(client_id, created_at)` for weekly SUM if list query needs it (CONTRACT decides — may reuse existing indexes).

---

## Gates (orchestrator)

- [ ] SPEC-REVIEW.md (spec-guardian)
- [ ] SECURITY.md (security-architect)
- [x] CONTRACT.md authored (nextjs-backend — **Reviewed by FE** before BUILD)
- [ ] BUILD (media-pipeline-engineer + nextjs-backend + nextjs-frontend)
- [ ] VALIDATION.md (requirements-validator)
- [ ] QA.md (qa-engineer)

**Status:** CONTRACT frozen — awaiting FE signoff. **Next gate:** BUILD (Phase A LLM-first).

---

## Open questions (for SPEC / SECURITY / CONTRACT)

1. **`video_jobs` vs spend ledger in USER_STORIES DB row — reconcile?** **PO lean:** SPEC-REVIEW notes **spend ledger is V1 canonical**; `video_jobs` cost columns land with US-8.2 DDL; US-7.3 AC "every completed job" satisfied for **LLM spend events** in BUILD.
2. **Single INSERT vs INSERT+UPDATE for LLM?** **PO lean:** **single INSERT** with actual after LLM returns (orchestrator already records post-success) — simpler than two-phase.
3. **`actual_cost_unavailable_reason` — enum text vs jsonb?** **PO lean:** **nullable text** with CHECK constraint on closed enum (`usage_missing`, `catalog_cost_model_unsupported`, `provider_no_billing`).
4. **List column — latest event vs cumulative?** **PO lean:** **cumulative SUM** per `reel_script_id` (matches budget gate semantics across retries).
5. **Weekly actual NULL when all events pending?** **PO lean:** **`weeklyActualCostCents: null`** when zero rows have actual; show "—" in UI; partial week shows sum of known actuals only (CONTRACT may add `partialActual` flag).
6. **Adapter-reported vs computed precedence?** **PO lean:** use **`adapterReportedCents`** when **> 0**; else compute from tokens; if both fail → null + reason.
7. **SiliconFlow usage missing — block job or record null actual?** **PO lean:** **record null actual + reason** — job already succeeded; observability gap only.
8. **Attach cost to `getReelScriptsForWeek` vs separate action?** **PO lean:** **extend same Operator loader** (one round-trip) — mirror US-7.2 recommendation batch pattern.
9. **Historical rows (pre-7.3) with null actual?** **PO lean:** show **pending** in UI; optional P1 backfill script out of BUILD scope.
10. **Fail closed on spend UPDATE failure (US-7.1 M2)?** **PO lean:** propagate INSERT/UPDATE errors from actual persist — do not swallow (inherit US-7.1 QA note).

No SPEC amendment assumed in PREP: SPEC §3 Cost Policy Engine requires learning true unit economics — US-7.3 implements the spend-ledger actual-cost slice for LLM jobs; US-8.x extends to async video/TTS completion.
