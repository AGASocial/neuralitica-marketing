import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import Module from "node:module";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  businessProfileForAgentsLoadFailedSchema,
  businessProfileForAgentsMissingSchema,
  businessProfileForAgentsViewSchema,
} from "../contracts/profile";
import { visualModeSummarySchema } from "../contracts/visual-preferences";
import { interviewAnswersCompleteSchema } from "../contracts/interview";
import { isPublicPath } from "../auth/public-routes";
import { mapBusinessProfileRowForAgents } from "./map-business-profile-row.ts";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";

const COMPLETE_FIELDS = {
  services: { items: ["Residential plumbing", "Drain cleaning"] },
  zone: { description: "Austin TX metro — South and central" },
  tone: { description: "Friendly expert; avoid slang and overpromise" },
  offers: { items: ["Free estimate", "Same-week slots"] },
  objections: { items: ["Price vs big chains"] },
  style: { description: "Clean before/after; no gore" },
  restrictions: { items: ["No political topics", "No competitor names"] },
} as const;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

type NodeModuleLoad = {
  _load: (
    request: string,
    parent: NodeModule | null | undefined,
    isMain: boolean,
  ) => unknown;
};

function clearAgentsModuleCache() {
  for (const key of Object.keys(require.cache)) {
    const normalized = key.replace(/\\/g, "/");
    if (
      normalized.includes("/lib/profile/get-business-profile-for-agents") ||
      normalized.includes("/lib/profile/get-business-profile-for-client") ||
      normalized.includes("/lib/supabase/server")
    ) {
      delete require.cache[key];
    }
  }
}

function withServerOnlyStub<T>(run: () => Promise<T>): Promise<T> {
  const nodeModule = Module as unknown as NodeModuleLoad;
  const originalLoad = nodeModule._load;
  nodeModule._load = function (request, parent, isMain) {
    if (request === "server-only") {
      return {};
    }
    return originalLoad(request, parent, isMain);
  };
  return (async () => {
    try {
      clearAgentsModuleCache();
      return await run();
    } finally {
      nodeModule._load = originalLoad;
      clearAgentsModuleCache();
    }
  })();
}

