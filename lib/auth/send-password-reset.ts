import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getRecoveryEmailRedirectTo } from "@/lib/auth/site-origin";
import { isBenignResendError } from "@/lib/auth/supabase-auth-errors";

/**
 * Always invoke Auth recovery for known and unknown emails.
 * Absorbs "user not found" and send-failures that only occur for existing users.
 * Never logs the email or tokens.
 */
export async function sendPasswordResetEmail(
  supabase: SupabaseClient,
  email: string,
): Promise<void> {
  try {
    const emailRedirectTo = getRecoveryEmailRedirectTo();

    const { error } = await supabase.auth.resetPasswordForEmail(
      email,
      emailRedirectTo ? { redirectTo: emailRedirectTo } : undefined,
    );

    if (error && !isBenignResendError(error)) {
      console.error("[auth] resetPasswordForEmail failed", {
        code: error.code,
        status: error.status,
      });
    }
  } catch {
    console.error("[auth] resetPasswordForEmail threw");
  }
}
