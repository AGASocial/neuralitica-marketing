"use server";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  setNewPasswordInputSchema,
  type SetNewPasswordResult,
} from "@/lib/contracts/auth";

import {
  forbiddenFieldsError,
  internalError,
  passwordPolicyError,
  redactAuthPayload,
  recoveryInvalidError,
  validationError,
} from "@/lib/auth/errors";
import { findForbiddenSetNewPasswordKeys } from "@/lib/auth/forbidden-fields";
import { validatePassword } from "@/lib/auth/password-policy";
import {
  isMissingSessionAuthError,
  isWeakPasswordAuthError,
} from "@/lib/auth/supabase-auth-errors";
import {
  createUserScopedAuthClient,
  discardSupabaseAuthCookies,
  isUserScopedAuthConfigured,
} from "@/lib/auth/supabase-cookie";
import { zodErrorToFieldErrors } from "@/lib/auth/zod-field-errors";

const RESET_SUCCESS_REDIRECT = "/login?reset=1" as const;

/** Returns true when every refresh token was revoked. Never logs the password. */
async function tryGlobalSignOut(auth: SupabaseClient): Promise<boolean> {
  try {
    const { error } = await auth.auth.signOut({ scope: "global" });
    if (!error) {
      return true;
    }
    console.error("[auth] setNewPassword global signOut failed", {
      code: error.code,
      status: error.status,
    });
    return false;
  } catch {
    console.error("[auth] setNewPassword global signOut threw");
    return false;
  }
}

async function setNewPasswordInner(
  raw: unknown,
): Promise<SetNewPasswordResult> {
  const forbidden = findForbiddenSetNewPasswordKeys(raw);
  if (forbidden.length > 0) {
    console.warn("[auth] setNewPassword rejected forbidden fields", {
      keys: forbidden,
    });
    return forbiddenFieldsError();
  }

  const parsed = setNewPasswordInputSchema.safeParse(raw);
  if (!parsed.success) {
    return validationError(zodErrorToFieldErrors(parsed.error));
  }

  const input = parsed.data;

  const policy = validatePassword(input.password);
  if (!policy.ok) {
    return passwordPolicyError(policy.violation);
  }

  if (!isUserScopedAuthConfigured()) {
    console.error(
      "[auth] setNewPassword unavailable: auth cookie client not configured",
    );
    return internalError();
  }

  const auth = await createUserScopedAuthClient();
  const { data: userData, error: userError } = await auth.auth.getUser();

  if (userError || !userData.user?.id) {
    return recoveryInvalidError();
  }

  const { error: updateError } = await auth.auth.updateUser({
    password: input.password,
  });

  if (updateError) {
    if (isMissingSessionAuthError(updateError)) {
      return recoveryInvalidError();
    }

    if (isWeakPasswordAuthError(updateError)) {
      return passwordPolicyError("COMMON_PASSWORD");
    }

    console.error("[auth] setNewPassword updateUser failed", {
      code: updateError.code,
      status: updateError.status,
    });
    return internalError();
  }

  let revoked = await tryGlobalSignOut(auth);
  if (!revoked) {
    revoked = await tryGlobalSignOut(auth);
  }

  await discardSupabaseAuthCookies();

  if (!revoked) {
    return internalError();
  }

  return {
    ok: true,
    redirectTo: RESET_SUCCESS_REDIRECT,
  };
}

export async function setNewPassword(
  raw: unknown,
): Promise<SetNewPasswordResult> {
  try {
    return await setNewPasswordInner(raw);
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code: unknown }).code)
        : undefined;
    console.error("[auth] setNewPassword unexpected error", {
      ...(code ? { code } : {}),
      payload: redactAuthPayload(raw),
    });
    return internalError();
  }
}
