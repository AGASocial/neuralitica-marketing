/**
 * Display-only currency formatting for Operator cost UI (US-7.1).
 * Cents remain authoritative on the server; this is never used for gate math.
 */
export function formatCentsForDisplay(cents: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(2)}`;
  }
}

/** Convert dollars entered in UI to integer cents for server mutations. */
export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

/** Convert server cents to dollars for controlled numeric inputs. */
export function centsToDollars(cents: number): number {
  return cents / 100;
}