describe("getBusinessProfileForAgents module (server-only)", () => {
  it("file includes import server-only and MUST-import comment", () => {
    const source = readFileSync(
      path.join(__dirname, "get-business-profile-for-agents.ts"),
      "utf8",
    );
    assert.match(source, /import ["']server-only["']/);
    assert.match(source, /MUST/);
    assert.match(source, /import this helper only/i);
    assert.match(source, /Content Strategy/);
    assert.match(source, /Video Script/);
    assert.match(source, /Caption/);
    assert.match(source, /QA/);
    assert.match(source, /mustDiscloseNotOwner/);
    assert.match(source, /resolveVisualPreferencesRules/);
    assert.equal(/\brequireActive\s*\(/.test(source), false);
  });

  it("export arity is 1 (clientId)", async () => {
    await withServerOnlyStub(async () => {
      const { getBusinessProfileForAgents } = await import(
        "./get-business-profile-for-agents.ts"
      );
      assert.equal(getBusinessProfileForAgents.length, 1);
    });
  });

  it("Cliente helper remains arity 0 and separate", async () => {
    await withServerOnlyStub(async () => {
      const { getBusinessProfileForClient } = await import(
        "./get-business-profile-for-client.ts"
      );
      assert.equal(getBusinessProfileForClient.length, 0);
      const agentsSource = readFileSync(
        path.join(__dirname, "get-business-profile-for-agents.ts"),
        "utf8",
      );
      assert.equal(
        agentsSource.includes("get-business-profile-for-client"),
        false,
      );
    });
  });

  it("does not introduce a public HTTP profile-by-clientId Route Handler", () => {
    assert.equal(existsSync(path.join(repoRoot, "app/api/profile")), false);
    assert.equal(
      existsSync(path.join(repoRoot, "app/api/profile-for-agents")),
      false,
    );
    assert.equal(isPublicPath("/api/profile-for-agents"), false);
  });
});

describe("mapBusinessProfileRowForAgents outcomes", () => {
  it("returns view DTO when fields + positive version are valid", () => {
    const result = mapBusinessProfileRowForAgents({
      clientId: CLIENT_ID,
      data: {
        fields: COMPLETE_FIELDS,
        version: 2,
        updated_at: "2026-08-29T16:00:00.000Z",
      },
      error: null,
    });

    assert.equal(result.exists, true);
    if (result.exists) {
      assert.equal(result.clientId, CLIENT_ID);
      assert.equal(result.version, 2);
      assert.equal(result.visualModeSummary, null);
      assert.equal(result.updatedAt, "2026-08-29T16:00:00.000Z");
      assert.deepEqual(
        result.fields,
        interviewAnswersCompleteSchema.parse(COMPLETE_FIELDS),
      );
    }
    assert.equal(
      businessProfileForAgentsViewSchema.safeParse(result).success,
      true,
    );

    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes("source_interview_id"), false);
    assert.equal(serialized.includes("sourceInterviewId"), false);
    assert.equal(serialized.includes("updated_by"), false);
    assert.equal(serialized.includes("updatedBy"), false);
    assert.equal(serialized.includes("auth_user_id"), false);
  });

  it("returns missing when no row", () => {
    const result = mapBusinessProfileRowForAgents({
      clientId: CLIENT_ID,
      data: null,
      error: null,
    });
    assert.deepEqual(result, { exists: false });
    assert.equal(
      businessProfileForAgentsMissingSchema.safeParse(result).success,
      true,
    );
  });

  it("soft-fails with loadFailed when fields are corrupt", () => {
    const result = mapBusinessProfileRowForAgents({
      clientId: CLIENT_ID,
      data: {
        fields: { garbage: true },
        version: 1,
        updated_at: "2026-08-29T16:00:00.000Z",
      },
      error: null,
    });
    assert.deepEqual(result, { exists: false, loadFailed: true });
    assert.equal(
      businessProfileForAgentsLoadFailedSchema.safeParse(result).success,
      true,
    );
    assert.equal(JSON.stringify(result).includes("garbage"), false);
  });

  it("soft-fails with loadFailed when version is non-positive", () => {
    const result = mapBusinessProfileRowForAgents({
      clientId: CLIENT_ID,
      data: {
        fields: COMPLETE_FIELDS,
        version: 0,
        updated_at: "2026-08-29T16:00:00.000Z",
      },
      error: null,
    });
    assert.deepEqual(result, { exists: false, loadFailed: true });
  });

  it("soft-fails with loadFailed on select error", () => {
    const result = mapBusinessProfileRowForAgents({
      clientId: CLIENT_ID,
      data: null,
      error: { code: "PGRST116" },
    });
    assert.deepEqual(result, { exists: false, loadFailed: true });
  });

  it("agent view schema .strict() rejects over-disclosure keys", () => {
    const parsed = businessProfileForAgentsViewSchema.safeParse({
      exists: true,
      clientId: CLIENT_ID,
      version: 1,
      fields: COMPLETE_FIELDS,
      visualModeSummary: null,
      sourceInterviewId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
    assert.equal(parsed.success, false);
  });

  it("visualModeSummary requires mustDiscloseNotOwner (US-3.4)", () => {
    assert.equal(
      visualModeSummarySchema.safeParse({
        allowedModes: ["generic_avatar"],
      }).success,
      false,
    );
    assert.equal(
      visualModeSummarySchema.safeParse({
        allowedModes: ["generic_avatar", "faceless"],
        mustDiscloseNotOwner: true,
      }).success,
      true,
    );
  });

  it("accepts visualModeSummary with mustDiscloseNotOwner in agent view", () => {
    const result = mapBusinessProfileRowForAgents({
      clientId: CLIENT_ID,
      data: {
        fields: COMPLETE_FIELDS,
        version: 2,
        updated_at: "2026-08-29T16:00:00.000Z",
      },
      error: null,
      visualModeSummary: {
        allowedModes: ["generic_avatar", "faceless"],
        mustDiscloseNotOwner: true,
      },
    });
    assert.equal(result.exists, true);
    if (result.exists) {
      assert.deepEqual(result.visualModeSummary, {
        allowedModes: ["generic_avatar", "faceless"],
        mustDiscloseNotOwner: true,
      });
      assert.equal(
        businessProfileForAgentsViewSchema.safeParse(result).success,
        true,
      );
    }
  });
});

describe("getBusinessProfileForAgents soft outcomes", () => {
  it("invalid UUID returns soft missing (no throw, no FORBIDDEN)", async () => {
    await withServerOnlyStub(async () => {
      const { getBusinessProfileForAgents } = await import(
        "./get-business-profile-for-agents.ts"
      );
      const result = await getBusinessProfileForAgents("not-a-uuid");
      assert.deepEqual(result, { exists: false });
      assert.equal("loadFailed" in result, false);
      assert.equal(JSON.stringify(result).includes("FORBIDDEN"), false);
    });
  });

  it("loads mustDiscloseNotOwner from Preferencias via resolveVisualPreferencesRules", async () => {
    await withServerOnlyStub(async () => {
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
              from(table: string) {
                const builder: Record<string, unknown> = {};
                const self = () => builder;
                builder.select = self;
                builder.eq = self;
                builder.maybeSingle = async () => {
                  if (table === "neuramark_business_profiles") {
                    return {
                      data: {
                        fields: COMPLETE_FIELDS,
                        version: 1,
                        updated_at: "2026-08-29T16:00:00.000Z",
                      },
                      error: null,
                    };
                  }
                  if (table === "neuramark_visual_preferences") {
                    return {
                      data: {
                        allowed_modes: ["generic_avatar"],
                        rules: { must_disclose_not_owner: false },
                      },
                      error: null,
                    };
                  }
                  return { data: null, error: null };
                };
                return builder;
              },
            }),
          };
        }
        return originalLoad(request, parent, isMain);
      };

      try {
        clearAgentsModuleCache();
        const { getBusinessProfileForAgents } = await import(
          `./get-business-profile-for-agents.ts?agents-mock=${Date.now()}`
        );
        const result = await getBusinessProfileForAgents(CLIENT_ID);
        assert.equal("loadFailed" in result && result.loadFailed, false);
        assert.equal(result.exists, true);
        if (result.exists) {
          assert.deepEqual(result.visualModeSummary, {
            allowedModes: ["generic_avatar"],
            mustDiscloseNotOwner: true,
          });
        }
      } finally {
        nodeModule._load = originalLoad;
        clearAgentsModuleCache();
      }
    });
  });
});
