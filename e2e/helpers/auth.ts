import type { Page } from "@playwright/test";

/**
 * Middleware only checks for an `sb-*` cookie on non-public routes.
 * Local E2E uses AUTH_DEV_FALLBACK, so Node identity is DEV_USER and this
 * cookie never has to be a real Auth session.
 */
export async function injectDevFallbackGateCookie(page: Page): Promise<void> {
  const cookie = {
    name: "sb-e2e-dev-fallback",
    value: "1",
    httpOnly: true,
    sameSite: "Lax" as const,
  };

  await page.context().addCookies([
    { ...cookie, url: "http://127.0.0.1:3000" },
    { ...cookie, url: "http://localhost:3000" },
  ]);
}
