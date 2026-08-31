# US-7.3 — Track actual cost per generation job

**Priority:** P0  
**Depends on:** US-7.2 ✅ · US-7.1 ✅ · US-5.1 ✅ · US-14.5 ✅ · **US-8.4 ✅** · US-8.2/8.6/8.7 ✅ · US-8.5 ✅ · US-8.3 ✅ · US-9.3 ✅ · US-7.4 Phase A ✅ (consumer). Phase A ✅.  
**Acceptance criteria:** `plan/USER_STORIES.md` § US-7.3 (source of truth — do **not** redefine; do **not** uncheck Phase A AC; Phase B adds **no** new checkboxes)  
**Implementers (Phase B):** **media-pipeline-engineer** + **nextjs-backend** + thin **nextjs-frontend**. DB: none expected. **No content-agents-engineer.**  
**Canonical terms:** **Operator** · **Reel** · **Paquete de guion** · **coste real** · **coste estimado**. Avoid CONTEXT _Evitar_ list in product-facing copy.  
**Phase B doc:** [`PHASE-B.md`](./PHASE-B.md). **Branch:** `feature/US-7.3-phase-b-spend-backfill`. **CONTRACT Phase B amendment required** (do not rewrite Phase A CONTRACT).

## Out of scope (do not implement here)

### Phase B (binding)

- **`/operator/production`** — does not exist; US-8.4 lives on **`/operator/scripts`**.
- **New USER_STORIES checkboxes** / unchecking Phase A AC.
- **Rewrite Phase A CONTRACT.md** — amendment section only (BE gate).
- **US-7.4 BUILD** — roll-up auto-picks new `asset_role` rows.
- **Migrate TTS** from `recordReelSpendEvent` to `finalizeGenerationCost`.
- **Failed/cancelled spend UPDATE** / invented billed cost.
- **`ltx_broll_high`**, ElevenLabs TTS, assembly/branding spend, QA cost rewrite.
- **B-roll per-clip cost UI** / TTS panel chip (rollup + slot column suffice).
- **Budget gate on actuals** · **Cliente** cost fields · **new tables**.
- **Historical SQL backfill**.

### Phase A (historical — still out of Phase A BUILD; several now CLOSED upstream)

- **`neuramark_video_jobs` DDL** — shipped US-8.2+; Phase B does not add reporting columns as canonical store.
- Phase A deferred video/TTS wiring — **this Phase B checklist** (do not re-open Phase A items).

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

## Phase B PO freezes (binding — full table in PHASE-B.md)

| Topic | Decision |
|-------|----------|
| Story ID | **US-7.3-B** (same story Phase B) |
| Ledger | **`neuramark_reel_spend_events`** canonical; `video_jobs.actual_cost_cents` **mirror only** |
| Actual writer | **`finalizeGenerationCost`** for video `async_update` + manual 0; **TTS INSERT exception** stays |
| Fail path | **No** spend UPDATE on fail/cancel |
| FE | Existing **`OperatorVideoJobSummaryPanel`**; refresh cost on poll; **no** new production route |
| US-7.4 | Query **unchanged** |
| Gate | Estimate-only |

---

## Phase B checklist (PREP — unchecked)

### Frontend (nextjs-frontend) — Phase B

**Surface:** `/operator/scripts` expand — **`OperatorVideoJobSummaryPanel`** (cost labels already exist). **Do not** add `/operator/production`.

- [x] After video job **completes**, panel **actual** updates without requiring a full page reload (today `GET /api/video-jobs/[jobId]` is status-only; `mergePolledStatus` drops `cost`).
- [x] Consume CONTRACT Phase B poll/summary DTO — **no** client-side cents math; reuse `formatCentsForDisplay` + existing `scripts.videoJob` / `scripts.cost.actual.*` keys.
- [x] EN + ES only if CONTRACT adds keys; pending / unavailable / `$0` manual still readable.
- [x] **No** Cliente cost UI. **No** B-roll clip strip. **No** TTS panel chip (rollup is the TTS/B-roll surface).
- [x] **CONTRACT Phase B Reviewed by FE** line after amendment (gate, not this PREP).

