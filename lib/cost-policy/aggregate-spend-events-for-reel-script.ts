import "server-only";

import {
  actualCostUnavailableReasonSchema,
  reelCostRollupAssetRoleSchema,
  type ActualCostUnavailableReason,
  type ReelCostRollupAssetRole,
} from "@/lib/contracts/actual-cost";

import { ReelCumulativeCostUnsafeError } from "./sum-reel-cumulative-cost-cents";

export type SpendEventAggregateRow = {
  asset_role: string;
  estimated_cost_cents: unknown;
  actual_cost_cents: unknown;
  actual_cost_unavailable_reason: unknown;
};

export type ReelSpendEventScope =
  | { eventScope: "week"; weekStart: string }
  | { eventScope: "lifetime" };

type RoleAggregate = {
  estimatedCostCents: number;
  actualSum: number;
  hasAnyActual: boolean;
  hasPendingActual: boolean;
  eventCount: number;
  unavailableReasons: Set<ActualCostUnavailableReason>;
};

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

function parseAssetRole(value: string): ReelCostRollupAssetRole | null {
  const parsed = reelCostRollupAssetRoleSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function emptyRoleAggregate(): RoleAggregate {
  return {
    estimatedCostCents: 0,
    actualSum: 0,
    hasAnyActual: false,
    hasPendingActual: false,
    eventCount: 0,
    unavailableReasons: new Set<ActualCostUnavailableReason>(),
  };
}

function applyEventToRoleAggregate(
  agg: RoleAggregate,
  estimated: number,
  actual: number | null,
  reason: ActualCostUnavailableReason | null,
): void {
  agg.eventCount += 1;
  agg.estimatedCostCents += estimated;
  if (actual !== null) {
    agg.actualSum += actual;
    agg.hasAnyActual = true;
  } else {
    agg.hasPendingActual = true;
    if (reason !== null) {
      agg.unavailableReasons.add(reason);
    }
  }
}

function finalizeRoleAggregate(agg: RoleAggregate): {
  estimatedCostCents: number;
  actualCostCents: number | null;
  eventCount: number;
  hasPendingActual: boolean;
  unavailableReasonKeys: ActualCostUnavailableReason[];
} {
  return {
    estimatedCostCents: agg.estimatedCostCents,
    actualCostCents: agg.hasAnyActual ? agg.actualSum : null,
    eventCount: agg.eventCount,
    hasPendingActual: agg.hasPendingActual,
    unavailableReasonKeys: [...agg.unavailableReasons],
  };
}

/**
 * Shared spend-event aggregation for weekly summary (US-7.3) and per-Reel roll-up (US-7.4).
 */
export function aggregateSpendEventsForReelScript(
  rows: SpendEventAggregateRow[],
): AggregatedReelSpend {
  const byAssetRole = new Map<ReelCostRollupAssetRole, RoleAggregate>();
  const topUnavailable = new Set<ActualCostUnavailableReason>();

  let estimatedTotalCents = 0;
  let actualSum = 0;
  let hasAnyActual = false;
  let hasPendingActual = false;

  for (const row of rows) {
    const estimated = parseNonNegativeInt(
      row.estimated_cost_cents,
      "estimated_cost_cents",
    );
    const actual = parseOptionalActualCents(row.actual_cost_cents);
    const reason = parseUnavailableReason(row.actual_cost_unavailable_reason);

    estimatedTotalCents += estimated;
    if (actual !== null) {
      actualSum += actual;
      hasAnyActual = true;
    } else {
      hasPendingActual = true;
      if (reason !== null) {
        topUnavailable.add(reason);
      }
    }

    const assetRole = parseAssetRole(row.asset_role);
    if (assetRole === null) {
      continue;
    }

    const roleAgg = byAssetRole.get(assetRole) ?? emptyRoleAggregate();
    applyEventToRoleAggregate(roleAgg, estimated, actual, reason);
    byAssetRole.set(assetRole, roleAgg);
  }

  const finalizedByRole = new Map<
    ReelCostRollupAssetRole,
    {
      estimatedCostCents: number;
      actualCostCents: number | null;
      eventCount: number;
      hasPendingActual: boolean;
      unavailableReasonKeys: ActualCostUnavailableReason[];
    }
  >();

  for (const [role, agg] of byAssetRole) {
    finalizedByRole.set(role, finalizeRoleAggregate(agg));
  }

  return {
    estimatedTotalCents,
    actualTotalCents: hasAnyActual ? actualSum : null,
    hasPendingActual,
    unavailableReasonKeys: [...topUnavailable],
    byAssetRole: finalizedByRole,
  };
}

/** ISO date (YYYY-MM-DD) for weekStart + 7 days (exclusive end bound). */
export function weekEndExclusive(weekStart: string): string {
  const date = new Date(`${weekStart}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 7);
  return date.toISOString().slice(0, 10);
}
