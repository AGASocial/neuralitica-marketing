import type {
  QaOverrideErrorCode,
  QaOverrideMutationError,
} from "@/lib/contracts/qa-override";

export function qaOverrideError(
  code: QaOverrideErrorCode,
  messageKey: string,
  extra?: {
    fields?: Record<string, string[]>;
  },
): QaOverrideMutationError {
  return {
    ok: false,
    error: {
      code,
      messageKey,
      ...extra,
    },
  };
}

export function qaOverrideUnauthenticatedError(): QaOverrideMutationError {
  return qaOverrideError(
    "UNAUTHENTICATED",
    "scripts.qa.override.errors.unauthenticated",
  );
}

export function qaOverrideForbiddenError(): QaOverrideMutationError {
  return qaOverrideError("FORBIDDEN", "scripts.qa.override.errors.forbidden");
}

export function qaOverrideForbiddenFieldsError(
  fields?: Record<string, string[]>,
): QaOverrideMutationError {
  return qaOverrideError(
    "FORBIDDEN_FIELDS",
    "scripts.qa.override.errors.forbiddenFields",
    { fields },
  );
}

export function qaOverrideValidationError(
  fields: Record<string, string[]>,
): QaOverrideMutationError {
  return qaOverrideError(
    "VALIDATION_ERROR",
    "scripts.qa.override.errors.validation",
    { fields },
  );
}

export function qaOverrideNotFoundError(): QaOverrideMutationError {
  return qaOverrideError("NOT_FOUND", "scripts.qa.override.errors.notFound");
}

export function qaOverrideCheckBlockingError(): QaOverrideMutationError {
  return qaOverrideError(
    "CHECK_BLOCKING",
    "scripts.qa.override.errors.checkBlocking",
  );
}

export function qaOverrideCheckNotFailedError(): QaOverrideMutationError {
  return qaOverrideError(
    "CHECK_NOT_FAILED",
    "scripts.qa.override.errors.checkNotFailed",
  );
}

export function qaOverrideRateLimitedError(): QaOverrideMutationError {
  return qaOverrideError(
    "RATE_LIMITED",
    "scripts.qa.override.errors.rateLimited",
  );
}

export function qaOverrideInternalError(): QaOverrideMutationError {
  return qaOverrideError("INTERNAL_ERROR", "scripts.qa.override.errors.internal");
}
