import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getSignupEmailRedirectTo } from "@/lib/auth/site-origin";
import { isBenignResendError } from "@/lib/auth/supabase-auth-errors";

/** Triggers Supabase signup confirmation email (admin createUser does not send automatically). */
export async function sendSignupConfirmationEmail(
  supabase: SupabaseClient,
  email: string,
): Promise<boolean> {
  try {
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
  } catch {
    console.error("[auth] sendSignupConfirmationEmail threw");
    return false;
  }
}
