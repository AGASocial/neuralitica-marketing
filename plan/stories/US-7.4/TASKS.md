# US-7.4 — Report real total cost per Reel

**Priority:** P0  
**Depends on:** US-7.3 ✅ `getReelCostSummaryForWeek` · spend ledger actuals · US-7.1 ✅ `max_cost_cents` · US-5.1 ✅ `ReelDetailPanel` · US-14.5 ✅ `requireOperator()` · US-9.3 ⏳ soft (TTS rows) · US-8.x ⏳ soft (video/B-roll rows)  
**Acceptance criteria:** `plan/USER_STORIES.md` § US-7.4 (source of truth — do **not** redefine; do **not** check off in PREP)  
**Implementers:** **nextjs-backend** + **nextjs-frontend** (`docs/development/AGENT-ROSTER.md` Phase 4). **No media-pipeline-engineer** BUILD slice.  
**Canonical terms:** **Operator** · **Reel** · **Paquete de guion** · **coste real** · **coste estimado** · **presupuesto máximo**. Avoid CONTEXT _Evitar_ list in product-facing copy.

## Out of scope (do not implement here)

- **New spend writes** — US-7.3 / US-8.x / US-9.3 own persistence.
- **`video_jobs` / `media_assets.cost_cents` queries** — spend ledger is canonical; USER_STORIES DB row superseded by US-7.3 freeze.
- **Standalone `/operator/costs` route or charts** — weekly footer on `/operator/scripts` is sufficient for V1.
- **US-8.4 production-list job cost column** — per-job DTO, not Reel roll-up.
- **Cumulative budget gate change** — US-7.1 estimate-only gate unchanged.
- **Cliente** routes — no cost fields on shared payloads ([SEC] response-shape exclusion).
- **Historical SQL backfill** for pre-7.3 null actuals.
- **Provider decision log UI** — optional analytics; not AC.

## Scope split

| Concern | Owner |
|---------|--------|
| Per-Reel aggregation by `asset_role` | **US-7.4** BE |
| `getReelCostDetailForScript` Operator read | **US-7.4** BE |
| Over-budget flag vs `max_cost_cents` | **US-7.4** BE (reads US-7.1 policy) |
| Cost section in `ReelDetailPanel` | **US-7.4** FE |
| Weekly footer / list column totals | **US-7.3** (reuse — no duplicate SUM) |
| Spend event INSERT + actual backfill | **US-7.3** / **US-8.x** / **US-9.3** |
| Budget gate + cap settings | **US-7.1** (unchanged) |

## PO decisions (freeze in CONTRACT unless SECURITY / SPEC vetoes)

| Topic | Decision |
|-------|----------|
| Surface | **`ReelDetailPanel`** expand row on **`/operator/scripts`** — Cost section above script/caption tabs. |
| Data store | **`neuramark_reel_spend_events`** only — GROUP BY `asset_role`. |
| Detail scope | **All events** for `reel_script_id` (lifetime). Weekly footer stays **week-scoped** (US-7.3). |
| Role labels | `llm` · `talking_head`→Video · `broll` · `tts`→Voiceover — hide zero-event roles. |
| V1 BUILD | **LLM-only breakdown** acceptable when video/TTS rows absent; muted phase-B note in UI. |
| Totals | `estimatedTotal` = SUM(estimated); `actualTotal` = SUM(actual) where not null, else null. |
| Variance | Show `actualTotal − estimatedTotal` when actual known; else omit or show estimate-only label. |
| Over-budget | `actualTotal > maxCostCents` when actual exists; else `estimatedTotal > maxCostCents`. |
| Weekly reconciliation | Sum of `costSummary.slots[].actualCostCents` (non-null slots) = `weeklyActualCostCents` — detail per slot **must match** list column for same `reelScriptId`. |
| Load pattern | PO lean: batch **`reelCostDetails`** on **`getReelScriptsForWeek`** — CONTRACT may allow lazy expand fetch. |
| Tenancy | `clientId` from **`requireOperator().id`** only — parameterized query scoped to `client_id` + `reel_script_id`. |
| Forbidden client fields | No new mutation paths; extend read-path forbidden-key tests for cost roll-up DTOs on Cliente routes. |
| i18n | **`scripts.cost.rollup.*`** EN + ES. |

### Reel cost detail DTO sketch (CONTRACT freezes Zod + exact names)

