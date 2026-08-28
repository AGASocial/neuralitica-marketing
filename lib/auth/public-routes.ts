/**
 * Deny-by-default public allowlist (US-14.5 CONTRACT).
 * Exact pathname after trailing-slash normalize. No locale prefixes, no `/api/*`.
 * `/pending` is not public. The `(auth)` group is not blindly public.
 */

const PUBLIC_EXACT = new Set([
  "/login",
  "/signup",
  "/reset-password",
  "/reset-password/new",
  "/auth/callback",
  "/auth/callback/recovery",
]);

export const PATHNAME_HEADER = "x-neuramark-pathname";
export const LOCALE_HEADER = "x-neuramark-locale";

export function normalizePathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_EXACT.has(normalizePathname(pathname));
}
