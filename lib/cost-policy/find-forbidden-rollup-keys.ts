import { FORBIDDEN_REEL_COST_ROLLUP_KEYS } from "@/lib/contracts/cost-policy";

const FORBIDDEN_KEYS = new Set<string>(FORBIDDEN_REEL_COST_ROLLUP_KEYS);

export function findForbiddenReelCostRollupKeys(raw: unknown): string[] {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return [];
  }
  return Object.keys(raw).filter((key) => FORBIDDEN_KEYS.has(key));
}