```ts
export const reelCostRoleKeySchema = z.enum([
  "llm",
  "talking_head",
  "broll",
  "tts",
]);

export const reelCostRoleBreakdownSchema = z
  .object({
    role: reelCostRoleKeySchema,
    estimatedCostCents: z.number().int().nonnegative(),
    actualCostCents: z.number().int().nonnegative().nullable(),
    eventCount: z.number().int().nonnegative(),
    hasPendingActual: z.boolean(),
  })
  .strict();

export const reelCostDetailSchema = z
  .object({
    reelScriptId: z.string().uuid(),
    clientId: z.string().uuid(),
    estimatedTotalCents: z.number().int().nonnegative(),
    actualTotalCents: z.number().int().nonnegative().nullable(),
    varianceCents: z.number().int().nullable(), // actualTotal - estimated when actual known
    hasPendingActual: z.boolean(),
    maxCostCents: z.number().int().positive(),
    isOverBudget: z.boolean(),
    breakdown: z.array(reelCostRoleBreakdownSchema),
  })
  .strict();

export type ReelCostDetail = z.infer<typeof reelCostDetailSchema>;
```

### Aggregation sketch (BE)

```ts
export async function getReelCostDetailForScript(params: {
  clientId: string;
  reelScriptId: string;
}): Promise<ReelCostDetail | null> {
  // requireOperator() at call site
  // SELECT asset_role, estimated_cost_cents, actual_cost_cents
  //   FROM neuramark_reel_spend_events
  //  WHERE client_id = $clientId AND reel_script_id = $reelScriptId
  // GROUP BY asset_role in application layer (or SQL GROUP BY)
  // maxCostCents from getCostPolicyForClient(clientId)
  // isOverBudget per PO rules
}
```

### Reconciliation invariant (tests)

```ts
// For each slot with reelScriptId in week:
detail.estimatedTotalCents === costSummary.slots[i].estimatedCostCents
detail.actualTotalCents === costSummary.slots[i].actualCostCents

// Week level (US-7.3 already tested):
sum(slots[].actualCostCents where not null) === weeklyActualCostCents
```

## Carry-forwards / reuse (do not reinvent)

- Weekly + slot totals: `lib/cost-policy/get-reel-cost-summary-for-week.ts` · `reelWeekCostSummarySchema`.
- Policy cap: `lib/cost-policy/get-cost-policy-for-client.ts`.
- List load: `lib/reel-scripts/actions/get-reel-scripts-for-week.ts`.
- Contracts: `lib/contracts/actual-cost.ts` · `lib/contracts/cost-policy.ts`.
- Detail UI shell: `components/scripts/ScriptsPageView.tsx` → `ReelDetailPanel`.
- Cost column / footer patterns: `ScriptsPageView.tsx` (`WeeklyCostFooter`, cost column).
- Operator gate: `requireOperator()` from US-14.5.
- Spend ledger DDL: `supabase/migrations/20260830510000_neuramark_reel_spend_events.sql`.
- Security baseline: forbidden keys · response-shape exclusion (US-7.1 / US-7.3 matrices).

---

## FE checklist

Concrete BE consumers: **`getReelCostDetailForScript`** or **`reelCostDetails`** map on **`getReelScriptsForWeek`**.

- [x] **`ReelCostSection`** component — embedded in **`ReelDetailPanel`** below `ProviderRecommendationPanel`, above `TabView`.
- [x] **Total row** — formatted estimated vs actual (currency); **variance** when actual known (signed, color-coded subdued).
- [x] **Breakdown table** — one row per role with events; role labels via i18n (`llm`, `video`, `broll`, `voiceover`).
- [x] **Over-budget highlight** — when `isOverBudget`, show warning banner/badge comparing total to `maxCostCents` (formatted).
- [x] **Pending actual** — role/total shows pending label when `hasPendingActual` (reuse US-7.3 pending copy pattern where possible).
- [x] **Empty state** — no spend events: **"—"** + short explanation (no generation yet).
- [x] **V1 LLM-only note** — when breakdown length === 1 && role === llm, optional muted helper text (phase B).
- [x] **Loading / error** if lazy-fetch on expand; otherwise inherit list loading.
- [x] **EN + ES** `scripts.cost.rollup.*` (section title, totals, variance, overBudget, roles, empty, pending, phaseNote).
- [x] **No Supabase in Client Components**; no client-side cost math.
- [x] **No Cliente** cost fields on any shared route.
- [x] **Read-only** — no inline edit.

---

## BE checklist

Concrete FE consumers: **`ReelCostSection`** · optional consistency check with list cost column.

