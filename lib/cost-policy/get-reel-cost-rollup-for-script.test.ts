/**
 * US-7.4 — getReelCostRollupForScript + reconciliation with getReelCostSummaryForWeek.
 */
import assert from "node:assert/strict";
import Module from "node:module";
import { describe, it } from "node:test";

import {
  computeReelCostIsOverBudget,
  computeReelCostVarianceCents,
} from "../contracts/actual-cost";
import { FORBIDDEN_REEL_COST_ROLLUP_KEYS } from "../contracts/cost-policy";
import { findForbiddenReelCostRollupKeys } from "./find-forbidden-rollup-keys";
import { findForbiddenReelScriptKeys } from "../reel-scripts/find-forbidden-keys";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const REEL_SCRIPT_A = "22222222-2222-4222-8222-222222222222";
const REEL_SCRIPT_B = "33333333-3333-4333-8333-333333333333";
const FOREIGN_SCRIPT = "44444444-4444-4444-8444-444444444444";
const WEEK_START = "2026-01-05";

type NodeModuleLoad = typeof Module & {
  _load: (
    request: string,
    parent: unknown,
    isMain: boolean,
  ) => unknown;
};

function chainableQuery(terminal: {
  then?: (
    onFulfilled: (v: unknown) => unknown,
    onRejected?: (e: unknown) => unknown,
  ) => Promise<unknown>;
}) {
  const builder: Record<string, unknown> = {};
  const self = () => builder;
  builder.select = self;
  builder.eq = self;
  builder.gte = self;
  builder.lt = self;
  builder.limit = self;
  builder.maybeSingle = () => Promise.resolve(terminal);
  builder.then =
    terminal.then ??
    ((
      onFulfilled: (v: unknown) => unknown,
      onRejected?: (e: unknown) => unknown,
    ) => Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected));
  return builder;
}

function clearModuleCache(prefix: string) {
  for (const key of Object.keys(require.cache)) {
    if (key.includes(prefix)) {
      delete require.cache[key];
    }
  }
}

const SPEND_FIXTURE = [
  {
    reel_script_id: REEL_SCRIPT_A,
    asset_role: "llm",
    estimated_cost_cents: 12,
    actual_cost_cents: 2,
    actual_cost_unavailable_reason: null,
  },
  {
    reel_script_id: REEL_SCRIPT_A,
    asset_role: "llm",
    estimated_cost_cents: 12,
    actual_cost_cents: 1,
    actual_cost_unavailable_reason: null,
  },
  {
    reel_script_id: REEL_SCRIPT_B,
    asset_role: "llm",
    estimated_cost_cents: 8,
    actual_cost_cents: null,
    actual_cost_unavailable_reason: "usage_missing",
  },
];

function installRollupMocks(options: {
  spendRows?: unknown[];
  scriptIds?: Set<string>;
  maxCostCents?: number;
  policyOk?: boolean;
}) {
  const {
    spendRows = SPEND_FIXTURE,
    scriptIds = new Set([REEL_SCRIPT_A, REEL_SCRIPT_B]),
    maxCostCents = 150,
    policyOk = true,
  } = options;

  const nodeModule = Module as unknown as NodeModuleLoad;
  const originalLoad = nodeModule._load.bind(nodeModule);

  nodeModule._load = function (request, parent, isMain) {
    if (request === "server-only") {
      return {};
    }
    if (String(request).includes("lib/supabase/server")) {
      return {
        isSupabaseConfigured: () => true,
        createServerSupabaseClient: () => ({
          from: (table: string) => {
            if (table === "neuramark_reel_scripts") {
              return {
                select: () => ({
                  eq: (_col: string, scriptId: string) => ({
                    eq: () => ({
                      maybeSingle: () =>
                        Promise.resolve({
                          data: scriptIds.has(scriptId) ? { id: scriptId } : null,
                          error: null,
                        }),
                    }),
                  }),
                }),
              };
            }
            if (table === "neuramark_reel_spend_events") {
              let reelScriptFilter: string | null = null;
              const builder: Record<string, unknown> = {};
              const self = () => builder;
              builder.select = self;
              builder.eq = (column: string, value: string) => {
                if (column === "reel_script_id") {
                  reelScriptFilter = value;
                }
                return builder;
              };
              builder.gte = self;
              builder.lt = self;
              builder.then = (
                onFulfilled: (v: unknown) => unknown,
                onRejected?: (e: unknown) => unknown,
              ) => {
                const filtered = reelScriptFilter
                  ? spendRows.filter(
                      (row) =>
                        (row as { reel_script_id?: string }).reel_script_id ===
                        reelScriptFilter,
                    )
                  : spendRows;
                return Promise.resolve({ data: filtered, error: null }).then(
                  onFulfilled,
                  onRejected,
                );
              };
              return builder;
            }
            return {
              select: () => chainableQuery({}),
            };
          },
        }),
      };
    }
    if (String(request).includes("get-cost-policy-for-client")) {
      return {
        getCostPolicyForClient: async () =>
          policyOk
            ? {
                ok: true as const,
                policy: { max_cost_cents: maxCostCents },
                scope: "global" as const,
              }
            : { ok: false as const, code: "COST_POLICY_UNAVAILABLE" as const },
      };
    }
    return originalLoad(request, parent, isMain);
  };

  return () => {
    nodeModule._load = originalLoad;
    clearModuleCache("aggregate-spend-events-for-reel-script");
    clearModuleCache("get-reel-cost-rollup-for-script");
    clearModuleCache("get-reel-cost-summary-for-week");
  };
}

