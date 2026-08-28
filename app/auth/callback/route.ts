import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import {
  createUserScopedAuthClientForResponse,
  expireSupabaseAuthCookies,
  isUserScopedAuthConfigured,
} from "@/lib/auth/supabase-cookie";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/auth/supabase-server";

export const dynamic = "force-dynamic";

const CONFIRMED_LOCATION = "/login?confirmed=1";
const CONFIRMATION_ERROR_LOCATION = "/login?error=confirmation";

const EMAIL_OTP_TYPES = new Set<string>([
  "signup",
  "invite",
  "magiclink",
  "email_change",
  "email",
]);

function parseEmailOtpType(value: string): EmailOtpType | null {
  if (!EMAIL_OTP_TYPES.has(value)) {
    return null;
  }
  return value as EmailOtpType;
}

function pathARedirect(location: typeof CONFIRMED_LOCATION | typeof CONFIRMATION_ERROR_LOCATION): NextResponse {
  return new NextResponse(null, {
    status: 302,
    headers: {
      Location: location,
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

function confirmationFailure(request: Request): NextResponse {
  const response = pathARedirect(CONFIRMATION_ERROR_LOCATION);
  expireSupabaseAuthCookies(request, response);
  return response;
}

function forwardRecoveryWithoutConsuming(url: URL): NextResponse {
  return new NextResponse(null, {
    status: 302,
    headers: {
      Location: `/auth/callback/recovery${url.search}`,
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

/**
 * Path A: confirm via `token_hash`+`type` (verifyOtp) or PKCE `code`
 * (exchangeCodeForSession). Drop any session cookies. 302 to `/login`.
 * Never lands on product routes. `next` / `redirectTo` ignored.
 * Recovery is not consumed here — forwarded to `/auth/callback/recovery`.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const otpTypeRaw = (url.searchParams.get("type")?.trim() ?? "").toLowerCase();

    if (otpTypeRaw === "recovery") {
      return forwardRecoveryWithoutConsuming(url);
    }

    const providerError = url.searchParams.get("error");
    const errorDescription = url.searchParams.get("error_description");

    if (providerError || errorDescription) {
      return confirmationFailure(request);
    }

    const tokenHash = url.searchParams.get("token_hash")?.trim() ?? "";
    const otpType = parseEmailOtpType(
      (url.searchParams.get("type")?.trim() ?? "").toLowerCase(),
    );
    const code = url.searchParams.get("code")?.trim() ?? "";

    if (tokenHash) {
      if (!otpType) {
        return confirmationFailure(request);
      }

      if (!isSupabaseConfigured()) {
        console.error("[auth] callback unavailable: supabase not configured");
        return confirmationFailure(request);
      }

      // Service-role client: persistSession false — verifyOtp must not mint cookies.
      const supabase = createServerSupabaseClient();
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: otpType,
      });

      if (error) {
        return confirmationFailure(request);
      }

      const success = pathARedirect(CONFIRMED_LOCATION);
      expireSupabaseAuthCookies(request, success);
      return success;
    }

    if (!code) {
      return confirmationFailure(request);
    }

    if (!isUserScopedAuthConfigured()) {
      console.error("[auth] callback unavailable: auth cookie client not configured");
      return confirmationFailure(request);
    }

    const success = pathARedirect(CONFIRMED_LOCATION);
    const supabase = createUserScopedAuthClientForResponse(request, success);
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return confirmationFailure(request);
    }

    await supabase.auth.signOut({ scope: "local" });
    expireSupabaseAuthCookies(request, success);
    return success;
  } catch {
    console.error("[auth] callback unexpected error");
    return confirmationFailure(request);
  }
}
