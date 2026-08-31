/**
 * US-13.2 — aggregateReelMetricsByTema unit tests.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Module from "node:module";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const WEEK_START = "2026-09-07";
const CLIENT_A = "11111111-1111-4111-8111-111111111111";
const CLIENT_B = "33333333-3333-4333-8333-333333333333";
const ASSEMBLED_1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ASSEMBLED_2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SCRIPT_1 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SCRIPT_2 = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const STRATEGY_1 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

const VALID_BRIEF = {
  pillars: ["Confianza"],
  themes: ["Invierno"],
  slots: [
    {
      slotIndex: 0,
      tema: "Mantenimiento preventivo",
      goal: "trust",
      formatoPlaybookSlug: "tip-rapido",
      modalidad: "faceless",
    },
    {
      slotIndex: 1,
      tema: "Señales de filtro sucio",
      goal: "education",
      formatoPlaybookSlug: "tip-rapido",
      modalidad: "faceless",
    },
    {
      slotIndex: 2,
      tema: "Oferta revisión",
      goal: "local_sale",
      formatoPlaybookSlug: "tip-rapido",
      modalidad: "faceless",
    },
  ],
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type NodeModuleLoad = {
  _load: (
    request: string,
    parent: NodeModule | null | undefined,
    isMain: boolean,
  ) => unknown;
};

type MetricsFixture = {
  assembledReelId: string;
  clientId: string;
  views: number;
  likes: number;
  comments: number;
  saves: number;
  dms: number;
  reelScriptId: string;
  slotIndex: number;
  strategyId: string;
  brief: unknown;
};

function withServerOnlyStub<T>(run: () => Promise<T>): Promise<T> {
  const nodeModule = Module as unknown as NodeModuleLoad;
  const originalLoad = nodeModule._load;
  nodeModule._load = function (request, parent, isMain) {
    if (request === "server-only") {
      return {};
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  return run().finally(() => {
    nodeModule._load = originalLoad;
  });
}

function clearAggregateCache() {
  for (const key of Object.keys(require.cache)) {
    if (key.includes("/lib/metrics/aggregate-reel-metrics-by-tema")) {
      delete require.cache[key];
    }
  }
}

function installAggregateMocks(fixtures: MetricsFixture[]) {
  const nodeModule = Module as unknown as NodeModuleLoad;
  const originalLoad = nodeModule._load;

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
          from: (table: string) => {
            if (table === "neuramark_reel_metrics") {
              return {
                select: () => ({
                  eq: (_col: string, clientId: string) => ({
                    gte: () => ({
                      lt: async () => ({
                        data: fixtures
                          .filter((f) => f.clientId === clientId)
                          .map((f) => ({
                            assembled_reel_id: f.assembledReelId,
                            views: f.views,
                            likes: f.likes,
                            comments: f.comments,
                            saves: f.saves,
                            dms: f.dms,
                          })),
                        error: null,
                      }),
                    }),
                  }),
                }),
              };
            }
            if (table === "neuramark_assembled_reels") {
              return {
                select: () => ({
                  eq: (_col: string, clientId: string) => ({
                    in: (_col2: string, ids: string[]) => ({
                      then: (
                        onFulfilled: (v: unknown) => unknown,
                      ) =>
                        Promise.resolve({
                          data: fixtures
                            .filter(
                              (f) =>
                                f.clientId === clientId &&
                                ids.includes(f.assembledReelId),
                            )
                            .map((f) => ({
                              id: f.assembledReelId,
                              client_id: f.clientId,
                              reel_script_id: f.reelScriptId,
                            })),
                          error: null,
                        }).then(onFulfilled),
                    }),
                  }),
                }),
              };
            }
            if (table === "neuramark_reel_scripts") {
              return {
                select: () => ({
                  eq: (_col: string, clientId: string) => ({
                    in: (_col2: string, ids: string[]) => ({
                      then: (
                        onFulfilled: (v: unknown) => unknown,
                      ) =>
                        Promise.resolve({
                          data: fixtures
                            .filter(
                              (f) =>
                                f.clientId === clientId &&
                                ids.includes(f.reelScriptId),
                            )
                            .map((f) => ({
                              id: f.reelScriptId,
                              client_id: f.clientId,
                              strategy_id: f.strategyId,
                              slot_index: f.slotIndex,
                            })),
                          error: null,
                        }).then(onFulfilled),
                    }),
                  }),
                }),
              };
            }
            if (table === "neuramark_content_strategies") {
              return {
                select: () => ({
                  eq: (_col: string, clientId: string) => ({
                    in: (_col2: string, ids: string[]) => ({
                      then: (
                        onFulfilled: (v: unknown) => unknown,
                      ) =>
                        Promise.resolve({
                          data: fixtures
                            .filter(
                              (f) =>
                                f.clientId === clientId &&
                                ids.includes(f.strategyId),
                            )
                            .map((f) => ({
                              id: f.strategyId,
                              client_id: f.clientId,
                              brief: f.brief,
                            })),
                          error: null,
                        }).then(onFulfilled),
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
    return originalLoad.call(this, request, parent, isMain);
  };

  return () => {
    nodeModule._load = originalLoad;
  };
}

describe("aggregateReelMetricsByTema", () => {
  it("returns null for empty window", async () => {
    const restore = installAggregateMocks([]);
    clearAggregateCache();
    try {
      const { aggregateReelMetricsByTema } = require("./aggregate-reel-metrics-by-tema.ts");
      const result = await aggregateReelMetricsByTema({
        clientId: CLIENT_A,
        weekStart: WEEK_START,
      });
      assert.equal(result, null);
    } finally {
      restore();
    }
  });

  it("aggregates single tema group with correct sums", async () => {
    const restore = installAggregateMocks([
      {
        assembledReelId: ASSEMBLED_1,
        clientId: CLIENT_A,
        views: 1000,
        likes: 50,
        comments: 10,
        saves: 20,
        dms: 2,
        reelScriptId: SCRIPT_1,
        slotIndex: 0,
        strategyId: STRATEGY_1,
        brief: VALID_BRIEF,
      },
      {
        assembledReelId: ASSEMBLED_2,
        clientId: CLIENT_A,
        views: 500,
        likes: 70,
        comments: 5,
        saves: 20,
        dms: 1,
        reelScriptId: SCRIPT_1,
        slotIndex: 0,
        strategyId: STRATEGY_1,
        brief: VALID_BRIEF,
      },
    ]);
    clearAggregateCache();
    try {
      const { aggregateReelMetricsByTema } = require("./aggregate-reel-metrics-by-tema.ts");
      const result = await aggregateReelMetricsByTema({
        clientId: CLIENT_A,
        weekStart: WEEK_START,
      });
      assert.ok(result);
      assert.equal(result.topThemes.length, 1);
      assert.equal(result.topThemes[0]!.tema, "Mantenimiento preventivo");
      assert.equal(result.topThemes[0]!.reelCount, 2);
      assert.equal(result.topThemes[0]!.views, 1500);
      assert.equal(result.topThemes[0]!.engagementScore, 1678);
    } finally {
      restore();
    }
  });

  it("tie-breaks by views DESC then reelCount DESC", async () => {
    const restore = installAggregateMocks([
      {
        assembledReelId: ASSEMBLED_1,
        clientId: CLIENT_A,
        views: 800,
        likes: 0,
        comments: 0,
        saves: 0,
        dms: 0,
        reelScriptId: SCRIPT_1,
        slotIndex: 0,
        strategyId: STRATEGY_1,
        brief: VALID_BRIEF,
      },
      {
        assembledReelId: ASSEMBLED_2,
        clientId: CLIENT_A,
        views: 800,
        likes: 0,
        comments: 0,
        saves: 0,
        dms: 0,
        reelScriptId: SCRIPT_2,
        slotIndex: 1,
        strategyId: STRATEGY_1,
        brief: VALID_BRIEF,
      },
    ]);
    clearAggregateCache();
    try {
      const { aggregateReelMetricsByTema } = require("./aggregate-reel-metrics-by-tema.ts");
      const result = await aggregateReelMetricsByTema({
        clientId: CLIENT_A,
        weekStart: WEEK_START,
      });
      assert.ok(result);
      assert.equal(result.topThemes.length, 2);
      assert.equal(result.topThemes[0]!.engagementScore, 800);
      assert.equal(result.topThemes[1]!.engagementScore, 800);
    } finally {
      restore();
    }
  });

  it("excludes orphan join failure rows", async () => {
    const restore = installAggregateMocks([
      {
        assembledReelId: ASSEMBLED_1,
        clientId: CLIENT_A,
        views: 100,
        likes: 0,
        comments: 0,
        saves: 0,
        dms: 0,
        reelScriptId: SCRIPT_1,
        slotIndex: 0,
        strategyId: STRATEGY_1,
        brief: VALID_BRIEF,
      },
    ]);
    clearAggregateCache();
    try {
      const { aggregateReelMetricsByTema } = require("./aggregate-reel-metrics-by-tema.ts");
      const result = await aggregateReelMetricsByTema({
        clientId: CLIENT_A,
        weekStart: WEEK_START,
      });
      assert.ok(result);
      assert.equal(result.topThemes.length, 1);
    } finally {
      restore();
    }
  });

  it("isolates cross-client metrics", async () => {
    const restore = installAggregateMocks([
      {
        assembledReelId: ASSEMBLED_1,
        clientId: CLIENT_A,
        views: 1000,
        likes: 0,
        comments: 0,
        saves: 0,
        dms: 0,
        reelScriptId: SCRIPT_1,
        slotIndex: 0,
        strategyId: STRATEGY_1,
        brief: VALID_BRIEF,
      },
      {
        assembledReelId: ASSEMBLED_2,
        clientId: CLIENT_B,
        views: 9999,
        likes: 0,
        comments: 0,
        saves: 0,
        dms: 0,
        reelScriptId: SCRIPT_2,
        slotIndex: 0,
        strategyId: STRATEGY_1,
        brief: VALID_BRIEF,
      },
    ]);
    clearAggregateCache();
    try {
      const { aggregateReelMetricsByTema } = require("./aggregate-reel-metrics-by-tema.ts");
      const result = await aggregateReelMetricsByTema({
        clientId: CLIENT_A,
        weekStart: WEEK_START,
      });
      assert.ok(result);
      assert.equal(result.topThemes[0]!.views, 1000);
    } finally {
      restore();
    }
  });

  it("includes all-zero counter rows", async () => {
    const restore = installAggregateMocks([
      {
        assembledReelId: ASSEMBLED_1,
        clientId: CLIENT_A,
        views: 0,
        likes: 0,
        comments: 0,
        saves: 0,
        dms: 0,
        reelScriptId: SCRIPT_1,
        slotIndex: 0,
        strategyId: STRATEGY_1,
        brief: VALID_BRIEF,
      },
    ]);
    clearAggregateCache();
    try {
      const { aggregateReelMetricsByTema } = require("./aggregate-reel-metrics-by-tema.ts");
      const result = await aggregateReelMetricsByTema({
        clientId: CLIENT_A,
        weekStart: WEEK_START,
      });
      assert.ok(result);
      assert.equal(result.topThemes[0]!.engagementScore, 0);
    } finally {
      restore();
    }
  });

  it("has import server-only", () => {
    const src = readFileSync(
      path.join(__dirname, "aggregate-reel-metrics-by-tema.ts"),
      "utf8",
    );
    assert.match(src, /import "server-only"/);
  });
});

describe("computeStrategyMetricsWindow", () => {
  it("computes 28-day exclusive windowEnd on weekStart", async () => {
    const { computeStrategyMetricsWindow } = await import(
      "./compute-strategy-metrics-window.ts"
    );
    const window = computeStrategyMetricsWindow(WEEK_START);
    assert.equal(window.windowEnd, WEEK_START);
    assert.equal(window.windowStart, "2026-08-10");
  });
});
