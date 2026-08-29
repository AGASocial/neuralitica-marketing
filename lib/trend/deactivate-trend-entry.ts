"use server";

import {
  trendWeekStartSchema,
  type DeactivateTrendEntryResult,
} from "@/lib/contracts/trend";
import { playbookSlugSchema } from "@/lib/contracts/playbook";
import { isAuthGuardError, requireOperator } from "@/lib/auth/require-user";
import {
  trendForbiddenError,
  trendInternalError,
  trendNotFoundError,
  trendUnauthenticatedError,
} from "@/lib/trend/errors";
import {
  parseStoredEntries,
  persistTrendEntries,
  revalidateTrendPaths,
  selectTrendSnapshotRow,
} from "@/lib/trend/trend-mutation-helpers";
import { isSupabaseConfigured } from "@/lib/supabase/server";

function authGuardEnvelope(error: {
  status: 401 | 403;
}): DeactivateTrendEntryResult {
  if (error.status === 401) {
    return trendUnauthenticatedError();
  }
  return trendForbiddenError();
}

/**
 * Soft-deactivate a táctica in a week snapshot (US-16.2).
 * Frontend consumer: `/operator/trends/[weekStart]/[slug]` — Deactivate.
 */
export async function deactivateTrendEntry(
  weekStart: string,
  slug: string,
): Promise<DeactivateTrendEntryResult> {
  try {
    await requireOperator("handler");
  } catch (error) {
    if (isAuthGuardError(error)) {
      return authGuardEnvelope(error);
    }
    throw error;
  }

  const weekParsed = trendWeekStartSchema.safeParse(weekStart);
  const slugParsed = playbookSlugSchema.safeParse(slug);
  if (!weekParsed.success || !slugParsed.success) {
    return trendNotFoundError();
  }

  if (!isSupabaseConfigured()) {
    console.error("[trend] deactivate unavailable: Supabase not configured");
    return trendInternalError();
  }

  let row;
  try {
    row = await selectTrendSnapshotRow(weekParsed.data);
  } catch {
    return trendInternalError();
  }

  if (!row) {
    return trendNotFoundError();
  }

  const entries = parseStoredEntries(row.entries);
  const index = entries.findIndex((entry) => entry.slug === slugParsed.data);
  if (index === -1) {
    return trendNotFoundError();
  }

  if (!entries[index].activo) {
    revalidateTrendPaths(weekParsed.data);
    return {
      ok: true,
      weekStart: weekParsed.data,
      slug: slugParsed.data,
      alreadyInactive: true,
    };
  }

  const next = [...entries];
  next[index] = { ...next[index], activo: false };

  const persistError = await persistTrendEntries(weekParsed.data, next);
  if (persistError) {
    return persistError;
  }

  revalidateTrendPaths(weekParsed.data);
  return { ok: true, weekStart: weekParsed.data, slug: slugParsed.data };
}
