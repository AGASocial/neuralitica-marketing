/**
 * Next.js instrumentation — runs once on Node server start.
 * Throws if AUTH_DEV_FALLBACK is set in production (US-14.5).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "edge") {
    return;
  }

  await import("./lib/auth/assert-dev-fallback");
}
