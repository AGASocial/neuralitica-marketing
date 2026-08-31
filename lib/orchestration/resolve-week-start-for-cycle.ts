import { trendWeekStartSchema } from "@/lib/contracts/trend";
import { normalizeToIsoMonday } from "@/lib/trend/normalize-week-start";

export function resolveWeekStartForCycle(referenceDate: Date = new Date()): string {
  return trendWeekStartSchema.parse(normalizeToIsoMonday(referenceDate));
}
