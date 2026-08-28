import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { isPublicPath, LOCALE_HEADER, PATHNAME_HEADER } from "@/lib/auth/public-routes";
import { applySessionCookieFlags } from "@/lib/auth/session-cookie-flags";
import {
  isUserScopedAuthConfigured,
  requireUserScopedCredentials,
  userScopedCookieOptions,
} from "@/lib/auth/user-scoped-credentials";

/**
 * Refresh `sb-*` cookies on Edge only for non-public paths that already
 * carry a session cookie. Public allowlist (callbacks, login, reset) is
 * unchanged — those routes mint or ignore cookies themselves.
 */
export function shouldRefreshSessionOnEdge(
  pathname: string,
  hasAuthCookie: boolean,
): boolean {
  return hasAuthCookie && !isPublicPath(pathname);
}

function continueWithPathHeaders(
  request: NextRequest,
  pathname: string,
  locale: string | null,
): NextResponse {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(PATHNAME_HEADER, pathname);
  if (locale) {
    requestHeaders.set(LOCALE_HEADER, locale);
  } else {
    requestHeaders.delete(LOCALE_HEADER);
  }

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

/**
 * Anon-key `getUser()` so a rotated refresh token is written as `Set-Cookie`
 * on this GET. Forwards updated cookies on the request so RSC sees them.
 * Does not read `neuramark_clients`, does not inject identity headers, and
 * does not use the service-role key. Result of `getUser()` is not used to
 * 302 — Node `requireActive()` remains the boundary.
 */
export async function refreshSessionCookiesOnEdge(
  request: NextRequest,
  pathname: string,
  locale: string | null,
): Promise<NextResponse> {
  if (!isUserScopedAuthConfigured()) {
    return continueWithPathHeaders(request, pathname, locale);
  }

  const { url, anonKey } = requireUserScopedCredentials();
  let response = continueWithPathHeaders(request, pathname, locale);

  const supabase = createServerClient(url, anonKey, {
    cookieOptions: userScopedCookieOptions(),
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers = {}) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = continueWithPathHeaders(request, pathname, locale);
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, applySessionCookieFlags(options));
        }
        for (const [key, headerValue] of Object.entries(headers)) {
          response.headers.set(key, headerValue);
        }
      },
    },
  });

  try {
    await supabase.auth.getUser();
  } catch {
    // Pass through. Expired/revoked sessions are rejected in Node.
  }

  return response;
}
