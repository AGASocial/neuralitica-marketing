"use server";

import {
  requestPasswordResetInputSchema,
  type RequestPasswordResetResult,
} from "@/lib/contracts/auth";

import {
  authSuccess,
  forbiddenFieldsError,
  internalError,
  passwordResetRateLimitedError,
  validationError,
} from "@/lib/auth/errors";
import { findForbiddenPasswordResetRequestKeys } from "@/lib/auth/forbidden-fields";
import { getClientIp } from "@/lib/auth/get-client-ip";
import {
  isPasswordResetRateLimited,
  recordAuthAttempt,
} from "@/lib/auth/rate-limit";
import { sendPasswordResetEmail } from "@/lib/auth/send-password-reset";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/auth/supabase-server";
import { zodErrorToFieldErrors } from "@/lib/auth/zod-field-errors";

async function requestPasswordResetInner(
  raw: unknown,
): Promise<RequestPasswordResetResult> {
  const forbidden = findForbiddenPasswordResetRequestKeys(raw);
  if (forbidden.length > 0) {
    console.warn("[auth] requestPasswordReset rejected forbidden fields", {
      keys: forbidden,
    });
    return forbiddenFieldsError();
  }

  const parsed = requestPasswordResetInputSchema.safeParse(raw);
  if (!parsed.success) {
    return validationError(zodErrorToFieldErrors(parsed.error));
  }

  const input = parsed.data;

  if (!isSupabaseConfigured()) {
    console.error(
      "[auth] requestPasswordReset unavailable: Supabase not configured",
    );
    return internalError();
  }

  const ip = await getClientIp();

  const recorded = await recordAuthAttempt({
    ip,
    email: input.email,
    action: "password_reset_request",
  });

  if (!recorded) {
    return passwordResetRateLimitedError();
  }

  if (await isPasswordResetRateLimited(input.email, ip)) {
    return passwordResetRateLimitedError();
  }

  const supabase = createServerSupabaseClient();
  await sendPasswordResetEmail(supabase, input.email);

  return authSuccess();
}

export async function requestPasswordReset(
  raw: unknown,
): Promise<RequestPasswordResetResult> {
  try {
    return await requestPasswordResetInner(raw);
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code: unknown }).code)
        : undefined;
    console.error(
      "[auth] requestPasswordReset unexpected error",
      code ? { code } : {},
    );
    return internalError();
  }
}
