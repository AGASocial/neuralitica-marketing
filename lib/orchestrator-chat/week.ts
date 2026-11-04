import { trendWeekStartSchema } from "@/lib/contracts/trend";
import { normalizeToIsoMonday } from "@/lib/trend/normalize-week-start";

export function resolveOrchestratorWeekStart(
  weekStart?: string,
): string {
  if (weekStart) {
    return trendWeekStartSchema.parse(weekStart);
  }
  return trendWeekStartSchema.parse(normalizeToIsoMonday(new Date()));
}
