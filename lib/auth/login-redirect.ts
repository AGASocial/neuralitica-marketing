import { normalizePathname } from "./public-routes";
import { sanitizeLoginNext } from "./safe-next-path";

/**
 * Same-origin relative `/login` Location. Never copies Host / X-Forwarded-Host.
 * Omits `next` when the requested path is `/pending` (not an activation oracle).
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
