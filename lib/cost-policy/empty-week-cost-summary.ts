import type { ReelWeekCostSummary } from "@/lib/contracts/actual-cost";

export function emptyWeekCostSummary(
  weekStart: string,
  clientId: string,
): ReelWeekCostSummary {
  return {
    weekStart,
    clientId,
    slots: [],
    weeklyEstimatedCostCents: 0,
    weeklyActualCostCents: null,
    hasPartialActual: false,
  };
}
