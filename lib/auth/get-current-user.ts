import "server-only";

import { cache } from "react";
import type { User } from "@supabase/supabase-js";

import { isAuthDevFallbackEnabled } from "@/lib/auth/assert-dev-fallback";
import type { CurrentUser, UserRole } from "@/lib/auth/get-current-user-types";
import { mapClientRowToCurrentUser } from "@/lib/auth/map-client-row";
import {
  createReadOnlyUserScopedAuthClient,
  isUserScopedAuthConfigured,
} from "@/lib/auth/supabase-cookie";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/auth/supabase-server";

export type { CurrentUser, UserRole };

/** Stable seed id — matches US-X.3 / US-14.5 operator INSERT. */
const DEV_USER_ID = "00000000-0000-4000-8000-000000000001";

const DEV_USER: CurrentUser = {
  id: DEV_USER_ID,
  email: "gaveho@gmail.com",
  displayName: "Gabriel Vega",
  preferredLocale: "en",
  role: "operator",
  active: true,
};

export type SessionAuthUser = {
  id: string;
  email: string;
  displayName: string;
};

function authDisplayName(user: User, email: string): string {
  const meta = user.user_metadata ?? {};
  const fromMeta = [meta.display_name, meta.full_name].find(
    (value) => typeof value === "string" && value.trim().length > 0,
  );
  const name = typeof fromMeta === "string" ? fromMeta.trim() : email;
  return name.slice(0, 120);
}

async function loadSessionAuthUser(): Promise<SessionAuthUser | null> {
  if (isAuthDevFallbackEnabled()) {
    return {
      id: DEV_USER.id,
      email: DEV_USER.email,
      displayName: DEV_USER.displayName,
    };
  }

  if (!isUserScopedAuthConfigured()) {
    return null;
  }

  let user: User | null = null;
  try {
    const auth = await createReadOnlyUserScopedAuthClient();
    const { data, error } = await auth.auth.getUser();
    if (error || !data.user?.id) {
      return null;
    }
    user = data.user;
  } catch {
    return null;
  }

  const email =
    typeof user.email === "string" && user.email.length > 0
      ? user.email.toLowerCase()
      : "";

  return {
    id: user.id,
    email,
    displayName: authDisplayName(user, email),
  };
}

/**
 * Validated Auth session (`getUser()` — signature/expiry, not cookie presence).
 * Not a product identity API. `id` is `auth.users.id`, never `CurrentUser.id`.
 */
export const getSessionAuthUser = cache(loadSessionAuthUser);

async function loadCurrentUser(): Promise<CurrentUser | null> {
  if (isAuthDevFallbackEnabled()) {
    return DEV_USER;
  }

  const authUser = await getSessionAuthUser();
  if (!authUser) {
    return null;
  }

  if (!isSupabaseConfigured()) {
    return null;
  }

  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("neuramark_clients")
      .select("id, email, display_name, preferred_locale, role, active")
      .eq("auth_user_id", authUser.id)
      .maybeSingle();

    if (error) {
      console.error("[auth] getCurrentUser client lookup failed", {
        code: error.code,
      });
      return null;
    }

    return mapClientRowToCurrentUser(data);
  } catch {
    console.error("[auth] getCurrentUser client lookup threw");
    return null;
  }
}

/**
 * Single identity seam. Session → `neuramark_clients` by `auth_user_id`.
 * `active` / `role` are read fresh every request (React `cache()` is request-local).
 * Default path never returns the hardcoded user.
 */
export const getCurrentUser = cache(loadCurrentUser);
