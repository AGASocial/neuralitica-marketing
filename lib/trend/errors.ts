import type {
  TrendErrorCode,
  TrendMutationError,
  TrendSnapshotForOperatorResult,
} from "@/lib/contracts/trend";

export function trendError(
  code: TrendErrorCode,
  messageKey: string,
  extra?: { fields?: Record<string, string[]> },
): TrendMutationError {
  return {
    ok: false,
    error: {
      code,
      messageKey,
      ...extra,
    },
  };
}

export function trendValidationError(
  fields: Record<string, string[]>,
): TrendMutationError {
  return trendError("VALIDATION_ERROR", "trend.errors.validation", { fields });
}

export function trendForbiddenFieldsError(): TrendMutationError {
  return trendError("FORBIDDEN_FIELDS", "trend.errors.forbiddenFields");
}

export function trendNotFoundError(): TrendMutationError {
  return trendError("NOT_FOUND", "trend.errors.notFound");
}

export function trendWeekNotFoundResult(): TrendSnapshotForOperatorResult {
  return {
    ok: false,
    error: {
      code: "NOT_FOUND",
      messageKey: "trend.errors.weekNotFound",
    },
  };
}

export function trendDuplicateSlugError(): TrendMutationError {
  return trendError("DUPLICATE_SLUG", "trend.errors.duplicateSlug", {
    fields: { slug: ["trend.errors.duplicateSlug"] },
  });
}

export function trendWeekStartMismatchError(): TrendMutationError {
  return trendError("WEEK_START_MISMATCH", "trend.errors.weekStartMismatch");
}

export function trendInvalidPlaybookSlugError(): TrendMutationError {
  return trendError("VALIDATION_ERROR", "trend.errors.validation", {
    fields: {
      formatos_playbook_compatibles: ["trend.errors.invalidPlaybookSlug"],
    },
  });
}

export function trendInternalError(): TrendMutationError {
  return trendError("INTERNAL_ERROR", "trend.errors.internal");
}

export function trendUnauthenticatedError(): TrendMutationError {
  return trendError("UNAUTHENTICATED", "auth.errors.unauthenticated");
}

export function trendForbiddenError(): TrendMutationError {
  return trendError("FORBIDDEN", "auth.errors.forbidden");
}
