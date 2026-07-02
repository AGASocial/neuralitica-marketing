import "server-only";

import en from "@/messages/en.json";
import es from "@/messages/es.json";

import { type Locale, isLocale } from "./locales";

const catalogs = { en, es } as const;

export type TranslationKey = keyof typeof en;

export function resolveLocale(
  preferred?: string | null,
  fallback: Locale = "en",
): Locale {
  if (preferred && isLocale(preferred)) {
    return preferred;
  }

  return fallback;
}

export function getTranslations(locale: Locale) {
  return catalogs[locale];
}
