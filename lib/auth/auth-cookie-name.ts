/** Host-only `@supabase/ssr` session cookies. Presence is not a valid session. */
export function isSupabaseAuthCookieName(name: string): boolean {
  return name.startsWith("sb-");
}
