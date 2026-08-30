import type {
  ContentStrategyErrorCode,
  ContentStrategyMutationError,
  GetLatestContentStrategyResult,
} from "@/lib/contracts/content-strategy";

export function contentStrategyError(
  code: ContentStrategyErrorCode,
  messageKey: string,
  extra?: { fields?: Record<string, string[]> },
): ContentStrategyMutationError {
  return {
    ok: false,
    error: {
      code,
      messageKey,
      ...extra,
    },
  };
}

export function contentStrategyValidationError(
  fields: Record<string, string[]>,
): ContentStrategyMutationError {
  return contentStrategyError("VALIDATION_ERROR", "strategy.errors.validation", {
    fields,
  });
}

export function contentStrategyForbiddenFieldsError(): ContentStrategyMutationError {
  return contentStrategyError(
    "FORBIDDEN_FIELDS",
    "strategy.errors.forbiddenFields",
  );
}

export function contentStrategyInternalError(): ContentStrategyMutationError {
  return contentStrategyError("INTERNAL_ERROR", "strategy.errors.internal");
}

export function contentStrategyUnauthenticatedError(): ContentStrategyMutationError {
  return contentStrategyError("UNAUTHENTICATED", "auth.errors.unauthenticated");
}

export function contentStrategyForbiddenError(): ContentStrategyMutationError {
  return contentStrategyError("FORBIDDEN", "auth.errors.forbidden");
}

export function contentStrategyRateLimitedError(): ContentStrategyMutationError {
  return contentStrategyError("RATE_LIMITED", "strategy.errors.rateLimited");
}

export function contentStrategyInFlightError(): ContentStrategyMutationError {
  return contentStrategyError(
    "GENERATION_IN_FLIGHT",
    "strategy.errors.inFlight",
  );
}

export function contentStrategyProfileIncompleteError(): ContentStrategyMutationError {
  return contentStrategyError(
    "PROFILE_INCOMPLETE",
    "strategy.errors.profileIncomplete",
  );
}

export function contentStrategyAgentOutputInvalidError(
  fields: Record<string, string[]>,
): ContentStrategyMutationError {
  return contentStrategyError(
    "AGENT_OUTPUT_INVALID",
    "strategy.errors.agentOutputInvalid",
    { fields },
  );
}

export function contentStrategyProviderUnavailableError(): ContentStrategyMutationError {
  return contentStrategyError(
    "PROVIDER_UNAVAILABLE",
    "strategy.errors.providerUnavailable",
  );
}

export function getLatestContentStrategyForbiddenResult(): GetLatestContentStrategyResult {
  return contentStrategyForbiddenError() as unknown as GetLatestContentStrategyResult;
}

export function getLatestContentStrategyUnauthenticatedResult(): GetLatestContentStrategyResult {
  return contentStrategyUnauthenticatedError() as unknown as GetLatestContentStrategyResult;
}
