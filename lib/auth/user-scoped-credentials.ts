/**
 * Anon/publishable credentials for the user-scoped Auth client.
 * Safe on Edge (middleware) and Node. Never the service-role key.
 * Never `NEXT_PUBLIC_`.
 */

function getAnonKey(): string | undefined {
  return process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;
}

export function isUserScopedAuthConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && getAnonKey());
}

export function userScopedCookieOptions() {
  return {
    path: "/" as const,
    sameSite: "lax" as const,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  };
}

export function requireUserScopedCredentials(): { url: string; anonKey: string } {
  const url = process.env.SUPABASE_URL;
  const anonKey = getAnonKey();

  if (!url || !anonKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_ANON_KEY (or SUPABASE_PUBLISHABLE_KEY) for user-scoped auth.",
    );
  }

  return { url, anonKey };
}
