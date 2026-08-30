/**
 * US-7.3 — getReelCostSummaryForWeek aggregation tests.
 */
import assert from "node:assert/strict";
import Module from "node:module";
import { describe, it } from "node:test";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const REEL_SCRIPT_A = "22222222-2222-4222-8222-222222222222";
const REEL_SCRIPT_B = "33333333-3333-4333-8333-333333333333";
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
  builder.then =
    terminal.then ??
    ((
      onFulfilled: (v: unknown) => unknown,
      onRejected?: (e: unknown) => unknown,
    ) => Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected));
  return builder;
}

function clearCostSummaryModuleCache() {
  for (const key of Object.keys(require.cache)) {
    if (key.includes("get-reel-cost-summary-for-week")) {
      delete require.cache[key];
    }
  }
}

function installSpendSummaryMocks(spendRows: unknown[]) {
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
          from: () => ({
            select: () =>
              chainableQuery({
                then: (
                  onFulfilled: (v: unknown) => unknown,
                  onRejected?: (e: unknown) => unknown,
                ) =>
                  Promise.resolve({ data: spendRows, error: null }).then(
                    onFulfilled,
                    onRejected,
                  ),
              }),
          }),
        }),
      };
    }
    return originalLoad(request, parent, isMain);
  };

  return () => {
    nodeModule._load = originalLoad;
    clearCostSummaryModuleCache();
  };
}

async function loadGetReelCostSummaryForWeek() {
  clearCostSummaryModuleCache();
  return import(`./get-reel-cost-summary-for-week.ts?run=${Date.now()}`);
}

describe("getReelCostSummaryForWeek (US-7.3)", () => {
  it("aggregates per-slot estimate and actual sums", async () => {
    const restore = installSpendSummaryMocks([
      {
        reel_script_id: REEL_SCRIPT_A,
        estimated_cost_cents: 12,
        actual_cost_cents: 2,
        actual_cost_unavailable_reason: null,
      },
      {
        reel_script_id: REEL_SCRIPT_A,
        estimated_cost_cents: 12,
        actual_cost_cents: 1,
        actual_cost_unavailable_reason: null,
      },
      {
        reel_script_id: REEL_SCRIPT_B,
        estimated_cost_cents: 8,
        actual_cost_cents: null,
        actual_cost_unavailable_reason: "usage_missing",
      },
    ]);
    try {
      const { getReelCostSummaryForWeek } = await loadGetReelCostSummaryForWeek();
      const summary = await getReelCostSummaryForWeek({
        clientId: CLIENT_ID,
        weekStart: WEEK_START,
        slotReelScriptIds: [
          { slotIndex: 0, reelScriptId: REEL_SCRIPT_A },
          { slotIndex: 1, reelScriptId: REEL_SCRIPT_B },
          { slotIndex: 2, reelScriptId: null },
        ],
      });

      assert.equal(summary.weeklyEstimatedCostCents, 32);
      assert.equal(summary.weeklyActualCostCents, 3);
      assert.equal(summary.hasPartialActual, true);

      const slot0 = summary.slots.find((s) => s.slotIndex === 0);
      assert.equal(slot0?.estimatedCostCents, 24);
      assert.equal(slot0?.actualCostCents, 3);
      assert.equal(slot0?.hasPendingActual, false);

      const slot1 = summary.slots.find((s) => s.slotIndex === 1);
      assert.equal(slot1?.estimatedCostCents, 8);
      assert.equal(slot1?.actualCostCents, null);
      assert.equal(slot1?.hasPendingActual, true);
      assert.deepEqual(slot1?.unavailableReasonKeys, ["usage_missing"]);

      const slot2 = summary.slots.find((s) => s.slotIndex === 2);
      assert.equal(slot2?.estimatedCostCents, 0);
      assert.equal(slot2?.actualCostCents, null);
    } finally {
      restore();
    }
  });

  it("returns null weekly actual when no slot has actuals", async () => {
    const restore = installSpendSummaryMocks([
      {
        reel_script_id: REEL_SCRIPT_A,
        estimated_cost_cents: 5,
        actual_cost_cents: null,
        actual_cost_unavailable_reason: null,
      },
    ]);
    try {
      const { getReelCostSummaryForWeek } = await loadGetReelCostSummaryForWeek();
      const summary = await getReelCostSummaryForWeek({
        clientId: CLIENT_ID,
        weekStart: WEEK_START,
        slotReelScriptIds: [{ slotIndex: 0, reelScriptId: REEL_SCRIPT_A }],
      });

      assert.equal(summary.weeklyEstimatedCostCents, 5);
      assert.equal(summary.weeklyActualCostCents, null);
      assert.equal(summary.hasPartialActual, false);
      assert.equal(summary.slots[0]?.hasPendingActual, true);
    } finally {
      restore();
    }
  });

  it("returns zero totals when week has no spend rows", async () => {
    const restore = installSpendSummaryMocks([]);
    try {
      const { getReelCostSummaryForWeek } = await loadGetReelCostSummaryForWeek();
      const summary = await getReelCostSummaryForWeek({
        clientId: CLIENT_ID,
        weekStart: WEEK_START,
        slotReelScriptIds: [{ slotIndex: 0, reelScriptId: REEL_SCRIPT_A }],
      });

      assert.equal(summary.weeklyEstimatedCostCents, 0);
      assert.equal(summary.weeklyActualCostCents, null);
      assert.equal(summary.hasPartialActual, false);
    } finally {
      restore();
    }
  });
});
