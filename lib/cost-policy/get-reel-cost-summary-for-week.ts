import "server-only";

import {
  actualCostUnavailableReasonSchema,
  getReelCostSummaryForWeekInputSchema,
  type ActualCostUnavailableReason,
  type ReelWeekCostSummary,
} from "@/lib/contracts/actual-cost";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

import { ReelCumulativeCostUnsafeError } from "./sum-reel-cumulative-cost-cents";

type SpendEventRow = {
  reel_script_id: string;
  estimated_cost_cents: unknown;
  actual_cost_cents: unknown;
  actual_cost_unavailable_reason: unknown;
};

type ReelSpendAggregate = {
  estimatedCostCents: number;
  actualCostCents: number | null;
  hasPendingActual: boolean;
  unavailableReasonKeys: ActualCostUnavailableReason[];
};

function weekEndExclusive(weekStart: string): string {
  const date = new Date(`${weekStart}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 7);
  return date.toISOString().slice(0, 10);
}

function parseNonNegativeInt(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new ReelCumulativeCostUnsafeError(`Invalid ${label}`);
  }
  return value;
}

function parseOptionalActualCents(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  return parseNonNegativeInt(value, "actual_cost_cents");
}

function parseUnavailableReason(
  value: unknown,
): ActualCostUnavailableReason | null {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = actualCostUnavailableReasonSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function aggregateSpendEventsByReel(
  rows: SpendEventRow[],
): Map<string, ReelSpendAggregate> {
  const byReel = new Map<
    string,
    {
      estimatedCostCents: number;
      actualSum: number;
      hasAnyActual: boolean;
      hasPendingActual: boolean;
      unavailableReasons: Set<ActualCostUnavailableReason>;
    }
  >();

  for (const row of rows) {
    const reelScriptId = row.reel_script_id;
    const estimated = parseNonNegativeInt(
      row.estimated_cost_cents,
      "estimated_cost_cents",
    );
    const actual = parseOptionalActualCents(row.actual_cost_cents);
    const reason = parseUnavailableReason(row.actual_cost_unavailable_reason);

    const existing = byReel.get(reelScriptId) ?? {
      estimatedCostCents: 0,
      actualSum: 0,
      hasAnyActual: false,
      hasPendingActual: false,
      unavailableReasons: new Set<ActualCostUnavailableReason>(),
    };

    existing.estimatedCostCents += estimated;
    if (actual !== null) {
      existing.actualSum += actual;
      existing.hasAnyActual = true;
    } else {
      existing.hasPendingActual = true;
      if (reason !== null) {
        existing.unavailableReasons.add(reason);
      }
    }

    byReel.set(reelScriptId, existing);
  }

  const result = new Map<string, ReelSpendAggregate>();
  for (const [reelScriptId, agg] of byReel) {
    result.set(reelScriptId, {
      estimatedCostCents: agg.estimatedCostCents,
      actualCostCents: agg.hasAnyActual ? agg.actualSum : null,
      hasPendingActual: agg.hasPendingActual,
      unavailableReasonKeys: [...agg.unavailableReasons],
    });
  }

  return result;
}

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
      "reel_script_id, estimated_cost_cents, actual_cost_cents, actual_cost_unavailable_reason",
    )
    .eq("client_id", clientId)
    .gte("created_at", `${weekStart}T00:00:00.000Z`)
    .lt("created_at", `${weekEnd}T00:00:00.000Z`);

  if (error) {
    throw new ReelCumulativeCostUnsafeError("Spend summary query failed");
  }

  const rows = (data ?? []) as SpendEventRow[];
  const byReel = aggregateSpendEventsByReel(rows);

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
      estimatedCostCents: agg.estimatedCostCents,
      actualCostCents: agg.actualCostCents,
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
