import { isLocale, type Locale } from "@/lib/i18n/locales";

/** Persist UI locale without `?locale=` (cookie > preference > default es). */
export const LOCALE_COOKIE_NAME = "neuramark_locale";

export const LOCALE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function parseLocaleCookieValue(
  value: string | undefined | null,
): Locale | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return isLocale(trimmed) ? trimmed : null;
}
