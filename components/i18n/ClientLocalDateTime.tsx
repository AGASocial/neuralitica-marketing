"use client";

import { useEffect, useState } from "react";

import type { Locale } from "@/lib/i18n/locales";

type ClientLocalDateTimeProps = {
  iso: string;
  locale: Locale | "en" | "es";
  /** Optional template with `{date}` placeholder. When omitted, shows the formatted time alone. */
  template?: string;
  className?: string;
};

function formatLocalDateTime(iso: string, locale: "en" | "es"): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat(locale === "es" ? "es" : "en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

/**
 * Formats an ISO timestamp in the browser timezone only after mount so SSR
 * (often UTC) and the first client render never disagree (React #418).
 */
export function ClientLocalDateTime({
  iso,
  locale,
  template,
  className,
}: ClientLocalDateTimeProps) {
  // Stable placeholder for SSR + first client paint (no Intl / TZ).
  const placeholder = template
    ? template.replace("{date}", "\u00a0")
    : "\u00a0";
  const [label, setLabel] = useState(placeholder);

  useEffect(() => {
    const formatted = formatLocalDateTime(iso, locale);
    setLabel(template ? template.replace("{date}", formatted) : formatted);
  }, [iso, locale, template]);

  return (
    <span className={className} suppressHydrationWarning>
      {label}
    </span>
  );
}

export function formatLocalDateTimeForTest(
  iso: string,
  locale: "en" | "es",
): string {
  return formatLocalDateTime(iso, locale);
}
