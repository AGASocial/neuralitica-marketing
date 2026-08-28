/**
 * Dual-flag AUTH_DEV_FALLBACK (US-14.5).
 * Production: any non-empty value throws at module evaluation / startup.
 * Identity of the fallback user is fixed in getCurrentUser — not here.
 */

export function assertAuthDevFallbackEnv(
  nodeEnv: string | undefined = process.env.NODE_ENV,
  flag: string | undefined = process.env.AUTH_DEV_FALLBACK,
): void {
  if (nodeEnv === "production" && typeof flag === "string" && flag.length > 0) {
    throw new Error(
      "AUTH_DEV_FALLBACK must not be set when NODE_ENV=production.",
    );
  }
}

export function isAuthDevFallbackEnabled(
  nodeEnv: string | undefined = process.env.NODE_ENV,
  flag: string | undefined = process.env.AUTH_DEV_FALLBACK,
): boolean {
  return nodeEnv === "development" && flag === "true";
}

assertAuthDevFallbackEnv();
