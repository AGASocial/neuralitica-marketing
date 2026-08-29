import type {
  GrantAvatarConsentErrorCode,
  GrantAvatarConsentResult,
  RevokeAvatarConsentErrorCode,
  RevokeAvatarConsentResult,
} from "@/lib/contracts/avatar-consent";

export function grantConsentError(
  code: GrantAvatarConsentErrorCode,
  messageKey: string,
  extra?: { fields?: Record<string, string[]> },
): Extract<GrantAvatarConsentResult, { ok: false }> {
  return {
    ok: false,
    error: {
      code,
      messageKey,
      ...extra,
    },
  };
}

export function grantConsentValidationError(
  fields: Record<string, string[]>,
): Extract<GrantAvatarConsentResult, { ok: false }> {
  return grantConsentError(
    "VALIDATION_ERROR",
    "preferences.consent.errors.validation",
    { fields },
  );
}

export function grantConsentForbiddenFieldsError(): Extract<
  GrantAvatarConsentResult,
  { ok: false }
> {
  return grantConsentError(
    "FORBIDDEN_FIELDS",
    "preferences.consent.errors.forbiddenFields",
  );
}

export function grantConsentVersionMismatchError(): Extract<
  GrantAvatarConsentResult,
  { ok: false }
> {
  return grantConsentError(
    "CONSENT_VERSION_MISMATCH",
    "preferences.consent.errors.versionMismatch",
  );
}

export function grantConsentAffirmationRequiredError(): Extract<
  GrantAvatarConsentResult,
  { ok: false }
> {
  return grantConsentError(
    "AFFIRMATION_REQUIRED",
    "preferences.consent.errors.affirmationRequired",
  );
}

export function grantConsentAlreadyActiveError(): Extract<
  GrantAvatarConsentResult,
  { ok: false }
> {
  return grantConsentError(
    "ALREADY_ACTIVE",
    "preferences.consent.errors.alreadyActive",
  );
}

export function grantConsentInternalError(): Extract<
  GrantAvatarConsentResult,
  { ok: false }
> {
  return grantConsentError(
    "INTERNAL_ERROR",
    "preferences.consent.errors.internal",
  );
}

export function grantConsentUnauthenticatedError(): Extract<
  GrantAvatarConsentResult,
  { ok: false }
> {
  return grantConsentError("UNAUTHENTICATED", "auth.errors.unauthenticated");
}

export function grantConsentForbiddenError(): Extract<
  GrantAvatarConsentResult,
  { ok: false }
> {
  return grantConsentError("FORBIDDEN", "auth.errors.forbidden");
}

export function revokeConsentError(
  code: RevokeAvatarConsentErrorCode,
  messageKey: string,
): Extract<RevokeAvatarConsentResult, { ok: false }> {
  return {
    ok: false,
    error: {
      code,
      messageKey,
    },
  };
}

export function revokeConsentNotActiveError(): Extract<
  RevokeAvatarConsentResult,
  { ok: false }
> {
  return revokeConsentError(
    "NOT_ACTIVE",
    "preferences.consent.errors.notActive",
  );
}

export function revokeConsentInternalError(): Extract<
  RevokeAvatarConsentResult,
  { ok: false }
> {
  return revokeConsentError(
    "INTERNAL_ERROR",
    "preferences.consent.errors.internal",
  );
}

export function revokeConsentUnauthenticatedError(): Extract<
  RevokeAvatarConsentResult,
  { ok: false }
> {
  return revokeConsentError("UNAUTHENTICATED", "auth.errors.unauthenticated");
}

export function revokeConsentForbiddenError(): Extract<
  RevokeAvatarConsentResult,
  { ok: false }
> {
  return revokeConsentError("FORBIDDEN", "auth.errors.forbidden");
}
