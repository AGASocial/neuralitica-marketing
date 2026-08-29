/**
 * Isolated upsertVisualPreferences action tests.
 * Separate file so ESM import cache is not poisoned by unmocked loads.
 */
import assert from "node:assert/strict";
import Module from "node:module";
import { describe, it } from "node:test";

import { preferencesUnauthenticatedError } from "./errors.ts";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";

const FACELESS_STYLE = {
  voice: "ai_voiceover" as const,
  onScreenText: "captions" as const,
  broll: "stock" as const,
};

type NodeModuleLoad = {
  _load: (
    request: string,
    parent: NodeModule | null | undefined,
    isMain: boolean,
  ) => unknown;
};

function clearUpsertModuleCache() {
  for (const key of Object.keys(require.cache)) {
    const normalized = key.replace(/\\/g, "/");
    if (
      normalized.includes("/lib/visual-preferences/") ||
      normalized.includes("/lib/supabase/server") ||
      normalized.includes("/lib/auth/require-user")
    ) {
      delete require.cache[key];
    }
  }
}

function installUpsertMocks(options: {
  requireActive?: () => Promise<unknown>;
  isAuthGuardError?: (error: unknown) => boolean;
  hasActiveAvatarConsent?: () => Promise<boolean>;
  from?: (table: string) => unknown;
  revalidatePath?: (p: string) => void;
}) {
  const nodeModule = Module as unknown as NodeModuleLoad;
  const originalLoad = nodeModule._load.bind(Module);

  nodeModule._load = function (request, parent, isMain) {
    if (request === "server-only") {
      return {};
    }
    if (request === "next/cache") {
      return {
        revalidatePath: options.revalidatePath ?? (() => {}),
      };
    }
    if (
      request === "@/lib/auth/require-user" ||
      String(request).includes("lib/auth/require-user")
    ) {
      return {
        isAuthGuardError:
          options.isAuthGuardError ??
          ((error: unknown) =>
            Boolean(
              error &&
                typeof error === "object" &&
                "status" in error &&
                ((error as { status: number }).status === 401 ||
                  (error as { status: number }).status === 403),
            )),
        requireActive:
          options.requireActive ??
          (async () => ({
            id: CLIENT_ID,
            email: "gaveho@gmail.com",
            displayName: "Gabriel Vega",
            preferredLocale: "en",
            role: "client",
            active: true,
          })),
      };
    }
    if (String(request).includes("has-active-avatar-consent")) {
      return {
        hasActiveAvatarConsent:
          options.hasActiveAvatarConsent ?? (async () => false),
      };
    }
    if (
      request === "@/lib/supabase/server" ||
      String(request).includes("lib/supabase/server")
    ) {
      return {
        isSupabaseConfigured: () => true,
        createServerSupabaseClient: () => ({
          from:
            options.from ??
            ((table: string) => {
              throw new Error(`unexpected from(${table})`);
            }),
        }),
      };
    }
    return originalLoad(request, parent, isMain);
  };

  return () => {
    nodeModule._load = originalLoad;
    clearUpsertModuleCache();
  };
}

