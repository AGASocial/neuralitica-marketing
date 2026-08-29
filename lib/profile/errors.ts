import type {
  UpdateBusinessProfileErrorCode,
  UpdateBusinessProfileErrorEnvelope,
} from "@/lib/contracts/profile";

export function profileError(
  code: UpdateBusinessProfileErrorCode,
  messageKey: string,
  extra?: { fields?: Record<string, string[]> },
): UpdateBusinessProfileErrorEnvelope {
  return {
    ok: false,
    error: {
      code,
      messageKey,
      ...extra,
    },
  };
}

export function profileValidationError(
  fields: Record<string, string[]>,
): UpdateBusinessProfileErrorEnvelope {
  return profileError("VALIDATION_ERROR", "profile.errors.validation", {
    fields,
  });
}

export function profileForbiddenFieldsError(): UpdateBusinessProfileErrorEnvelope {
  return profileError("FORBIDDEN_FIELDS", "profile.errors.forbiddenFields");
}

export function profilePayloadTooLargeError(): UpdateBusinessProfileErrorEnvelope {
  return profileError("PAYLOAD_TOO_LARGE", "profile.errors.payloadTooLarge");
}

export function profileNotFoundError(): UpdateBusinessProfileErrorEnvelope {
  return profileError("PROFILE_NOT_FOUND", "profile.errors.notFound");
}

export function profileInternalError(): UpdateBusinessProfileErrorEnvelope {
  return profileError("INTERNAL_ERROR", "profile.errors.internal");
}

export function profileUnauthenticatedError(): UpdateBusinessProfileErrorEnvelope {
  return profileError("UNAUTHENTICATED", "auth.errors.unauthenticated");
}

export function profileForbiddenError(): UpdateBusinessProfileErrorEnvelope {
  return profileError("FORBIDDEN", "auth.errors.forbidden");
}
