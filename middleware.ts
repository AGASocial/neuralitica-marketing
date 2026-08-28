import { NextResponse, type NextRequest } from "next/server";

import { isSupabaseAuthCookieName } from "@/lib/auth/auth-cookie-name";
import { buildAbsoluteLoginLocation } from "@/lib/auth/login-redirect";
import {
  isPublicPath,
  LOCALE_HEADER,
  normalizePathname,
  PATHNAME_HEADER,
} from "@/lib/auth/public-routes";
import { refreshSessionCookiesOnEdge } from "@/lib/auth/refresh-session-cookies";

function hasSupabaseAuthCookie(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some((cookie) => isSupabaseAuthCookieName(cookie.name));
}

/**
 * Next.js 15 Edge rejects relative `Location` (`middleware-relative-urls`).
 * Absolute origin is `SITE_URL` then `request.nextUrl.origin` — never raw
 * `Host` / `X-Forwarded-Host`.
 */
function loginRedirect(
  request: NextRequest,
  next: string | null,
  locale: string | null,
): NextResponse {
  const location = buildAbsoluteLoginLocation({
    siteUrl: process.env.SITE_URL,
    appOrigin: request.nextUrl.origin,
    next,
    locale,
  });
  const response = NextResponse.redirect(location, 302);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function withPathHeaders(
  request: NextRequest,
  pathname: string,
  locale: string | null,
): Headers {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(PATHNAME_HEADER, pathname);
  if (locale) {
    requestHeaders.set(LOCALE_HEADER, locale);
  }
  return requestHeaders;
}

/**
 * Convenience only: allowlist + cookie presence + anon-key session refresh.
 * Does not read neuramark_clients, does not inject identity headers, and
 * does not use the service-role key. getUser() here is for cookie rotation
 * only — Node requireActive() is the authorization boundary.
 */
export async function middleware(
  request: NextRequest,
): Promise<NextResponse> {
  const pathname = normalizePathname(request.nextUrl.pathname);
  const locale = request.nextUrl.searchParams.get("locale");
  const requestHeaders = withPathHeaders(request, pathname, locale);

  if (isPublicPath(pathname)) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  if (!hasSupabaseAuthCookie(request)) {
    const next = pathname === "/pending" ? null : pathname;
    return loginRedirect(request, next, locale);
  }

  return refreshSessionCookiesOnEdge(request, pathname, locale);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|woff2?)$).*)",
  ],
};
