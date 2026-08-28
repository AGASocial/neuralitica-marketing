import { normalizePathname } from "./public-routes";
import { sanitizeLoginNext } from "./safe-next-path";

/**
 * Same-origin relative `/login` Location. Never copies Host / X-Forwarded-Host.
 * Omits `next` when the requested path is `/pending` (not an activation oracle).
 * Node `redirect()` accepts this relative form; Edge middleware must wrap it
 * with {@link buildAbsoluteLoginLocation}.
 */
export function buildLoginLocation(options: {
  next?: string | null;
  locale?: string | null;
}): string {
  const params = new URLSearchParams();
  const locale = options.locale?.trim();
  if (locale) {
    params.set("locale", locale);
  }

  const next = options.next;
  if (typeof next === "string" && next.length > 0) {
    const normalized = normalizePathname(next);
    if (normalized !== "/pending") {
      params.set("next", sanitizeLoginNext(next));
    }
  }

  const query = params.toString();
  return query ? `/login?${query}` : "/login";
}

function originFromSiteUrl(siteUrl: string | undefined | null): string | undefined {
  const configured = siteUrl?.trim();
  if (!configured) {
    return undefined;
  }

  const base =
    configured.startsWith("http://") || configured.startsWith("https://")
      ? configured
      : `https://${configured}`;

  try {
    const origin = new URL(base).origin;
    if (origin && origin !== "null") {
      return origin;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

/**
 * Allowlisted public origin for Edge login redirects.
 * Prefers server-only `SITE_URL`. If unset or invalid, uses `appOrigin`
 * (`request.nextUrl.origin` — the app origin, not `Host` / `X-Forwarded-Host`).
 */
export function resolveAllowlistedRedirectOrigin(
  siteUrl: string | undefined | null,
  appOrigin: string,
): string {
  return originFromSiteUrl(siteUrl) ?? new URL(appOrigin).origin;
}

/**
 * Absolute `/login` URL for Next.js 15 Edge (`validateURL` rejects relative
 * `Location`). Origin is allowlisted; `next` is still sanitized.
 */
export function buildAbsoluteLoginLocation(options: {
  siteUrl?: string | null;
  appOrigin: string;
  next?: string | null;
  locale?: string | null;
}): string {
  const origin = resolveAllowlistedRedirectOrigin(
    options.siteUrl,
    options.appOrigin,
  );
  return new URL(buildLoginLocation(options), origin).toString();
}
