import { NextResponse, type NextRequest } from "next/server";

import { isSupabaseAuthCookieName } from "@/lib/auth/auth-cookie-name";
import { buildLoginLocation } from "@/lib/auth/login-redirect";
import {
  isPublicPath,
  LOCALE_HEADER,
  normalizePathname,
  PATHNAME_HEADER,
} from "@/lib/auth/public-routes";

function hasSupabaseAuthCookie(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some((cookie) => isSupabaseAuthCookieName(cookie.name));
}

function relativeRedirect(location: string): NextResponse {
  return new NextResponse(null, {
    status: 302,
    headers: {
      Location: location,
      "Cache-Control": "no-store",
    },
  });
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
 * Convenience only: allowlist + cookie presence.
 * Does not call getUser(), does not read neuramark_clients, does not
 * inject identity headers, and does not use the service-role key.
 */
export function middleware(request: NextRequest): NextResponse {
  const pathname = normalizePathname(request.nextUrl.pathname);
  const locale = request.nextUrl.searchParams.get("locale");
  const requestHeaders = withPathHeaders(request, pathname, locale);

  if (isPublicPath(pathname)) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  if (!hasSupabaseAuthCookie(request)) {
    const next = pathname === "/pending" ? null : pathname;
    return relativeRedirect(buildLoginLocation({ next, locale }));
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|woff2?)$).*)",
  ],
};
