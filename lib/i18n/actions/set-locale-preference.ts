"use server";

import { cookies } from "next/headers";

import { isLocale, type Locale } from "@/lib/i18n/locales";
import {
  LOCALE_COOKIE_MAX_AGE_SECONDS,
  LOCALE_COOKIE_NAME,
} from "@/lib/i18n/locale-cookie";

export type SetLocalePreferenceResult =
  | { ok: true; locale: Locale }
  | { ok: false; error: "INVALID_LOCALE" };

/**
 * Persist UI locale in `neuramark_locale` so server components resolve it
 * without a `?locale=` query param.
 */
export async function setLocalePreference(
  raw: unknown,
): Promise<SetLocalePreferenceResult> {
  const locale =
    typeof raw === "string"
      ? raw
      : raw &&
          typeof raw === "object" &&
          "locale" in raw &&
          typeof (raw as { locale: unknown }).locale === "string"
        ? (raw as { locale: string }).locale
        : null;

  if (!locale || !isLocale(locale)) {
    return { ok: false, error: "INVALID_LOCALE" };
  }

  const store = await cookies();
  store.set(LOCALE_COOKIE_NAME, locale, {
    path: "/",
    maxAge: LOCALE_COOKIE_MAX_AGE_SECONDS,
    sameSite: "lax",
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
  });

  return { ok: true, locale };
}
