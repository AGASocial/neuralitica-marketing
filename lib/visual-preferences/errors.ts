import type {
  UpsertVisualPreferencesErrorCode,
  UpsertVisualPreferencesErrorEnvelope,
} from "@/lib/contracts/visual-preferences";

export function preferencesError(
  code: UpsertVisualPreferencesErrorCode,
  messageKey: string,
  extra?: { fields?: Record<string, string[]> },
): UpsertVisualPreferencesErrorEnvelope {
  return {
    ok: false,
    error: {
      code,
      messageKey,
      ...extra,
    },
  };
}

export function preferencesValidationError(
  fields: Record<string, string[]>,
): UpsertVisualPreferencesErrorEnvelope {
  return preferencesError("VALIDATION_ERROR", "preferences.errors.validation", {
    fields,
  });
}

export function preferencesForbiddenFieldsError(): UpsertVisualPreferencesErrorEnvelope {
  return preferencesError(
    "FORBIDDEN_FIELDS",
    "preferences.errors.forbiddenFields",
  );
}

export function preferencesPayloadTooLargeError(): UpsertVisualPreferencesErrorEnvelope {
  return preferencesError(
    "PAYLOAD_TOO_LARGE",
    "preferences.errors.payloadTooLarge",
  );
}

export function preferencesOwnAvatarConsentRequiredError(): UpsertVisualPreferencesErrorEnvelope {
  return preferencesError(
    "OWN_AVATAR_CONSENT_REQUIRED",
    "preferences.errors.ownAvatarConsentRequired",
  );
}

export function preferencesInternalError(): UpsertVisualPreferencesErrorEnvelope {
  return preferencesError("INTERNAL_ERROR", "preferences.errors.internal");
}

export function preferencesUnauthenticatedError(): UpsertVisualPreferencesErrorEnvelope {
  return preferencesError("UNAUTHENTICATED", "auth.errors.unauthenticated");
}

export function preferencesForbiddenError(): UpsertVisualPreferencesErrorEnvelope {
  return preferencesError("FORBIDDEN", "auth.errors.forbidden");
}
