import "server-only";

import { headers } from "next/headers";

import { LOCALE_HEADER } from "@/lib/auth/public-routes";
import { resolveLocale } from "@/lib/i18n/get-translations";
import { isLocale, type Locale } from "@/lib/i18n/locales";

/**
 * Prefer `?locale=` (middleware → x-neuramark-locale) over the user's saved
 * preferredLocale so chat chrome matches the page when the query overrides.
 */
export async function resolveRequestLocale(
  preferredLocale?: string | null,
): Promise<Locale> {
  const headerList = await headers();
  const fromQuery = headerList.get(LOCALE_HEADER);
  if (fromQuery && isLocale(fromQuery)) {
    return fromQuery;
  }
  return resolveLocale(preferredLocale);
}

export function resolveChatBodyLocale(
  bodyLocale: unknown,
  preferredLocale?: string | null,
): Locale {
  if (typeof bodyLocale === "string" && isLocale(bodyLocale)) {
    return bodyLocale;
  }
  return resolveLocale(preferredLocale);
}
