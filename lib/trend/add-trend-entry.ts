"use server";

import {
  addTrendEntryInputSchema,
  type AddTrendEntryInput,
  type AddTrendEntryResult,
} from "@/lib/contracts/trend";
import { isAuthGuardError, requireOperator } from "@/lib/auth/require-user";
import { zodInterviewErrorToFieldErrors } from "@/lib/interview/zod-field-errors";
import {
  trendDuplicateSlugError,
  trendForbiddenError,
  trendInternalError,
  trendNotFoundError,
  trendUnauthenticatedError,
  trendValidationError,
} from "@/lib/trend/errors";
import {
  ensureEntryWeekStart,
  hasDuplicateSlug,
  mergeTrendEntryCreate,
  parseStoredEntries,
  persistTrendEntries,
  revalidateTrendPaths,
  selectTrendSnapshotRow,
  validateEntryPlaybookSlugs,
} from "@/lib/trend/trend-mutation-helpers";
import { isSupabaseConfigured } from "@/lib/supabase/server";

function authGuardEnvelope(error: {
  status: 401 | 403;
}): AddTrendEntryResult {
  if (error.status === 401) {
    return trendUnauthenticatedError();
  }
  return trendForbiddenError();
}

/**
 * Append a táctica to a published week (US-16.2).
 * Frontend consumer: `/operator/trends/[weekStart]/new`.
 */
export async function addTrendEntry(
  input: AddTrendEntryInput,
): Promise<AddTrendEntryResult> {
  try {
    await requireOperator("handler");
  } catch (error) {
    if (isAuthGuardError(error)) {
      return authGuardEnvelope(error);
    }
    throw error;
  }

  const parsed = addTrendEntryInputSchema.safeParse(input);
  if (!parsed.success) {
    return trendValidationError(zodInterviewErrorToFieldErrors(parsed.error));
  }

  if (!isSupabaseConfigured()) {
    console.error("[trend] add entry unavailable: Supabase not configured");
    return trendInternalError();
  }

  const { weekStart, entry } = parsed.data;
  const weekMismatch = ensureEntryWeekStart(entry.week_start, weekStart);
  if (weekMismatch) {
    return weekMismatch;
  }

  const playbookError = await validateEntryPlaybookSlugs(entry);
  if (playbookError) {
    return playbookError;
  }

  let row;
  try {
    row = await selectTrendSnapshotRow(weekStart);
  } catch {
    return trendInternalError();
  }

  if (!row) {
    return trendNotFoundError();
  }

  const entries = parseStoredEntries(row.entries);
  if (hasDuplicateSlug(entries, entry.slug)) {
    return trendDuplicateSlugError();
  }

  const merged = mergeTrendEntryCreate(entry);
  const persistError = await persistTrendEntries(weekStart, [...entries, merged]);
  if (persistError) {
    return persistError;
  }

  revalidateTrendPaths(weekStart);
  return { ok: true, weekStart, slug: merged.slug };
}
