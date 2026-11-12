/**
 * Shared-secret auth for Fly worker wake HTTP (pure — safe for node:test).
 */
import { createHash, timingSafeEqual } from "node:crypto";

export type WorkerWakeAuthResult =
  | { ok: true }
  | {
      ok: false;
      status: 401 | 503;
      error: "UNAUTHORIZED" | "SERVICE_UNAVAILABLE";
    };

function isProductionLike(env: NodeJS.ProcessEnv): boolean {
  return (
    env.VERCEL_ENV === "production" ||
    env.NODE_ENV === "production" ||
    Boolean(env.FLY_APP_NAME?.trim())
  );
}

/**
 * Verify `Authorization: Bearer <WORKER_WAKE_SECRET>` with digest timing-safe compare.
 * When the secret is unset, reject all callers (503 in production-like envs).
 */
export function verifyWorkerWakeAuthorization(
  authorizationHeader: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): WorkerWakeAuthResult {
  const expected = env.WORKER_WAKE_SECRET?.trim();
  if (!expected) {
    return isProductionLike(env)
      ? { ok: false, status: 503, error: "SERVICE_UNAVAILABLE" }
      : { ok: false, status: 401, error: "UNAUTHORIZED" };
  }

  const match = /^Bearer\s+(\S+)\s*$/i.exec(authorizationHeader ?? "");
  if (!match) {
    return { ok: false, status: 401, error: "UNAUTHORIZED" };
  }

  const providedDigest = createHash("sha256").update(match[1], "utf8").digest();
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(providedDigest, expectedDigest)
    ? { ok: true }
    : { ok: false, status: 401, error: "UNAUTHORIZED" };
}
