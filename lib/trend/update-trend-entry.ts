"use server";

import {
  trendEntryUpdateInputSchema,
  trendWeekStartSchema,
  type TrendEntryUpdateInput,
  type UpdateTrendEntryResult,
} from "@/lib/contracts/trend";
import { playbookSlugSchema } from "@/lib/contracts/playbook";
import { isAuthGuardError, requireOperator } from "@/lib/auth/require-user";
import { zodInterviewErrorToFieldErrors } from "@/lib/interview/zod-field-errors";
import {
  trendForbiddenFieldsError,
  trendForbiddenError,
  trendInternalError,
  trendNotFoundError,
  trendUnauthenticatedError,
  trendValidationError,
} from "@/lib/trend/errors";
import {
  ensureEntryWeekStart,
  parseStoredEntries,
  persistTrendEntries,
  revalidateTrendPaths,
  selectTrendSnapshotRow,
  validateEntryPlaybookSlugs,
} from "@/lib/trend/trend-mutation-helpers";
import { trendEntryCoreSchema } from "@/lib/contracts/trend";
import { isSupabaseConfigured } from "@/lib/supabase/server";

function authGuardEnvelope(error: {
  status: 401 | 403;
}): UpdateTrendEntryResult {
  if (error.status === 401) {
    return trendUnauthenticatedError();
  }
  return trendForbiddenError();
}

/**
 * Update a táctica in a week snapshot (US-16.2).
 * Frontend consumer: `/operator/trends/[weekStart]/[slug]` — Save.
 */
export async function updateTrendEntry(
  weekStart: string,
  slug: string,
  input: TrendEntryUpdateInput,
): Promise<UpdateTrendEntryResult> {
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

  if (
    typeof input === "object" &&
    input !== null &&
    "slug" in input
  ) {
    return trendForbiddenFieldsError();
  }

  const parsed = trendEntryUpdateInputSchema.safeParse(input);
  if (!parsed.success) {
    return trendValidationError(zodInterviewErrorToFieldErrors(parsed.error));
  }

  if (!isSupabaseConfigured()) {
    console.error("[trend] update entry unavailable: Supabase not configured");
    return trendInternalError();
  }

  const weekMismatch = ensureEntryWeekStart(parsed.data.week_start, weekParsed.data);
  if (weekMismatch) {
    return weekMismatch;
  }

  const playbookError = await validateEntryPlaybookSlugs(parsed.data);
  if (playbookError) {
    return playbookError;
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

  const existing = entries[index];
  const updated = trendEntryCoreSchema.parse({
    ...parsed.data,
    slug: existing.slug,
    activo: existing.activo,
    fuente: "manual",
  });

  const next = [...entries];
  next[index] = updated;

  const persistError = await persistTrendEntries(weekParsed.data, next);
  if (persistError) {
    return persistError;
  }

  revalidateTrendPaths(weekParsed.data);
  return { ok: true, weekStart: weekParsed.data, slug: slugParsed.data };
}
