import "server-only";

import { cookies, headers } from "next/headers";

import { LOCALE_HEADER } from "@/lib/auth/public-routes";
import { resolveLocale } from "@/lib/i18n/get-translations";
import {
  LOCALE_COOKIE_NAME,
  parseLocaleCookieValue,
} from "@/lib/i18n/locale-cookie";
import { isLocale, type Locale } from "@/lib/i18n/locales";

/**
 * Query (`?locale=` → middleware header) > cookie > preferredLocale > default es.
 */
export async function resolveRequestLocale(
  preferredLocale?: string | null,
): Promise<Locale> {
  const headerList = await headers();
  const fromQuery = headerList.get(LOCALE_HEADER);
  if (fromQuery && isLocale(fromQuery)) {
    return fromQuery;
  }

  const cookieStore = await cookies();
  const fromCookie = parseLocaleCookieValue(
    cookieStore.get(LOCALE_COOKIE_NAME)?.value,
  );
  if (fromCookie) {
    return fromCookie;
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
