import type {
  ReelCaptionErrorCode,
  ReelCaptionMutationError,
} from "@/lib/contracts/reel-caption";

export function reelCaptionError(
  code: ReelCaptionErrorCode,
  messageKey: string,
  extra?: { fields?: Record<string, string[]> },
): ReelCaptionMutationError {
  return {
    ok: false,
    error: {
      code,
      messageKey,
      ...extra,
    },
  };
}

export function reelCaptionValidationError(
  fields: Record<string, string[]>,
): ReelCaptionMutationError {
  return reelCaptionError("VALIDATION_ERROR", "scripts.caption.errors.validation", {
    fields,
  });
}

export function reelCaptionForbiddenFieldsError(): ReelCaptionMutationError {
  return reelCaptionError(
    "FORBIDDEN_FIELDS",
    "scripts.caption.errors.forbiddenFields",
  );
}

export function reelCaptionInternalError(): ReelCaptionMutationError {
  return reelCaptionError("INTERNAL_ERROR", "scripts.caption.errors.internal");
}

export function reelCaptionUnauthenticatedError(): ReelCaptionMutationError {
  return reelCaptionError("UNAUTHENTICATED", "auth.errors.unauthenticated");
}

export function reelCaptionForbiddenError(): ReelCaptionMutationError {
  return reelCaptionError("FORBIDDEN", "auth.errors.forbidden");
}

export function reelCaptionRateLimitedError(): ReelCaptionMutationError {
  return reelCaptionError("RATE_LIMITED", "scripts.caption.errors.rateLimited");
}

export function reelCaptionInFlightError(): ReelCaptionMutationError {
  return reelCaptionError("GENERATION_IN_FLIGHT", "scripts.caption.errors.inFlight");
}

export function reelCaptionProfileIncompleteError(): ReelCaptionMutationError {
  return reelCaptionError(
    "PROFILE_INCOMPLETE",
    "scripts.caption.errors.profileIncomplete",
  );
}

export function reelCaptionOutputInvalidError(
  fields: Record<string, string[]>,
): ReelCaptionMutationError {
  return reelCaptionError(
    "CAPTION_OUTPUT_INVALID",
    "scripts.caption.errors.captionOutputInvalid",
    { fields },
  );
}

export function reelCaptionProviderUnavailableError(): ReelCaptionMutationError {
  return reelCaptionError(
    "PROVIDER_UNAVAILABLE",
    "scripts.caption.errors.providerUnavailable",
  );
}

export function reelCaptionNotFoundError(): ReelCaptionMutationError {
  return reelCaptionError("NOT_FOUND", "scripts.caption.errors.notFound");
}

export function reelCaptionStrategyNotApprovedError(): ReelCaptionMutationError {
  return reelCaptionError(
    "STRATEGY_NOT_APPROVED",
    "scripts.caption.errors.strategyNotApproved",
  );
}

export function reelCaptionSlotNotFoundError(): ReelCaptionMutationError {
  return reelCaptionError("SLOT_NOT_FOUND", "scripts.caption.errors.slotNotFound");
}

export function reelCaptionScriptNotFoundError(): ReelCaptionMutationError {
  return reelCaptionError(
    "SCRIPT_NOT_FOUND",
    "scripts.caption.errors.scriptNotFound",
  );
}

export function reelCaptionBudgetExceededError(extra?: {
  blockedSlotIndexes?: number[];
  previews?: import("@/lib/contracts/cost-policy").ReelBudgetPreview[];
}): ReelCaptionMutationError {
  return {
    ok: false,
    error: {
      code: "BUDGET_EXCEEDED",
      messageKey: "scripts.budget.errors.exceeded",
      ...extra,
    },
  };
}

export function reelCaptionCostPolicyUnavailableError(): ReelCaptionMutationError {
  return reelCaptionError(
    "COST_POLICY_UNAVAILABLE",
    "scripts.budget.errors.policyUnavailable",
  );
}

export function reelCaptionNotFoundForSelectError(): ReelCaptionMutationError {
  return reelCaptionError(
    "CAPTION_NOT_FOUND",
    "scripts.caption.ctaSelect.errors.captionNotFound",
  );
}

export function reelCaptionCtaIndexOutOfBoundsError(): ReelCaptionMutationError {
  return reelCaptionError(
    "CTA_INDEX_OUT_OF_BOUNDS",
    "scripts.caption.ctaSelect.errors.indexOutOfBounds",
  );
}
