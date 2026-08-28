import "server-only";

type AuthLikeError = {
  message?: string;
  code?: string;
  status?: number;
} | null;

/** Map Supabase duplicate-registration errors to enumeration-safe handling. */
export function isDuplicateAuthError(error: AuthLikeError): boolean {
  if (!error) {
    return false;
  }

  const message = error.message?.toLowerCase() ?? "";
  const code = error.code?.toLowerCase() ?? "";

  return (
    code === "email_exists" ||
    code === "user_already_exists" ||
    error.status === 422 ||
    message.includes("already registered") ||
    message.includes("already been registered") ||
    message.includes("user already exists") ||
    message.includes("email address has already been registered")
  );
}

/** Swallow user-not-found style errors for enumeration-safe resend. */
export function isBenignResendError(error: AuthLikeError): boolean {
  if (!error) {
    return false;
  }

  const message = error.message?.toLowerCase() ?? "";
  const code = error.code?.toLowerCase() ?? "";

  return (
    code === "user_not_found" ||
    message.includes("user not found") ||
    message.includes("no user found") ||
    message.includes("email not found")
  );
}
