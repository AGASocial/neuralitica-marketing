import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

export type CronSecretVerifyResult =
  | { ok: true }
  | { ok: false; status: 401 | 503; error: "UNAUTHORIZED" | "SERVICE_UNAVAILABLE" };

export function verifyCronSecret(request: Request): CronSecretVerifyResult {
  const expected = process.env.CRON_SECRET?.trim();
  const production =
    process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";

  if (!expected) {
    return production
      ? { ok: false, status: 503, error: "SERVICE_UNAVAILABLE" }
      : { ok: false, status: 401, error: "UNAUTHORIZED" };
  }

  const match = /^Bearer\s+(\S+)\s*$/i.exec(request.headers.get("authorization") ?? "");
  if (!match) return { ok: false, status: 401, error: "UNAUTHORIZED" };

  const providedDigest = createHash("sha256").update(match[1], "utf8").digest();
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(providedDigest, expectedDigest)
    ? { ok: true }
    : { ok: false, status: 401, error: "UNAUTHORIZED" };
}
