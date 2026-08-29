import "server-only";

import { revalidatePath } from "next/cache";

import {
  trendEntryCreateInputSchema,
  trendEntryCoreSchema,
  type TrendEntryCore,
  type TrendEntryCreateInput,
} from "@/lib/contracts/trend";
import { validateFormatosPlaybookCompatibles } from "@/lib/trend/validate-playbook-slugs";
import {
  serializeEntries,
  type TrendSnapshotSelectRow,
} from "@/lib/trend/map-trend-row";
import type { TrendMutationError } from "@/lib/contracts/trend";
import { zodInterviewErrorToFieldErrors } from "@/lib/interview/zod-field-errors";
import { trendValidationError, trendDuplicateSlugError, trendInternalError, trendInvalidPlaybookSlugError, trendWeekStartMismatchError } from "@/lib/trend/errors";
import {
  createServerSupabaseClient,
} from "@/lib/supabase/server";

export function revalidateTrendPaths(weekStart: string): void {
  revalidatePath("/operator/trends");
  revalidatePath(`/operator/trends/${weekStart}`);
}

export function mergeTrendEntryCreate(
  entry: TrendEntryCreateInput,
): TrendEntryCore {
  return trendEntryCoreSchema.parse({
    ...entry,
    activo: true,
    fuente: "manual",
  });
}

export async function validateEntryPlaybookSlugs(
  entry: Pick<TrendEntryCreateInput, "formatos_playbook_compatibles">,
): Promise<ReturnType<typeof trendInvalidPlaybookSlugError> | null> {
  const validation = await validateFormatosPlaybookCompatibles(
    entry.formatos_playbook_compatibles,
  );

  if (!validation.ok) {
    if (validation.loadFailed) {
      return trendInternalError();
    }
    return trendInvalidPlaybookSlugError();
  }

  return null;
}

export function ensureEntryWeekStart(
  entryWeekStart: string,
  weekStart: string,
): ReturnType<typeof trendWeekStartMismatchError> | null {
  if (entryWeekStart !== weekStart) {
    return trendWeekStartMismatchError();
  }
  return null;
}

export function hasDuplicateSlug(
  entries: TrendEntryCore[],
  slug: string,
  excludeSlug?: string,
): boolean {
  return entries.some(
    (entry) => entry.slug === slug && entry.slug !== excludeSlug,
  );
}

export async function selectTrendSnapshotRow(
  weekStart: string,
): Promise<TrendSnapshotSelectRow | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_trend_snapshots")
    .select("week_start, entries, published_at, updated_at")
    .eq("week_start", weekStart)
    .maybeSingle();

  if (error) {
    console.error("[trend] select failed", { code: error.code, weekStart });
    throw new Error("Trend snapshot unavailable");
  }

  return (data as TrendSnapshotSelectRow | null) ?? null;
}

export async function persistTrendEntries(
  weekStart: string,
  entries: TrendEntryCore[],
): Promise<ReturnType<typeof trendInternalError> | null> {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("neuramark_trend_snapshots")
    .update({ entries: serializeEntries(entries) })
    .eq("week_start", weekStart);

  if (error) {
    console.error("[trend] persist entries failed", { code: error.code, weekStart });
    return trendInternalError();
  }

  return null;
}

export function parseStoredEntries(raw: unknown): TrendEntryCore[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const entries: TrendEntryCore[] = [];
  for (const item of raw) {
    const parsed = trendEntryCoreSchema.safeParse(item);
    if (parsed.success) {
      entries.push(parsed.data);
    }
  }
  return entries;
}

export function validateCreateEntriesBatch(
  entries: TrendEntryCreateInput[],
  weekStart: string,
): TrendEntryCore[] | TrendMutationError {
  const merged: TrendEntryCore[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const parsed = trendEntryCreateInputSchema.safeParse(entry);
    if (!parsed.success) {
      return trendValidationError(zodInterviewErrorToFieldErrors(parsed.error));
    }

    const weekMismatch = ensureEntryWeekStart(parsed.data.week_start, weekStart);
    if (weekMismatch) {
      return weekMismatch;
    }

    if (seen.has(parsed.data.slug)) {
      return trendDuplicateSlugError();
    }
    seen.add(parsed.data.slug);

    merged.push(mergeTrendEntryCreate(parsed.data));
  }

  return merged;
}
