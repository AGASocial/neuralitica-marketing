# API Contract — US-7.4 Report real total cost per Reel

**Story:** US-7.4  
**Status:** Frozen — 2026-08-29 (awaiting FE signoff)  
**Security:** `plan/stories/US-7.4/SECURITY.md` (APPROVE WITH CONDITIONS — reconciled below)  
**Spec review:** `plan/stories/US-7.4/SPEC-REVIEW.md` (GAPS — resolved by this contract)  
**Depends on:** US-7.3 ✅ spend ledger + `getReelCostSummaryForWeek` · US-7.1 ✅ `getCostPolicyForClient` + `max_cost_cents` · US-5.1 ✅ `/operator/scripts` + `ReelDetailPanel` · US-14.5 ✅ `requireOperator()` · US-7.3 Phase B ⏳ soft (video/TTS actuals) · US-8.x ⏳ soft (video/B-roll spend rows) · US-9.3 ⏳ soft (TTS spend rows)  
**Identity seam:** `lib/auth/get-current-user.ts` / `requireOperator()` (unchanged)  
**Feature branch:** `feature/US-7.4-reel-cost-rollup`  
**Error envelope style:** same class as US-5.1 / US-7.3 (`ok: true` vs `{ ok: false, error: { code, fields?, messageKey? } }`)

**This document is CONTRACT ONLY.** Zod below is the BUILD sketch for extensions to `lib/contracts/actual-cost.ts` and `lib/contracts/reel-script.ts`, new modules under `lib/cost-policy/`, and FE `ReelCostRollupPanel` in `ReelDetailPanel`.

**Terminology:** **Costo estimado** · **Costo real** · **Varianza** · **Desglose por componente** · **Presupuesto máximo** · **Operator** · **Reel** · **Paquete de guion**. Technical enums (`assetRole`, `getReelCostRollupForScript`) OK in code/DB. Do **not** use CONTEXT _Evitar_ terms in product-facing strings.

**USER_STORIES DB row amendment (binding):** The BE/DB row “query over `video_jobs` + TTS asset costs (`media_assets.cost_cents`)” is **superseded**. Canonical reporting store is **`neuramark_reel_spend_events` only** (US-7.3 freeze). No new tables; no parallel SUM from `neuramark_video_jobs` or `media_assets.cost_cents`.

---

## SPEC-REVIEW blocking gaps closed

| # | Gap | Resolution |
|---|-----|------------|
| 1 | Dual canonical store (`video_jobs` + `media_assets.cost_cents`) | **`neuramark_reel_spend_events`** is the **sole** read source for roll-up totals and component breakdown. **Forbidden:** JOIN/SUM on job or media tables for economics authority. |
| 2 | Failed-attempt inclusion vs US-7.3 success-only rows | Roll-up sums **all spend ledger rows** for `reel_script_id` in scope — each row represents a **completed I/O path that INSERTed** (regenerate, retry with ledger row). Jobs that fail **before** spend INSERT are **excluded** (no phantom cost). Phase B may add provider-billed failure rows via US-8.x writers — same query picks them up automatically. |
| 3 | Per-Reel read API / DTO undefined | **`getReelCostRollupForScript`** (server-only) returns **`ReelCostRollupDto`**. Batch map **`reelCostRollups`** on **`getReelScriptsForWeek`** success (one round-trip). |
| 4 | Component breakdown mapping | Four component lines keyed by ledger **`asset_role`**: `llm`, `talking_head`, `broll`, `tts`. Hide lines with **`eventCount === 0`**. EN/ES i18n under **`scripts.cost.rollup.component.*`**. |
| 5 | Variance + over-budget rules unspecified | **`varianceCents = actualTotalCents - estimatedTotalCents`** when `actualTotalCents !== null`; else **`null`**. **`isOverBudget`** uses **`compareTotalCents`** (see § Formulas). Cap from **`getCostPolicyForClient(clientId).maxCostCents`** — never request input. Gate unchanged (estimates only). |
| 6 | Weekly ↔ per-Reel reconciliation | **Week-scoped** roll-ups on list load match **`costSummary.slots[]`**. Automated reconciliation test (see § Reconciliation). |
| 7 | FE surface ambiguous | **`ReelCostRollupPanel`** inside **`ReelDetailPanel`** on **`/operator/scripts`** — below `ProviderRecommendationPanel`, above script/caption tabs. |
| 8 | Phased BUILD vs US-9.3 / US-7.3 Phase B | **Phase A (BUILD):** LLM component lines + totals + variance + over-budget. **Phase B:** `talking_head`, `broll`, `tts` appear when upstream writers land — **no FE/BE query change**. |
| 9 | Shared aggregation drift | Extract **`aggregateSpendEventsForReelScript`** — shared by **`getReelCostSummaryForWeek`** and **`getReelCostRollupForScript`**. |
| 10 | Cliente response-shape exclusion | Extend **`FORBIDDEN_BUDGET_SPEND_KEYS`** + **`FORBIDDEN_REEL_COST_ROLLUP_KEYS`**. **`reelScriptListItemSchema`** unchanged — no cost keys on `items[]`. |

