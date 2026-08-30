import type {
  BrandingJobErrorCode,
  BrandingJobMutationError,
} from "@/lib/contracts/branding-job";

export function brandingJobMutationError(
  code: BrandingJobErrorCode,
  options?: {
    messageKey?: string;
    fields?: Record<string, string[]>;
  },
): BrandingJobMutationError {
  return {
    ok: false,
    error: {
      code,
      ...(options?.messageKey ? { messageKey: options.messageKey } : {}),
      ...(options?.fields ? { fields: options.fields } : {}),
    },
  };
}

export function brandingJobUnauthenticatedError(): BrandingJobMutationError {
  return brandingJobMutationError("UNAUTHENTICATED");
}

export function brandingJobForbiddenError(): BrandingJobMutationError {
  return brandingJobMutationError("FORBIDDEN");
}

export function brandingJobNotFoundError(): BrandingJobMutationError {
  return brandingJobMutationError("NOT_FOUND");
}

export function brandingJobForbiddenFieldsError(): BrandingJobMutationError {
  return brandingJobMutationError("FORBIDDEN_FIELDS");
}

export function brandingJobInternalError(): BrandingJobMutationError {
  return brandingJobMutationError("INTERNAL_ERROR");
}

export function brandingBaseIncompleteError(): BrandingJobMutationError {
  return brandingJobMutationError("BRANDING_BASE_INCOMPLETE");
}

export function brandingSubtitleSanitizeFailedError(): BrandingJobMutationError {
  return brandingJobMutationError("SUBTITLE_SANITIZE_FAILED", {
    messageKey: "scripts.branding.failure.subtitleSanitize",
  });
}

export function brandingValidationError(
  fields?: Record<string, string[]>,
): BrandingJobMutationError {
  return brandingJobMutationError("VALIDATION_ERROR", { fields });
}
