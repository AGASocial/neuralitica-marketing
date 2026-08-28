"use server";

import { logInInputSchema, type LogInResult } from "@/lib/contracts/auth";

import {
  forbiddenFieldsError,
  internalError,
  invalidCredentialsError,
  loginRateLimitedError,
  redactAuthPayload,
  validationError,
} from "@/lib/auth/errors";
import { findForbiddenLogInKeys } from "@/lib/auth/forbidden-fields";
import { getClientIp } from "@/lib/auth/get-client-ip";
import {
  isLoginRateLimited,
  recordAuthAttempt,
  resetLoginFailedAttempts,
} from "@/lib/auth/rate-limit";
import { sanitizeLoginNext } from "@/lib/auth/safe-next-path";
import {
  createUserScopedAuthClient,
  discardSupabaseAuthCookies,
  isUserScopedAuthConfigured,
} from "@/lib/auth/supabase-cookie";
import { createServerSupabaseClient, isSupabaseConfigured } from "@/lib/auth/supabase-server";
import { zodErrorToFieldErrors } from "@/lib/auth/zod-field-errors";

const PENDING = "/pending";
const DISPLAY_NAME_MAX = 120;
const EMAIL_MAX = 320;

type ClientLandingRow = {
  email: string;
  displayName: string;
  active: boolean;
};

async function recordLoginFailureOrLimit(
  ip: string,
  email: string,
): Promise<LogInResult | null> {
  const recorded = await recordAuthAttempt({
    ip,
    email,
    action: "login_failed",
  });

  if (!recorded) {
    return loginRateLimitedError();
  }

  return null;
}

/**
 * Service-role read after successful Auth. Errors / missing row → null
 * (pending landing). Must not surface as INTERNAL_ERROR (enumeration).
 */
async function readClientLandingRow(
  authUserId: string,
): Promise<ClientLandingRow | null> {
  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("neuramark_clients")
      .select("email, display_name, active")
      .eq("auth_user_id", authUserId)
      .maybeSingle();

    if (error) {
      console.error("[auth] logIn client lookup failed", { code: error.code });
      return null;
    }

    if (!data) {
      return null;
    }

    const email =
      typeof data.email === "string" && data.email.length > 0
        ? data.email.slice(0, EMAIL_MAX)
        : "";
    const displayName =
      typeof data.display_name === "string" && data.display_name.length > 0
        ? data.display_name.slice(0, DISPLAY_NAME_MAX)
        : "";

    if (!email || !displayName) {
      return null;
    }

    return {
      email,
      displayName,
      active: data.active === true,
    };
  } catch {
    console.error("[auth] logIn client lookup threw");
    return null;
  }
}

function pendingIdentity(
  row: ClientLandingRow | null,
  authEmail: string,
): { email: string; displayName: string } {
  if (row) {
    return { email: row.email, displayName: row.displayName };
  }

  const email = authEmail.slice(0, EMAIL_MAX);
  const displayName = email.slice(0, DISPLAY_NAME_MAX);

  return {
    email,
    displayName: displayName.length > 0 ? displayName : email.slice(0, DISPLAY_NAME_MAX),
  };
}

async function logInInner(raw: unknown): Promise<LogInResult> {
  const forbidden = findForbiddenLogInKeys(raw);
  if (forbidden.length > 0) {
    console.warn("[auth] logIn rejected forbidden fields", { keys: forbidden });
    return forbiddenFieldsError();
  }

  const parsed = logInInputSchema.safeParse(raw);
  if (!parsed.success) {
    return validationError(zodErrorToFieldErrors(parsed.error));
  }

  const input = parsed.data;

  if (!isSupabaseConfigured() || !isUserScopedAuthConfigured()) {
    console.error("[auth] logIn unavailable: Supabase not configured");
    return internalError();
  }

  const ip = await getClientIp();

  if (await isLoginRateLimited(input.email, ip)) {
    return loginRateLimitedError();
  }

  await discardSupabaseAuthCookies();

  const auth = await createUserScopedAuthClient();
  const { data, error: authError } = await auth.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });

  if (authError || !data.user?.id || !data.session) {
    await discardSupabaseAuthCookies();
    const limit = await recordLoginFailureOrLimit(ip, input.email);
    if (limit) {
      return limit;
    }

    return invalidCredentialsError();
  }

  const resetOk = await resetLoginFailedAttempts(input.email, ip);
  if (!resetOk) {
    console.error("[auth] logIn login_failed reset failed; continuing success");
  }

  const authEmail =
    typeof data.user.email === "string" && data.user.email.length > 0
      ? data.user.email.toLowerCase()
      : input.email;

  const row = await readClientLandingRow(data.user.id);

  if (row?.active) {
    return {
      ok: true,
      redirectTo: sanitizeLoginNext(input.next),
      email: row.email,
      displayName: row.displayName,
    };
  }

  const identity = pendingIdentity(row, authEmail);
  return {
    ok: true,
    redirectTo: PENDING,
    email: identity.email,
    displayName: identity.displayName,
  };
}

export async function logIn(raw: unknown): Promise<LogInResult> {
  try {
    return await logInInner(raw);
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code: unknown }).code)
        : undefined;
    console.error("[auth] logIn unexpected error", {
      ...(code ? { code } : {}),
      payload: redactAuthPayload(raw),
    });
    return internalError();
  }
}