---

## SECURITY reconciliation (binding)

| Topic | SECURITY condition | **Frozen in this contract** |
|-------|-------------------|----------------------------|
| Server-only aggregation | `import "server-only"` central module | **`lib/cost-policy/get-reel-cost-rollup-for-script.ts`** + **`aggregate-spend-events-for-reel-script.ts`** |
| Ledger canonical | Single reporting store | SELECT **`neuramark_reel_spend_events`** only — parameterized `client_id` + `reel_script_id` + optional week window |
| Operator gate | `requireOperator` first await on browser paths | **`getReelScriptsForWeek`** (existing) — roll-up computed **after** gate; no public rollup action in Phase A |
| Input strict | `{ reelScriptId }` pointer only if lazy action added later | Phase A: **no client rollup input** — batch attach only. Future lazy action: **`getReelCostRollupForScriptActionInputSchema`** — `reelScriptId` + optional `weekStart` cross-check; **no** `clientId`, cost, or cap fields |
| IDOR | Ownership before read | Verify **`neuramark_reel_scripts.id = reelScriptId AND client_id = serverClientId`** before aggregation. Foreign/missing → skip map entry / **404** if standalone |
| Totals authority | Server-computed totals; FE display-only | DTO includes **`estimatedTotalCents`**, **`actualTotalCents`**, **`varianceCents`**, **`isOverBudget`** — FE **must not** re-SUM `components[]` for authority |
| Over-budget cap | Server-resolved policy | **`maxCostCents`** from **`getCostPolicyForClient(serverClientId)`** — integer only; no `rules` / `cost_model` in DTO |
| Component allowlist | No catalog leakage | Components: `assetRole`, cents fields, `eventCount`, `hasPendingActual`, `unavailableReasonKeys` — **forbidden:** `cost_model`, `envKeyName`, raw billing blobs |
| Cliente exclusion | Serializer omission | **`reelCostRollups`** only on **`getReelScriptsForWeek`** Operator success — never on Cliente paths |
| Reconciliation test | Automated invariant | **`get-reel-cost-rollup-for-script.test.ts`** + extend weekly summary tests |
| Forbidden keys | Extend denylist | **`FORBIDDEN_REEL_COST_ROLLUP_KEYS`** merged into rollup input guards |

---

## Overview

The **Operator** sees **costo estimado vs costo real** per **Reel** with **desglose por componente**, **varianza**, and **over-budget** highlight against the resolved **presupuesto máximo** (`maxCostCents`). Data is read-only from the **spend ledger**; weekly list totals (**US-7.3**) **reconcile** with per-slot roll-ups.

**Phase A flow (BUILD — LLM-only breakdown):**

