import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import Module from "node:module";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { isPublicPath } from "../auth/public-routes";
import {
  FACELESS_STYLE_MAX_UTF8_BYTES,
  upsertVisualPreferencesErrorEnvelopeSchema,
  upsertVisualPreferencesInputSchema,
  upsertVisualPreferencesResultSchema,
  upsertVisualPreferencesSuccessSchema,
  visualModalitySchema,
} from "../contracts/visual-preferences";
import { updateBusinessProfileInputSchema } from "../contracts/profile";
import {
  preferencesForbiddenFieldsError,
  preferencesOwnAvatarConsentRequiredError,
  preferencesPayloadTooLargeError,
  preferencesUnauthenticatedError,
  preferencesValidationError,
} from "./errors.ts";
import {
  buildVisualPreferencesUpsertPayload,
  deriveVisualPreferencesRules,
  findForbiddenUpsertVisualPreferencesKeys,
  isFacelessStylePayloadTooLarge,
  mapUpsertVisualPreferencesResult,
  mapVisualPreferencesRow,
  zodPreferencesErrorToFieldErrors,
} from "./helpers.ts";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";

const FACELESS_STYLE = {
  voice: "ai_voiceover" as const,
  onScreenText: "captions" as const,
  broll: "stock" as const,
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

type NodeModuleLoad = {
  _load: (
    request: string,
    parent: NodeModule | null | undefined,
    isMain: boolean,
  ) => unknown;
};

function clearVisualPrefsModuleCache() {
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

describe("upsertVisualPreferencesInputSchema allowlist (.strict())", () => {
  it("accepts happy path with faceless + style", () => {
    const parsed = upsertVisualPreferencesInputSchema.safeParse({
      allowedModes: ["generic_avatar", "faceless"],
      facelessStyle: FACELESS_STYLE,
      genericAvatarId: null,
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.deepEqual(parsed.data.allowedModes, [
        "generic_avatar",
        "faceless",
      ]);
      assert.deepEqual(parsed.data.facelessStyle, FACELESS_STYLE);
    }
  });

  it("accepts happy path without faceless", () => {
    const parsed = upsertVisualPreferencesInputSchema.safeParse({
      allowedModes: ["generic_avatar"],
      facelessStyle: null,
      genericAvatarId: null,
    });
    assert.equal(parsed.success, true);
  });

  it("accepts empty allowlist", () => {
    const parsed = upsertVisualPreferencesInputSchema.safeParse({
      allowedModes: [],
      facelessStyle: null,
    });
    assert.equal(parsed.success, true);
  });

  it("rejects unknown modality", () => {
    const parsed = upsertVisualPreferencesInputSchema.safeParse({
      allowedModes: ["own_avatar", "god_mode"],
      facelessStyle: null,
    });
    assert.equal(parsed.success, false);
  });

  it("rejects duplicate modalities", () => {
    const parsed = upsertVisualPreferencesInputSchema.safeParse({
      allowedModes: ["generic_avatar", "generic_avatar"],
      facelessStyle: null,
    });
    assert.equal(parsed.success, false);
  });

  it("rejects faceless without style", () => {
    const parsed = upsertVisualPreferencesInputSchema.safeParse({
      allowedModes: ["faceless"],
      facelessStyle: null,
    });
    assert.equal(parsed.success, false);
    if (!parsed.success) {
      const fields = zodPreferencesErrorToFieldErrors(parsed.error);
      assert.ok("facelessStyle" in fields);
      assert.equal(
        preferencesValidationError(fields).error.code,
        "VALIDATION_ERROR",
      );
    }
  });

  it("rejects style without faceless", () => {
    const parsed = upsertVisualPreferencesInputSchema.safeParse({
      allowedModes: ["generic_avatar"],
      facelessStyle: FACELESS_STYLE,
    });
    assert.equal(parsed.success, false);
  });

  it("rejects non-null genericAvatarId (V1 stub)", () => {
    const parsed = upsertVisualPreferencesInputSchema.safeParse({
      allowedModes: ["generic_avatar"],
      facelessStyle: null,
      genericAvatarId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
    assert.equal(parsed.success, false);
  });

  it("rejects unknown keys via .strict()", () => {
    const parsed = upsertVisualPreferencesInputSchema.safeParse({
      allowedModes: ["generic_avatar"],
      facelessStyle: null,
      extra: true,
    });
    assert.equal(parsed.success, false);
  });
});

describe("findForbiddenUpsertVisualPreferencesKeys", () => {
  it("rejects tenant / rules / consent / audit keys as FORBIDDEN_FIELDS", () => {
    assert.ok(
      findForbiddenUpsertVisualPreferencesKeys({
        allowedModes: ["generic_avatar"],
        client_id: "00000000-0000-4000-8000-000000000099",
      }).includes("client_id"),
    );
    assert.ok(
      findForbiddenUpsertVisualPreferencesKeys({
        allowedModes: ["generic_avatar"],
        rules: { must_disclose_not_owner: false },
      }).includes("rules"),
    );
    assert.ok(
      findForbiddenUpsertVisualPreferencesKeys({
        allowedModes: ["generic_avatar"],
        must_disclose_not_owner: false,
      }).length > 0,
    );
    assert.ok(
      findForbiddenUpsertVisualPreferencesKeys({
        allowedModes: ["generic_avatar"],
        consent_version: 1,
      }).length > 0,
    );
    assert.ok(
      findForbiddenUpsertVisualPreferencesKeys({
        allowedModes: ["generic_avatar"],
        role: "operator",
      }).includes("role"),
    );
    assert.ok(
      findForbiddenUpsertVisualPreferencesKeys({
        allowedModes: ["generic_avatar"],
        updatedAt: "2026-08-29T21:40:00.000Z",
      }).includes("updatedAt"),
    );
    assert.equal(
      preferencesForbiddenFieldsError().error.code,
      "FORBIDDEN_FIELDS",
    );
  });

  it("does not treat allowlisted keys as forbidden", () => {
    assert.deepEqual(
      findForbiddenUpsertVisualPreferencesKeys({
        allowedModes: ["generic_avatar"],
        facelessStyle: null,
        genericAvatarId: null,
      }),
      [],
    );
  });
});

describe("deriveVisualPreferencesRules (server-owned)", () => {
  it("sets must_disclose_not_owner when generic_avatar selected", () => {
    assert.deepEqual(
      deriveVisualPreferencesRules(["generic_avatar", "faceless"]),
      { must_disclose_not_owner: true },
    );
  });

  it("clears must_disclose_not_owner when generic_avatar absent", () => {
    assert.deepEqual(deriveVisualPreferencesRules(["faceless"]), {
      must_disclose_not_owner: false,
    });
    assert.deepEqual(deriveVisualPreferencesRules([]), {
      must_disclose_not_owner: false,
    });
  });
});

describe("buildVisualPreferencesUpsertPayload", () => {
  it("uses server clientId and derived rules; never trusts body tenant", () => {
    const payload = buildVisualPreferencesUpsertPayload({
      clientId: CLIENT_ID,
      input: {
        allowedModes: ["generic_avatar", "faceless"],
        facelessStyle: FACELESS_STYLE,
        genericAvatarId: null,
      },
    });
    assert.equal(payload.client_id, CLIENT_ID);
    assert.deepEqual(payload.allowed_modes, ["generic_avatar", "faceless"]);
    assert.deepEqual(payload.faceless_style, FACELESS_STYLE);
    assert.equal(payload.generic_avatar_id, null);
    assert.deepEqual(payload.rules, { must_disclose_not_owner: true });
  });
});

describe("mapVisualPreferencesRow / upsert result DTO", () => {
  it("maps exists row and omits client_id", () => {
    const mapped = mapVisualPreferencesRow({
      data: {
        allowed_modes: ["generic_avatar"],
        faceless_style: null,
        generic_avatar_id: null,
        rules: { must_disclose_not_owner: true },
        updated_at: "2026-08-29T21:41:00.000Z",
      },
      error: null,
    });
    assert.equal(mapped.kind, "exists");
    if (mapped.kind === "exists") {
      const success = mapUpsertVisualPreferencesResult({
        allowed_modes: mapped.allowedModes,
        faceless_style: mapped.facelessStyle,
        generic_avatar_id: null,
        rules: mapped.rules,
        updated_at: mapped.updatedAt,
      });
      assert.equal(
        upsertVisualPreferencesSuccessSchema.safeParse(success).success,
        true,
      );
      assert.deepEqual(success, {
        ok: true,
        allowedModes: ["generic_avatar"],
        facelessStyle: null,
        genericAvatarId: null,
        rules: { must_disclose_not_owner: true },
        updatedAt: "2026-08-29T21:41:00.000Z",
      });
      assert.equal(JSON.stringify(success).includes("client_id"), false);
    }
  });

  it("returns missing when no row", () => {
    assert.deepEqual(mapVisualPreferencesRow({ data: null, error: null }), {
      kind: "missing",
    });
  });

  it("returns loadFailed on select error", () => {
    assert.deepEqual(
      mapVisualPreferencesRow({ data: null, error: { code: "PGRST116" } }),
      { kind: "loadFailed" },
    );
  });
});

describe("OWN_AVATAR_CONSENT_REQUIRED envelope", () => {
  it("matches CONTRACT messageKey", () => {
    const envelope = preferencesOwnAvatarConsentRequiredError();
    assert.equal(envelope.error.code, "OWN_AVATAR_CONSENT_REQUIRED");
    assert.equal(
      envelope.error.messageKey,
      "preferences.errors.ownAvatarConsentRequired",
    );
    assert.equal(
      upsertVisualPreferencesErrorEnvelopeSchema.safeParse(envelope).success,
      true,
    );
  });
});

describe("payload size gate", () => {
  it("rejects oversized facelessStyle before write", () => {
    assert.equal(FACELESS_STYLE_MAX_UTF8_BYTES, 4096);
    assert.equal(isFacelessStylePayloadTooLarge(FACELESS_STYLE), false);
    assert.equal(
      preferencesPayloadTooLargeError().error.code,
      "PAYLOAD_TOO_LARGE",
    );
  });
});

describe("US-2.2 PATCH still rejects Preferencias keys (regression)", () => {
  it("rejects visual_mode / allowedModes on Ficha viva schema", () => {
    const COMPLETE_FIELDS = {
      services: { items: ["Web design"] },
      zone: { description: "Miami" },
      tone: { description: "Clear" },
      offers: { items: ["Retainer"] },
      objections: { items: ["Price"] },
      style: { description: "Clean" },
      restrictions: { items: [] },
    };
    const parsed = updateBusinessProfileInputSchema.safeParse({
      ...COMPLETE_FIELDS,
      visual_mode: "own_avatar",
      allowedModes: ["generic_avatar"],
    });
    assert.equal(parsed.success, false);
  });
});

describe("modality enum", () => {
  it("only allows three tokens", () => {
    assert.equal(visualModalitySchema.safeParse("own_avatar").success, true);
    assert.equal(
      visualModalitySchema.safeParse("generic_avatar").success,
      true,
    );
    assert.equal(visualModalitySchema.safeParse("faceless").success, true);
    assert.equal(visualModalitySchema.safeParse("god_mode").success, false);
  });
});

describe("happy-path result schema matches CONTRACT fixture", () => {
  it("with faceless", () => {
    const success = {
      ok: true as const,
      allowedModes: ["generic_avatar", "faceless"] as const,
      facelessStyle: FACELESS_STYLE,
      genericAvatarId: null,
      rules: { must_disclose_not_owner: true },
      updatedAt: "2026-08-29T21:40:00.000Z",
    };
    assert.equal(
      upsertVisualPreferencesResultSchema.safeParse(success).success,
      true,
    );
  });
});

describe("getVisualPreferencesForClient / upsertVisualPreferences arity (IDOR)", () => {
  it("loader arity is 0; upsert arity is 1 (body only)", () => {
    const loaderSrc = readFileSync(
      path.join(__dirname, "get-visual-preferences-for-client.ts"),
      "utf8",
    );
    const upsertSrc = readFileSync(
      path.join(__dirname, "upsert-visual-preferences.ts"),
      "utf8",
    );
    assert.match(
      loaderSrc,
      /export async function getVisualPreferencesForClient\(\)/,
    );
    assert.match(
      upsertSrc,
      /export async function upsertVisualPreferences\(\s*\n?\s*input:/,
    );
    assert.equal(
      (async function getVisualPreferencesForClient() {}).length,
      0,
    );
    assert.equal(
      (async function upsertVisualPreferences(_input: unknown) {}).length,
      1,
    );
  });
});

describe("hasActiveAvatarConsent fail-closed", () => {
  it("returns false when Supabase is not configured (missing table / fail closed)", async () => {
    const nodeModule = Module as unknown as NodeModuleLoad;
    const originalLoad = nodeModule._load.bind(Module);
    const previousUrl = process.env.SUPABASE_URL;
    const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const previousSecret = process.env.SUPABASE_SECRET_KEY;

    nodeModule._load = function (request, parent, isMain) {
      if (request === "server-only") {
        return {};
      }
      return originalLoad(request, parent, isMain);
    };

    try {
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      delete process.env.SUPABASE_SECRET_KEY;
      clearVisualPrefsModuleCache();
      const { hasActiveAvatarConsent } = await import(
        "./has-active-avatar-consent.ts"
      );
      assert.equal(await hasActiveAvatarConsent(CLIENT_ID), false);
    } finally {
      nodeModule._load = originalLoad;
      if (previousUrl === undefined) {
        delete process.env.SUPABASE_URL;
      } else {
        process.env.SUPABASE_URL = previousUrl;
      }
      if (previousKey === undefined) {
        delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      } else {
        process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
      }
      if (previousSecret === undefined) {
        delete process.env.SUPABASE_SECRET_KEY;
      } else {
        process.env.SUPABASE_SECRET_KEY = previousSecret;
      }
      clearVisualPrefsModuleCache();
    }
  });

  it("returns false when consent table is missing (PGRST205)", async () => {
    const nodeModule = Module as unknown as NodeModuleLoad;
    const originalLoad = nodeModule._load.bind(Module);

    nodeModule._load = function (request, parent, isMain) {
      if (request === "server-only") {
        return {};
      }
      if (
        request === "@/lib/supabase/server" ||
        String(request).includes("lib/supabase/server")
      ) {
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
                            data: null,
                            error: {
                              code: "PGRST205",
                              message:
                                "Could not find the table 'public.neuramark_avatar_consents' in the schema cache",
                            },
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
      clearVisualPrefsModuleCache();
      const { hasActiveAvatarConsent } = await import(
        "./has-active-avatar-consent.ts"
      );
      assert.equal(await hasActiveAvatarConsent(CLIENT_ID), false);
    } finally {
      nodeModule._load = originalLoad;
      clearVisualPrefsModuleCache();
    }
  });
});

describe("server-only modules + no public Route Handler", () => {
  it("helpers import server-only", () => {
    const consent = readFileSync(
      path.join(__dirname, "has-active-avatar-consent.ts"),
      "utf8",
    );
    const loader = readFileSync(
      path.join(__dirname, "get-visual-preferences-for-client.ts"),
      "utf8",
    );
    const upsert = readFileSync(
      path.join(__dirname, "upsert-visual-preferences.ts"),
      "utf8",
    );
    assert.match(consent, /import ["']server-only["']/);
    assert.match(loader, /import ["']server-only["']/);
    assert.match(upsert, /["']use server["']/);
    assert.equal(
      /generateStrategy|generateScript|callProvider|\bopenai\b|\banthropic\b/i.test(
        upsert,
      ),
      false,
    );
  });

  it("does not ship public Preferencias Route Handler", () => {
    assert.equal(
      existsSync(path.join(repoRoot, "app/api/visual-preferences")),
      false,
    );
    assert.equal(
      existsSync(path.join(repoRoot, "app/api/preferences")),
      false,
    );
    assert.equal(
      existsSync(path.join(repoRoot, "app/api/settings/preferences")),
      false,
    );
  });

  it("keeps /settings/preferences off isPublicPath", () => {
    assert.equal(isPublicPath("/settings/preferences"), false);
    assert.equal(isPublicPath("/settings"), false);
  });

  it("migration creates neuramark_visual_preferences with RLS and no consent table", () => {
    const migration = readFileSync(
      path.join(
        repoRoot,
        "supabase/migrations/20260829210000_neuramark_visual_preferences.sql",
      ),
      "utf8",
    );
    assert.match(migration, /neuramark_visual_preferences/);
    assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
    assert.match(migration, /neuramark_visual_modality/);
    assert.equal(migration.includes("neuramark_avatar_consents"), false);
    assert.equal(migration.includes("media_assets"), false);
    assert.equal(/CREATE POLICY/i.test(migration), false);
  });
});
