import type { AutomationSettings } from "@/lib/contracts/automation-settings";

/** Pure F0 eligibility for Autopilot (no I/O). */
export function shouldAutoApproveCandidate(params: {
  settings: AutomationSettings;
  itemCostCents: number | null | undefined;
  weeklySpendCents: number | null | undefined;
}): boolean {
  if (params.settings.preset === "review_all") {
    return false;
  }
  if (
    params.settings.preset !== "auto_pilot" &&
    params.settings.preset !== "custom"
  ) {
    return false;
  }
  // custom without per-type rules → treat as review_all for F0
  if (params.settings.preset === "custom") {
    return false;
  }
  const maxItem = params.settings.maxAutoApproveCostCents;
  if (maxItem != null) {
    if (params.itemCostCents == null || params.itemCostCents > maxItem) {
      return false;
    }
  }
  const weeklyCap = params.settings.weeklySpendCapCents;
  if (weeklyCap != null) {
    const spend = params.weeklySpendCents ?? 0;
    const next = spend + (params.itemCostCents ?? 0);
    if (next > weeklyCap) {
      return false;
    }
  }
  return true;
}