async function loadAggregateModule() {
  const nodeModule = Module as unknown as NodeModuleLoad;
  const originalLoad = nodeModule._load.bind(nodeModule);
  nodeModule._load = function (request, parent, isMain) {
    if (request === "server-only") {
      return {};
    }
    return originalLoad(request, parent, isMain);
  };
  clearModuleCache("aggregate-spend-events-for-reel-script");
  try {
    return await import(`./aggregate-spend-events-for-reel-script.ts?run=${Date.now()}`);
  } finally {
    nodeModule._load = originalLoad;
  }
}

async function loadRollupModule() {
  clearModuleCache("get-reel-cost-rollup-for-script");
  return import(`./get-reel-cost-rollup-for-script.ts?run=${Date.now()}`);
}

async function loadSummaryModule() {
  clearModuleCache("get-reel-cost-summary-for-week");
  return import(`./get-reel-cost-summary-for-week.ts?run=${Date.now()}`);
}

describe("aggregateSpendEventsForReelScript (US-7.4)", () => {
  it("groups by asset_role and sums totals", async () => {
    const { aggregateSpendEventsForReelScript } = await loadAggregateModule();
    const aggregated = aggregateSpendEventsForReelScript([
      {
        asset_role: "llm",
        estimated_cost_cents: 20,
        actual_cost_cents: 15,
        actual_cost_unavailable_reason: null,
      },
      {
        asset_role: "llm",
        estimated_cost_cents: 22,
        actual_cost_cents: 23,
        actual_cost_unavailable_reason: null,
      },
      {
        asset_role: "tts",
        estimated_cost_cents: 5,
        actual_cost_cents: null,
        actual_cost_unavailable_reason: "usage_missing",
      },
      {
        asset_role: "unknown_role",
        estimated_cost_cents: 99,
        actual_cost_cents: 50,
        actual_cost_unavailable_reason: null,
      },
    ]);

    assert.equal(aggregated.estimatedTotalCents, 146);
    assert.equal(aggregated.actualTotalCents, 88);
    assert.equal(aggregated.hasPendingActual, true);
    assert.deepEqual(aggregated.unavailableReasonKeys, ["usage_missing"]);

    const llm = aggregated.byAssetRole.get("llm");
    assert.equal(llm?.eventCount, 2);
    assert.equal(llm?.estimatedCostCents, 42);
    assert.equal(llm?.actualCostCents, 38);
    assert.equal(llm?.hasPendingActual, false);

    const tts = aggregated.byAssetRole.get("tts");
    assert.equal(tts?.eventCount, 1);
    assert.equal(tts?.actualCostCents, null);
    assert.equal(tts?.hasPendingActual, true);
    assert.ok(!aggregated.byAssetRole.has("unknown_role" as never));
  });

  it("treats zero actual as recorded actual", async () => {
    const { aggregateSpendEventsForReelScript } = await loadAggregateModule();
    const aggregated = aggregateSpendEventsForReelScript([
      {
        asset_role: "llm",
        estimated_cost_cents: 10,
        actual_cost_cents: 0,
        actual_cost_unavailable_reason: null,
      },
    ]);

    assert.equal(aggregated.actualTotalCents, 0);
    assert.equal(aggregated.hasPendingActual, false);
    assert.equal(aggregated.byAssetRole.get("llm")?.actualCostCents, 0);
  });

  it("returns null actual when no event has actual", async () => {
    const { aggregateSpendEventsForReelScript } = await loadAggregateModule();
    const aggregated = aggregateSpendEventsForReelScript([
      {
        asset_role: "llm",
        estimated_cost_cents: 5,
        actual_cost_cents: null,
        actual_cost_unavailable_reason: null,
      },
    ]);

    assert.equal(aggregated.actualTotalCents, null);
    assert.equal(aggregated.hasPendingActual, true);
  });
});

