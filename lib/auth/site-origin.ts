import "server-only";

/**
 * Allowlisted public origin for Auth `emailRedirectTo`.
 * Prefers server-only `SITE_URL`; `VERCEL_URL` fallback is allowed (not attacker Host).
 * Returns undefined if origin cannot be resolved safely — callers must omit
 * `emailRedirectTo` rather than copying `Host` / `X-Forwarded-Host`.
 */
export function getAllowlistedSiteOrigin(): string | undefined {
  const configured = process.env.SITE_URL?.trim();
  const vercelHost = process.env.VERCEL_URL?.trim();

  const raw = configured
    ? configured
    : vercelHost
      ? `https://${vercelHost}`
      : undefined;

  if (!configured && vercelHost) {
    console.warn(
      "[auth] SITE_URL is unset; using VERCEL_URL for emailRedirectTo. Set SITE_URL and add it to the Supabase Auth redirect allowlist.",
    );
  }

  if (!raw) {
    console.warn(
      "[auth] SITE_URL is unset; emailRedirectTo omitted. Set SITE_URL and add it to the Supabase Auth redirect allowlist.",
    );
    return undefined;
  }

  const base = raw.startsWith("http") ? raw : `https://${raw}`;

  try {
    return new URL(base).origin;
  } catch {
    console.warn(
      "[auth] SITE_URL is not a valid URL; emailRedirectTo omitted.",
    );
    return undefined;
  }
}

/** Signup confirmation landing — Path A `GET /auth/callback`. */
export function getSignupEmailRedirectTo(): string | undefined {
  const origin = getAllowlistedSiteOrigin();
  return origin ? `${origin}/auth/callback` : undefined;
}

/** Password recovery landing — `GET /auth/callback/recovery` (not Path A). */
export function getRecoveryEmailRedirectTo(): string | undefined {
  const origin = getAllowlistedSiteOrigin();
  return origin ? `${origin}/auth/callback/recovery` : undefined;
}
