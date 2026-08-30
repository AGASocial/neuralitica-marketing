import "server-only";

/**
 * Dedicated HMAC secret for provider-readable asset URLs (US-8.2 / US-8.4).
 * Production requires NEURAMARK_PROVIDER_ASSET_URL_SECRET; dev may fall back to
 * Supabase service-role material for local workflows.
 */
export function getProviderAssetUrlSecret(): string | null {
  const dedicated = process.env.NEURAMARK_PROVIDER_ASSET_URL_SECRET;
  if (dedicated) {
    return dedicated;
  }

  if (process.env.NODE_ENV === "production") {
    return null;
  }

  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SECRET_KEY ??
    null
  );
}
