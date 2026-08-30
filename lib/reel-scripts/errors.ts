import type {
  ReelScriptErrorCode,
  ReelScriptMutationError,
} from "@/lib/contracts/reel-script";

export function reelScriptError(
  code: ReelScriptErrorCode,
  messageKey: string,
  extra?: { fields?: Record<string, string[]> },
): ReelScriptMutationError {
  return {
    ok: false,
    error: {
      code,
      messageKey,
      ...extra,
    },
  };
}

export function reelScriptValidationError(
  fields: Record<string, string[]>,
): ReelScriptMutationError {
  return reelScriptError("VALIDATION_ERROR", "scripts.errors.validation", {
    fields,
  });
}

export function reelScriptForbiddenFieldsError(): ReelScriptMutationError {
  return reelScriptError(
    "FORBIDDEN_FIELDS",
    "scripts.errors.forbiddenFields",
  );
}

export function reelScriptInternalError(): ReelScriptMutationError {
  return reelScriptError("INTERNAL_ERROR", "scripts.errors.internal");
}

export function reelScriptUnauthenticatedError(): ReelScriptMutationError {
  return reelScriptError("UNAUTHENTICATED", "auth.errors.unauthenticated");
}

export function reelScriptForbiddenError(): ReelScriptMutationError {
  return reelScriptError("FORBIDDEN", "auth.errors.forbidden");
}

export function reelScriptRateLimitedError(): ReelScriptMutationError {
  return reelScriptError("RATE_LIMITED", "scripts.errors.rateLimited");
}

export function reelScriptInFlightError(): ReelScriptMutationError {
  return reelScriptError("GENERATION_IN_FLIGHT", "scripts.errors.inFlight");
}

export function reelScriptProfileIncompleteError(): ReelScriptMutationError {
  return reelScriptError(
    "PROFILE_INCOMPLETE",
    "scripts.errors.profileIncomplete",
  );
}

export function reelScriptOutputInvalidError(
  fields: Record<string, string[]>,
): ReelScriptMutationError {
  return reelScriptError(
    "SCRIPT_OUTPUT_INVALID",
    "scripts.errors.scriptOutputInvalid",
    { fields },
  );
}

export function reelScriptProviderUnavailableError(): ReelScriptMutationError {
  return reelScriptError(
    "PROVIDER_UNAVAILABLE",
    "scripts.errors.providerUnavailable",
  );
}

export function reelScriptNotFoundError(): ReelScriptMutationError {
  return reelScriptError("NOT_FOUND", "scripts.errors.notFound");
}

export function reelScriptStrategyNotApprovedError(): ReelScriptMutationError {
  return reelScriptError(
    "STRATEGY_NOT_APPROVED",
    "scripts.errors.strategyNotApproved",
  );
}

export function reelScriptSlotNotFoundError(): ReelScriptMutationError {
  return reelScriptError("SLOT_NOT_FOUND", "scripts.errors.slotNotFound");
}
