/**
 * US-8.5 M1 — reference still resolver honors reelScriptId priority.
 */
import assert from "node:assert/strict";
import Module from "node:module";
import { afterEach, describe, it } from "node:test";

const CLIENT_ID = "22222222-2222-4222-8222-222222222222";
const REEL_SCRIPT_ID = "11111111-1111-4111-8111-111111111111";
const SCRIPT_COVER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLIENT_COVER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

type NodeModuleLoad = {
  _load: (
    request: string,
    parent: NodeModule | null | undefined,
    isMain: boolean,
  ) => unknown;
};

function clearModuleCache() {
  for (const key of Object.keys(require.cache)) {
    const normalized = key.replace(/\\/g, "/");
    if (
      normalized.includes("/lib/media/get-broll-reference-still") ||
      normalized.includes("/lib/supabase/server")
    ) {
      delete require.cache[key];
    }
  }
}

afterEach(() => {
  clearModuleCache();
});

describe("getBrollReferenceStillAssetForClient", () => {
  it("M1 — prefers script-linked assembled cover over client-wide stills", async () => {
    const nodeModule = Module as unknown as NodeModuleLoad;
    const originalLoad = nodeModule._load.bind(nodeModule);
    const queries: string[] = [];

    nodeModule._load = function (request, parent, isMain) {
      if (request === "server-only") return {};
      const req = String(request);
      if (req.includes("supabase/server")) {
        return {
          isSupabaseConfigured: () => true,
          createServerSupabaseClient: () => ({
            from: (table: string) => {
              queries.push(table);
              if (table === "neuramark_assembled_reels") {
                return {
                  select: () => ({
                    eq: () => ({
                      eq: () => ({
                        not: () => ({
                          order: () => ({
                            limit: () => ({
                              maybeSingle: async () => ({
                                data: { cover_media_asset_id: SCRIPT_COVER_ID },
                                error: null,
                              }),
                            }),
                          }),
                        }),
                      }),
                    }),
                  }),
                };
              }
              if (table === "neuramark_media_assets") {
                return {
                  select: () => ({
                    eq: (_col: string, val: string) => {
                      // Owned check by id first, or asset_type fallback.
                      if (val === SCRIPT_COVER_ID || _col === "id") {
                        return {
                          eq: () => ({
                            in: () => ({
                              maybeSingle: async () => ({
                                data: { id: SCRIPT_COVER_ID },
                                error: null,
                              }),
                            }),
                          }),
                        };
                      }
                      return {
                        eq: () => ({
                          in: () => ({
                            order: () => ({
                              limit: () => ({
                                maybeSingle: async () => ({
                                  data: { id: CLIENT_COVER_ID },
                                  error: null,
                                }),
                              }),
                            }),
                          }),
                        }),
                      };
                    },
                  }),
                };
              }
              throw new Error(`unexpected table ${table}`);
            },
          }),
        };
      }
      return originalLoad(request, parent, isMain);
    };

    clearModuleCache();
    try {
      const { getBrollReferenceStillAssetForClient } = require(
        "./get-broll-reference-still-asset-for-client.ts",
      );
      const result = await getBrollReferenceStillAssetForClient(
        CLIENT_ID,
        REEL_SCRIPT_ID,
      );
      assert.deepEqual(result, { assetId: SCRIPT_COVER_ID });
      assert.ok(queries.includes("neuramark_assembled_reels"));
    } finally {
      nodeModule._load = originalLoad;
      clearModuleCache();
    }
  });

  it("M1 — falls back to client-wide still when no script cover", async () => {
    const nodeModule = Module as unknown as NodeModuleLoad;
    const originalLoad = nodeModule._load.bind(nodeModule);

    nodeModule._load = function (request, parent, isMain) {
      if (request === "server-only") return {};
      const req = String(request);
      if (req.includes("supabase/server")) {
        return {
          isSupabaseConfigured: () => true,
          createServerSupabaseClient: () => ({
            from: (table: string) => {
              if (table === "neuramark_assembled_reels") {
                return {
                  select: () => ({
                    eq: () => ({
                      eq: () => ({
                        not: () => ({
                          order: () => ({
                            limit: () => ({
                              maybeSingle: async () => ({
                                data: null,
                                error: null,
                              }),
                            }),
                          }),
                        }),
                      }),
                    }),
                  }),
                };
              }
              if (table === "neuramark_media_assets") {
                return {
                  select: () => ({
                    eq: () => ({
                      eq: (_col: string, assetType: string) => ({
                        in: () => ({
                          order: () => ({
                            limit: () => ({
                              maybeSingle: async () =>
                                assetType === "client_logo"
                                  ? {
                                      data: { id: CLIENT_COVER_ID },
                                      error: null,
                                    }
                                  : { data: null, error: null },
                            }),
                          }),
                        }),
                      }),
                    }),
                  }),
                };
              }
              throw new Error(`unexpected table ${table}`);
            },
          }),
        };
      }
      return originalLoad(request, parent, isMain);
    };

    clearModuleCache();
    try {
      const { getBrollReferenceStillAssetForClient } = require(
        "./get-broll-reference-still-asset-for-client.ts",
      );
      const result = await getBrollReferenceStillAssetForClient(
        CLIENT_ID,
        REEL_SCRIPT_ID,
      );
      assert.deepEqual(result, { assetId: CLIENT_COVER_ID });
    } finally {
      nodeModule._load = originalLoad;
      clearModuleCache();
    }
  });
});
