import "server-only";

import {
  getReelCostSummaryForWeekInputSchema,
  type ReelWeekCostSummary,
} from "@/lib/contracts/actual-cost";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

import {
  aggregateSpendEventsForReelScript,
  weekEndExclusive,
  type SpendEventAggregateRow,
} from "./aggregate-spend-events-for-reel-script";
import { ReelCumulativeCostUnsafeError } from "./sum-reel-cumulative-cost-cents";

type SpendEventRow = SpendEventAggregateRow & {
  reel_script_id: string;
};

function emptySlotSummary(
  slotIndex: number,
  reelScriptId: string | null,
): ReelWeekCostSummary["slots"][number] {
  return {
    slotIndex,
    reelScriptId,
    estimatedCostCents: 0,
    actualCostCents: null,
    hasPendingActual: false,
    unavailableReasonKeys: [],
  };
}

/**
 * Operator-only weekly cost aggregates for /operator/scripts (US-7.3).
 * Called from getReelScriptsForWeek after requireOperator — not a public action.
 */
export async function getReelCostSummaryForWeek(
  rawInput: unknown,
): Promise<ReelWeekCostSummary> {
  const parsed = getReelCostSummaryForWeekInputSchema.parse(rawInput);
  const { clientId, weekStart, slotReelScriptIds } = parsed;

  if (!isSupabaseConfigured()) {
    throw new ReelCumulativeCostUnsafeError("Supabase not configured");
  }

  const weekEnd = weekEndExclusive(weekStart);
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_reel_spend_events")
    .select(
      "reel_script_id, asset_role, estimated_cost_cents, actual_cost_cents, actual_cost_unavailable_reason",
    )
    .eq("client_id", clientId)
    .gte("created_at", `${weekStart}T00:00:00.000Z`)
    .lt("created_at", `${weekEnd}T00:00:00.000Z`);

  if (error) {
    throw new ReelCumulativeCostUnsafeError("Spend summary query failed");
  }

  const rows = (data ?? []) as SpendEventRow[];

  const rowsByReel = new Map<string, SpendEventAggregateRow[]>();
  for (const row of rows) {
    const reelScriptId = row.reel_script_id;
    const bucket = rowsByReel.get(reelScriptId) ?? [];
    bucket.push({
      asset_role: row.asset_role,
      estimated_cost_cents: row.estimated_cost_cents,
      actual_cost_cents: row.actual_cost_cents,
      actual_cost_unavailable_reason: row.actual_cost_unavailable_reason,
    });
    rowsByReel.set(reelScriptId, bucket);
  }

  const byReel = new Map<
    string,
    ReturnType<typeof aggregateSpendEventsForReelScript>
  >();
  for (const [reelScriptId, reelRows] of rowsByReel) {
    byReel.set(reelScriptId, aggregateSpendEventsForReelScript(reelRows));
  }

  let eventsWithActual = 0;
  for (const row of rows) {
    if (row.actual_cost_cents !== null && row.actual_cost_cents !== undefined) {
      eventsWithActual += 1;
    }
  }
  const hasPartialActual =
    rows.length > 0 &&
    eventsWithActual > 0 &&
    eventsWithActual < rows.length;

  const slots = slotReelScriptIds.map(({ slotIndex, reelScriptId }) => {
    if (reelScriptId === null) {
      return emptySlotSummary(slotIndex, null);
    }

    const agg = byReel.get(reelScriptId);
    if (!agg) {
      return emptySlotSummary(slotIndex, reelScriptId);
    }

    return {
      slotIndex,
      reelScriptId,
      estimatedCostCents: agg.estimatedTotalCents,
      actualCostCents: agg.actualTotalCents,
      hasPendingActual: agg.hasPendingActual,
      unavailableReasonKeys: agg.unavailableReasonKeys,
    };
  });

  let weeklyEstimatedCostCents = 0;
  let weeklyActualCostCents: number | null = 0;
  let slotsWithActual = 0;

  for (const slot of slots) {
    weeklyEstimatedCostCents += slot.estimatedCostCents;
    if (slot.actualCostCents !== null) {
      slotsWithActual += 1;
      weeklyActualCostCents = (weeklyActualCostCents ?? 0) + slot.actualCostCents;
    }
  }

  if (slotsWithActual === 0) {
    weeklyActualCostCents = null;
  }

  return {
    weekStart,
    clientId,
    slots,
    weeklyEstimatedCostCents,
    weeklyActualCostCents,
    hasPartialActual,
  };
}
