"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { CSSProperties } from "react";

import type { Locale } from "@/lib/i18n/locales";

type AuthLocaleSwitcherProps = {
  locale: Locale;
  labels: {
    en: string;
    es: string;
  };
};

export function AuthLocaleSwitcher({ locale, labels }: AuthLocaleSwitcherProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function hrefFor(nextLocale: Locale) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("locale", nextLocale);
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  const linkStyle = (active: boolean): CSSProperties => ({
    fontSize: "0.875rem",
    fontWeight: active ? 600 : 500,
    color: active ? "#4338ca" : "#6b7280",
    textDecoration: "none",
    padding: "0.15rem 0.35rem",
  });

  return (
    <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center" }}>
      <Link href={hrefFor("en")} style={linkStyle(locale === "en")}>
        {labels.en}
      </Link>
      <span style={{ color: "#d1d5db" }}>|</span>
      <Link href={hrefFor("es")} style={linkStyle(locale === "es")}>
        {labels.es}
      </Link>
    </div>
  );
}
