import "server-only";

export type UserRole = "client" | "operator";

export type CurrentUser = {
  id: string;
  email: string;
  displayName: string;
  preferredLocale: "en" | "es";
  role: UserRole;
  active: boolean;
};

/** Stable dev seed id — matches future neuramark_clients backfill (US-14.5). */
const DEV_USER_ID = "00000000-0000-4000-8000-000000000001";

const DEV_USER: CurrentUser = {
  id: DEV_USER_ID,
  email: "gaveho@gmail.com",
  displayName: "Gabriel Vega",
  preferredLocale: "en",
  role: "operator",
  active: true,
};

/**
 * Single identity seam (US-X.3). All server routes resolve the current user here.
 * Auth stories (US-14.x) swap this implementation without changing call sites.
 */
export async function getCurrentUser(): Promise<CurrentUser> {
  if (
    process.env.NODE_ENV === "development" &&
    process.env.AUTH_DEV_FALLBACK === "true"
  ) {
    return DEV_USER;
  }

  // Until US-14.5 lands, non-dev builds still use the hardcoded user.
  return DEV_USER;
}
