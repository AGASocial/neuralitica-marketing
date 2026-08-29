import type {
  PlaybookErrorCode,
  PlaybookFormatoForOperatorResult,
  PlaybookMutationError,
} from "@/lib/contracts/playbook";

export function playbookError(
  code: PlaybookErrorCode,
  messageKey: string,
  extra?: { fields?: Record<string, string[]> },
): PlaybookMutationError {
  return {
    ok: false,
    error: {
      code,
      messageKey,
      ...extra,
    },
  };
}

export function playbookValidationError(
  fields: Record<string, string[]>,
): PlaybookMutationError {
  return playbookError("VALIDATION_ERROR", "playbook.errors.validation", {
    fields,
  });
}

export function playbookForbiddenFieldsError(): PlaybookMutationError {
  return playbookError("FORBIDDEN_FIELDS", "playbook.errors.forbiddenFields");
}

export function playbookNotFoundError(): PlaybookMutationError {
  return playbookError("NOT_FOUND", "playbook.errors.notFound");
}

export function playbookFormatoNotFoundResult(): PlaybookFormatoForOperatorResult {
  return {
    ok: false,
    error: {
      code: "NOT_FOUND",
      messageKey: "playbook.errors.notFound",
    },
  };
}

export function playbookDuplicateSlugError(): PlaybookMutationError {
  return playbookError("DUPLICATE_SLUG", "playbook.errors.duplicateSlug");
}

export function playbookVersionConflictError(): PlaybookMutationError {
  return playbookError("VERSION_CONFLICT", "playbook.errors.versionConflict");
}

export function playbookAlreadyArchivedError(): PlaybookMutationError {
  return playbookError("ALREADY_ARCHIVED", "playbook.errors.alreadyArchived");
}

export function playbookInternalError(): PlaybookMutationError {
  return playbookError("INTERNAL_ERROR", "playbook.errors.internal");
}

export function playbookUnauthenticatedError(): PlaybookMutationError {
  return playbookError("UNAUTHENTICATED", "auth.errors.unauthenticated");
}

export function playbookForbiddenError(): PlaybookMutationError {
  return playbookError("FORBIDDEN", "auth.errors.forbidden");
}
