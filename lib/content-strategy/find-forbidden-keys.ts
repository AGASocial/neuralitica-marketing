const FORBIDDEN_GENERATE_KEYS = new Set([
  "clientId",
  "client_id",
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

export function findForbiddenContentStrategyKeys(raw: unknown): string[] {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return [];
  }
  return Object.keys(raw).filter((key) => FORBIDDEN_GENERATE_KEYS.has(key));
}
