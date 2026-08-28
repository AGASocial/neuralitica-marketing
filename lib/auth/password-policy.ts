import "server-only";

import type { PasswordPolicyViolation } from "@/lib/contracts/auth";

import commonPasswordsJson from "./data/common-passwords.json";

const COMMON_PASSWORDS = new Set(
  (commonPasswordsJson as string[]).map((p) => p.toLowerCase()),
);

export type PasswordPolicyResult =
  | { ok: true }
  | { ok: false; violation: PasswordPolicyViolation };

const MIN_LENGTH = 12;
const MAX_LENGTH = 128;

/**
 * NIST-style password policy (US-14.1 / shared with US-14.4).
 * Server-authoritative; client hints are presentation only.
 */
export function validatePassword(password: string): PasswordPolicyResult {
  if (password.length < MIN_LENGTH) {
    return { ok: false, violation: "TOO_SHORT" };
  }

  if (password.length > MAX_LENGTH) {
    return { ok: false, violation: "TOO_LONG" };
  }

  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return { ok: false, violation: "COMMON_PASSWORD" };
  }

  return { ok: true };
}

export { MIN_LENGTH as PASSWORD_MIN_LENGTH, MAX_LENGTH as PASSWORD_MAX_LENGTH };
