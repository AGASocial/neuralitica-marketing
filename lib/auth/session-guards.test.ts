import assert from "node:assert/strict";
import Module from "node:module";
import { describe, it } from "node:test";

import { isSupabaseAuthCookieName } from "./auth-cookie-name";
import {
  assertAuthDevFallbackEnv,
  isAuthDevFallbackEnabled,
} from "./assert-dev-fallback";
import type { CurrentUser } from "./get-current-user-types";
import { resolveActiveGuard, resolveOperatorGuard } from "./guard-decision";
import { buildLoginLocation } from "./login-redirect";
import { mapClientRowToCurrentUser } from "./map-client-row";
import { isPublicPath, normalizePathname } from "./public-routes";
import { shouldRefreshSessionOnEdge } from "./refresh-session-cookies";
import {
  applySessionCookieFlags,
  SESSION_IDLE_MAX_AGE_SECONDS,
} from "./session-cookie-flags";

const SEVEN_DAYS = 7 * 24 * 60 * 60;

const activeClient: CurrentUser = {
  id: "3b2c1a09-7e4f-4d11-9c0a-aaaaaaaaaaa1",
  email: "maria.garcia@example.com",
  displayName: "María García",
  preferredLocale: "es",
  role: "client",
  active: true,
};

const inactiveOperator: CurrentUser = {
  id: "3b2c1a09-7e4f-4d11-9c0a-aaaaaaaaaaa2",
  email: "pending.user@example.com",
  displayName: "Pending User",
  preferredLocale: "en",
  role: "operator",
  active: false,
};

describe("AUTH_DEV_FALLBACK", () => {
  it("throws in production for any non-empty value including false", () => {
    assert.throws(() => assertAuthDevFallbackEnv("production", "true"));
    assert.throws(() => assertAuthDevFallbackEnv("production", "false"));
    assert.throws(() => assertAuthDevFallbackEnv("production", "0"));
    assert.doesNotThrow(() => assertAuthDevFallbackEnv("production", undefined));
    assert.doesNotThrow(() => assertAuthDevFallbackEnv("production", ""));
  });

  it("is unreachable when NODE_ENV is production", () => {
    assert.equal(isAuthDevFallbackEnabled("production", "true"), false);
    assert.equal(isAuthDevFallbackEnabled("production", "false"), false);
    assert.equal(isAuthDevFallbackEnabled("development", "true"), true);
    assert.equal(isAuthDevFallbackEnabled("development", "TRUE"), false);
    assert.equal(isAuthDevFallbackEnabled("test", "true"), false);
  });
});

describe("applySessionCookieFlags", () => {
  it("clamps idle maxAge to 7 days and does not raise maxAge 0", () => {
    assert.equal(SESSION_IDLE_MAX_AGE_SECONDS, SEVEN_DAYS);

    const clamped = applySessionCookieFlags({ maxAge: 400 * 24 * 60 * 60 });
    assert.equal(clamped.maxAge, SEVEN_DAYS);
    assert.equal(clamped.httpOnly, true);
    assert.equal(clamped.sameSite, "lax");
    assert.equal(clamped.path, "/");
    assert.equal("domain" in clamped, false);

    const unset = applySessionCookieFlags({});
    assert.equal(unset.maxAge, SEVEN_DAYS);

    const deleted = applySessionCookieFlags({ maxAge: 0 });
    assert.equal(deleted.maxAge, 0);

    const short = applySessionCookieFlags({ maxAge: 3600 });
    assert.equal(short.maxAge, 3600);
  });

  it("clamps expires down to 7 days", () => {
    const far = new Date(Date.now() + 400 * 24 * 60 * 60 * 1000);
    const flags = applySessionCookieFlags({ expires: far });
    assert.ok(flags.expires);
    const delta = flags.expires!.getTime() - Date.now();
    assert.ok(delta <= SEVEN_DAYS * 1000 + 1000);
  });
});

describe("public allowlist", () => {
  it("treats trailing slashes as the same path and keeps /pending private", () => {
    assert.equal(normalizePathname("/login/"), "/login");
    assert.equal(isPublicPath("/login"), true);
    assert.equal(isPublicPath("/login/"), true);
    assert.equal(isPublicPath("/signup"), true);
    assert.equal(isPublicPath("/reset-password"), true);
    assert.equal(isPublicPath("/reset-password/new"), true);
    assert.equal(isPublicPath("/auth/callback"), true);
    assert.equal(isPublicPath("/auth/callback/recovery"), true);
    assert.equal(isPublicPath("/pending"), false);
    assert.equal(isPublicPath("/"), false);
    assert.equal(isPublicPath("/dashboard"), false);
    assert.equal(isPublicPath("/api/anything"), false);
  });
});

