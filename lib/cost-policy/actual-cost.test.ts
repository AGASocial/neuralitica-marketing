/**
 * US-7.3 actual cost finalization tests.
 */
import assert from "node:assert/strict";
import Module from "node:module";
import { describe, it } from "node:test";

import { FORBIDDEN_BUDGET_SPEND_KEYS } from "../contracts/cost-policy";
import { findForbiddenReelScriptKeys } from "../reel-scripts/find-forbidden-keys";

type NodeModuleLoad = typeof Module & {
  _load: (
    request: string,
    parent: unknown,
    isMain: boolean,
  ) => unknown;
};

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const REEL_SCRIPT_ID = "22222222-2222-4222-8222-222222222222";
const SPEND_EVENT_ID = "33333333-3333-4333-8333-333333333333";

const CATALOG_FIXTURE = {
  providers: [
    {
      key: "siliconflow_low",
      assetRole: "llm" as const,
      tier: "low" as const,
      active: true,
      capabilities: {},
      costModel: {
        billingUnit: "per_1m_tokens" as const,
        unitCostCents: 50,
      },
      envKeyName: "SILICONFLOW_API_KEY",
    },
    {
      key: "heygen_avatar",
      assetRole: "talking_head" as const,
      tier: "low" as const,
      active: true,
      capabilities: {},
      costModel: {
        billingUnit: "per_second" as const,
        unitCostCents: 7,
      },
      envKeyName: "HEYGEN_API_KEY",
    },
  ],
};

function withServerOnlyStub<T>(run: () => Promise<T>): Promise<T> {
  const nodeModule = Module as unknown as NodeModuleLoad;
  const originalLoad = nodeModule._load.bind(nodeModule);

  nodeModule._load = function (request, parent, isMain) {
    if (request === "server-only") {
      return {};
    }
    return originalLoad(request, parent, isMain);
  };

  return run().finally(() => {
    nodeModule._load = originalLoad;
  });
}

function withCatalogMock<T>(run: () => Promise<T>): Promise<T> {
  const nodeModule = Module as unknown as NodeModuleLoad;
  const originalLoad = nodeModule._load.bind(nodeModule);

  nodeModule._load = function (request, parent, isMain) {
    if (request === "server-only") {
      return {};
    }
    if (String(request).includes("get-provider-catalog")) {
      return {
        getProviderCatalog: async () => CATALOG_FIXTURE,
      };
    }
    return originalLoad(request, parent, isMain);
  };

  return run().finally(() => {
    nodeModule._load = originalLoad;
  });
}

describe("computeLlmActualCost (US-7.3)", () => {
  it("prefers adapter-reported cents when >= 1", async () => {
    await withCatalogMock(async () => {
      const { computeLlmActualCost } = await import(
        `./compute-llm-actual-cost.ts?adapter=${Date.now()}`
      );
      const result = await computeLlmActualCost({
        providerKey: "siliconflow_low",
        inputTokens: 1500,
        outputTokens: 800,
        adapterReportedCents: 9,
      });
      assert.deepEqual(result, { ok: true, actualCostCents: 9 });
    });
  });

  it("computes catalog token math when adapter reports zero", async () => {
    await withCatalogMock(async () => {
      const { computeLlmActualCost } = await import(
        `./compute-llm-actual-cost.ts?catalog=${Date.now()}`
      );
      const result = await computeLlmActualCost({
        providerKey: "siliconflow_low",
        inputTokens: 1500,
        outputTokens: 800,
        adapterReportedCents: 0,
      });
      assert.deepEqual(result, { ok: true, actualCostCents: 1 });
    });
  });

  it("returns usage_missing when token counts are absent", async () => {
    await withCatalogMock(async () => {
      const { computeLlmActualCost } = await import(
        `./compute-llm-actual-cost.ts?usage=${Date.now()}`
      );
      const result = await computeLlmActualCost({
        providerKey: "siliconflow_low",
        inputTokens: 0,
        outputTokens: 0,
        adapterReportedCents: 0,
      });
      assert.deepEqual(result, { ok: false, reason: "usage_missing" });
    });
  });

  it("returns catalog_cost_model_unsupported for non-token billing", async () => {
    await withCatalogMock(async () => {
      const { computeLlmActualCost } = await import(
        `./compute-llm-actual-cost.ts?billing=${Date.now()}`
      );
      const result = await computeLlmActualCost({
        providerKey: "heygen_avatar",
        inputTokens: 100,
        outputTokens: 200,
        adapterReportedCents: 0,
      });
      assert.deepEqual(result, {
        ok: false,
        reason: "catalog_cost_model_unsupported",
      });
    });
  });

  it("ceilPerMillionTokenCostCents matches contract fixture", async () => {
    await withServerOnlyStub(async () => {
      const { ceilPerMillionTokenCostCents } = await import(
        `./compute-llm-actual-cost.ts?ceil=${Date.now()}`
      );
      assert.equal(ceilPerMillionTokenCostCents(50, 1500, 800), 1);
    });
  });
});

