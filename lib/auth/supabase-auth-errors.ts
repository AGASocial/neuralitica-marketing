import "server-only";

type AuthLikeError = {
  message?: string;
  code?: string;
  status?: number;
} | null;

function errorCode(error: AuthLikeError): string {
  return error?.code?.toLowerCase() ?? "";
}

function errorMessage(error: AuthLikeError): string {
  return error?.message?.toLowerCase() ?? "";
}

/** Map Supabase duplicate-registration errors to enumeration-safe handling. */
export function isDuplicateAuthError(error: AuthLikeError): boolean {
  if (!error) {
    return false;
  }

  const code = errorCode(error);
  const message = errorMessage(error);

  return (
    code === "email_exists" ||
    code === "user_already_exists" ||
    message.includes("already registered") ||
    message.includes("already been registered") ||
    message.includes("user already exists") ||
    message.includes("email address has already been registered")
  );
}

/** GoTrue leaked/weak password (HTTP 422) — not a duplicate account. */
export function isWeakPasswordAuthError(error: AuthLikeError): boolean {
  if (!error) {
    return false;
  }

  const code = errorCode(error);
  const message = errorMessage(error);

  return (
    code === "weak_password" ||
    message.includes("weak_password") ||
    message.includes("password is known to be weak") ||
    message.includes("leaked password")
  );
}

/** Missing / expired recovery session — map to RECOVERY_INVALID, not INTERNAL_ERROR. */
export function isMissingSessionAuthError(error: AuthLikeError): boolean {
  if (!error) {
    return false;
  }

  const code = errorCode(error);
  const message = errorMessage(error);
  const status = error?.status;

  return (
    status === 401 ||
    code === "session_not_found" ||
    code === "session_expired" ||
    code === "user_not_found" ||
    code === "invalid_jwt" ||
    code === "bad_jwt" ||
    message.includes("session missing") ||
    message.includes("auth session missing") ||
    message.includes("not authenticated") ||
    message.includes("invalid jwt") ||
    message.includes("jwt expired")
  );
}

/** Swallow user-not-found style errors for enumeration-safe resend. */
export function isBenignResendError(error: AuthLikeError): boolean {
  if (!error) {
    return false;
  }

  const code = errorCode(error);
  const message = errorMessage(error);

  return (
    code === "user_not_found" ||
    message.includes("user not found") ||
    message.includes("no user found") ||
    message.includes("email not found")
  );
}
