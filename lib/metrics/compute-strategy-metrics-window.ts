import "server-only";

import { STRATEGY_METRICS_LOOKBACK_DAYS } from "@/lib/contracts/strategy-insights";

export function computeStrategyMetricsWindow(weekStart: string): {
  windowStart: string;
  windowEnd: string;
  windowStartTs: Date;
  windowEndTs: Date;
} {
  const windowEndTs = new Date(`${weekStart}T00:00:00.000Z`);
  const windowStartTs = new Date(windowEndTs);
  windowStartTs.setUTCDate(
    windowStartTs.getUTCDate() - STRATEGY_METRICS_LOOKBACK_DAYS,
  );

  const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);

  return {
    windowStart: toIsoDate(windowStartTs),
    windowEnd: weekStart,
    windowStartTs,
    windowEndTs,
  };
}
