import type {
  AuthErrorCode,
  AuthErrorEnvelope,
  PasswordPolicyViolation,
} from "@/lib/contracts/auth";

export function authSuccess(): { ok: true } {
  return { ok: true };
}

export function authError(
  code: AuthErrorCode,
  messageKey: string,
  extra?: {
    fields?: Record<string, string[]>;
    passwordPolicy?: PasswordPolicyViolation;
  },
): AuthErrorEnvelope {
  return {
    ok: false,
    error: {
      code,
      messageKey,
      ...extra,
    },
  };
}

export function rateLimitedError(): AuthErrorEnvelope {
  return authError("RATE_LIMITED", "auth.errors.rateLimited");
}

/** Login 429 uses the same user-facing copy as credentials failure (no distinct rate-limit string). */
export function loginRateLimitedError(): AuthErrorEnvelope {
  return authError("RATE_LIMITED", "auth.login.genericFailure");
}

/** Request-reset 429 uses the same check-email copy as success (no existence oracle). */
export function passwordResetRateLimitedError(): AuthErrorEnvelope {
  return authError("RATE_LIMITED", "auth.reset.checkEmail");
}

export function recoveryInvalidError(): AuthErrorEnvelope {
  return authError("RECOVERY_INVALID", "auth.reset.invalidToken");
}

export function invalidCredentialsError(): AuthErrorEnvelope {
  return authError("INVALID_CREDENTIALS", "auth.login.genericFailure");
}

export function internalError(): AuthErrorEnvelope {
  return authError("INTERNAL_ERROR", "auth.errors.internal");
}

export function forbiddenFieldsError(): AuthErrorEnvelope {
  return authError("FORBIDDEN_FIELDS", "auth.errors.forbiddenFields");
}

export function passwordPolicyError(
  violation: PasswordPolicyViolation,
): AuthErrorEnvelope {
  return authError("PASSWORD_POLICY", "auth.errors.passwordPolicy", {
    passwordPolicy: violation,
  });
}

export function validationError(
  fields: Record<string, string[]>,
): AuthErrorEnvelope {
  return authError("VALIDATION_ERROR", "auth.errors.validation", { fields });
}

/** Redact password keys before server-side logging. */
export function redactAuthPayload(input: unknown): unknown {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return input;
  }

  const redacted: Record<string, unknown> = {
    ...(input as Record<string, unknown>),
  };

  for (const key of Object.keys(redacted)) {
    if (key.toLowerCase().includes("password")) {
      redacted[key] = "[REDACTED]";
    }
  }

  return redacted;
}
