import { NextResponse } from "next/server";

import {
  createUserScopedAuthClientForResponse,
  expireSupabaseAuthCookies,
  isUserScopedAuthConfigured,
} from "@/lib/auth/supabase-cookie";

export const dynamic = "force-dynamic";

const CONFIRMED_LOCATION = "/login?confirmed=1";
const CONFIRMATION_ERROR_LOCATION = "/login?error=confirmation";

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

/**
 * Path A: exchange confirmation `code` server-side, drop any session cookies,
 * 302 to `/login`. Never lands on product routes. `next` / `redirectTo` ignored.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const providerError = url.searchParams.get("error");
    const errorDescription = url.searchParams.get("error_description");
    const code = url.searchParams.get("code")?.trim() ?? "";

    if (providerError || errorDescription || !code) {
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