- [x] **`lib/contracts/actual-cost.ts`** — add `reelCostRoleBreakdownSchema`, `reelCostDetailSchema`, input schema.
- [x] **`getReelCostDetailForScript({ clientId, reelScriptId })`** — server-only; parameterized tenant scope; return null when script not found or tenant mismatch.
- [x] **Aggregation** — SUM estimated/actual per `asset_role`; compute totals, variance, `hasPendingActual`, `eventCount`.
- [x] **`maxCostCents`** — load via **`getCostPolicyForClient(clientId)`**; compute **`isOverBudget`** per PO rules.
- [x] **Attach to list load** — extend **`getReelScriptsForWeek`** with **`reelCostDetails: Record<uuid, ReelCostDetail>`** for slots with `reelScriptId` (PO lean) **or** export gated Server Action for expand (CONTRACT picks).
- [x] **Reconciliation** — detail totals **match** `costSummary.slots[slotIndex]` for same script (same aggregation rules as US-7.3 per-slot SUM).
- [x] **[SEC] Operator-only** — `requireOperator()` before any cost detail read; 403 for non-operator.
- [x] **[SEC] Tenancy** — query always filters `client_id`; foreign `reelScriptId` → empty/null, never leak other tenant rows.
- [x] **[SEC] Response-shape** — cost detail DTO **only** on Operator serializers; strip from any shared/Cliente code path.
- [x] **Automated tests:** per-role breakdown; totals; over-budget true/false; null actual total; tenant isolation; reconciliation with `getReelCostSummaryForWeek` fixture; forbidden keys on Cliente-facing loaders.

---

## DB checklist

All objects keep `neuramark_` prefix. **No migration required** unless CONTRACT adds index for `(client_id, reel_script_id, asset_role)` — evaluate in CONTRACT.

- [x] **No CREATE tables** — query existing **`neuramark_reel_spend_events`**.
- [x] **Optional index** — `(client_id, reel_script_id)` already exists (`neuramark_reel_spend_events_client_reel_idx`); confirm EXPLAIN in CONTRACT if needed.
- [x] RLS deny-by-default unchanged; service-role Node only.

---

## Gates (orchestrator)

- [ ] SPEC-REVIEW.md (spec-guardian)
- [ ] SECURITY.md (security-architect)
- [ ] CONTRACT.md authored (nextjs-backend — **Reviewed by FE** before BUILD)
- [ ] BUILD (nextjs-backend + nextjs-frontend)
- [ ] VALIDATION.md (requirements-validator)
- [ ] QA.md (qa-engineer)

**Status:** PREP (2026-08-29). **Next:** spec-guardian → security-architect → CONTRACT.

---

## Open questions (for SPEC / SECURITY / CONTRACT)

1. **`video_jobs` vs spend ledger in USER_STORIES DB row — reconcile?** **PO lean:** **spend ledger only** (US-7.3 freeze); amend USER_STORIES DB row at VALIDATION if needed.
2. **Batch vs lazy load for `reelCostDetails`?** **PO lean:** **batch on `getReelScriptsForWeek`** (max 7 slots) — lazy if CONTRACT flags payload size.
3. **Over-budget uses actual or estimate when partial actual?** **PO lean:** **actual total** when any actual recorded; else **estimated total** — avoids false green when only LLM actual known but video still pending.
4. **Show zero-cost manual rows (US-8.3)?** **PO lean:** include in breakdown with **$0.00 actual** when spend row exists with `actual_cost_cents = 0`.
5. **Variance sign display?** **PO lean:** positive variance = over estimate (warn color); negative = under estimate (success subdued).
6. **Failed attempts without spend rows?** **PO lean:** **not in roll-up** — matches US-7.3; AC "failed attempts" = billable retries with ledger rows when US-8.4 ships.
7. **Reconciliation AC scope?** **PO lean:** weekly sum reconciles **sum of per-Reel slot totals in week**, not lifetime detail totals vs weekly footer.
8. **Attach `maxCostCents` to detail DTO or FE loads settings separately?** **PO lean:** **include in `ReelCostDetail`** — one round-trip, server-resolved policy.
9. **i18n reuse vs new keys?** **PO lean:** new **`scripts.cost.rollup.*`** namespace; reuse **`scripts.cost.actual.pending`** where identical.
10. **Phase B auto-expand breakdown?** **PO lean:** no FE changes when US-8.x adds rows — same query surfaces new roles.

No SPEC amendment assumed in PREP: SPEC §3 Cost Policy Engine requires true unit economics per Reel — US-7.4 is the Operator read surface over US-7.3 actuals.
