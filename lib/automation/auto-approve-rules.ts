import {
  parseContentTypeRules,
  type AutomationContentType,
  type AutomationSettings,
} from "@/lib/contracts/automation-settings";

export type AutoApproveRuleReason =
  | "eligible"
  | "preset_review_all"
  | "custom_rule_review"
  | "content_type_unknown"
  | "item_cost_unknown"
  | "item_cost_over_cap"
  | "weekly_cap_exceeded";

export type AutoApproveRuleResult = {
  eligible: boolean;
  reason: AutoApproveRuleReason;
};

/**
 * Pure eligibility for Piloto automático / custom per-type rules (no I/O).
 *
 * - `review_all` → never.
 * - `auto_pilot` → every content type, within caps.
 * - `custom` → only content types whose rule is `auto`; missing rule or
 *   unknown content type → review (notify).
 * Caps: per-item cap needs a known cost; weekly cap counts spend so far plus
 * this item.
 */
export function resolveAutoApproveRule(params: {
  settings: AutomationSettings;
  contentType?: AutomationContentType | null;
  itemCostCents: number | null | undefined;
  weeklySpendCents: number | null | undefined;
}): AutoApproveRuleResult {
  const { settings } = params;
  if (settings.preset === "review_all") {
    return { eligible: false, reason: "preset_review_all" };
  }
  if (settings.preset === "custom") {
    if (!params.contentType) {
      return { eligible: false, reason: "content_type_unknown" };
    }
    const rules = parseContentTypeRules(settings.contentTypeRules);
    if (rules[params.contentType] !== "auto") {
      return { eligible: false, reason: "custom_rule_review" };
    }
  } else if (settings.preset !== "auto_pilot") {
    return { eligible: false, reason: "preset_review_all" };
  }

  const maxItem = settings.maxAutoApproveCostCents;
  if (maxItem != null) {
    if (params.itemCostCents == null) {
      return { eligible: false, reason: "item_cost_unknown" };
    }
    if (params.itemCostCents > maxItem) {
      return { eligible: false, reason: "item_cost_over_cap" };
    }
  }
  const weeklyCap = settings.weeklySpendCapCents;
  if (weeklyCap != null) {
    const spend = params.weeklySpendCents ?? 0;
    const next = spend + (params.itemCostCents ?? 0);
    if (next > weeklyCap) {
      return { eligible: false, reason: "weekly_cap_exceeded" };
    }
  }
  return { eligible: true, reason: "eligible" };
}

/** Back-compat boolean wrapper. */
export function shouldAutoApproveCandidate(params: {
  settings: AutomationSettings;
  contentType?: AutomationContentType | null;
  itemCostCents: number | null | undefined;
  weeklySpendCents: number | null | undefined;
}): boolean {
  return resolveAutoApproveRule(params).eligible;
}
