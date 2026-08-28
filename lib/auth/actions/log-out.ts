"use server";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  logOutInputSchema,
  type LogOutInput,
  type LogOutResult,
} from "@/lib/contracts/auth";

import {
  forbiddenFieldsError,
  internalError,
  redactAuthPayload,
  validationError,
} from "@/lib/auth/errors";
import { findForbiddenLogOutKeys } from "@/lib/auth/forbidden-fields";
import { isMissingSessionAuthError } from "@/lib/auth/supabase-auth-errors";
import {
  createUserScopedAuthClient,
  discardSupabaseAuthCookies,
  isUserScopedAuthConfigured,
} from "@/lib/auth/supabase-cookie";
import { zodErrorToFieldErrors } from "@/lib/auth/zod-field-errors";

const LOGIN_REDIRECT = "/login" as const;

/** Returns true when this refresh token was revoked. Logs code/status only. */
async function tryLocalSignOut(auth: SupabaseClient): Promise<boolean> {
  try {
    const { error } = await auth.auth.signOut({ scope: "local" });
    if (!error) {
      return true;
    }
    console.error("[auth] logOut local signOut failed", {
      code: error.code,
      status: error.status,
    });
    return false;
  } catch {
    console.error("[auth] logOut local signOut threw");
    return false;
  }
}

function success(): LogOutResult {
  return { ok: true, redirectTo: LOGIN_REDIRECT };
}

async function logOutInner(raw: unknown): Promise<LogOutResult> {
  const forbidden = findForbiddenLogOutKeys(raw);
  if (forbidden.length > 0) {
    console.warn("[auth] logOut rejected forbidden fields", { keys: forbidden });
    return forbiddenFieldsError();
  }

  const parsed = logOutInputSchema.safeParse(
    raw === undefined ? {} : raw,
  );
  if (!parsed.success) {
    return validationError(zodErrorToFieldErrors(parsed.error));
  }

  if (!isUserScopedAuthConfigured()) {
    console.error(
      "[auth] logOut unavailable: auth cookie client not configured",
    );
    await discardSupabaseAuthCookies();
    return internalError();
  }

  const auth = await createUserScopedAuthClient();
  const { data: userData, error: userError } = await auth.auth.getUser();
  const sessionUserId = userData.user?.id;
  const noSessionToRevoke =
    !sessionUserId &&
    (!userError || isMissingSessionAuthError(userError));

  if (!noSessionToRevoke) {
    let revoked = await tryLocalSignOut(auth);
    if (!revoked) {
      revoked = await tryLocalSignOut(auth);
    }

    await discardSupabaseAuthCookies();

    if (!revoked) {
      return internalError();
    }

    return success();
  }

  await discardSupabaseAuthCookies();
  return success();
}

/**
 * End this browser session: local Auth revoke, then expire `sb-*`.
 * Do not call `requireActive()` / `requireOperator()` — pending must log out.
 */
export async function logOut(input?: LogOutInput): Promise<LogOutResult> {
  try {
    return await logOutInner(input);
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code: unknown }).code)
        : undefined;
    console.error("[auth] logOut unexpected error", {
      ...(code ? { code } : {}),
      payload: redactAuthPayload(input),
    });
    try {
      await discardSupabaseAuthCookies();
    } catch {
      console.error("[auth] logOut cookie expiry threw in catch");
    }
    return internalError();
  }
}