1. Operator loads **`getReelScriptsForWeek({ weekStart })`** — `requireOperator()` gates.
2. Server loads **`costSummary`** (US-7.3) and **`reelCostRollups`** map in parallel for slotted `reelScriptId`s.
3. For each slotted script, **`getReelCostRollupForScript`** queries spend events with **`eventScope: "week"`** (same window as weekly summary).
4. **`ReelCostRollupPanel`** reads **`reelCostRollups[scriptId]`** in expand row — no client-side math.
5. When only LLM rows exist, breakdown shows **LLM line only** + optional muted **`scripts.cost.rollup.phaseNote`**.

**Phase B (automatic — no US-7.4 BUILD change):**

When US-8.x / US-9.3 INSERT `talking_head`, `broll`, `tts` spend rows, the same aggregation surfaces new component lines.

**Surfaces**

| # | Surface | Kind | Phase | New vs reused |
|---|---------|------|-------|---------------|
| 1 | `/operator/scripts` `ReelCostRollupPanel` | FE | A | **New** — expand-row Cost section |
| 2 | `getReelCostRollupForScript` | Server helper | A | **New** — per-Reel roll-up |
| 3 | `aggregateSpendEventsForReelScript` | Server helper | A | **New** — shared aggregation |
| 4 | `getReelScriptsForWeek` | Server Action | A | **Extended** — `reelCostRollups` map |
| 5 | `getReelCostSummaryForWeek` | Server helper | A | **Refactored** — delegate to shared aggregator |
| 6 | Zod + types | `lib/contracts/actual-cost.ts` | A | **Extended** |
| 7 | List success schema | `lib/contracts/reel-script.ts` | A | **Extended** — `reelCostRollups` |
| 8 | Forbidden keys | `lib/contracts/cost-policy.ts` | A | **Extended** |

**Forbidden surfaces (BUILD veto):**

- SUM/JOIN on **`neuramark_video_jobs`** or **`media_assets.cost_cents`** for roll-up authority.
- Cost fields on **`reelScriptListItemSchema`** or any Cliente/shared serializer.
- Client-supplied `maxCostCents`, `varianceCents`, `components`, `actualCostCents` on any path.
- Public rollup Server Action without **`requireOperator("handler")`** first await.
- Changing US-7.1 budget gate to use actuals.
- Operator manual cost edit or spend ledger mutation in this story.

---

## Phased BUILD acceptance

| Phase | Scope | Closes AC |
|-------|-------|-----------|
| **A** | `aggregateSpendEventsForReelScript`; `getReelCostRollupForScript`; batch **`reelCostRollups`** on **`getReelScriptsForWeek`**; `ReelCostRollupPanel`; variance + over-budget; reconciliation tests; forbidden keys; Operator-only 403 | LLM-tracked Reels show totals + LLM breakdown + variance when actual known; weekly sum reconciles; [SEC] response-shape exclusion |
| **B** | Upstream spend writers only (US-7.3 Phase B, US-8.x, US-9.3) | Full component lines for video/B-roll/voiceover when ledger rows exist |

Phase A **does not** block on video pipeline DDL or TTS orchestration.

---

## Data store (frozen)

**Table:** **`neuramark_reel_spend_events`** (existing — no migration)

**Query pattern:**

```sql
SELECT asset_role, estimated_cost_cents, actual_cost_cents, actual_cost_unavailable_reason
  FROM neuramark_reel_spend_events
 WHERE client_id = $1
   AND reel_script_id = $2
   -- when eventScope = 'week':
   AND created_at >= $weekStart::timestamptz
   AND created_at < ($weekStart + interval '7 days')::timestamptz
```

**Index:** Existing **`neuramark_reel_spend_events_client_reel_idx`** — no new index in Phase A.

**RLS:** Deny-by-default unchanged; service-role Node only.

---

## Event scope (frozen)

