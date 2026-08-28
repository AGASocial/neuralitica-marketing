import "server-only";

import { createHmac } from "node:crypto";

function getRateLimitSecret(): string {
  const secret =
    process.env.AUTH_RATE_LIMIT_SECRET ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SECRET_KEY;

  if (!secret) {
    throw new Error(
      "Missing AUTH_RATE_LIMIT_SECRET (or SUPABASE_SERVICE_ROLE_KEY fallback) for auth attempt hashing.",
    );
  }

  return secret;
}

/** HMAC-SHA256 hash for IP/email storage in neuramark_auth_attempts. */
export function hmacSha256(value: string): string {
  return createHmac("sha256", getRateLimitSecret())
    .update(value)
    .digest("hex");
}

export function hashIp(ip: string): string {
  return hmacSha256(`ip:${ip}`);
}

export function hashEmail(email: string): string {
  return hmacSha256(`email:${email.toLowerCase().trim()}`);
}