describe("computeReelCost helpers (US-7.4)", () => {
  it("computes variance and over-budget per contract", () => {
    assert.equal(computeReelCostVarianceCents(120, 165), 45);
    assert.equal(computeReelCostVarianceCents(42, null), null);
    assert.equal(computeReelCostIsOverBudget(120, 165, 150), true);
    assert.equal(computeReelCostIsOverBudget(42, null, 150), false);
    assert.equal(computeReelCostIsOverBudget(160, null, 150), true);
  });
});

describe("getReelCostRollupForScript (US-7.4)", () => {
  it("returns LLM component breakdown and totals", async () => {
    const restore = installRollupMocks({});
    try {
      const { getReelCostRollupForScript } = await loadRollupModule();
      const rollup = await getReelCostRollupForScript({
        clientId: CLIENT_ID,
        reelScriptId: REEL_SCRIPT_A,
        weekStart: WEEK_START,
        eventScope: "week",
      });

      assert.ok(rollup);
      assert.equal(rollup.estimatedTotalCents, 24);
      assert.equal(rollup.actualTotalCents, 3);
      assert.equal(rollup.varianceCents, -21);
      assert.equal(rollup.hasPendingActual, false);
      assert.equal(rollup.maxCostCents, 150);
      assert.equal(rollup.isOverBudget, false);
      assert.equal(rollup.components.length, 1);
      assert.equal(rollup.components[0]?.assetRole, "llm");
      assert.equal(rollup.components[0]?.eventCount, 2);
      assert.equal(rollup.components[0]?.actualCostCents, 3);
    } finally {
      restore();
    }
  });

  it("returns pending rollup without variance", async () => {
    const restore = installRollupMocks({});
    try {
      const { getReelCostRollupForScript } = await loadRollupModule();
      const rollup = await getReelCostRollupForScript({
        clientId: CLIENT_ID,
        reelScriptId: REEL_SCRIPT_B,
        weekStart: WEEK_START,
        eventScope: "week",
      });

      assert.ok(rollup);
      assert.equal(rollup.estimatedTotalCents, 8);
      assert.equal(rollup.actualTotalCents, null);
      assert.equal(rollup.varianceCents, null);
      assert.equal(rollup.hasPendingActual, true);
      assert.deepEqual(
        rollup.components[0]?.unavailableReasonKeys,
        ["usage_missing"],
      );
    } finally {
      restore();
    }
  });

  it("returns null for foreign or missing reelScriptId", async () => {
    const restore = installRollupMocks({});
    try {
      const { getReelCostRollupForScript } = await loadRollupModule();
      const rollup = await getReelCostRollupForScript({
        clientId: CLIENT_ID,
        reelScriptId: FOREIGN_SCRIPT,
        weekStart: WEEK_START,
        eventScope: "week",
      });
      assert.equal(rollup, null);
    } finally {
      restore();
    }
  });

  it("uses DEFAULT_MAX_COST_CENTS when policy unavailable", async () => {
    const restore = installRollupMocks({ policyOk: false, maxCostCents: 99 });
    try {
      const { getReelCostRollupForScript } = await loadRollupModule();
      const rollup = await getReelCostRollupForScript({
        clientId: CLIENT_ID,
        reelScriptId: REEL_SCRIPT_A,
        weekStart: WEEK_START,
        eventScope: "week",
      });
      assert.ok(rollup);
      assert.equal(rollup.maxCostCents, 150);
    } finally {
      restore();
    }
  });

  it("flags over-budget when actual exceeds cap", async () => {
    const restore = installRollupMocks({
      spendRows: [
        {
          reel_script_id: REEL_SCRIPT_A,
          asset_role: "llm",
          estimated_cost_cents: 120,
          actual_cost_cents: 165,
          actual_cost_unavailable_reason: null,
        },
      ],
      maxCostCents: 150,
    });
    try {
      const { getReelCostRollupForScript } = await loadRollupModule();
      const rollup = await getReelCostRollupForScript({
        clientId: CLIENT_ID,
        reelScriptId: REEL_SCRIPT_A,
        weekStart: WEEK_START,
        eventScope: "week",
      });
      assert.ok(rollup);
      assert.equal(rollup.isOverBudget, true);
      assert.equal(rollup.varianceCents, 45);
    } finally {
      restore();
    }
  });
});