| Scope | Used when | Reconciles with |
|-------|-----------|-----------------|
| **`week`** | **`getReelScriptsForWeek`** batch attach | **`costSummary.slots[slotIndex]`** for same `reelScriptId` + **`weeklyActualCostCents`** |
| **`lifetime`** | Reserved — **not** in Phase A BUILD | N/A (future “includes all regenerations” subtitle if PO adds lazy detail fetch) |

Phase A **freezes `week`** for all roll-ups attached to the scripts list.

---

## Formulas (frozen)

Pure helpers in **`lib/contracts/actual-cost.ts`** (server imports; FE may import for display typing only — **not** for authority):

```ts
/** actualTotal - estimatedTotal when actual known; else null. */
export function computeReelCostVarianceCents(
  estimatedTotalCents: number,
  actualTotalCents: number | null,
): number | null {
  if (actualTotalCents === null) return null;
  return actualTotalCents - estimatedTotalCents;
}

/** Total used for over-budget comparison: actual when any actual recorded, else estimate. */
export function computeReelCostCompareTotalCents(
  estimatedTotalCents: number,
  actualTotalCents: number | null,
): number {
  return actualTotalCents !== null ? actualTotalCents : estimatedTotalCents;
}

/** Reporting-only — does NOT affect US-7.1 budget gate. */
export function computeReelCostIsOverBudget(
  estimatedTotalCents: number,
  actualTotalCents: number | null,
  maxCostCents: number,
): boolean {
  return (
    computeReelCostCompareTotalCents(estimatedTotalCents, actualTotalCents) >
    maxCostCents
  );
}
```

| Field | Rule |
|-------|------|
| **`estimatedTotalCents`** | `SUM(estimated_cost_cents)` over events in scope |
| **`actualTotalCents`** | `SUM(actual_cost_cents)` where not null for events in scope; **`null`** when **no** event has non-null actual (includes all-pending and no-events) |
| **`hasPendingActual`** | `true` when any event in scope has `actual_cost_cents IS NULL` |
| **`varianceCents`** | **`computeReelCostVarianceCents(estimatedTotalCents, actualTotalCents)`** |
| **`isOverBudget`** | **`computeReelCostIsOverBudget(estimatedTotalCents, actualTotalCents, maxCostCents)`** |
| **`maxCostCents`** | **`getCostPolicyForClient(clientId).policy.max_cost_cents`** (effective cap) |
| Manual `actual_cost_cents = 0` | Counts as actual (not pending); included in totals and component lines |

**FE display hints (non-authoritative):**

- **`isOverBudget`** → PrimeReact **`Message`** severity `warn` comparing **`compareTotalCents`** to formatted cap.
- **`varianceCents > 0`** (under cap) → subdued warn tone on variance badge.
- **`varianceCents < 0`** → subdued success tone (under estimate).

---

## `aggregateSpendEventsForReelScript` (**new**)

**File (BUILD):** `lib/cost-policy/aggregate-spend-events-for-reel-script.ts` (`import "server-only"`)

Refactors aggregation currently inlined in **`getReelCostSummaryForWeek`** into a shared module.

```ts
export type SpendEventAggregateRow = {
  asset_role: string;
  estimated_cost_cents: unknown;
  actual_cost_cents: unknown;
  actual_cost_unavailable_reason: unknown;
};

export type ReelSpendEventScope =
  | { eventScope: "week"; weekStart: string }
  | { eventScope: "lifetime" };

export type AggregatedReelSpend = {
  estimatedTotalCents: number;
  actualTotalCents: number | null;
  hasPendingActual: boolean;
  unavailableReasonKeys: ActualCostUnavailableReason[];
  byAssetRole: Map<
    ReelCostRollupAssetRole,
    {
      estimatedCostCents: number;
      actualCostCents: number | null;
      eventCount: number;
      hasPendingActual: boolean;
      unavailableReasonKeys: ActualCostUnavailableReason[];
    }
  >;
};

export function aggregateSpendEventsForReelScript(
  rows: SpendEventAggregateRow[],
): AggregatedReelSpend;
```

