/**
 * Normalize a calendar date to the ISO week Monday (UTC) as YYYY-MM-DD.
 * Used by Operator Trend week picker before publish.
 */
export function normalizeToIsoMonday(input: Date): string {
  const date = new Date(
    Date.UTC(input.getFullYear(), input.getMonth(), input.getDate(), 12, 0, 0, 0),
  );
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
}

export function formatWeekRange(weekStart: string, locale: string): string {
  const start = new Date(`${weekStart}T12:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);

  try {
    const formatter = new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
    return `${formatter.format(start)} – ${formatter.format(end)}`;
  } catch {
    return weekStart;
  }
}
