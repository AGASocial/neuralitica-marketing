/**
 * US-7.1 cost policy resolver, budget gate, and audit ledger tests.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Module from "node:module";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  MAX_COST_CENTS_CEILING,
  safeAddCents,
  updateGlobalCostPolicyInputSchema,
  wouldExceedBudget,
} from "../contracts/cost-policy";
import { findForbiddenReelScriptKeys } from "../reel-scripts/find-forbidden-keys";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type NodeModuleLoad = typeof Module & {
  _load: (
    request: string,
    parent: unknown,
    isMain: boolean,
  ) => unknown;
};

const CLIENT_ID = "22222222-2222-4222-8222-222222222222";
const GLOBAL_POLICY_ID = "00000000-0000-4000-8000-000000000001";
const CLIENT_POLICY_ID = "00000000-0000-4000-8000-000000000002";
const REEL_SCRIPT_ID = "11111111-1111-4111-8111-111111111111";

function clearCostPolicyModuleCache() {
  for (const key of Object.keys(require.cache)) {
    if (key.includes("lib/cost-policy/")) {
      delete require.cache[key];
    }
  }
}

describe("cost-policy contract helpers", () => {
  it("safeAddCents returns null on overflow inputs", () => {
    assert.equal(safeAddCents(Number.MAX_SAFE_INTEGER, 1), null);
    assert.equal(safeAddCents(-1, 2), null);
  });

  it("wouldExceedBudget fails closed on overflow", () => {
    assert.equal(
      wouldExceedBudget(Number.MAX_SAFE_INTEGER, 1, Number.MAX_SAFE_INTEGER),
      true,
    );
  });

  it("wouldExceedBudget detects cap exceedance", () => {
    assert.equal(wouldExceedBudget(149, 1, 150), false);
    assert.equal(wouldExceedBudget(149, 2, 150), true);
  });

  it("updateGlobalCostPolicyInputSchema rejects above ceiling", () => {
    const parsed = updateGlobalCostPolicyInputSchema.safeParse({
      maxCostCents: MAX_COST_CENTS_CEILING + 1,
      providerTier: "low",
    });
    assert.equal(parsed.success, false);
  });
});

describe("forbidden budget keys on generate actions", () => {
  it("rejects estimatedCostCents on script generate input", () => {
    const keys = findForbiddenReelScriptKeys({
      weekStart: "2026-01-05",
      estimatedCostCents: 0,
    });
    assert.ok(keys.includes("estimatedCostCents"));
  });
});

describe("resolveLlmProviderLabel", () => {
  it("maps known provider keys without envKeyName", async () => {
    const { resolveLlmProviderLabel } = await import(
      "../cost-policy/llm-provider-label.ts"
    );
    const label = resolveLlmProviderLabel("siliconflow_deepseek_flash");
    assert.equal(label, "DeepSeek Flash");
    assert.equal(label.includes("envKeyName"), false);
  });
});

describe("getCostPolicyForClient", () => {
  it("returns client row when override exists", async () => {
    const nodeModule = Module as unknown as NodeModuleLoad;
    const originalLoad = nodeModule._load.bind(nodeModule);

    nodeModule._load = function (request, parent, isMain) {
      if (request === "server-only") return {};
      if (request === "react") {
        return { cache: (fn: (...args: unknown[]) => unknown) => fn };
      }
      if (String(request).includes("lib/supabase/server")) {
        return {
          isSupabaseConfigured: () => true,
          createServerSupabaseClient: () => ({
            from(table: string) {
              assert.equal(table, "neuramark_cost_policies");
              return {
                select: () => ({
                  eq: (_col: string, val: unknown) => ({
                    limit: () => ({
                      maybeSingle: async () => {
                        if (val === CLIENT_ID) {
                          return {
                            data: {
                              id: CLIENT_POLICY_ID,
                              client_id: CLIENT_ID,
                              provider_tier: "high",
                              max_cost_cents: 500,
                              rules: null,
                              created_at: "2026-01-01T00:00:00.000Z",
                              updated_at: "2026-01-02T00:00:00.000Z",
                            },
                            error: null,
                          };
                        }
                        return { data: null, error: null };
                      },
                    }),
                  }),
                  is: () => ({
                    limit: () => ({
                      maybeSingle: async () => ({ data: null, error: null }),
                    }),
                  }),
                }),
              };
            },
          }),
        };
      }
      return originalLoad(request, parent, isMain);
    };

    try {
      clearCostPolicyModuleCache();
      const { getCostPolicyForClient } = await import(
        `../cost-policy/get-cost-policy-for-client.ts?client=${Date.now()}`
      );
      const result = await getCostPolicyForClient(CLIENT_ID);
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.scope, "client");
        assert.equal(result.policy.maxCostCents, 500);
        assert.equal(result.policy.providerTier, "high");
      }
    } finally {
      nodeModule._load = originalLoad;
      clearCostPolicyModuleCache();
    }
  });

  it("falls back to global when client row missing", async () => {
    const nodeModule = Module as unknown as NodeModuleLoad;
    const originalLoad = nodeModule._load.bind(nodeModule);

    nodeModule._load = function (request, parent, isMain) {
      if (request === "server-only") return {};
      if (request === "react") {
        return { cache: (fn: (...args: unknown[]) => unknown) => fn };
      }
      if (String(request).includes("lib/supabase/server")) {
        return {
          isSupabaseConfigured: () => true,
          createServerSupabaseClient: () => ({
            from: () => ({
              select: () => ({
                eq: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({ data: null, error: null }),
                  }),
                }),
                is: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({
                      data: {
                        id: GLOBAL_POLICY_ID,
                        client_id: null,
                        provider_tier: "low",
                        max_cost_cents: 150,
                        rules: null,
                        created_at: "2026-01-01T00:00:00.000Z",
                        updated_at: "2026-01-01T00:00:00.000Z",
                      },
                      error: null,
                    }),
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
      clearCostPolicyModuleCache();
      const { getCostPolicyForClient } = await import(
        `../cost-policy/get-cost-policy-for-client.ts?global=${Date.now()}`
      );
      const result = await getCostPolicyForClient(CLIENT_ID);
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.scope, "global");
        assert.equal(result.policy.maxCostCents, 150);
      }
    } finally {
      nodeModule._load = originalLoad;
      clearCostPolicyModuleCache();
    }
  });

  it("returns COST_POLICY_UNAVAILABLE when global missing", async () => {
    const nodeModule = Module as unknown as NodeModuleLoad;
    const originalLoad = nodeModule._load.bind(nodeModule);

    nodeModule._load = function (request, parent, isMain) {
      if (request === "server-only") return {};
      if (request === "react") {
        return { cache: (fn: (...args: unknown[]) => unknown) => fn };
      }
      if (String(request).includes("lib/supabase/server")) {
        return {
          isSupabaseConfigured: () => true,
          createServerSupabaseClient: () => ({
            from: () => ({
              select: () => ({
                eq: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({ data: null, error: null }),
                  }),
                }),
                is: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({ data: null, error: null }),
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
      clearCostPolicyModuleCache();
      const { getCostPolicyForClient } = await import(
        `../cost-policy/get-cost-policy-for-client.ts?missing=${Date.now()}`
      );
      const result = await getCostPolicyForClient(CLIENT_ID);
      assert.deepEqual(result, { ok: false, code: "COST_POLICY_UNAVAILABLE" });
    } finally {
      nodeModule._load = originalLoad;
      clearCostPolicyModuleCache();
    }
  });
});

describe("sumReelCumulativeCostCents", () => {
  it("sums script and caption spend events", async () => {
    const nodeModule = Module as unknown as NodeModuleLoad;
    const originalLoad = nodeModule._load.bind(nodeModule);

    nodeModule._load = function (request, parent, isMain) {
      if (request === "server-only") return {};
      if (String(request).includes("lib/supabase/server")) {
        return {
          isSupabaseConfigured: () => true,
          createServerSupabaseClient: () => ({
            from: () => ({
              select: () => ({
                eq: async () => ({
                  data: [
                    { estimated_cost_cents: 1 },
                    { estimated_cost_cents: 2 },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      return originalLoad(request, parent, isMain);
    };

    try {
      clearCostPolicyModuleCache();
      const { sumReelCumulativeCostCents } = await import(
        `../cost-policy/sum-reel-cumulative-cost-cents.ts?sum=${Date.now()}`
      );
      const total = await sumReelCumulativeCostCents(REEL_SCRIPT_ID);
      assert.equal(total, 3);
    } finally {
      nodeModule._load = originalLoad;
      clearCostPolicyModuleCache();
    }
  });
});

describe("assertReelBudgetAllowsSpend", () => {
  it("includes import server-only in gate module", () => {
    const source = readFileSync(
      path.join(__dirname, "assert-reel-budget-allows-spend.ts"),
      "utf8",
    );
    assert.match(source, /import ["']server-only["']/);
  });
});

describe("assert-reel-budget gate behavior (mocked)", () => {
  function mockCostPolicyModules(options: {
    maxCostCents?: number;
    cumulative?: number;
    estimated?: number;
    highTier?: boolean;
  }) {
    const auditRows: Array<Record<string, unknown>> = [];
    const nodeModule = Module as unknown as NodeModuleLoad;
    const originalLoad = nodeModule._load.bind(nodeModule);

    nodeModule._load = function (request, parent, isMain) {
      if (request === "server-only") return {};
      if (request === "react") {
        return { cache: (fn: (...args: unknown[]) => unknown) => fn };
      }
      const req = String(request);
      if (req.includes("get-cost-policy-for-client")) {
        return {
          loadCostPolicyForClientFresh: async () => ({
            ok: true,
            policy: {
              id: GLOBAL_POLICY_ID,
              clientId: null,
              providerTier: options.highTier ? "high" : "low",
              maxCostCents: options.maxCostCents ?? 150,
              rules: null,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
            scope: "global",
          }),
        };
      }
      if (req.includes("estimate-llm-job-cost")) {
        return {
          estimateLlmJobCost: async () =>
            options.highTier
              ? { ok: false, code: "PROVIDER_UNAVAILABLE" }
              : {
                  ok: true,
                  estimatedCostCents: options.estimated ?? 1,
                  providerKey: "siliconflow_deepseek_flash",
                  resolvedLlmProviderLabel: "DeepSeek Flash",
                },
          llmVariantForJobKind: () => "default",
        };
      }
      if (req.includes("sum-reel-cumulative-cost-cents")) {
        return {
          sumReelCumulativeCostCents: async () => options.cumulative ?? 0,
          ReelCumulativeCostUnsafeError: class extends Error {},
        };
      }
      if (req.includes("resolve-reel-script-for-budget")) {
        return {
          verifyReelScriptBelongsToClient: async () => true,
        };
      }
      if (req.includes("record-budget-audit-event")) {
        return {
          recordBudgetAuditEvent: async (row: Record<string, unknown>) => {
            auditRows.push(row);
          },
        };
      }
      if (req.includes("lib/supabase/server")) {
        return {
          isSupabaseConfigured: () => true,
          createServerSupabaseClient: () => ({}),
        };
      }
      return originalLoad(request, parent, isMain);
    };

    return {
      auditRows,
      restore: () => {
        nodeModule._load = originalLoad;
        clearCostPolicyModuleCache();
      },
    };
  }

  it("allows spend under cap without audit", async () => {
    const mock = mockCostPolicyModules({ cumulative: 10, estimated: 1 });
    try {
      clearCostPolicyModuleCache();
      const { assertReelBudgetAllowsSpend } = await import(
        `../cost-policy/assert-reel-budget-allows-spend.ts?under=${Date.now()}`
      );
      const result = await assertReelBudgetAllowsSpend({
        clientId: CLIENT_ID,
        reelScriptId: REEL_SCRIPT_ID,
        reelScriptPersisted: true,
        jobKind: "script_generate",
        operatorClientId: CLIENT_ID,
      });
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.didOverride, false);
      }
      assert.equal(mock.auditRows.length, 0);
    } finally {
      mock.restore();
    }
  });

  it("blocks over cap and writes blocked audit", async () => {
    const mock = mockCostPolicyModules({ cumulative: 149, estimated: 2 });
    try {
      clearCostPolicyModuleCache();
      const { assertReelBudgetAllowsSpend } = await import(
        `../cost-policy/assert-reel-budget-allows-spend.ts?block=${Date.now()}`
      );
      const result = await assertReelBudgetAllowsSpend({
        clientId: CLIENT_ID,
        reelScriptId: REEL_SCRIPT_ID,
        reelScriptPersisted: true,
        jobKind: "caption_generate",
        operatorClientId: CLIENT_ID,
      });
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.code, "BUDGET_EXCEEDED");
      }
      assert.equal(mock.auditRows.length, 1);
      assert.equal(mock.auditRows[0]?.eventType, "blocked");
    } finally {
      mock.restore();
    }
  });

  it("override with reason proceeds and audits override_proceed", async () => {
    const mock = mockCostPolicyModules({ cumulative: 149, estimated: 2 });
    try {
      clearCostPolicyModuleCache();
      const { assertReelBudgetAllowsSpend } = await import(
        `../cost-policy/assert-reel-budget-allows-spend.ts?override=${Date.now()}`
      );
      const result = await assertReelBudgetAllowsSpend({
        clientId: CLIENT_ID,
        reelScriptId: REEL_SCRIPT_ID,
        reelScriptPersisted: true,
        jobKind: "caption_generate",
        operatorClientId: CLIENT_ID,
        budgetOverride: true,
        overrideReason: "Cliente deadline",
      });
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.didOverride, true);
      }
      assert.equal(mock.auditRows.length, 1);
      assert.equal(mock.auditRows[0]?.eventType, "override_proceed");
    } finally {
      mock.restore();
    }
  });

  it("override without reason returns VALIDATION_ERROR", async () => {
    const mock = mockCostPolicyModules({ cumulative: 149, estimated: 2 });
    try {
      clearCostPolicyModuleCache();
      const { assertReelBudgetAllowsSpend } = await import(
        `../cost-policy/assert-reel-budget-allows-spend.ts?noreason=${Date.now()}`
      );
      const result = await assertReelBudgetAllowsSpend({
        clientId: CLIENT_ID,
        reelScriptId: REEL_SCRIPT_ID,
        reelScriptPersisted: true,
        jobKind: "caption_generate",
        operatorClientId: CLIENT_ID,
        budgetOverride: true,
      });
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.code, "VALIDATION_ERROR");
      }
      assert.equal(mock.auditRows.length, 0);
    } finally {
      mock.restore();
    }
  });

  it("high tier without active provider returns PROVIDER_UNAVAILABLE", async () => {
    const mock = mockCostPolicyModules({ highTier: true });
    try {
      clearCostPolicyModuleCache();
      const { assertReelBudgetAllowsSpend } = await import(
        `../cost-policy/assert-reel-budget-allows-spend.ts?high=${Date.now()}`
      );
      const result = await assertReelBudgetAllowsSpend({
        clientId: CLIENT_ID,
        reelScriptId: REEL_SCRIPT_ID,
        reelScriptPersisted: true,
        jobKind: "caption_generate",
        operatorClientId: CLIENT_ID,
      });
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.code, "PROVIDER_UNAVAILABLE");
      }
    } finally {
      mock.restore();
    }
  });

  it("estimateLlmJobCost returns fallback variant rationaleKey", async () => {
    const nodeModule = Module as unknown as NodeModuleLoad;
    const originalLoad = nodeModule._load.bind(nodeModule);

    nodeModule._load = function (request, parent, isMain) {
      if (request === "server-only") return {};
      if (request === "react") {
        return { cache: (fn: (...args: unknown[]) => unknown) => fn };
      }
      const req = String(request);
      if (req.includes("get-cost-policy-for-client")) {
        return {
          getCostPolicyForClient: async () => ({
            ok: true,
            policy: {
              id: GLOBAL_POLICY_ID,
              clientId: null,
              providerTier: "low",
              maxCostCents: 150,
              rules: null,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
            scope: "global",
          }),
          loadCostPolicyForClientFresh: async () => ({
            ok: true,
            policy: {
              id: GLOBAL_POLICY_ID,
              clientId: null,
              providerTier: "low",
              maxCostCents: 150,
              rules: null,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
            scope: "global",
          }),
        };
      }
      if (req.includes("get-provider-catalog")) {
        return {
          getProviderCatalog: async () => ({
            providers: [
              {
                key: "siliconflow_deepseek_flash",
                assetRole: "llm",
                tier: "low",
                active: true,
                capabilities: {},
                costModel: {
                  billingUnit: "per_1m_tokens",
                  unitCostCents: 14,
                },
                envKeyName: "SILICONFLOW_API_KEY",
              },
              {
                key: "siliconflow_qwen",
                assetRole: "llm",
                tier: "low",
                active: true,
                capabilities: {},
                costModel: { billingUnit: "per_1m_tokens", unitCostCents: 18 },
                envKeyName: "SILICONFLOW_API_KEY",
              },
            ],
          }),
        };
      }
      if (req.includes("siliconflow-llm-adapter")) {
        return {
          createSiliconFlowLlmAdapter: () => ({
            estimateCost: async () => ({
              estimatedCostCents: 2,
              currency: "USD",
              providerKey: "siliconflow_qwen",
            }),
          }),
        };
      }
      return originalLoad(request, parent, isMain);
    };

    try {
      clearCostPolicyModuleCache();
      const { estimateLlmJobCost } = await import(
        `../cost-policy/estimate-llm-job-cost.ts?delegate=${Date.now()}`
      );
      const result = await estimateLlmJobCost({
        clientId: CLIENT_ID,
        providerTier: "low",
        llmVariant: "fallback",
      });
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.providerKey, "siliconflow_qwen");
        assert.equal(result.rationaleKey, "llm_variant_fallback");
      }
    } finally {
      nodeModule._load = originalLoad;
      clearCostPolicyModuleCache();
    }
  });

  it("rejects client providerKey on script generate input", () => {
    const keys = findForbiddenReelScriptKeys({
      weekStart: "2026-01-05",
      providerKey: "heygen_high",
    });
    assert.ok(keys.includes("providerKey"));
  });
});