| Rule | Detail |
|------|--------|
| Per-event actual | Non-null actual sums into role + total; null actual sets **`hasPendingActual`** |
| Total actual | **`null`** when zero events have non-null actual (same rule as US-7.3 slot summary) |
| Zero actual | **`0`** is a valid actual — counts toward **`actualTotalCents`** |
| Roles | Group by **`asset_role`**; unknown roles ignored (defensive) |

**`getReelCostSummaryForWeek`** refactored to: fetch week rows once → group by `reel_script_id` → call aggregator per reel → build slots (behavior unchanged).

---

## `getReelCostRollupForScript` (**new**)

**File (BUILD):** `lib/cost-policy/get-reel-cost-rollup-for-script.ts` (`import "server-only"`)

**Not** a browser-invokable Server Action in Phase A — called from gated **`getReelScriptsForWeek`** only.

```ts
export async function getReelCostRollupForScript(input: {
  clientId: string;
  reelScriptId: string;
  weekStart: string;
  eventScope: "week";
}): Promise<ReelCostRollupDto | null>;
```

| Step | Detail |
|------|--------|
| 1 | Verify reel exists: **`neuramark_reel_scripts`** WHERE `id = reelScriptId AND client_id = clientId` — missing → **`null`** |
| 2 | SELECT spend events (parameterized) for client + reel + week window |
| 3 | **`aggregateSpendEventsForReelScript(rows)`** |
| 4 | Load **`maxCostCents`** via **`getCostPolicyForClient(clientId)`** — on failure use **`DEFAULT_MAX_COST_CENTS`** for display only (log error) |
| 5 | Build **`components[]`** from **`byAssetRole`** — omit zero-event roles |
| 6 | Compute **`varianceCents`**, **`isOverBudget`** via contract helpers |

**Call graph (Phase A):**

```
getReelScriptsForWeek
  └─ requireOperator("handler")
  └─ getReelCostSummaryForWeek(...)
  └─ for each item.scriptId:
       └─ getReelCostRollupForScript({ clientId, reelScriptId, weekStart, eventScope: "week" })
  └─ reelCostRollups: Record<uuid, ReelCostRollupDto>
```

---

## `ReelCostRollupDto` (frozen Zod)

**File (BUILD):** `lib/contracts/actual-cost.ts`

```ts
export const reelCostRollupAssetRoleSchema = z.enum([
  "llm",
  "talking_head",
  "broll",
  "tts",
]);

export const reelCostRollupComponentSchema = z
  .object({
    assetRole: reelCostRollupAssetRoleSchema,
    estimatedCostCents: z.number().int().nonnegative(),
    actualCostCents: z.number().int().nonnegative().nullable(),
    eventCount: z.number().int().nonnegative(),
    hasPendingActual: z.boolean(),
    unavailableReasonKeys: z.array(actualCostUnavailableReasonSchema),
  })
  .strict();

export const reelCostRollupDtoSchema = z
  .object({
    reelScriptId: z.string().uuid(),
    clientId: z.string().uuid(),
    weekStart: trendWeekStartSchema,
    eventScope: z.literal("week"),
    estimatedTotalCents: z.number().int().nonnegative(),
    actualTotalCents: z.number().int().nonnegative().nullable(),
    varianceCents: z.number().int().nullable(),
    hasPendingActual: z.boolean(),
    maxCostCents: z.number().int().positive(),
    isOverBudget: z.boolean(),
    components: z.array(reelCostRollupComponentSchema),
  })
  .strict();

export const reelCostRollupsMapSchema = z.record(
  z.string().uuid(),
  reelCostRollupDtoSchema,
);
```

