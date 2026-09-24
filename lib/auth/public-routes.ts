/**
 * Deny-by-default public allowlist (US-14.5 CONTRACT).
 * Exact pathname after trailing-slash normalize. No locale prefixes.
 * `/pending` is not public. The `(auth)` group is not blindly public.
 *
 * Exception: HMAC-signed vendor asset URLs under `/api/media/provider-assets/*`
 * must be fetchable without session cookies (Wan/SadTalker/etc.). Auth is the
 * signature on the query string — middleware must not redirect to /login.
 */

const PUBLIC_EXACT = new Set([
  "/login",
  "/signup",
  "/reset-password",
  "/reset-password/new",
  "/auth/callback",
  "/auth/callback/recovery",
]);

const PROVIDER_ASSET_PATH_RE =
  /^\/api\/media\/provider-assets\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const PATHNAME_HEADER = "x-neuramark-pathname";
export const LOCALE_HEADER = "x-neuramark-locale";

export function normalizePathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

export function isPublicPath(pathname: string): boolean {
  const normalized = normalizePathname(pathname);
  if (PUBLIC_EXACT.has(normalized)) {
    return true;
  }
  return PROVIDER_ASSET_PATH_RE.test(normalized);
}