describe("reconciliation: rollup vs weekly summary (US-7.4)", () => {
  it("per-slot totals match costSummary.slots", async () => {
    const restore = installRollupMocks({});
    try {
      const { getReelCostSummaryForWeek } = await loadSummaryModule();
      const { getReelCostRollupForScript } = await loadRollupModule();

      const slotReelScriptIds = [
        { slotIndex: 0, reelScriptId: REEL_SCRIPT_A },
        { slotIndex: 1, reelScriptId: REEL_SCRIPT_B },
        { slotIndex: 2, reelScriptId: null },
      ];

      const costSummary = await getReelCostSummaryForWeek({
        clientId: CLIENT_ID,
        weekStart: WEEK_START,
        slotReelScriptIds,
      });

      const rollups: Record<string, Awaited<ReturnType<typeof getReelCostRollupForScript>>> =
        {};
      for (const { reelScriptId } of slotReelScriptIds) {
        if (reelScriptId === null) {
          continue;
        }
        rollups[reelScriptId] = await getReelCostRollupForScript({
          clientId: CLIENT_ID,
          reelScriptId,
          weekStart: WEEK_START,
          eventScope: "week",
        });
      }

      for (const slot of costSummary.slots) {
        if (slot.reelScriptId === null) {
          continue;
        }
        const rollup = rollups[slot.reelScriptId];
        assert.ok(rollup, `missing rollup for ${slot.reelScriptId}`);
        assert.equal(rollup.estimatedTotalCents, slot.estimatedCostCents);
        assert.equal(rollup.actualTotalCents, slot.actualCostCents);
        assert.equal(rollup.hasPendingActual, slot.hasPendingActual);
      }

      const rollupEstimatedSum = Object.values(rollups).reduce(
        (sum, rollup) => sum + (rollup?.estimatedTotalCents ?? 0),
        0,
      );
      assert.equal(rollupEstimatedSum, costSummary.weeklyEstimatedCostCents);

      const rollupActualValues = Object.values(rollups)
        .map((rollup) => rollup?.actualTotalCents)
        .filter((value): value is number => value !== null && value !== undefined);
      if (costSummary.weeklyActualCostCents !== null) {
        const rollupActualSum = rollupActualValues.reduce((a, b) => a + b, 0);
        assert.equal(rollupActualSum, costSummary.weeklyActualCostCents);
      } else {
        assert.equal(rollupActualValues.length, 0);
      }
    } finally {
      restore();
    }
  });
});

describe("forbidden rollup keys (US-7.4)", () => {
  it("findForbiddenReelCostRollupKeys rejects smuggled authority fields", () => {
    const keys = findForbiddenReelCostRollupKeys({
      reelScriptId: REEL_SCRIPT_A,
      varianceCents: 10,
      components: [],
    });
    assert.ok(keys.includes("varianceCents"));
    assert.ok(keys.includes("components"));
    assert.ok(!keys.includes("reelScriptId"));
  });

  it("findForbiddenReelScriptKeys includes rollup denylist keys", () => {
    for (const key of FORBIDDEN_REEL_COST_ROLLUP_KEYS) {
      const keys = findForbiddenReelScriptKeys({ weekStart: WEEK_START, [key]: true });
      assert.ok(keys.includes(key), `expected ${key} to be forbidden`);
    }
  });
});
