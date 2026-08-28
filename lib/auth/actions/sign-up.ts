"use server";

import { signUpInputSchema, type SignUpResult } from "@/lib/contracts/auth";

import {
  authSuccess,
  forbiddenFieldsError,
  internalError,
  passwordPolicyError,
  rateLimitedError,
  redactAuthPayload,
  validationError,
} from "@/lib/auth/errors";
import { findAuthUserIdByEmail } from "@/lib/auth/find-auth-user-by-email";
import { findForbiddenSignUpKeys } from "@/lib/auth/forbidden-fields";
import { getClientIp } from "@/lib/auth/get-client-ip";
import { validatePassword } from "@/lib/auth/password-policy";
import {
  isSignupRateLimited,
  recordAuthAttempt,
} from "@/lib/auth/rate-limit";
import { sendSignupConfirmationEmail } from "@/lib/auth/send-signup-confirmation";
import { createServerSupabaseClient, isSupabaseConfigured } from "@/lib/auth/supabase-server";
import {
  isDuplicateAuthError,
  isWeakPasswordAuthError,
} from "@/lib/auth/supabase-auth-errors";
import { zodErrorToFieldErrors } from "@/lib/auth/zod-field-errors";

import type { SupabaseClient } from "@supabase/supabase-js";

function emailFromRaw(raw: unknown): string | undefined {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return undefined;
  }

  const email = (raw as { email?: unknown }).email;
  if (typeof email !== "string" || email.trim().length === 0) {
    return undefined;
  }

  return email.toLowerCase().trim();
}

async function recordSignupAttemptOrLimit(
  ip: string,
  email: string | undefined,
): Promise<SignUpResult | null> {
  const recorded = await recordAuthAttempt({
    ip,
    email,
    action: "signup",
  });

  if (!recorded) {
    return rateLimitedError();
  }

  return null;
}

/**
 * Duplicate createUser: backfill neuramark_clients if the auth user exists
 * without a profile row. Always enumeration-safe — never leak lookup results.
 */
async function ensureClientRowForExistingAuthUser(
  supabase: SupabaseClient,
  params: {
    email: string;
    displayName: string;
    preferredLocale: string;
  },
): Promise<void> {
  try {
    const { data: existing, error: lookupError } = await supabase
      .from("neuramark_clients")
      .select("id")
      .eq("email", params.email)
      .maybeSingle();

    if (lookupError) {
      console.error("[auth] duplicate-path client lookup failed", {
        code: lookupError.code,
      });
      return;
    }

    if (existing) {
      return;
    }

    const authUserId = await findAuthUserIdByEmail(params.email);
    if (!authUserId) {
      console.error("[auth] duplicate-path auth user lookup found no id");
      return;
    }

    const { error: insertError } = await supabase.from("neuramark_clients").insert({
      auth_user_id: authUserId,
      email: params.email,
      display_name: params.displayName,
      preferred_locale: params.preferredLocale,
    });

    if (insertError && insertError.code !== "23505") {
      console.error("[auth] duplicate-path client insert failed", {
        code: insertError.code,
      });
    }
  } catch {
    console.error("[auth] duplicate-path ensure client row threw");
  }
}

async function signUpInner(raw: unknown): Promise<SignUpResult> {
  const forbidden = findForbiddenSignUpKeys(raw);
  if (forbidden.length > 0) {
    console.warn("[auth] signUp rejected forbidden fields", { keys: forbidden });
    return forbiddenFieldsError();
  }

  const ip = await getClientIp();
  const parsed = signUpInputSchema.safeParse(raw);

  if (!parsed.success) {
    if (isSupabaseConfigured()) {
      const recorded = await recordSignupAttemptOrLimit(ip, emailFromRaw(raw));
      if (recorded) {
        return recorded;
      }
    }
    return validationError(zodErrorToFieldErrors(parsed.error));
  }

  const input = parsed.data;

  const policy = validatePassword(input.password);
  if (!policy.ok) {
    if (isSupabaseConfigured()) {
      const recorded = await recordSignupAttemptOrLimit(ip, input.email);
      if (recorded) {
        return recorded;
      }
    }
    return passwordPolicyError(policy.violation);
  }

  if (!isSupabaseConfigured()) {
    console.error("[auth] signUp unavailable: Supabase not configured");
    return internalError();
  }

  const recordError = await recordSignupAttemptOrLimit(ip, input.email);
  if (recordError) {
    return recordError;
  }

  if (await isSignupRateLimited(ip)) {
    return rateLimitedError();
  }

  const supabase = createServerSupabaseClient();

  const { data: authData, error: authError } =
    await supabase.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: false,
      user_metadata: {
        display_name: input.displayName,
      },
    });

  if (authError) {
    if (isDuplicateAuthError(authError)) {
      await ensureClientRowForExistingAuthUser(supabase, {
        email: input.email,
        displayName: input.displayName,
        preferredLocale: input.preferredLocale ?? "en",
      });
      return authSuccess();
    }

    if (isWeakPasswordAuthError(authError)) {
      return passwordPolicyError("COMMON_PASSWORD");
    }

    console.error("[auth] signUp Supabase createUser failed", {
      code: authError.code,
      status: authError.status,
      payload: redactAuthPayload(raw),
    });
    return internalError();
  }

  const authUserId = authData.user?.id;
  if (!authUserId) {
    console.error("[auth] signUp missing auth user id after createUser");
    // Success-shaped: INTERNAL_ERROR here would oracle vs duplicate `{ ok: true }`.
    return authSuccess();
  }

  const { error: insertError } = await supabase.from("neuramark_clients").insert({
    auth_user_id: authUserId,
    email: input.email,
    display_name: input.displayName,
    preferred_locale: input.preferredLocale ?? "en",
  });

  if (insertError) {
    if (insertError.code === "23505") {
      // Unique on email or auth_user_id: a client row already exists. Do not
      // delete the auth user (that would cascade-drop a valid profile).
      return authSuccess();
    }

    console.error("[auth] signUp client insert failed; compensating auth user delete", {
      code: insertError.code,
    });

    await supabase.auth.admin.deleteUser(authUserId).catch((deleteError) => {
      console.error("[auth] signUp compensation delete failed", {
        code: deleteError?.code,
      });
    });

    return internalError();
  }

  const emailSent = await sendSignupConfirmationEmail(supabase, input.email);
  if (!emailSent) {
    console.error(
      "[auth] signUp confirmation email failed; keeping auth user and client row for resend recovery",
    );
  }

  return authSuccess();
}

export async function signUp(raw: unknown): Promise<SignUpResult> {
  try {
    return await signUpInner(raw);
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code: unknown }).code)
        : undefined;
    console.error("[auth] signUp unexpected error", code ? { code } : {});
    return internalError();
  }
}
