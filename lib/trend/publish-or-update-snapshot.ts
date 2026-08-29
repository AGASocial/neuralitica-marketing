"use server";

import {
  publishOrUpdateSnapshotInputSchema,
  type PublishOrUpdateSnapshotInput,
  type PublishOrUpdateSnapshotResult,
} from "@/lib/contracts/trend";
import { isAuthGuardError, requireOperator } from "@/lib/auth/require-user";
import { zodInterviewErrorToFieldErrors } from "@/lib/interview/zod-field-errors";
import {
  trendForbiddenError,
  trendInternalError,
  trendUnauthenticatedError,
  trendValidationError,
} from "@/lib/trend/errors";
import {
  mergeTrendEntryCreate,
  parseStoredEntries,
  revalidateTrendPaths,
  validateCreateEntriesBatch,
  validateEntryPlaybookSlugs,
} from "@/lib/trend/trend-mutation-helpers";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

function authGuardEnvelope(error: {
  status: 401 | 403;
}): PublishOrUpdateSnapshotResult {
  if (error.status === 401) {
    return trendUnauthenticatedError();
  }
  return trendForbiddenError();
}

/**
 * Upsert a weekly Snapshot de tendencias (US-16.2).
 * Frontend consumer: `/operator/trends` — Publish new week.
 */
export async function publishOrUpdateSnapshot(
  input: PublishOrUpdateSnapshotInput,
): Promise<PublishOrUpdateSnapshotResult> {
  try {
    await requireOperator("handler");
  } catch (error) {
    if (isAuthGuardError(error)) {
      return authGuardEnvelope(error);
    }
    throw error;
  }

  const parsed = publishOrUpdateSnapshotInputSchema.safeParse(input);
  if (!parsed.success) {
    return trendValidationError(zodInterviewErrorToFieldErrors(parsed.error));
  }

  if (!isSupabaseConfigured()) {
    console.error("[trend] publish unavailable: Supabase not configured");
    return trendInternalError();
  }

  const weekStart = parsed.data.weekStart;
  const supabase = createServerSupabaseClient();

  const { data: existing, error: selectError } = await supabase
    .from("neuramark_trend_snapshots")
    .select("week_start, entries")
    .eq("week_start", weekStart)
    .maybeSingle();

  if (selectError) {
    console.error("[trend] publish select failed", {
      code: selectError.code,
      weekStart,
    });
    return trendInternalError();
  }

  if (parsed.data.entries !== undefined) {
    const batch = validateCreateEntriesBatch(parsed.data.entries, weekStart);
    if (!Array.isArray(batch)) {
      return batch;
    }

    for (const entry of batch) {
      const slugError = await validateEntryPlaybookSlugs(entry);
      if (slugError) {
        return slugError;
      }
    }

    if (!existing) {
      const { error: insertError } = await supabase
        .from("neuramark_trend_snapshots")
        .insert({
          week_start: weekStart,
          entries: batch,
        });

      if (insertError) {
        console.error("[trend] publish insert failed", {
          code: insertError.code,
          weekStart,
        });
        return trendInternalError();
      }

      revalidateTrendPaths(weekStart);
      return { ok: true, weekStart, created: true };
    }

    const { error: updateError } = await supabase
      .from("neuramark_trend_snapshots")
      .update({ entries: batch })
      .eq("week_start", weekStart);

    if (updateError) {
      console.error("[trend] publish update entries failed", {
        code: updateError.code,
        weekStart,
      });
      return trendInternalError();
    }

    revalidateTrendPaths(weekStart);
    return { ok: true, weekStart, created: false };
  }

  if (!existing) {
    const { error: insertError } = await supabase
      .from("neuramark_trend_snapshots")
      .insert({
        week_start: weekStart,
        entries: [],
      });

    if (insertError) {
      console.error("[trend] publish insert failed", {
        code: insertError.code,
        weekStart,
      });
      return trendInternalError();
    }

    revalidateTrendPaths(weekStart);
    return { ok: true, weekStart, created: true };
  }

  revalidateTrendPaths(weekStart);
  return { ok: true, weekStart, created: false };
}
