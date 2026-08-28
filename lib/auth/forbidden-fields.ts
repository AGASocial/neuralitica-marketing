import "server-only";

const FORBIDDEN_SIGNUP_KEYS = new Set(
  [
    "role",
    "active",
    "auth_user_id",
    "authUserId",
    "client_id",
    "clientId",
    "confirmPassword",
    "confirm_password",
  ].map((key) => key.toLowerCase()),
);

const FORBIDDEN_RESEND_KEYS = new Set(
  [
    "role",
    "active",
    "auth_user_id",
    "authUserId",
    "client_id",
    "clientId",
  ].map((key) => key.toLowerCase()),
);

function findForbiddenKeys(
  input: unknown,
  forbidden: Set<string>,
): string[] {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return [];
  }

  return Object.keys(input).filter((key) => forbidden.has(key.toLowerCase()));
}

export function findForbiddenSignUpKeys(input: unknown): string[] {
  return findForbiddenKeys(input, FORBIDDEN_SIGNUP_KEYS);
}

export function findForbiddenResendKeys(input: unknown): string[] {
  return findForbiddenKeys(input, FORBIDDEN_RESEND_KEYS);
}

/** Same privilege keys as resend; login does not treat confirmPassword as forbidden (Zod .strict() rejects extras). */
export function findForbiddenLogInKeys(input: unknown): string[] {
  return findForbiddenKeys(input, FORBIDDEN_RESEND_KEYS);
}