describe("Edge session refresh", () => {
  it("refreshes only non-public paths that already have an sb-* cookie", () => {
    assert.equal(shouldRefreshSessionOnEdge("/dashboard", true), true);
    assert.equal(shouldRefreshSessionOnEdge("/", true), true);
    assert.equal(shouldRefreshSessionOnEdge("/pending", true), true);
    assert.equal(shouldRefreshSessionOnEdge("/login", true), false);
    assert.equal(shouldRefreshSessionOnEdge("/signup", true), false);
    assert.equal(shouldRefreshSessionOnEdge("/reset-password", true), false);
    assert.equal(shouldRefreshSessionOnEdge("/reset-password/new", true), false);
    assert.equal(shouldRefreshSessionOnEdge("/auth/callback", true), false);
    assert.equal(shouldRefreshSessionOnEdge("/auth/callback/recovery", true), false);
    assert.equal(shouldRefreshSessionOnEdge("/dashboard", false), false);
    assert.equal(shouldRefreshSessionOnEdge("/pending", false), false);
  });
});

describe("login Location", () => {
  it("omits next for /pending and sanitizes product next", () => {
    assert.equal(buildLoginLocation({ next: "/pending" }), "/login");
    assert.equal(
      buildLoginLocation({ next: "/pending", locale: "es" }),
      "/login?locale=es",
    );
    assert.equal(buildLoginLocation({ next: "/" }), "/login?next=%2F");
    assert.equal(
      buildLoginLocation({ next: "/dashboard" }),
      "/login?next=%2Fdashboard",
    );
    assert.equal(
      buildLoginLocation({ next: "https://evil.example" }),
      "/login?next=%2Fdashboard",
    );
  });
});

describe("requireActive / requireOperator decisions", () => {
  it("sends no session to login/401 and inactive or missing row to pending/403", () => {
    assert.equal(
      resolveActiveGuard({ user: null, hasValidSession: false }).kind,
      "unauthenticated",
    );
    assert.equal(
      resolveActiveGuard({ user: null, hasValidSession: true }).kind,
      "forbidden",
    );
    assert.equal(
      resolveActiveGuard({ user: inactiveOperator, hasValidSession: true }).kind,
      "forbidden",
    );
    const ok = resolveActiveGuard({
      user: activeClient,
      hasValidSession: true,
    });
    assert.equal(ok.kind, "ok");
  });

  it("evaluates active before role so an inactive operator is forbidden", () => {
    assert.equal(
      resolveActiveGuard({ user: inactiveOperator, hasValidSession: true }).kind,
      "forbidden",
    );
    const demoted: CurrentUser = { ...activeClient, role: "client" };
    assert.equal(resolveOperatorGuard(demoted).kind, "forbidden");
    const operator: CurrentUser = { ...activeClient, role: "operator" };
    assert.equal(resolveOperatorGuard(operator).kind, "ok");
  });
});

type NodeModuleLoad = {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};

