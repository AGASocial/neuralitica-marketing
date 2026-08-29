/**
 * US-3.2 Consentimiento de avatar — probe, grant, revoke, stubs.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import Module from "node:module";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { isPublicPath } from "../auth/public-routes";
import {
  AVATAR_CONSENT_DISCLOSURE_V1,
  grantAvatarConsentInputSchema,
  grantAvatarConsentSuccessSchema,
  revokeAvatarConsentSuccessSchema,
} from "../contracts/avatar-consent";
import {
  findForbiddenGrantAvatarConsentKeys,
} from "./avatar-consent-helpers.ts";
import {
  grantConsentAffirmationRequiredError,
  grantConsentVersionMismatchError,
  revokeConsentNotActiveError,
} from "./avatar-consent-errors.ts";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const VICTIM_ID = "00000000-0000-4000-8000-000000000099";
const CONSENT_ROW_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

type NodeModuleLoad = {
  _load: (
    request: string,
    parent: NodeModule | null | undefined,
    isMain: boolean,
  ) => unknown;
};

function clearConsentModuleCache() {
  for (const key of Object.keys(require.cache)) {
    const normalized = key.replace(/\\/g, "/");
    if (
      normalized.includes("/lib/visual-preferences/") ||
      normalized.includes("/lib/supabase/server") ||
      normalized.includes("/lib/auth/require-user") ||
      normalized.includes("/lib/contracts/avatar-consent")
    ) {
      delete require.cache[key];
    }
  }
}

function chainableQuery(terminal: {
  maybeSingle?: () => Promise<{ data: unknown; error: unknown }>;
  single?: () => Promise<{ data: unknown; error: unknown }>;
}) {
  const builder: Record<string, unknown> = {};
  const self = () => builder;
  builder.select = self;
  builder.eq = self;
  builder.is = self;
  builder.order = self;
  builder.limit = self;
  builder.insert = self;
  builder.update = self;
  builder.upsert = self;
  builder.delete = self;
  builder.maybeSingle =
    terminal.maybeSingle ?? (async () => ({ data: null, error: null }));
  builder.single =
    terminal.single ?? (async () => ({ data: null, error: null }));
  return builder;
}

type InstallOptions = {
  requireActive?: () => Promise<unknown>;
  isAuthGuardError?: (error: unknown) => boolean;
  hasActiveAvatarConsent?: (clientId: string) => Promise<boolean>;
  cancelQueuedOwnAvatarJobs?: (
    clientId: string,
  ) => Promise<{ ok: true; cancelledCount: number }>;
  from?: (table: string) => unknown;
  revalidatePath?: (p: string) => void;
};

function installConsentMocks(options: InstallOptions) {
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
      if (options.hasActiveAvatarConsent) {
        return {
          hasActiveAvatarConsent: options.hasActiveAvatarConsent,
        };
      }
    }
    if (String(request).includes("cancel-queued-own-avatar-jobs")) {
      if (options.cancelQueuedOwnAvatarJobs) {
        return {
          cancelQueuedOwnAvatarJobs: options.cancelQueuedOwnAvatarJobs,
        };
      }
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
    clearConsentModuleCache();
  };
}

describe("grantAvatarConsentInputSchema", () => {
  it("accepts affirmed + current version", () => {
    const parsed = grantAvatarConsentInputSchema.safeParse({
      affirmed: true,
      consentVersion: AVATAR_CONSENT_DISCLOSURE_V1,
    });
    assert.equal(parsed.success, true);
  });

  it("rejects wrong version and false affirmation", () => {
    assert.equal(
      grantAvatarConsentInputSchema.safeParse({
        affirmed: true,
        consentVersion: "AVATAR_CONSENT_DISCLOSURE_V999",
      }).success,
      false,
    );
    assert.equal(
      grantAvatarConsentInputSchema.safeParse({
        affirmed: false,
        consentVersion: AVATAR_CONSENT_DISCLOSURE_V1,
      }).success,
      false,
    );
  });

  it("rejects unknown / tenant keys via .strict()", () => {
    assert.equal(
      grantAvatarConsentInputSchema.safeParse({
        affirmed: true,
        consentVersion: AVATAR_CONSENT_DISCLOSURE_V1,
        client_id: VICTIM_ID,
      }).success,
      false,
    );
  });
});

describe("findForbiddenGrantAvatarConsentKeys", () => {
  it("flags tenant / timestamp / privilege keys", () => {
    assert.deepEqual(
      findForbiddenGrantAvatarConsentKeys({
        client_id: VICTIM_ID,
        affirmed: true,
        consentVersion: AVATAR_CONSENT_DISCLOSURE_V1,
      }),
      ["client_id"],
    );
    assert.ok(
      findForbiddenGrantAvatarConsentKeys({
        consentedAt: "2026-01-01T00:00:00.000Z",
        affirmed: true,
        consentVersion: AVATAR_CONSENT_DISCLOSURE_V1,
      }).includes("consentedAt"),
    );
  });

  it("allows consentVersion echo", () => {
    assert.deepEqual(
      findForbiddenGrantAvatarConsentKeys({
        affirmed: true,
        consentVersion: AVATAR_CONSENT_DISCLOSURE_V1,
      }),
      [],
    );
  });
});

describe("hasActiveAvatarConsent multi-row harden", () => {
  it("returns true for latest non-revoked matching version", async () => {
    const calls: { method: string; args: unknown[] }[] = [];
    const restore = installConsentMocks({
      from: (table: string) => {
        assert.equal(table, "neuramark_avatar_consents");
        const builder: Record<string, unknown> = {};
        const track =
          (method: string) =>
          (...args: unknown[]) => {
            calls.push({ method, args });
            return builder;
          };
        builder.select = track("select");
        builder.eq = track("eq");
        builder.is = track("is");
        builder.order = track("order");
        builder.limit = track("limit");
        builder.maybeSingle = async () => ({
          data: {
            consent_version: AVATAR_CONSENT_DISCLOSURE_V1,
            revoked_at: null,
            consented_at: "2026-08-29T22:10:00.000Z",
          },
          error: null,
        });
        return builder;
      },
    });

    try {
      clearConsentModuleCache();
      const { hasActiveAvatarConsent } = await import(
        `./has-active-avatar-consent.ts?t=${Date.now()}-1`
      );
      assert.equal(await hasActiveAvatarConsent(CLIENT_ID), true);
      assert.ok(calls.some((c) => c.method === "is"));
      assert.ok(calls.some((c) => c.method === "order"));
      assert.ok(calls.some((c) => c.method === "limit"));
      const isCall = calls.find((c) => c.method === "is");
      assert.deepEqual(isCall?.args, ["revoked_at", null]);
      const limitCall = calls.find((c) => c.method === "limit");
      assert.deepEqual(limitCall?.args, [1]);
    } finally {
      restore();
    }
  });

  it("returns false when only revoked history exists (no active row)", async () => {
    const restore = installConsentMocks({
      from: () =>
        chainableQuery({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
    });

    try {
      clearConsentModuleCache();
      const { hasActiveAvatarConsent } = await import(
        `./has-active-avatar-consent.ts?t=${Date.now()}-2`
      );
      assert.equal(await hasActiveAvatarConsent(CLIENT_ID), false);
    } finally {
      restore();
    }
  });

  it("returns false on version mismatch of non-revoked row", async () => {
    const restore = installConsentMocks({
      from: () =>
        chainableQuery({
          maybeSingle: async () => ({
            data: {
              consent_version: "AVATAR_CONSENT_DISCLOSURE_V0",
              revoked_at: null,
              consented_at: "2026-08-29T22:10:00.000Z",
            },
            error: null,
          }),
        }),
    });

    try {
      clearConsentModuleCache();
      const { hasActiveAvatarConsent } = await import(
        `./has-active-avatar-consent.ts?t=${Date.now()}-3`
      );
      assert.equal(await hasActiveAvatarConsent(CLIENT_ID), false);
    } finally {
      restore();
    }
  });

  it("returns false for empty clientId", async () => {
    const restore = installConsentMocks({
      from: () => {
        throw new Error("must not query");
      },
    });

    try {
      clearConsentModuleCache();
      const { hasActiveAvatarConsent } = await import(
        `./has-active-avatar-consent.ts?t=${Date.now()}-4`
      );
      assert.equal(await hasActiveAvatarConsent(""), false);
    } finally {
      restore();
    }
  });
});

describe("grantAvatarConsent action", () => {
  it("INSERT grants with server version and revalidates Preferencias", async () => {
    const fromTables: string[] = [];
    const insertPayloads: unknown[] = [];
    const revalidatePaths: string[] = [];
    const restore = installConsentMocks({
      hasActiveAvatarConsent: async () => false,
      revalidatePath: (p) => {
        revalidatePaths.push(p);
      },
      from: (table: string) => {
        fromTables.push(table);
        const builder: Record<string, unknown> = {};
        const self = () => builder;
        builder.insert = (payload: unknown) => {
          insertPayloads.push(payload);
          return builder;
        };
        builder.select = self;
        builder.single = async () => ({
          data: {
            consented_at: "2026-08-29T22:10:00.000Z",
            consent_version: AVATAR_CONSENT_DISCLOSURE_V1,
          },
          error: null,
        });
        return builder;
      },
    });

    try {
      clearConsentModuleCache();
      const { grantAvatarConsent } = await import(
        `./grant-avatar-consent.ts?t=${Date.now()}-g1`
      );
      const result = await grantAvatarConsent({
        affirmed: true,
        consentVersion: AVATAR_CONSENT_DISCLOSURE_V1,
      });
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(
          grantAvatarConsentSuccessSchema.safeParse(result).success,
          true,
        );
        assert.equal(result.consentVersion, AVATAR_CONSENT_DISCLOSURE_V1);
      }
      assert.deepEqual(fromTables, ["neuramark_avatar_consents"]);
      assert.equal(insertPayloads.length, 1);
      const row = insertPayloads[0] as Record<string, unknown>;
      assert.equal(row.client_id, CLIENT_ID);
      assert.equal(row.consent_version, AVATAR_CONSENT_DISCLOSURE_V1);
      assert.equal(row.revoked_at, null);
      assert.ok(typeof row.consented_at === "string");
      assert.deepEqual(revalidatePaths, ["/settings/preferences"]);
      assert.equal(
        fromTables.some((t) => /job|strategy|script|media|tts|video/i.test(t)),
        false,
      );
    } finally {
      restore();
    }
  });

  it("rejects version mismatch with no INSERT", async () => {
    let fromCalled = false;
    const restore = installConsentMocks({
      from: () => {
        fromCalled = true;
        throw new Error("must not write");
      },
    });

    try {
      clearConsentModuleCache();
      const { grantAvatarConsent } = await import(
        `./grant-avatar-consent.ts?t=${Date.now()}-g2`
      );
      const result = await grantAvatarConsent({
        affirmed: true,
        consentVersion: "AVATAR_CONSENT_DISCLOSURE_V999",
      } as never);
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.error.code, "CONSENT_VERSION_MISMATCH");
        assert.equal(
          result.error.messageKey,
          grantConsentVersionMismatchError().error.messageKey,
        );
      }
      assert.equal(fromCalled, false);
    } finally {
      restore();
    }
  });

  it("rejects missing affirmation with no INSERT", async () => {
    let fromCalled = false;
    const restore = installConsentMocks({
      from: () => {
        fromCalled = true;
        throw new Error("must not write");
      },
    });

    try {
      clearConsentModuleCache();
      const { grantAvatarConsent } = await import(
        `./grant-avatar-consent.ts?t=${Date.now()}-g3`
      );
      const result = await grantAvatarConsent({
        affirmed: false,
        consentVersion: AVATAR_CONSENT_DISCLOSURE_V1,
      } as never);
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.error.code, "AFFIRMATION_REQUIRED");
        assert.equal(
          result.error.messageKey,
          grantConsentAffirmationRequiredError().error.messageKey,
        );
      }
      assert.equal(fromCalled, false);
    } finally {
      restore();
    }
  });

  it("rejects foreign client_id (IDOR) — FORBIDDEN_FIELDS, no write", async () => {
    let fromCalled = false;
    const restore = installConsentMocks({
      from: () => {
        fromCalled = true;
        throw new Error("must not write");
      },
    });

    try {
      clearConsentModuleCache();
      const { grantAvatarConsent } = await import(
        `./grant-avatar-consent.ts?t=${Date.now()}-g4`
      );
      const result = await grantAvatarConsent({
        affirmed: true,
        consentVersion: AVATAR_CONSENT_DISCLOSURE_V1,
        client_id: VICTIM_ID,
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

  it("returns ALREADY_ACTIVE without second INSERT", async () => {
    let fromCalled = false;
    const restore = installConsentMocks({
      hasActiveAvatarConsent: async () => true,
      from: () => {
        fromCalled = true;
        throw new Error("must not insert when already active");
      },
    });

    try {
      clearConsentModuleCache();
      const { grantAvatarConsent } = await import(
        `./grant-avatar-consent.ts?t=${Date.now()}-g5`
      );
      const result = await grantAvatarConsent({
        affirmed: true,
        consentVersion: AVATAR_CONSENT_DISCLOSURE_V1,
      });
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.error.code, "ALREADY_ACTIVE");
      }
      assert.equal(fromCalled, false);
    } finally {
      restore();
    }
  });
});

describe("revokeAvatarConsent action", () => {
  it("sets revoked_at only, invokes cancel stub, does not touch Preferencias", async () => {
    const fromTables: string[] = [];
    const updatePayloads: unknown[] = [];
    const cancelCalls: string[] = [];
    const revalidatePaths: string[] = [];
    let findPhase = 0;

    const restore = installConsentMocks({
      cancelQueuedOwnAvatarJobs: async (clientId) => {
        cancelCalls.push(clientId);
        return { ok: true, cancelledCount: 0 };
      },
      revalidatePath: (p) => {
        revalidatePaths.push(p);
      },
      from: (table: string) => {
        fromTables.push(table);
        if (table === "neuramark_visual_preferences") {
          throw new Error("revoke must not touch Preferencias");
        }
        findPhase += 1;
        if (findPhase === 1) {
          return chainableQuery({
            maybeSingle: async () => ({
              data: { id: CONSENT_ROW_ID },
              error: null,
            }),
          });
        }
        const builder: Record<string, unknown> = {};
        const self = () => builder;
        builder.update = (payload: unknown) => {
          updatePayloads.push(payload);
          return builder;
        };
        builder.eq = self;
        builder.is = self;
        builder.select = self;
        builder.maybeSingle = async () => ({
          data: { revoked_at: "2026-08-29T22:15:00.000Z" },
          error: null,
        });
        return builder;
      },
    });

    try {
      clearConsentModuleCache();
      const { revokeAvatarConsent } = await import(
        `./revoke-avatar-consent.ts?t=${Date.now()}-r1`
      );
      const result = await revokeAvatarConsent();
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(
          revokeAvatarConsentSuccessSchema.safeParse(result).success,
          true,
        );
        assert.equal(result.active, false);
      }
      assert.deepEqual(fromTables, [
        "neuramark_avatar_consents",
        "neuramark_avatar_consents",
      ]);
      assert.equal(updatePayloads.length, 1);
      assert.deepEqual(Object.keys(updatePayloads[0] as object).sort(), [
        "revoked_at",
      ]);
      assert.deepEqual(cancelCalls, [CLIENT_ID]);
      assert.deepEqual(revalidatePaths, ["/settings/preferences"]);
      assert.equal(
        fromTables.includes("neuramark_visual_preferences"),
        false,
      );
    } finally {
      restore();
    }
  });

  it("returns NOT_ACTIVE when no active row — skips cancel stub", async () => {
    const cancelCalls: string[] = [];
    const restore = installConsentMocks({
      cancelQueuedOwnAvatarJobs: async (clientId) => {
        cancelCalls.push(clientId);
        return { ok: true, cancelledCount: 0 };
      },
      from: () =>
        chainableQuery({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
    });

    try {
      clearConsentModuleCache();
      const { revokeAvatarConsent } = await import(
        `./revoke-avatar-consent.ts?t=${Date.now()}-r2`
      );
      const result = await revokeAvatarConsent();
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.error.code, "NOT_ACTIVE");
        assert.equal(
          result.error.messageKey,
          revokeConsentNotActiveError().error.messageKey,
        );
      }
      assert.deepEqual(cancelCalls, []);
    } finally {
      restore();
    }
  });
});

describe("Preferencias upsert never writes consent ledger", () => {
  it("happy Preferencias path only touches neuramark_visual_preferences", async () => {
    const fromTables: string[] = [];
    const restore = installConsentMocks({
      hasActiveAvatarConsent: async () => false,
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
                        allowed_modes: ["generic_avatar"],
                        faceless_style: null,
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
      clearConsentModuleCache();
      const { upsertVisualPreferences } = await import(
        `./upsert-visual-preferences.ts?t=${Date.now()}-pref`
      );
      const result = await upsertVisualPreferences({
        allowedModes: ["generic_avatar"],
        facelessStyle: null,
        genericAvatarId: null,
      });
      assert.equal(result.ok, true);
      assert.deepEqual(fromTables, ["neuramark_visual_preferences"]);
      assert.equal(fromTables.includes("neuramark_avatar_consents"), false);
    } finally {
      restore();
    }
  });
});

describe("assertActiveAvatarConsentForJobs stub", () => {
  it("fail-closed when inactive", async () => {
    const restore = installConsentMocks({
      hasActiveAvatarConsent: async () => false,
    });

    try {
      clearConsentModuleCache();
      const { assertActiveAvatarConsentForJobs } = await import(
        `./assert-active-avatar-consent-for-jobs.ts?t=${Date.now()}-a1`
      );
      const result = await assertActiveAvatarConsentForJobs(CLIENT_ID);
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.error.code, "OWN_AVATAR_CONSENT_REQUIRED");
      }
    } finally {
      restore();
    }
  });

  it("ok when probe true", async () => {
    const restore = installConsentMocks({
      hasActiveAvatarConsent: async () => true,
    });

    try {
      clearConsentModuleCache();
      const { assertActiveAvatarConsentForJobs } = await import(
        `./assert-active-avatar-consent-for-jobs.ts?t=${Date.now()}-a2`
      );
      const result = await assertActiveAvatarConsentForJobs(CLIENT_ID);
      assert.equal(result.ok, true);
    } finally {
      restore();
    }
  });
});

describe("cancelQueuedOwnAvatarJobs stub", () => {
  it("idempotent no-op when jobs absent", async () => {
    const restore = installConsentMocks({});

    try {
      clearConsentModuleCache();
      const { cancelQueuedOwnAvatarJobs } = await import(
        `./cancel-queued-own-avatar-jobs.ts?t=${Date.now()}-c1`
      );
      const result = await cancelQueuedOwnAvatarJobs(CLIENT_ID);
      assert.deepEqual(result, { ok: true, cancelledCount: 0 });
    } finally {
      restore();
    }
  });
});

describe("arity / surfaces / migration (US-3.2)", () => {
  it("loader arity 0; grant arity 1; revoke arity 0", () => {
    const loaderSrc = readFileSync(
      path.join(__dirname, "get-avatar-consent-for-client.ts"),
      "utf8",
    );
    const grantSrc = readFileSync(
      path.join(__dirname, "grant-avatar-consent.ts"),
      "utf8",
    );
    const revokeSrc = readFileSync(
      path.join(__dirname, "revoke-avatar-consent.ts"),
      "utf8",
    );
    assert.match(
      loaderSrc,
      /export async function getAvatarConsentForClient\(\)/,
    );
    assert.match(
      grantSrc,
      /export async function grantAvatarConsent\(\s*\n?\s*input:/,
    );
    assert.match(revokeSrc, /export async function revokeAvatarConsent\(\)/);
  });

  it("no public consent Route Handler; settings stays gated", () => {
    assert.equal(existsSync(path.join(repoRoot, "app/api/avatar-consent")), false);
    assert.equal(
      existsSync(path.join(repoRoot, "app/api/consent")),
      false,
    );
    assert.equal(isPublicPath("/settings/preferences"), false);
  });

  it("migration creates neuramark_avatar_consents with RLS + partial unique", () => {
    const migration = readFileSync(
      path.join(
        repoRoot,
        "supabase/migrations/20260829220000_neuramark_avatar_consents.sql",
      ),
      "utf8",
    );
    assert.match(migration, /neuramark_avatar_consents/);
    assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
    assert.match(
      migration,
      /neuramark_avatar_consents_client_id_active_uidx/,
    );
    assert.match(migration, /WHERE revoked_at IS NULL/);
    assert.equal(/CREATE POLICY/i.test(migration), false);
    assert.equal(migration.includes("media_assets"), false);
    assert.equal(migration.includes("DELETE FROM"), false);
  });

  it("cancel stub documents in-flight Operator TODO", () => {
    const src = readFileSync(
      path.join(__dirname, "cancel-queued-own-avatar-jobs.ts"),
      "utf8",
    );
    assert.match(src, /TODO \(US-8 \/ US-10\)/);
    assert.match(src, /Operator/);
  });

  it("grant/revoke do not call generation modules", () => {
    const grantSrc = readFileSync(
      path.join(__dirname, "grant-avatar-consent.ts"),
      "utf8",
    );
    const revokeSrc = readFileSync(
      path.join(__dirname, "revoke-avatar-consent.ts"),
      "utf8",
    );
    assert.equal(
      /generateStrategy|generateScript|callProvider|\bopenai\b|\banthropic\b/i.test(
        grantSrc + revokeSrc,
      ),
      false,
    );
  });
});