describe("finalizeGenerationCost sync_insert (US-7.3)", () => {
  it("inserts spend row with computed actual via recordReelSpendEvent", async () => {
    await withServerOnlyStub(async () => {
    const inserts: unknown[] = [];
    const nodeModule = Module as unknown as NodeModuleLoad;
    const originalLoad = nodeModule._load.bind(nodeModule);

    nodeModule._load = function (request, parent, isMain) {
      if (request === "server-only") {
        return {};
      }
      if (String(request).includes("get-provider-catalog")) {
        return {
          getProviderCatalog: async () => CATALOG_FIXTURE,
        };
      }
      if (String(request).includes("record-reel-spend-event")) {
        return {
          recordReelSpendEvent: async (params: unknown) => {
            inserts.push(params);
            return { spendEventId: SPEND_EVENT_ID };
          },
        };
      }
      return originalLoad(request, parent, isMain);
    };

    try {
      const { finalizeGenerationCost } = await import(
        `./finalize-generation-cost.ts?sync=${Date.now()}`
      );
      const result = await finalizeGenerationCost({
        mode: "sync_insert",
        clientId: CLIENT_ID,
        reelScriptId: REEL_SCRIPT_ID,
        assetRole: "llm",
        jobKind: "script_generate",
        estimatedCostCents: 12,
        operatorClientId: CLIENT_ID,
        providerKey: "siliconflow_low",
        llmUsage: {
          inputTokens: 1500,
          outputTokens: 800,
          adapterReportedCents: 0,
        },
      });

      assert.deepEqual(result, { ok: true, spendEventId: SPEND_EVENT_ID });
      assert.equal(inserts.length, 1);
      assert.deepEqual(inserts[0], {
        clientId: CLIENT_ID,
        reelScriptId: REEL_SCRIPT_ID,
        assetRole: "llm",
        jobKind: "script_generate",
        estimatedCostCents: 12,
        actualCostCents: 1,
        actualCostUnavailableReason: null,
        durationSec: null,
        operatorClientId: CLIENT_ID,
        providerKey: "siliconflow_low",
      });
    } finally {
      nodeModule._load = originalLoad;
    }
    });
  });
});

describe("updateReelSpendEventActual (US-7.3 seam)", () => {
  it("returns TENANT_MISMATCH for foreign clientId", async () => {
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
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: SPEND_EVENT_ID,
                      client_id: "99999999-9999-4999-8999-999999999999",
                      reel_script_id: REEL_SCRIPT_ID,
                      actual_cost_cents: null,
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      return originalLoad(request, parent, isMain);
    };

    try {
      const { updateReelSpendEventActual } = await import(
        `./update-reel-spend-event-actual.ts?tenant=${Date.now()}`
      );
      const result = await updateReelSpendEventActual({
        spendEventId: SPEND_EVENT_ID,
        clientId: CLIENT_ID,
        reelScriptId: REEL_SCRIPT_ID,
        actualCostCents: 10,
      });
      assert.deepEqual(result, { ok: false, code: "TENANT_MISMATCH" });
    } finally {
      nodeModule._load = originalLoad;
    }
  });

  it("returns ALREADY_FINALIZED when actual differs from stored value", async () => {
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
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: SPEND_EVENT_ID,
                      client_id: CLIENT_ID,
                      reel_script_id: REEL_SCRIPT_ID,
                      actual_cost_cents: 10,
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      return originalLoad(request, parent, isMain);
    };

    try {
      const { updateReelSpendEventActual } = await import(
        `./update-reel-spend-event-actual.ts?finalized=${Date.now()}`
      );
      const result = await updateReelSpendEventActual({
        spendEventId: SPEND_EVENT_ID,
        clientId: CLIENT_ID,
        reelScriptId: REEL_SCRIPT_ID,
        actualCostCents: 5,
      });
      assert.deepEqual(result, { ok: false, code: "ALREADY_FINALIZED" });
    } finally {
      nodeModule._load = originalLoad;
    }
  });

  it("is idempotent when re-applying the same actual value", async () => {
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
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: SPEND_EVENT_ID,
                      client_id: CLIENT_ID,
                      reel_script_id: REEL_SCRIPT_ID,
                      actual_cost_cents: 10,
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      return originalLoad(request, parent, isMain);
    };

    try {
      const { updateReelSpendEventActual } = await import(
        `./update-reel-spend-event-actual.ts?idempotent=${Date.now()}`
      );
      const result = await updateReelSpendEventActual({
        spendEventId: SPEND_EVENT_ID,
        clientId: CLIENT_ID,
        reelScriptId: REEL_SCRIPT_ID,
        actualCostCents: 10,
      });
      assert.deepEqual(result, {
        ok: true,
        spendEventId: SPEND_EVENT_ID,
        idempotent: true,
      });
    } finally {
      nodeModule._load = originalLoad;
    }
  });
});

describe("forbidden actual cost keys (US-7.3)", () => {
  it("rejects actualCostCents on script generate input", () => {
    const keys = findForbiddenReelScriptKeys({
      weekStart: "2026-01-05",
      actualCostCents: 0,
    });
    assert.ok(keys.includes("actualCostCents"));
  });

  it("includes actual_cost_cents in FORBIDDEN_BUDGET_SPEND_KEYS", () => {
    assert.ok(FORBIDDEN_BUDGET_SPEND_KEYS.includes("actual_cost_cents"));
  });
});