describe("logOut cookie replay", () => {
  it("replayed pre-logout sb-* cookies do not restore a product user after local revoke", async () => {
    const AUTH_COOKIE = "sb-localhost-auth-token";
    const PRE_LOGOUT_VALUE = "captured-pre-logout-session";
    const jar: { name: string; value: string; maxAge?: number }[] = [
      { name: AUTH_COOKIE, value: PRE_LOGOUT_VALUE, maxAge: SEVEN_DAYS },
    ];

    const captured = jar
      .filter((cookie) => isSupabaseAuthCookieName(cookie.name))
      .map((cookie) => ({ ...cookie }));
    assert.equal(captured.length, 1);
    assert.equal(captured[0]?.name, AUTH_COOKIE);
    assert.equal(captured[0]?.value, PRE_LOGOUT_VALUE);

    let refreshTokenRevoked = false;
    const authClient = {
      auth: {
        async getUser() {
          if (refreshTokenRevoked) {
            return {
              data: { user: null },
              error: { code: "session_not_found", status: 401 },
            };
          }
          return {
            data: {
              user: {
                id: "11111111-1111-4111-8111-111111111111",
                email: activeClient.email,
                user_metadata: { display_name: activeClient.displayName },
              },
            },
            error: null,
          };
        },
        async signOut(options: { scope: string }) {
          assert.equal(options.scope, "local");
          refreshTokenRevoked = true;
          return { error: null };
        },
      },
    };

    const nodeModule = Module as unknown as NodeModuleLoad;
    const originalLoad = nodeModule._load.bind(Module);
    const previousEnv = {
      AUTH_DEV_FALLBACK: process.env.AUTH_DEV_FALLBACK,
      NODE_ENV: process.env.NODE_ENV,
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    };

    nodeModule._load = function (request, parent, isMain) {
      if (request === "server-only") {
        return {};
      }
      if (request === "next/headers") {
        return {
          cookies: async () => ({
            getAll: () => jar.map(({ name, value }) => ({ name, value })),
            set: (
              name: string,
              value: string,
              options?: { maxAge?: number },
            ) => {
              const next = { name, value, maxAge: options?.maxAge };
              const index = jar.findIndex((cookie) => cookie.name === name);
              if (index >= 0) {
                jar[index] = next;
              } else {
                jar.push(next);
              }
            },
          }),
        };
      }
      if (request === "@supabase/ssr") {
        return {
          createServerClient: () => authClient,
          parseCookieHeader: () => [],
        };
      }
      if (request === "@/lib/auth/supabase-server") {
        return {
          isSupabaseConfigured: () => true,
          createServerSupabaseClient: () => ({
            from() {
              return {
                select() {
                  return {
                    eq() {
                      return {
                        async maybeSingle() {
                          return {
                            data: {
                              id: activeClient.id,
                              email: activeClient.email,
                              display_name: activeClient.displayName,
                              preferred_locale: activeClient.preferredLocale,
                              role: activeClient.role,
                              active: activeClient.active,
                            },
                            error: null,
                          };
                        },
                      };
                    },
                  };
                },
              };
            },
          }),
        };
      }
      return originalLoad(request, parent, isMain);
    };

    try {
      delete process.env.AUTH_DEV_FALLBACK;
      process.env.NODE_ENV = "test";
      process.env.SUPABASE_URL = "https://example.supabase.co";
      process.env.SUPABASE_ANON_KEY = "test-anon-key";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";

      const { logOut } = await import("./actions/log-out.ts");
      const result = await logOut();
      assert.deepEqual(result, { ok: true, redirectTo: "/login" });
      assert.equal(refreshTokenRevoked, true);
      assert.equal(jar[0]?.value, "");
      assert.equal(jar[0]?.maxAge, 0);

      jar.splice(0, jar.length, ...captured.map((cookie) => ({ ...cookie })));
      assert.equal(jar[0]?.value, PRE_LOGOUT_VALUE);

      const { getCurrentUser } = await import("./get-current-user.ts");
      const replayedUser = await getCurrentUser();
      assert.equal(replayedUser, null);

      assert.equal(isPublicPath("/dashboard"), false);
      assert.equal(isPublicPath("/pending"), false);
      assert.equal(
        resolveActiveGuard({
          user: replayedUser,
          hasValidSession: false,
        }).kind,
        "unauthenticated",
      );
      assert.equal(
        buildLoginLocation({ next: "/dashboard" }),
        "/login?next=%2Fdashboard",
      );
      assert.equal(buildLoginLocation({ next: "/pending" }), "/login");
    } finally {
      nodeModule._load = originalLoad;
      for (const [key, value] of Object.entries(previousEnv)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  });
});

describe("mapClientRowToCurrentUser", () => {
  it("does not invent a user when id or email is missing", () => {
    assert.equal(mapClientRowToCurrentUser(null), null);
    assert.equal(
      mapClientRowToCurrentUser({
        id: "",
        email: "a@b.com",
        display_name: "A",
        preferred_locale: "en",
        role: "client",
        active: true,
      }),
      null,
    );
    const mapped = mapClientRowToCurrentUser({
      id: "3b2c1a09-7e4f-4d11-9c0a-aaaaaaaaaaa1",
      email: "maria.garcia@example.com",
      display_name: "María García",
      preferred_locale: "es",
      role: "client",
      active: false,
    });
    assert.equal(mapped?.id, "3b2c1a09-7e4f-4d11-9c0a-aaaaaaaaaaa1");
    assert.equal(mapped?.active, false);
    assert.equal(mapped?.preferredLocale, "es");
  });
});