| Field | Presence |
|-------|----------|
| **`components`** | Only roles with **`eventCount > 0`** |
| **`varianceCents`** | Non-null only when **`actualTotalCents !== null`** |
| **`maxCostCents`** | Always present on Operator DTO — cap for over-budget copy only |

**i18n component labels:**

| `assetRole` | EN key | ES key |
|-------------|--------|--------|
| `llm` | `scripts.cost.rollup.component.llm` | (ES mirror) |
| `talking_head` | `scripts.cost.rollup.component.talkingHead` | Video / presencia |
| `broll` | `scripts.cost.rollup.component.broll` | B-roll |
| `tts` | `scripts.cost.rollup.component.tts` | Voz en off |

Additional keys: **`scripts.cost.rollup.title`**, `.estimated`, `.actual`, `.variance`, `.overBudget`, `.pending`, `.empty`, `.phaseNote`.

---

## Extend `getReelScriptsForWeek` (**extended**)

**Frontend consumer:** `/operator/scripts` — list load + expand-row **`ReelCostRollupPanel`**.

**Success payload addition:**

```ts
export const getReelScriptsForWeekSuccessSchema = z
  .object({
    // ... existing fields ...
    costSummary: reelWeekCostSummarySchema,
    /** US-7.4 — Operator-only per-Reel roll-ups keyed by reelScriptId. */
    reelCostRollups: reelCostRollupsMapSchema,
  })
  .strict();
```

| Rule | Detail |
|------|--------|
| Keys | Only **`scriptId`** values present in **`items[]`** where `scriptId !== null` |
| Missing rollup | Slot with no script → no map entry |
| Empty events | Roll-up still returned with zeros / null actual / empty **`components`** |
| Operator-only | Same action gate as US-7.3 **`costSummary`** |

---

## Reconciliation (frozen invariant + tests)

**Per-slot (required test):** For each slot `i` where `reelScriptId !== null`:

```
rollup = reelCostRollups[reelScriptId]
rollup.estimatedTotalCents === costSummary.slots[i].estimatedCostCents
rollup.actualTotalCents === costSummary.slots[i].actualCostCents
rollup.hasPendingActual === costSummary.slots[i].hasPendingActual
```

**Weekly (required test):** Using fixture week with mixed LLM events:

```
sum(costSummary.slots[].estimatedCostCents) === costSummary.weeklyEstimatedCostCents

sum(costSummary.slots[].actualCostCents where not null) === costSummary.weeklyActualCostCents
  (when weeklyActualCostCents is not null)

sum(Object.values(reelCostRollups).map(r => r.estimatedTotalCents))
  === costSummary.weeklyEstimatedCostCents

sum(Object.values(reelCostRollups).map(r => r.actualTotalCents).filter non-null)
  === costSummary.weeklyActualCostCents
  (when weeklyActualCostCents is not null)
```

**Test file (BUILD):** `lib/cost-policy/get-reel-cost-rollup-for-script.test.ts` — uses shared fixture spend rows; extends patterns from **`get-reel-cost-summary-for-week.test.ts`**.

---

## Forbidden keys (extended)

**File (BUILD):** `lib/contracts/cost-policy.ts`

```ts
export const FORBIDDEN_REEL_COST_ROLLUP_KEYS = [
  "reelCostRollups",
  "reelCostRollup",
  "costRollup",
  "cost_rollup",
  "components",
  "varianceCents",
  "variance_cents",
  "isOverBudget",
  "is_over_budget",
  "totalActualCostCents",
  "total_actual_cost_cents",
  "totalEstimatedCostCents",
  "total_estimated_cost_cents",
  "compareTotalCents",
  "eventScope",
  "event_scope",
] as const;
```

Merge into rollup input guards when lazy action is added. **`FORBIDDEN_BUDGET_SPEND_KEYS`** unchanged for generate/regenerate paths.

---

## Error envelope

Phase A batch path inherits **`getReelScriptsForWeek`** errors. No new error codes.

