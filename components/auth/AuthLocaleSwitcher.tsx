"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import type { Locale } from "@/lib/i18n/locales";
import { cn } from "@/lib/utils";

/** Safe query keys to preserve across locale switches. Never copy tokens or PII. */
const AUTH_LOCALE_HREF_KEYS = [
  "next",
  "redirectTo",
  "confirmed",
  "error",
  "reset",
] as const;

type AuthLocaleSwitcherProps = {
  locale: Locale;
  labels: {
    en: string;
    es: string;
  };
};

function hrefForLocale(
  pathname: string,
  searchParams: Pick<URLSearchParams, "get">,
  nextLocale: Locale,
): string {
  const params = new URLSearchParams();
  params.set("locale", nextLocale);

  for (const key of AUTH_LOCALE_HREF_KEYS) {
    const value = searchParams.get(key)?.trim();
    if (value) {
      params.set(key, value);
    }
  }

  return `${pathname}?${params.toString()}`;
}

export function AuthLocaleSwitcher({ locale, labels }: AuthLocaleSwitcherProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function hrefFor(nextLocale: Locale) {
    return hrefForLocale(pathname, searchParams, nextLocale);
  }

  return (
    <div className="flex items-center justify-center gap-2 text-sm">
      <Link
        href={hrefFor("en")}
        className={cn(
          "rounded-full px-2 py-0.5 focus-visible:outline-none",
          locale === "en" ? "font-semibold text-butter" : "text-dim hover:text-fog",
        )}
        aria-current={locale === "en" ? "true" : undefined}
      >
        {labels.en}
      </Link>
      <span className="text-edge" aria-hidden>
        |
      </span>
      <Link
        href={hrefFor("es")}
        className={cn(
          "rounded-full px-2 py-0.5 focus-visible:outline-none",
          locale === "es" ? "font-semibold text-butter" : "text-dim hover:text-fog",
        )}
        aria-current={locale === "es" ? "true" : undefined}
      >
        {labels.es}
      </Link>
    </div>
  );
}
