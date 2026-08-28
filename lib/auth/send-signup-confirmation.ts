import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isBenignResendError } from "@/lib/auth/supabase-auth-errors";

function getSignupEmailRedirectTo(): string | undefined {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);

  if (!raw) {
    return undefined;
  }

  const base = raw.startsWith("http") ? raw : `https://${raw}`;
  return `${base.replace(/\/$/, "")}/auth/callback`;
}

/** Triggers Supabase signup confirmation email (admin createUser does not send automatically). */
export async function sendSignupConfirmationEmail(
  supabase: SupabaseClient,
  email: string,
): Promise<boolean> {
  const emailRedirectTo = getSignupEmailRedirectTo();

  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: emailRedirectTo ? { emailRedirectTo } : undefined,
  });

  if (error && !isBenignResendError(error)) {
    console.error("[auth] sendSignupConfirmationEmail failed", {
      code: error.code,
      status: error.status,
    });
    return false;
  }

  return true;
}
