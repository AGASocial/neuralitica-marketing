/** Keys rejected on synthesize boundary before Zod parse (US-9.3 SECURITY). */
const FORBIDDEN_TTS_SYNTHESIS_KEY_SET = new Set(
  [
    "voiceId",
    "voice_id",
    "providerVoice",
    "provider_voice",
    "providerKey",
    "provider_key",
    "tier",
    "providerTier",
    "provider_tier",
    "estimatedCostCents",
    "estimated_cost_cents",
    "text",
    "voiceoverText",
    "voiceover_text",
    "hook",
    "body",
    "cta",
    "clientId",
    "client_id",
    "skipBudgetCheck",
    "skip_budget_check",
    "overrideBudget",
    "override_budget",
    "policyId",
    "policy_id",
    "rules",
    "locale",
    "preferredLocale",
    "preferred_locale",
    "confirmGeneration",
    "confirm_generation",
    "actualCostCents",
    "actual_cost_cents",
    "durationSec",
    "duration_sec",
  ].map((key) => key.toLowerCase()),
);

/** Reject client-authoritative synthesis keys before Zod parse (US-9.3 SECURITY). */
export function findForbiddenTtsSynthesisKeys(input: unknown): string[] {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return [];
  }

  return Object.keys(input).filter((key) =>
    FORBIDDEN_TTS_SYNTHESIS_KEY_SET.has(key.toLowerCase()),
  );
}
