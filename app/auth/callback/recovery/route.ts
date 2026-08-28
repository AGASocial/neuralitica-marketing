import { NextResponse } from "next/server";

import {
  createUserScopedAuthClientForResponse,
  expireSupabaseAuthCookies,
  isUserScopedAuthConfigured,
} from "@/lib/auth/supabase-cookie";

export const dynamic = "force-dynamic";

const SUCCESS_LOCATION = "/reset-password/new";
const FAILURE_LOCATION = "/reset-password/new?error=invalid";

const CALLBACK_HEADERS = {
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
} as const;

function recoveryRedirect(location: typeof SUCCESS_LOCATION | typeof FAILURE_LOCATION): NextResponse {
  return new NextResponse(null, {
    status: 302,
    headers: {
      Location: location,
      ...CALLBACK_HEADERS,
    },
  });
}

function recoveryFailure(request: Request): NextResponse {
  const response = recoveryRedirect(FAILURE_LOCATION);
  expireSupabaseAuthCookies(request, response);
  return response;
}

/**
 * Recovery Path: exchange `token_hash`+`type=recovery` (verifyOtp) or PKCE
 * `code` (exchangeCodeForSession) on the user-scoped cookie client. 302 to
 * `/reset-password/new` (token-free). Never lands on product routes.
 * `next` / `redirect_to` / `redirectTo` ignored.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const providerError = url.searchParams.get("error");
    const errorDescription = url.searchParams.get("error_description");

    if (providerError || errorDescription) {
      return recoveryFailure(request);
    }

    const tokenHash = url.searchParams.get("token_hash")?.trim() ?? "";
    const otpType = (url.searchParams.get("type")?.trim() ?? "").toLowerCase();
    const code = url.searchParams.get("code")?.trim() ?? "";

    if (tokenHash) {
      if (otpType !== "recovery") {
        return recoveryFailure(request);
      }

      if (!isUserScopedAuthConfigured()) {
        console.error(
          "[auth] recovery callback unavailable: auth cookie client not configured",
        );
        return recoveryFailure(request);
      }

      const success = recoveryRedirect(SUCCESS_LOCATION);
      expireSupabaseAuthCookies(request, success);

      const supabase = createUserScopedAuthClientForResponse(request, success);
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: "recovery",
      });

      if (error) {
        return recoveryFailure(request);
      }

      return success;
    }

    if (!code) {
      return recoveryFailure(request);
    }

    if (otpType && otpType !== "recovery") {
      return recoveryFailure(request);
    }

    if (!isUserScopedAuthConfigured()) {
      console.error(
        "[auth] recovery callback unavailable: auth cookie client not configured",
      );
      return recoveryFailure(request);
    }

    const success = recoveryRedirect(SUCCESS_LOCATION);
    expireSupabaseAuthCookies(request, success);

    const supabase = createUserScopedAuthClientForResponse(request, success);
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return recoveryFailure(request);
    }

    return success;
  } catch {
    console.error("[auth] recovery callback unexpected error");
    return recoveryFailure(request);
  }
}
