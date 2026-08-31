/**
 * Operator-local calendar date (YYYY-MM-DD) for publishedAt bounds (US-12.2).
 */
export function operatorLocalCalendarDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addCalendarDays(dateOnly: string, days: number): string {
  const anchor = new Date(`${dateOnly}T12:00:00.000Z`);
  anchor.setUTCDate(anchor.getUTCDate() + days);
  return anchor.toISOString().slice(0, 10);
}

export function publishedAtUtcNoonIsoFromDateInput(dateOnly: string): string {
  return `${dateOnly}T12:00:00.000Z`;
}

export function isPublishedAtWithinBounds(params: {
  publishedAt: string;
  weekStart: string;
  now?: Date;
}): boolean {
  if (params.publishedAt < params.weekStart) {
    return false;
  }
  const maxDate = addCalendarDays(operatorLocalCalendarDate(params.now), 1);
  return params.publishedAt <= maxDate;
}
