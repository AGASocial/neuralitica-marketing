import "server-only";

import {
  createServerClient,
  parseCookieHeader,
  type CookieOptions,
} from "@supabase/ssr";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Server-only anon/publishable key — never `NEXT_PUBLIC_`. */
function getAnonKey(): string | undefined {
  return process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;
}

export function isUserScopedAuthConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && getAnonKey());
}

type SessionCookieSetOptions = {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge?: number;
  expires?: Date;
};

/**
 * Contract cookie flags. Host-only (no Domain). `Secure` in production.
 * Max-Age follows `@supabase/ssr` when the library supplies it.
 */
export function applySessionCookieFlags(
  incoming?: CookieOptions,
): SessionCookieSetOptions {
  const options: SessionCookieSetOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  };

  if (typeof incoming?.maxAge === "number") {
    options.maxAge = incoming.maxAge;
  }

  if (incoming?.expires) {
    options.expires =
      incoming.expires instanceof Date
        ? incoming.expires
        : new Date(incoming.expires);
  }

  return options;
}

export function isSupabaseAuthCookieName(name: string): boolean {
  return name.startsWith("sb-");
}

function userScopedCookieOptions() {
  return {
    path: "/" as const,
    sameSite: "lax" as const,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  };
}

function requireUserScopedCredentials(): { url: string; anonKey: string } {
  const url = process.env.SUPABASE_URL;
  const anonKey = getAnonKey();

  if (!url || !anonKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_ANON_KEY (or SUPABASE_PUBLISHABLE_KEY) for user-scoped auth.",
    );
  }

  return { url, anonKey };
}

/** Discard pre-auth `sb-*` cookies (session fixation) in a Server Action. */
export async function discardSupabaseAuthCookies(): Promise<void> {
  const cookieStore = await cookies();

  for (const cookie of cookieStore.getAll()) {
    if (isSupabaseAuthCookieName(cookie.name)) {
      cookieStore.set(
        cookie.name,
        "",
        applySessionCookieFlags({ maxAge: 0 }),
      );
    }
  }
}

/**
 * User-scoped `@supabase/ssr` client for Server Actions.
 * Uses the anon key only — never the service-role client.
 */
export async function createUserScopedAuthClient(): Promise<SupabaseClient> {
  const { url, anonKey } = requireUserScopedCredentials();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookieOptions: userScopedCookieOptions(),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet, _headers) {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, applySessionCookieFlags(options));
        }
      },
    },
  });
}

/**
 * User-scoped client that writes Set-Cookie onto a Route Handler response.
 */
export function createUserScopedAuthClientForResponse(
  request: Request,
  response: NextResponse,
): SupabaseClient {
  const { url, anonKey } = requireUserScopedCredentials();

  return createServerClient(url, anonKey, {
    cookieOptions: userScopedCookieOptions(),
    cookies: {
      getAll() {
        return parseCookieHeader(request.headers.get("cookie") ?? "");
      },
      setAll(cookiesToSet, headers = {}) {
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, applySessionCookieFlags(options));
        }
        for (const [key, headerValue] of Object.entries(headers)) {
          response.headers.set(key, headerValue);
        }
      },
    },
  });
}

/** Expire every `sb-*` cookie from the request and any the handler just set. */
export function expireSupabaseAuthCookies(
  request: Request,
  response: NextResponse,
): void {
  const names = new Set<string>();

  for (const { name } of parseCookieHeader(
    request.headers.get("cookie") ?? "",
  )) {
    if (isSupabaseAuthCookieName(name)) {
      names.add(name);
    }
  }

  for (const cookie of response.cookies.getAll()) {
    if (isSupabaseAuthCookieName(cookie.name)) {
      names.add(cookie.name);
    }
  }

  const expire = applySessionCookieFlags({ maxAge: 0 });
  for (const name of names) {
    response.cookies.set(name, "", expire);
  }
}
