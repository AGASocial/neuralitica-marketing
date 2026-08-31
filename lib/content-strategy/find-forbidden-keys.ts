const FORBIDDEN_METRICS_SMUGGLING_KEYS = [
  "metricsSummary",
  "metricsSummaryForPrompt",
  "metrics_summary",
  "insights",
  "topThemes",
  "top_themes",
  "engagementScore",
  "engagement_score",
  "available",
  "windowStart",
  "windowEnd",
  "reelCount",
  "reel_count",
] as const;

const FORBIDDEN_GENERATE_KEYS = new Set([
  ...FORBIDDEN_METRICS_SMUGGLING_KEYS,
  "providerKey",
  "provider_key",
  "tier",
  "envKeyName",
  "model",
  "status",
  "brief",
  "version",
  "approved",
  "approved_by",
  "approved_at",
  "approvedBy",
  "approvedAt",
  "role",
  "auth_user_id",
]);

const FORBIDDEN_GET_LATEST_KEYS = new Set([
  ...FORBIDDEN_METRICS_SMUGGLING_KEYS,
  "providerKey",
  "provider_key",
  "tier",
  "envKeyName",
  "model",
  "status",
  "brief",
  "version",
  "approved",
  "approved_by",
  "approved_at",
  "approvedBy",
  "approvedAt",
  "role",
  "auth_user_id",
]);

function findForbiddenKeys(raw: unknown, forbidden: Set<string>): string[] {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return [];
  }
  return Object.keys(raw).filter((key) => forbidden.has(key));
}

/** Forbidden keys on generateContentStrategy — clientId allowed when validated server-side. */
export function findForbiddenContentStrategyKeys(raw: unknown): string[] {
  return findForbiddenKeys(raw, FORBIDDEN_GENERATE_KEYS);
}

/** Forbidden keys on getLatestContentStrategy — clientId allowed when validated server-side. */
export function findForbiddenGetLatestContentStrategyKeys(raw: unknown): string[] {
  return findForbiddenKeys(raw, FORBIDDEN_GET_LATEST_KEYS);
}

export { FORBIDDEN_METRICS_SMUGGLING_KEYS };
