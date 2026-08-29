import type {
  InterviewErrorCode,
  InterviewErrorEnvelope,
} from "../contracts/interview";

export function interviewError(
  code: InterviewErrorCode,
  messageKey: string,
  extra?: { fields?: Record<string, string[]> },
): InterviewErrorEnvelope {
  return {
    ok: false,
    error: {
      code,
      messageKey,
      ...extra,
    },
  };
}

export function interviewValidationError(
  fields: Record<string, string[]>,
): InterviewErrorEnvelope {
  return interviewError("VALIDATION_ERROR", "interview.errors.validation", {
    fields,
  });
}

export function interviewForbiddenFieldsError(): InterviewErrorEnvelope {
  return interviewError("FORBIDDEN_FIELDS", "interview.errors.forbiddenFields");
}

export function interviewPayloadTooLargeError(): InterviewErrorEnvelope {
  return interviewError("PAYLOAD_TOO_LARGE", "interview.errors.payloadTooLarge");
}

export function interviewConflictError(): InterviewErrorEnvelope {
  return interviewError("CONFLICT", "interview.errors.conflict");
}

/** No interview session row to submit (US-1.3). */
export function interviewNotFoundError(): InterviewErrorEnvelope {
  return interviewError("CONFLICT", "interview.errors.notFound");
}

export function interviewInternalError(): InterviewErrorEnvelope {
  return interviewError("INTERNAL_ERROR", "interview.errors.internal");
}

export function interviewUnauthenticatedError(): InterviewErrorEnvelope {
  return interviewError("UNAUTHENTICATED", "auth.errors.unauthenticated");
}

export function interviewForbiddenError(): InterviewErrorEnvelope {
  return interviewError("FORBIDDEN", "auth.errors.forbidden");
}