Future lazy **`getReelCostRollupForScriptAction`** (optional, not Phase A):

| Code | When |
|------|------|
| `UNAUTHENTICATED` | No session |
| `FORBIDDEN` | Non-operator |
| `NOT_FOUND` | Foreign/missing `reelScriptId` (uniform 404) |
| `FORBIDDEN_FIELDS` | Smuggled cost/cap/client keys |
| `VALIDATION_ERROR` | Invalid UUID / weekStart |

---

## Fixtures (mock payloads)

**Week-scoped LLM-only slot (Phase A):**

```json
{
  "reelScriptId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "clientId": "c1b2a3d4-e5f6-7890-abcd-ef1234567890",
  "weekStart": "2026-08-25",
  "eventScope": "week",
  "estimatedTotalCents": 42,
  "actualTotalCents": 38,
  "varianceCents": -4,
  "hasPendingActual": false,
  "maxCostCents": 150,
  "isOverBudget": false,
  "components": [
    {
      "assetRole": "llm",
      "estimatedCostCents": 42,
      "actualCostCents": 38,
      "eventCount": 2,
      "hasPendingActual": false,
      "unavailableReasonKeys": []
    }
  ]
}
```

**Over-budget (actual exceeds cap):**

```json
{
  "estimatedTotalCents": 120,
  "actualTotalCents": 165,
  "varianceCents": 45,
  "maxCostCents": 150,
  "isOverBudget": true
}
```

**Pending actual (no variance number):**

```json
{
  "estimatedTotalCents": 42,
  "actualTotalCents": null,
  "varianceCents": null,
  "hasPendingActual": true,
  "isOverBudget": false
}
```

**`getReelScriptsForWeek` success excerpt:**

```json
{
  "ok": true,
  "weekStart": "2026-08-25",
  "items": [{ "scriptId": "a1b2c3d4-...", "slotIndex": 0 }],
  "costSummary": { "weeklyEstimatedCostCents": 42, "weeklyActualCostCents": 38, "slots": [] },
  "reelCostRollups": {
    "a1b2c3d4-...": { "...": "ReelCostRollupDto above" }
  }
}
```

---

## Security test matrix (BUILD)

| # | Test | Expected |
|---|------|----------|
| S1 | Non-operator **`getReelScriptsForWeek`** | **403** — no roll-up data |
| S2 | **`reelScriptListItemSchema` parse** sample | No cost / rollup keys |
| S3 | Reconciliation fixture | Slot + weekly equalities pass |
| S4 | Foreign `reelScriptId` in standalone helper (unit) | **`null`** / no cross-tenant rows |
| S5 | Grep Cliente loaders | No `reelCostRollups` / `varianceCents` imports |

---

## Reviewed by FE

**Reviewed by FE** — 2026-08-29 (nextjs-frontend)

Batch `reelCostRollups[scriptId]` on `getReelScriptsForWeek` fits expand-row wiring; no lazy fetch in Phase A. `ReelCostRollupDto` has all display fields (totals, variance, `isOverBudget`, `maxCostCents`, `components[]`); FE display-only — no client-side re-SUM. Placement below `ProviderRecommendationPanel` / above `TabView` matches `ReelDetailPanel`. Week-scoped roll-ups reconcile with list column + `costSummary.slots[]`. Reuse `formatCentsForDisplay`, `Message`, and `scripts.cost.actual.pending` / `unavailable` patterns. Implement as `ReelCostRollupPanel` (TASKS `ReelCostSection` alias OK). i18n under `scripts.cost.rollup.*` as specified.

---

## Change log

| Date | Change |
|------|--------|
| 2026-08-29 | Initial freeze — resolves SPEC-REVIEW GAPS + SECURITY conditions; ledger-only; `getReelCostRollupForScript` + batch `reelCostRollups`; variance/over-budget formulas; week-scoped reconciliation; Phase A LLM-only |
