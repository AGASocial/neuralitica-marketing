"use server";

import {
  resendConfirmationInputSchema,
  type ResendConfirmationResult,
} from "@/lib/contracts/auth";

import {
  authSuccess,
  forbiddenFieldsError,
  internalError,
  rateLimitedError,
  validationError,
} from "@/lib/auth/errors";
import { findForbiddenResendKeys } from "@/lib/auth/forbidden-fields";
import { getClientIp } from "@/lib/auth/get-client-ip";
import {
  isResendConfirmationRateLimited,
  recordAuthAttempt,
} from "@/lib/auth/rate-limit";
import { sendSignupConfirmationEmail } from "@/lib/auth/send-signup-confirmation";
import { createServerSupabaseClient, isSupabaseConfigured } from "@/lib/auth/supabase-server";
import { zodErrorToFieldErrors } from "@/lib/auth/zod-field-errors";

async function resendConfirmationEmailInner(
  raw: unknown,
): Promise<ResendConfirmationResult> {
  const forbidden = findForbiddenResendKeys(raw);
  if (forbidden.length > 0) {
    console.warn("[auth] resendConfirmation rejected forbidden fields", {
      keys: forbidden,
    });
    return forbiddenFieldsError();
  }

  const parsed = resendConfirmationInputSchema.safeParse(raw);
  if (!parsed.success) {
    return validationError(zodErrorToFieldErrors(parsed.error));
  }

  const input = parsed.data;

  if (!isSupabaseConfigured()) {
    console.error("[auth] resendConfirmation unavailable: Supabase not configured");
    return internalError();
  }

  const ip = await getClientIp();

  const recorded = await recordAuthAttempt({
    ip,
    email: input.email,
    action: "resend_confirmation",
  });

  if (!recorded) {
    return rateLimitedError();
  }

  if (await isResendConfirmationRateLimited(input.email, ip)) {
    return rateLimitedError();
  }

  const supabase = createServerSupabaseClient();

  await sendSignupConfirmationEmail(supabase, input.email);

  return authSuccess();
}

export async function resendConfirmationEmail(
  raw: unknown,
): Promise<ResendConfirmationResult> {
  try {
    return await resendConfirmationEmailInner(raw);
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code: unknown }).code)
        : undefined;
    console.error(
      "[auth] resendConfirmation unexpected error",
      code ? { code } : {},
    );
    return internalError();
  }
}
