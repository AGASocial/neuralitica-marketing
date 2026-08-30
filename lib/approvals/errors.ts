import type {
  ApprovalErrorCode,
  ApprovalMutationError,
} from "@/lib/contracts/approval";

export function approvalError(
  code: ApprovalErrorCode,
  messageKey: string,
  extra?: {
    fields?: Record<string, string[]>;
  },
): ApprovalMutationError {
  return {
    ok: false,
    error: {
      code,
      messageKey,
      ...extra,
    },
  };
}

export function approvalUnauthenticatedError(): ApprovalMutationError {
  return approvalError("UNAUTHENTICATED", "approvals.errors.unauthenticated");
}

export function approvalForbiddenError(): ApprovalMutationError {
  return approvalError("FORBIDDEN", "approvals.errors.forbidden");
}

export function approvalForbiddenFieldsError(
  fields?: Record<string, string[]>,
): ApprovalMutationError {
  return approvalError(
    "FORBIDDEN_FIELDS",
    "approvals.errors.forbiddenFields",
    { fields },
  );
}

export function approvalValidationError(
  fields: Record<string, string[]>,
): ApprovalMutationError {
  return approvalError("VALIDATION_ERROR", "approvals.errors.validation", {
    fields,
  });
}

export function approvalNotFoundError(): ApprovalMutationError {
  return approvalError("NOT_FOUND", "approvals.errors.notFound");
}

export function approvalQaGateNotReadyError(): ApprovalMutationError {
  return approvalError("QA_GATE_NOT_READY", "approvals.errors.qaGateNotReady");
}

export function approvalAssemblyNotReadyError(): ApprovalMutationError {
  return approvalError(
    "ASSEMBLY_NOT_READY",
    "approvals.errors.assemblyNotReady",
  );
}

export function approvalBrandingRequiredError(): ApprovalMutationError {
  return approvalError(
    "BRANDING_REQUIRED",
    "approvals.errors.brandingRequired",
  );
}

export function approvalCaptionRequiredError(): ApprovalMutationError {
  return approvalError("CAPTION_REQUIRED", "approvals.errors.captionRequired");
}

export function approvalCaptionCtaNotSelectedError(): ApprovalMutationError {
  return approvalError(
    "CAPTION_CTA_NOT_SELECTED",
    "approvals.errors.captionCtaNotSelected",
  );
}

export function approvalInvalidTransitionError(): ApprovalMutationError {
  return approvalError(
    "INVALID_TRANSITION",
    "approvals.errors.invalidTransition",
  );
}

export function approvalRateLimitedError(): ApprovalMutationError {
  return approvalError("RATE_LIMITED", "approvals.errors.rateLimited");
}

export function approvalInternalError(): ApprovalMutationError {
  return approvalError("INTERNAL_ERROR", "approvals.errors.internal");
}
