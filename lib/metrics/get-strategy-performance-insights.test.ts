/**
 * US-13.2 — getStrategyPerformanceInsights action tests.
 */
import assert from "node:assert/strict";
import Module from "node:module";
import { describe, it } from "node:test";

const WEEK_START = "2026-09-07";
const CLIENT_A = "11111111-1111-4111-8111-111111111111";
const OPERATOR_ID = "22222222-2222-4222-8222-222222222222";

const operatorUser = {
  id: OPERATOR_ID,
  email: "operator@example.com",
  displayName: "Operator",
  preferredLocale: "en",
  role: "operator",
  active: true,
};

type NodeModuleLoad = {
  _load: (
    request: string,
    parent: NodeModule | null | undefined,
    isMain: boolean,
  ) => unknown;
};

function clearInsightsCache() {
  for (const key of Object.keys(require.cache)) {
    if (
      key.includes("/lib/metrics/") ||
      key.includes("/lib/auth/require-user") ||
      key.includes("/lib/content-strategy/validate-active-operator-client-id")
    ) {
      delete require.cache[key];
    }
  }
}

type InsightsMockOptions = {
  requireOperator?: () => Promise<unknown>;
  validateActiveOperatorClientId?: (
    clientId: string,
  ) => Promise<{ ok: true } | { ok: false; code: "NOT_FOUND" }>;
  aggregateReelMetricsByTema?: (params: {
    clientId: string;
    weekStart: string;
  }) => Promise<unknown>;
  aggregateCalled?: boolean;
};

function installInsightsMocks(options: InsightsMockOptions) {
  const nodeModule = Module as unknown as NodeModuleLoad;
  const originalLoad = nodeModule._load;

  nodeModule._load = function (request, parent, isMain) {
    if (request === "server-only") {
      return {};
    }
    if (
      request === "@/lib/auth/require-user" ||
      String(request).includes("lib/auth/require-user")
    ) {
      return {
        isAuthGuardError: (error: unknown) =>
          Boolean(
            error &&
              typeof error === "object" &&
              "status" in error &&
              ((error as { status: number }).status === 401 ||
                (error as { status: number }).status === 403),
          ),
        requireOperator:
          options.requireOperator ?? (async () => operatorUser),
      };
    }
    if (
      request === "@/lib/content-strategy/validate-active-operator-client-id" ||
      String(request).includes("validate-active-operator-client-id")
    ) {
      return {
        validateActiveOperatorClientId:
          options.validateActiveOperatorClientId ??
          (async (clientId: string) =>
            clientId === CLIENT_A
              ? { ok: true as const }
              : { ok: false as const, code: "NOT_FOUND" as const }),
      };
    }
    if (
      request === "@/lib/metrics/aggregate-reel-metrics-by-tema" ||
      String(request).includes("aggregate-reel-metrics-by-tema")
    ) {
      return {
        aggregateReelMetricsByTema:
          options.aggregateReelMetricsByTema ??
          (async () => {
            if (options.aggregateCalled !== undefined) {
              options.aggregateCalled = true;
            }
            return {
              available: true,
              windowStart: "2026-08-04",
              windowEnd: WEEK_START,
              topThemes: [
                {
                  rank: 1,
                  tema: "Mantenimiento preventivo",
                  reelCount: 1,
                  views: 100,
                  likes: 10,
                  comments: 0,
                  saves: 0,
                  dms: 0,
                  engagementScore: 110,
                },
              ],
            };
          }),
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  return () => {
    nodeModule._load = originalLoad;
  };
}

describe("getStrategyPerformanceInsights action", () => {
  it("non-operator returns FORBIDDEN without aggregate", async () => {
    let aggregateCalled = false;
    const restore = installInsightsMocks({
      requireOperator: async () => {
        throw Object.assign(new Error("forbidden"), { status: 403 });
      },
      aggregateReelMetricsByTema: async () => {
        aggregateCalled = true;
        return null;
      },
    });
    clearInsightsCache();
    try {
      const { getStrategyPerformanceInsights } = require("./actions/get-strategy-performance-insights.ts");
      const result = await getStrategyPerformanceInsights({
        clientId: CLIENT_A,
        weekStart: WEEK_START,
      });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.code, "FORBIDDEN");
      assert.equal(aggregateCalled, false);
    } finally {
      restore();
    }
  });

  it("operator happy path returns insights with at most 3 rows", async () => {
    const restore = installInsightsMocks({});
    clearInsightsCache();
    try {
      const { getStrategyPerformanceInsights } = require("./actions/get-strategy-performance-insights.ts");
      const result = await getStrategyPerformanceInsights({
        clientId: CLIENT_A,
        weekStart: WEEK_START,
      });
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.ok(result.insights);
        assert.ok(result.insights!.topThemes.length <= 3);
      }
    } finally {
      restore();
    }
  });

  it("invalid UUID clientId returns VALIDATION_ERROR", async () => {
    const restore = installInsightsMocks({});
    clearInsightsCache();
    try {
      const { getStrategyPerformanceInsights } = require("./actions/get-strategy-performance-insights.ts");
      const result = await getStrategyPerformanceInsights({
        clientId: "not-a-uuid",
        weekStart: WEEK_START,
      });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.code, "VALIDATION_ERROR");
    } finally {
      restore();
    }
  });

  it("inactive client returns NOT_FOUND", async () => {
    const restore = installInsightsMocks({
      validateActiveOperatorClientId: async () => ({
        ok: false,
        code: "NOT_FOUND",
      }),
    });
    clearInsightsCache();
    try {
      const { getStrategyPerformanceInsights } = require("./actions/get-strategy-performance-insights.ts");
      const result = await getStrategyPerformanceInsights({
        clientId: CLIENT_A,
        weekStart: WEEK_START,
      });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.code, "NOT_FOUND");
    } finally {
      restore();
    }
  });

  it("body with topThemes returns FORBIDDEN_FIELDS", async () => {
    const restore = installInsightsMocks({});
    clearInsightsCache();
    try {
      const { getStrategyPerformanceInsights } = require("./actions/get-strategy-performance-insights.ts");
      const result = await getStrategyPerformanceInsights({
        clientId: CLIENT_A,
        weekStart: WEEK_START,
        topThemes: [{ rank: 1, tema: "hack" }],
      });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.code, "FORBIDDEN_FIELDS");
    } finally {
      restore();
    }
  });
});