### Backend / API (nextjs-backend) — Phase B

**Concrete consumers:** Operator video panel · weekly slot sum · US-7.4 rollup (read-only).

- [x] **CONTRACT.md Phase B amendment** — call-site table, TTS exception, poll `cost` DTO, duration on `async_update`; **Reviewed by FE** before BUILD (awaiting nextjs-frontend SIGNOFF).
- [x] Pass **`durationSec`** into `finalizeGenerationCost({ mode: "async_update" })` when persist/probe has duration; else null.
- [x] Completed spend row: actual **or** closed `actualCostUnavailableReason` — never null/null after successful complete.
- [x] Missing `spendEventId` on complete: log; **do not** invent a late INSERT of actual-only.
- [x] **TTS trusted path:** persist `durationSec` on spend INSERT (Operator path already does).
- [x] **Do not** rewrite manual upload `finalizeGenerationCost` (already actual 0).
- [x] **Do not** migrate TTS to `finalizeGenerationCost` this slice.
- [x] Operator poll route: include **`OperatorProductionJobCostDto`** (or freeze equivalent) — **`requireOperator` already**; **no** cost on Cliente payloads.
- [x] Grep/tests: no client request Zod accepts `actualCostCents`; video/TTS forbidden keys still reject.
- [x] Tests: poller complete → ledger actual; fail/cancel → estimate-only unchanged; duration set when known; TTS trusted duration; poll DTO Operator-only. (BE: TTS trusted duration, poll DTO Operator-only, forbidden keys, Cliente 403, weekly/rollup/budget grep. Poller complete/fail/cancel/duration remain media.)

### Worker / media pipeline (media-pipeline-engineer) — Phase B

- [x] Confirm talking-head / HeyGen / Wan **`fetchAsset.actualCostCents`** reaches `persistVideoJobOutputAsset` → poller `async_update` (adapters already return catalog/estimate cents).
- [x] Wan B-roll complete uses the **same** `applyVideoJobStatusUpdate` path (no second writer).
- [x] **No** new adapter (`ltx_broll_high` out). **No** FFmpeg / branding spend.
- [x] Unit/golden: complete with `spendEventId` updates spend actual; fail does not.

### Database — Phase B

- [x] **None** — reuse `neuramark_reel_spend_events.duration_sec` / `actual_cost_unavailable_reason` (Phase A migration).

---

## Agent routing summary

### Phase A (CLOSED)
| Agent | Owns |
|-------|------|
| **media-pipeline-engineer** | LLM token math, SiliconFlow actual, `updateReelSpendEventActual` seam |
| **nextjs-backend** | DDL, `finalizeGenerationCost` sync, weekly summary, forbidden keys |
| **nextjs-frontend** | `/operator/scripts` cost column + weekly footer |

### Phase B (this PREP)
| Agent | Owns |
|-------|------|
| **media-pipeline-engineer** | Adapter actual → persist → poller; Wan complete path tests |
| **nextjs-backend** | CONTRACT Phase B; `durationSec` async_update; TTS trusted duration; poll cost DTO |
| **nextjs-frontend** | Thin: merge/poll cost on `OperatorVideoJobSummaryPanel` |
| **spec-guardian** | SPEC-REVIEW Phase B |
| **security-architect** | SECURITY amend (TTS exception, poll cost Operator-only) |

---

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
- Phase B reuse: `lib/cost-policy/finalize-generation-cost.ts` · `apply-video-job-status-update.ts` · `build-operator-production-job-cost.ts` · `OperatorVideoJobSummaryPanel.tsx` · TTS `recordReelSpendEvent` · `upload-manual-video-job.ts`.

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

