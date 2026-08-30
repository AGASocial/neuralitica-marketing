import { FORBIDDEN_PROVIDER_AUTHORITY_KEYS } from "@/lib/contracts/provider-decisions";

const FORBIDDEN_REEL_CAPTION_KEYS = new Set([
  "clientId",
  "client_id",
  "strategyId",
  "strategy_id",
  "reelScriptId",
  "reel_script_id",
  "tier",
  "envKeyName",
  "model",
  "status",
  "approved",
  "caption",
  "hashtags",
  "keywords",
  "ctaVariants",
  "cta_variants",
  "selectedCtaIndex",
  "selected_cta_index",
  "maxHashtags",
  "maxCaptionChars",
  "hook",
  "body",
  "cta",
  "onScreenText",
  "voiceoverText",
  "on_screen_text",
  "voiceover_text",
  "brief",
  "invokedBy",
  "role",
  "auth_user_id",
  // US-7.1: budget authority keys — use budgetOverride / overrideReason only
  "maxCostCents",
  "max_cost_cents",
  "providerTier",
  "provider_tier",
  "estimatedCostCents",
  "estimated_cost_cents",
  "cumulativeCostCents",
  "cumulative_cost_cents",
  "budgetCap",
  "policyId",
  "policy_id",
  "rules",
  "skipBudgetCheck",
  "skip_budget_check",
  "overrideBudget",
  "override_budget",
  "confirmGeneration",
  "confirm_generation",
  ...FORBIDDEN_PROVIDER_AUTHORITY_KEYS,
]);

export function findForbiddenReelCaptionKeys(raw: unknown): string[] {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return [];
  }
  return Object.keys(raw).filter((key) => FORBIDDEN_REEL_CAPTION_KEYS.has(key));
}
