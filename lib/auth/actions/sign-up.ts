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
import { findForbiddenSignUpKeys } from "@/lib/auth/forbidden-fields";
import { getClientIp } from "@/lib/auth/get-client-ip";
import { validatePassword } from "@/lib/auth/password-policy";
import {
  isSignupRateLimited,
  recordAuthAttempt,
} from "@/lib/auth/rate-limit";
import { sendSignupConfirmationEmail } from "@/lib/auth/send-signup-confirmation";
import { createServerSupabaseClient, isSupabaseConfigured } from "@/lib/auth/supabase-server";
import { isDuplicateAuthError } from "@/lib/auth/supabase-auth-errors";
import { zodErrorToFieldErrors } from "@/lib/auth/zod-field-errors";

export async function signUp(raw: unknown): Promise<SignUpResult> {
  const forbidden = findForbiddenSignUpKeys(raw);
  if (forbidden.length > 0) {
    console.warn("[auth] signUp rejected forbidden fields", { keys: forbidden });
    return forbiddenFieldsError();
  }

  const parsed = signUpInputSchema.safeParse(raw);
  if (!parsed.success) {
    return validationError(zodErrorToFieldErrors(parsed.error));
  }

  const input = parsed.data;

  const policy = validatePassword(input.password);
  if (!policy.ok) {
    return passwordPolicyError(policy.violation);
  }

  if (!isSupabaseConfigured()) {
    console.error("[auth] signUp unavailable: Supabase not configured");
    return internalError();
  }

  const ip = await getClientIp();

  await recordAuthAttempt({
    ip,
    email: input.email,
    action: "signup",
  });

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
      return authSuccess();
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
    return internalError();
  }

  const { error: insertError } = await supabase.from("neuramark_clients").insert({
    auth_user_id: authUserId,
    email: input.email,
    display_name: input.displayName,
    preferred_locale: input.preferredLocale ?? "en",
  });

  if (insertError) {
    if (insertError.code === "23505") {
      await supabase.auth.admin.deleteUser(authUserId).catch(() => undefined);
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
    const { error: deleteClientError } = await supabase
      .from("neuramark_clients")
      .delete()
      .eq("auth_user_id", authUserId);

    if (deleteClientError) {
      console.error("[auth] signUp email send failed; client delete compensation failed", {
        code: deleteClientError.code,
      });
    }

    await supabase.auth.admin.deleteUser(authUserId).catch(() => undefined);
    return internalError();
  }

  return authSuccess();
}