- [x] **Migration (if needed):** `actual_cost_unavailable_reason` nullable text + CHECK enum on **`neuramark_reel_spend_events`** (CONTRACT freezes values).
- [x] **`lib/contracts/cost-policy.ts`** — Zod for `ActualCostUnavailableReason`, `ReelSlotCostSummary`, `ReelWeekCostSummary`, extended `recordReelSpendEvent` params.
- [x] **`computeLlmActualCost(input)`** — catalog-driven token math; fail with reason when usage missing.
- [x] **Fix `SiliconFlowLlmAdapter.complete`** — compute `actualCostCents` from usage + catalog (replace placeholder `0`).
- [x] **Extend `recordReelSpendEvent`** — accept `actualCostCents` + `actualCostUnavailableReason`; remove `actualCostCents?: null` restriction.
- [x] **`updateReelSpendEventActual(params)`** — server-only UPDATE by `spendEventId`; export for US-8.x; **not called** in V1 BUILD except tests.
- [x] **`sumReelActualCostCents(reelScriptId)`** — inlined in `getReelCostSummaryForWeek` (standalone helper deferred — see QA L1).
- [x] **`getReelCostSummaryForWeek({ clientId, weekStart })`** — operator-gated; join spend events to week's scripts by `reel_script_id`; return `ReelWeekCostSummary`.
- [x] **Wire orchestrators** — pass LLM `inputTokens`/`outputTokens`/`actualCostCents` through to `finalizeGenerationCost` → `computeLlmActualCost` + `recordReelSpendEvent`.
- [x] **Extend `getReelScriptsForWeek`** (or companion loader) — attach cost summary to Operator response only.
- [x] **[SEC] Forbidden fields** — reject `actualCostCents`, `actual_cost_cents` on generate/regenerate actions.
- [x] **[SEC] Operator-only** — `requireOperator()` on cost summary reads; strip cost from any Cliente code path.
- [x] **Export seam** — document **`updateReelSpendEventActual`** in CONTRACT for US-8.2+ job completion handler.
- [x] **Automated tests:** `computeLlmActualCost` token math; spend INSERT with actual; null+reason when usage missing; forbidden client `actualCostCents`; operator-only summary; weekly SUM; `updateReelSpendEventActual` unit test (seam). **Read path:** `get-reel-cost-summary-for-week.test.ts` + forbidden-key tests in `cost-policy.test.ts` ✅

---

## DB checklist

All objects keep `neuramark_` prefix. Migrations via Supabase migrations only.

- [x] **ALTER** **`neuramark_reel_spend_events`** — add **`actual_cost_unavailable_reason`** nullable (CONTRACT freezes enum CHECK) if column not present.
- [x] **No CREATE** **`neuramark_video_jobs`** — deferred to US-8.2.
- [x] RLS deny-by-default unchanged; service-role Node only.
- [x] Index: `(client_id, created_at)` for weekly SUM — `neuramark_reel_spend_events_client_created_at_idx`.

---

## Gates (orchestrator)

- [x] SPEC-REVIEW.md (spec-guardian — GAPS)
- [x] SECURITY.md (security-architect — APPROVE WITH CONDITIONS)
- [x] CONTRACT.md authored (nextjs-backend — frozen `f6038e9`; **Reviewed by FE** before BUILD)
- [x] BUILD (media-pipeline-engineer + nextjs-backend + nextjs-frontend — Phase A LLM)
- [x] VALIDATION.md (requirements-validator — PASS WITH NOTES)
- [x] QA.md (qa-engineer — APPROVE WITH NOTES after `f60579d`)

**Status:** CLOSED (2026-08-29). Phase A complete; 4/4 AC checked in `plan/USER_STORIES.md`.

### Phase B — PREP 2026-08-31
- [x] PREP — [`PHASE-B.md`](./PHASE-B.md) + this Phase B checklist
- [x] SPEC-REVIEW.md amendment (spec-guardian)
- [x] SECURITY.md amendment (security-architect)
- [x] CONTRACT.md Phase B + Reviewed by FE (nextjs-backend → nextjs-frontend)
- [x] BUILD (media-pipeline-engineer ∥ nextjs-backend ∥ thin nextjs-frontend)
- [ ] VALIDATION Phase B — Phase A AC stay [x]; re-verify [SEC]
- [ ] QA Phase B

**Next:** requirements-validator **VALIDATION** (Phase B).

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

**Phase B open questions:** resolved in [`PHASE-B.md`](./PHASE-B.md) (no remaining PO-unleaned items). SPEC-REVIEW Phase B should confirm spend-ledger canonical + `/operator/scripts` surface vs CONTRACT's historical `/operator/production` name.
