import type { CostPolicyErrorCode } from "@/lib/contracts/cost-policy";

export type CostPolicyActionError = {
  code:
    | CostPolicyErrorCode
    | "UNAUTHENTICATED"
    | "FORBIDDEN"
    | "VALIDATION_ERROR"
    | "INTERNAL_ERROR";
  messageKey?: string;
  fields?: Record<string, string[]>;
};

export function costPolicyUnauthenticatedError(): {
  ok: false;
  error: CostPolicyActionError;
} {
  return { ok: false, error: { code: "UNAUTHENTICATED" } };
}

export function costPolicyForbiddenError(): {
  ok: false;
  error: CostPolicyActionError;
} {
  return { ok: false, error: { code: "FORBIDDEN" } };
}

export function costPolicyUnavailableError(): {
  ok: false;
  error: CostPolicyActionError;
} {
  return {
    ok: false,
    error: {
      code: "COST_POLICY_UNAVAILABLE",
      messageKey: "settings.costPolicy.errors.unavailable",
    },
  };
}

export function costPolicyValidationError(
  fields?: Record<string, string[]>,
): { ok: false; error: CostPolicyActionError } {
  return {
    ok: false,
    error: {
      code: "POLICY_VALIDATION_ERROR",
      messageKey: "settings.costPolicy.errors.validation",
      fields,
    },
  };
}

export function costPolicyInternalError(): {
  ok: false;
  error: CostPolicyActionError;
} {
  return { ok: false, error: { code: "INTERNAL_ERROR" } };
}

export function reelBudgetPreviewUnavailableError(): {
  ok: false;
  error: CostPolicyActionError;
} {
  return {
    ok: false,
    error: {
      code: "COST_POLICY_UNAVAILABLE",
      messageKey: "scripts.budget.errors.policyUnavailable",
    },
  };
}

export function reelBudgetProviderUnavailableError(): {
  ok: false;
  error: CostPolicyActionError;
} {
  return {
    ok: false,
    error: {
      code: "PROVIDER_UNAVAILABLE",
      messageKey: "scripts.budget.errors.providerUnavailable",
    },
  };
}