describe("upsertVisualPreferences action (isolated)", () => {
  it("rejects own_avatar without consent and does not call upsert / generation", async () => {
    const fromTables: string[] = [];
    const restore = installUpsertMocks({
      hasActiveAvatarConsent: async () => false,
      from: (table: string) => {
        fromTables.push(table);
        throw new Error("upsert must not run when consent fails");
      },
    });

    try {
      clearUpsertModuleCache();
      const { upsertVisualPreferences } = await import(
        `./upsert-visual-preferences.ts?test=1-${Date.now()}`
      );
      const result = await upsertVisualPreferences({
        allowedModes: ["own_avatar", "faceless"],
        facelessStyle: {
          voice: "music_only",
          onScreenText: "headline_and_captions",
          broll: "mixed",
        },
        genericAvatarId: null,
      });
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.error.code, "OWN_AVATAR_CONSENT_REQUIRED");
      }
      assert.deepEqual(fromTables, []);
    } finally {
      restore();
    }
  });

  it("happy path upserts Preferencias only — no job/strategy tables", async () => {
    const fromTables: string[] = [];
    const revalidatePaths: string[] = [];
    const restore = installUpsertMocks({
      hasActiveAvatarConsent: async () => false,
      revalidatePath: (p) => {
        revalidatePaths.push(p);
      },
      from: (table: string) => {
        fromTables.push(table);
        return {
          upsert() {
            return {
              select() {
                return {
                  async single() {
                    return {
                      data: {
                        allowed_modes: ["generic_avatar", "faceless"],
                        faceless_style: FACELESS_STYLE,
                        generic_avatar_id: null,
                        rules: { must_disclose_not_owner: true },
                        updated_at: "2026-08-29T21:40:00.000Z",
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
    });

    try {
      clearUpsertModuleCache();
      const { upsertVisualPreferences } = await import(
        `./upsert-visual-preferences.ts?test=2-${Date.now()}`
      );
      const result = await upsertVisualPreferences({
        allowedModes: ["generic_avatar", "faceless"],
        facelessStyle: FACELESS_STYLE,
        genericAvatarId: null,
      });
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.deepEqual(result.allowedModes, ["generic_avatar", "faceless"]);
        assert.deepEqual(result.rules, { must_disclose_not_owner: true });
      }
      assert.deepEqual(fromTables, ["neuramark_visual_preferences"]);
      assert.deepEqual(revalidatePaths, ["/settings/preferences"]);
      assert.equal(
        fromTables.some((t) => /job|strategy|script|media|tts|video/i.test(t)),
        false,
      );
    } finally {
      restore();
    }
  });

  it("rejects foreign client_id before write (FORBIDDEN_FIELDS)", async () => {
    let fromCalled = false;
    const restore = installUpsertMocks({
      from: () => {
        fromCalled = true;
        throw new Error("must not write");
      },
    });

    try {
      clearUpsertModuleCache();
      const { upsertVisualPreferences } = await import(
        `./upsert-visual-preferences.ts?test=3-${Date.now()}`
      );
      const result = await upsertVisualPreferences({
        client_id: "00000000-0000-4000-8000-000000000099",
        allowedModes: ["generic_avatar"],
        facelessStyle: null,
        genericAvatarId: null,
      } as never);
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.error.code, "FORBIDDEN_FIELDS");
      }
      assert.equal(fromCalled, false);
    } finally {
      restore();
    }
  });

  it("rejects mustDiscloseNotOwner before write (FORBIDDEN_FIELDS)", async () => {
    let fromCalled = false;
    const restore = installUpsertMocks({
      from: () => {
        fromCalled = true;
        throw new Error("must not write");
      },
    });

    try {
      clearUpsertModuleCache();
      const { upsertVisualPreferences } = await import(
        `./upsert-visual-preferences.ts?test=5-${Date.now()}`
      );
      const result = await upsertVisualPreferences({
        allowedModes: ["generic_avatar"],
        facelessStyle: null,
        mustDiscloseNotOwner: false,
      } as never);
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.error.code, "FORBIDDEN_FIELDS");
      }
      assert.equal(fromCalled, false);
    } finally {
      restore();
    }
  });

  it("returns UNAUTHENTICATED when requireActive throws 401", async () => {
    class FakeAuthGuardError extends Error {
      status = 401 as const;
      envelope = preferencesUnauthenticatedError();
      constructor() {
        super("unauthenticated");
        this.name = "AuthGuardError";
      }
    }

    const restore = installUpsertMocks({
      isAuthGuardError: (error: unknown) => error instanceof FakeAuthGuardError,
      requireActive: async () => {
        throw new FakeAuthGuardError();
      },
    });

    try {
      clearUpsertModuleCache();
      const { upsertVisualPreferences } = await import(
        `./upsert-visual-preferences.ts?test=4-${Date.now()}`
      );
      const result = await upsertVisualPreferences({
        allowedModes: ["generic_avatar"],
        facelessStyle: null,
      });
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.error.code, "UNAUTHENTICATED");
      }
    } finally {
      restore();
    }
  });
});
