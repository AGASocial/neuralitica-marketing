import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isBenignResendError } from "@/lib/auth/supabase-auth-errors";

function getSignupEmailRedirectTo(): string | undefined {
  const configured = process.env.SITE_URL?.trim();
  const vercelHost = process.env.VERCEL_URL?.trim();

  const raw = configured
    ? configured
    : vercelHost
      ? `https://${vercelHost}`
      : undefined;

  if (!configured && vercelHost) {
    console.warn(
      "[auth] SITE_URL is unset; using VERCEL_URL for confirmation emailRedirectTo. Set SITE_URL and add it to the Supabase Auth redirect allowlist.",
    );
  }

  if (!raw) {
    console.warn(
      "[auth] SITE_URL is unset; confirmation emailRedirectTo omitted. Set SITE_URL and add it to the Supabase Auth redirect allowlist.",
    );
    return undefined;
  }

  const base = raw.startsWith("http") ? raw : `https://${raw}`;

  try {
    const origin = new URL(base);
    return `${origin.origin}/auth/callback`;
  } catch {
    console.warn(
      "[auth] SITE_URL is not a valid URL; confirmation emailRedirectTo omitted.",
    );
    return undefined;
  }
}

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
