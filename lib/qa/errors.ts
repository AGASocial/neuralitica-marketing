import type {
  QaReportErrorCode,
  QaReportMutationError,
} from "@/lib/contracts/qa-report";
import type { ReelBudgetPreview } from "@/lib/contracts/cost-policy";

export function qaReportError(
  code: QaReportErrorCode,
  messageKey: string,
  extra?: {
    fields?: Record<string, string[]>;
    previews?: ReelBudgetPreview[];
  },
): QaReportMutationError {
  return {
    ok: false,
    error: {
      code,
      messageKey,
      ...extra,
    },
  };
}

export function qaUnauthenticatedError(): QaReportMutationError {
  return qaReportError("UNAUTHENTICATED", "scripts.qa.errors.unauthenticated");
}

export function qaForbiddenError(): QaReportMutationError {
  return qaReportError("FORBIDDEN", "scripts.qa.errors.forbidden");
}

export function qaForbiddenFieldsError(
  fields?: Record<string, string[]>,
): QaReportMutationError {
  return qaReportError("FORBIDDEN_FIELDS", "scripts.qa.errors.forbiddenFields", {
    fields,
  });
}

export function qaValidationError(
  fields: Record<string, string[]>,
): QaReportMutationError {
  return qaReportError("VALIDATION_ERROR", "scripts.qa.errors.validation", {
    fields,
  });
}

export function qaNotFoundError(): QaReportMutationError {
  return qaReportError("NOT_FOUND", "scripts.qa.errors.notFound");
}

export function qaAssemblyNotReadyError(): QaReportMutationError {
  return qaReportError(
    "ASSEMBLY_NOT_READY",
    "scripts.qa.errors.assemblyNotReady",
  );
}

export function qaBrandingRequiredError(): QaReportMutationError {
  return qaReportError(
    "BRANDING_REQUIRED",
    "scripts.qa.errors.brandingRequired",
  );
}

export function qaCaptionRequiredError(): QaReportMutationError {
  return qaReportError(
    "CAPTION_REQUIRED",
    "scripts.qa.errors.captionRequired",
  );
}

export function qaScriptNotFoundError(): QaReportMutationError {
  return qaReportError("SCRIPT_NOT_FOUND", "scripts.qa.errors.scriptNotFound");
}

export function qaRateLimitedError(): QaReportMutationError {
  return qaReportError("RATE_LIMITED", "scripts.qa.errors.rateLimited");
}

export function qaBudgetExceededError(options?: {
  previews?: ReelBudgetPreview[];
}): QaReportMutationError {
  return qaReportError("BUDGET_EXCEEDED", "scripts.qa.errors.budgetExceeded", {
    previews: options?.previews,
  });
}

export function qaCostPolicyUnavailableError(): QaReportMutationError {
  return qaReportError(
    "COST_POLICY_UNAVAILABLE",
    "scripts.qa.errors.costPolicyUnavailable",
  );
}

export function qaProviderUnavailableError(): QaReportMutationError {
  return qaReportError(
    "PROVIDER_UNAVAILABLE",
    "scripts.qa.errors.providerUnavailable",
  );
}

export function qaOutputInvalidError(): QaReportMutationError {
  return qaReportError(
    "QA_OUTPUT_INVALID",
    "scripts.qa.errors.qaOutputInvalid",
  );
}

export function qaInternalError(): QaReportMutationError {
  return qaReportError("INTERNAL_ERROR", "scripts.qa.errors.internal");
}
