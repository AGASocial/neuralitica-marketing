/**
 * US-X.4 Provider catalog, cost policy, and resolveProvider tests.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import Module from "node:module";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_LOW_TIER_PROVIDER_KEYS,
  PROVIDER_NOT_FOUND,
  V1_CATALOG_SEED_KEYS,
  defaultCostPolicyLoadFailedSchema,
  defaultCostPolicySuccessSchema,
  envKeyNameSchema,
  providerCatalogLoadFailedSchema,
  providerCatalogRowSchema,
  providerCatalogSuccessSchema,
  providerCostModelSchema,
} from "../contracts/providers";
import { isPublicPath } from "../auth/public-routes";
import type { ProviderCatalogRow } from "../contracts/providers";
import { mapProviderCatalogRows } from "./map-provider-catalog-rows.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

type NodeModuleLoad = {
  _load: (
    request: string,
    parent: NodeModule | null | undefined,
    isMain: boolean,
  ) => unknown;
};

function clearProviderModuleCache() {
  for (const key of Object.keys(require.cache)) {
    const normalized = key.replace(/\\/g, "/");
    if (
      normalized.includes("/lib/providers/get-provider-catalog") ||
      normalized.includes("/lib/providers/get-default-cost-policy") ||
      normalized.includes("/lib/providers/provider-adapters") ||
      normalized.includes("/lib/supabase/server")
    ) {
      delete require.cache[key];
    }
  }
}

function withServerOnlyStub<T>(run: () => T): T {
  const nodeModule = Module as unknown as NodeModuleLoad;
  const originalLoad = nodeModule._load.bind(nodeModule);
  nodeModule._load = function (request, parent, isMain) {
    if (request === "server-only") {
      return {};
    }
    if (request === "react") {
      return { cache: (fn: (...args: unknown[]) => unknown) => fn };
    }
    return originalLoad(request, parent, isMain);
  };
  try {
    clearProviderModuleCache();
    return run();
  } finally {
    nodeModule._load = originalLoad;
    clearProviderModuleCache();
  }
}

function loadProviderAdapters() {
  return withServerOnlyStub(() => require("./provider-adapters.ts"));
}

function row(
  key: string,
  assetRole: ProviderCatalogRow["assetRole"],
  tier: ProviderCatalogRow["tier"],
  active: boolean,
  capabilities: Record<string, unknown> = {},
  costModelOverrides: Partial<ProviderCatalogRow["costModel"]> = {},
): ProviderCatalogRow {
  const defaults: Record<string, ProviderCatalogRow["costModel"]> = {
    siliconflow_deepseek_flash: {
      billingUnit: "per_1m_tokens",
      unitCostCents: 14,
      metadata: { model: "deepseek-v4-flash" },
    },
    siliconflow_qwen: {
      billingUnit: "per_1m_tokens",
      unitCostCents: 18,
      metadata: { model: "qwen3.5-9b" },
    },
    siliconflow_cosyvoice2: {
      billingUnit: "per_1m_chars",
      unitCostCents: 1,
      metadata: { model: "cosyvoice2" },
    },
    sadtalker_low: {
      billingUnit: "per_run",
      unitCostCents: 10,
      metadata: { vendor: "replicate" },
    },
    musetalk_low: {
      billingUnit: "per_run",
      unitCostCents: 19,
      metadata: { vendor: "replicate" },
    },
    siliconflow_wan21_turbo: {
      billingUnit: "per_clip",
      unitCostCents: 21,
      metadata: { clipDurationSec: 5, model: "wan2.1-i2v-turbo" },
    },
    manual: { billingUnit: "per_run", unitCostCents: 0 },
    heygen_high: {
      billingUnit: "per_second",
      unitCostCents: 7,
      metadata: { plan: "standard" },
    },
    ltx_broll_high: {
      billingUnit: "per_clip",
      unitCostCents: 126,
      metadata: { clipDurationSec: 5, model: "ltx-2.3-pro" },
    },
    elevenlabs_tts_high: {
      billingUnit: "per_1m_chars",
      unitCostCents: 300,
      metadata: { plan: "multilingual" },
    },
  };

  const envKeys: Record<string, string> = {
    siliconflow_deepseek_flash: "SILICONFLOW_API_KEY",
    siliconflow_qwen: "SILICONFLOW_API_KEY",
    siliconflow_cosyvoice2: "SILICONFLOW_API_KEY",
    sadtalker_low: "REPLICATE_API_TOKEN",
    musetalk_low: "REPLICATE_API_TOKEN",
    siliconflow_wan21_turbo: "SILICONFLOW_API_KEY",
    manual: "NEURAMARK_MANUAL_FALLBACK",
    heygen_high: "HEYGEN_API_KEY",
    ltx_broll_high: "FAL_API_KEY",
    elevenlabs_tts_high: "ELEVENLABS_API_KEY",
  };

  return providerCatalogRowSchema.parse({
    key,
    assetRole,
    tier,
    active,
    capabilities,
    costModel: { ...defaults[key], ...costModelOverrides },
    envKeyName: envKeys[key],
  });
}

/** Full V1 seed catalog in SQL ORDER BY asset_role, tier, key. */
function buildSeedCatalog(): ProviderCatalogRow[] {
  return [
    row("siliconflow_wan21_turbo", "broll", "low", true),
    row("ltx_broll_high", "broll", "high", false),
    row("siliconflow_deepseek_flash", "llm", "low", true),
    row("siliconflow_qwen", "llm", "low", true),
    row("siliconflow_cosyvoice2", "tts", "low", true),
    row("elevenlabs_tts_high", "tts", "high", false),
    row("manual", "talking_head", "low", true, { manualFallback: true }),
    row("musetalk_low", "talking_head", "low", true, {
      prefersReferenceLoop: true,
    }),
    row("sadtalker_low", "talking_head", "low", true),
    row("heygen_high", "talking_head", "high", false),
  ];
}

describe("migrations (US-X.4)", () => {
  const catalogMigration = readFileSync(
    path.join(
      repoRoot,
      "supabase/migrations/20260829260000_neuramark_provider_catalog.sql",
    ),
    "utf8",
  );
  const costPolicyMigration = readFileSync(
    path.join(
      repoRoot,
      "supabase/migrations/20260829260100_neuramark_cost_policies.sql",
    ),
    "utf8",
  );
  const providerDecisionsMigration = readFileSync(
    path.join(
      repoRoot,
      "supabase/migrations/20260830510300_neuramark_provider_decisions.sql",
    ),
    "utf8",
  );

  it("catalog migration defines neuramark_provider_catalog with RLS and seed keys", () => {
    assert.match(catalogMigration, /neuramark_provider_catalog/);
    assert.match(catalogMigration, /ENABLE ROW LEVEL SECURITY/);
    assert.equal(/CREATE POLICY/i.test(catalogMigration), false);

    for (const key of V1_CATALOG_SEED_KEYS) {
      assert.match(catalogMigration, new RegExp(`'${key}'`));
    }

    assert.match(catalogMigration, /prefersReferenceLoop/);
    assert.match(catalogMigration, /manualFallback/);
  });

  it("cost policy migration defines global default with partial unique index", () => {
    assert.match(costPolicyMigration, /neuramark_cost_policies/);
    assert.match(costPolicyMigration, /ENABLE ROW LEVEL SECURITY/);
    assert.equal(/CREATE POLICY/i.test(costPolicyMigration), false);
    assert.match(
      costPolicyMigration,
      /neuramark_cost_policies_one_global_default_idx/,
    );
    assert.match(costPolicyMigration, /\n  150,\n/);
    assert.match(costPolicyMigration, /'low'/);
  });

  it("provider decisions migration defines append-only neuramark_provider_decisions", () => {
    assert.match(providerDecisionsMigration, /neuramark_provider_decisions/);
    assert.match(providerDecisionsMigration, /rationale_key/);
    assert.match(
      providerDecisionsMigration,
      /neuramark_provider_decisions_reel_script_id_idx/,
    );
    assert.match(providerDecisionsMigration, /ENABLE ROW LEVEL SECURITY/);
    assert.equal(/CREATE POLICY/i.test(providerDecisionsMigration), false);
  });

  it("seed SQL contains no secret-shaped strings", () => {
    const catalogSeed = catalogMigration.split("INSERT INTO")[1] ?? "";
    const combinedSeed = catalogSeed + costPolicyMigration;
    assert.equal(combinedSeed.includes("sk-"), false);
    assert.equal(combinedSeed.includes("Bearer"), false);
    assert.equal(combinedSeed.includes("NEXT_PUBLIC_"), false);
  });
});

describe("DEFAULT_LOW_TIER_PROVIDER_KEYS", () => {
  it("includes llmFallback and matches active low seed keys", () => {
    assert.equal(
      DEFAULT_LOW_TIER_PROVIDER_KEYS.llmFallback,
      "siliconflow_qwen",
    );
    assert.equal(
      DEFAULT_LOW_TIER_PROVIDER_KEYS.llm,
      "siliconflow_deepseek_flash",
    );
    assert.equal(DEFAULT_LOW_TIER_PROVIDER_KEYS.manual, "manual");
  });
});

describe("envKeyNameSchema", () => {
  it("accepts UPPER_SNAKE_CASE env var names", () => {
    assert.equal(
      envKeyNameSchema.safeParse("SILICONFLOW_API_KEY").success,
      true,
    );
  });

  it("rejects NEXT_PUBLIC_ prefix", () => {
    assert.equal(
      envKeyNameSchema.safeParse("NEXT_PUBLIC_FOO").success,
      false,
    );
  });
});

describe("mapProviderCatalogRows", () => {
  it("maps snake_case DB rows to validated camelCase DTOs", () => {
    const result = mapProviderCatalogRows({
      rows: [
        {
          key: "siliconflow_deepseek_flash",
          asset_role: "llm",
          tier: "low",
          active: true,
          capabilities: {},
          cost_model: {
            billingUnit: "per_1m_tokens",
            unitCostCents: 14,
          },
          env_key_name: "SILICONFLOW_API_KEY",
        },
      ],
      error: null,
    });

    assert.equal(providerCatalogSuccessSchema.safeParse(result).success, true);
    assert.equal(result.providers[0]?.key, "siliconflow_deepseek_flash");
    assert.equal(result.providers[0]?.assetRole, "llm");
    assert.equal(result.providers[0]?.envKeyName, "SILICONFLOW_API_KEY");
  });

  it("skips corrupt rows and returns valid rows", () => {
    const result = mapProviderCatalogRows({
      rows: [
        {
          key: "bad_row",
          asset_role: "llm",
          tier: "low",
          active: true,
          capabilities: {},
          cost_model: { billingUnit: "invalid_unit", unitCostCents: 1 },
          env_key_name: "SILICONFLOW_API_KEY",
        },
        {
          key: "siliconflow_qwen",
          asset_role: "llm",
          tier: "low",
          active: true,
          capabilities: {},
          cost_model: {
            billingUnit: "per_1m_tokens",
            unitCostCents: 18,
          },
          env_key_name: "SILICONFLOW_API_KEY",
        },
      ],
      error: null,
    });

    assert.equal(result.providers.length, 1);
    assert.equal(result.providers[0]?.key, "siliconflow_qwen");
    assert.equal("loadFailed" in result, false);
  });

  it("returns loadFailed when all rows invalid", () => {
    const result = mapProviderCatalogRows({
      rows: [
        {
          key: "bad",
          asset_role: "nope",
          tier: "low",
          active: true,
          capabilities: {},
          cost_model: { billingUnit: "per_run", unitCostCents: 0 },
          env_key_name: "LOWERCASE",
        },
      ],
      error: null,
    });

    assert.equal(providerCatalogLoadFailedSchema.safeParse(result).success, true);
  });
});

describe("resolveProvider (US-X.4)", () => {
  const catalog = buildSeedCatalog();

  it("resolves LLM default variant to siliconflow_deepseek_flash", () => {
    const { resolveProvider } = loadProviderAdapters();
    const resolved = resolveProvider(catalog, {
      assetRole: "llm",
      tier: "low",
    });
    assert.equal(resolved.key, DEFAULT_LOW_TIER_PROVIDER_KEYS.llm);
  });

  it("resolves LLM fallback variant to siliconflow_qwen", () => {
    const { resolveProvider } = loadProviderAdapters();
    const resolved = resolveProvider(catalog, {
      assetRole: "llm",
      tier: "low",
      llmVariant: "fallback",
    });
    assert.equal(resolved.key, DEFAULT_LOW_TIER_PROVIDER_KEYS.llmFallback);
  });

  it("LLM without variant matches default", () => {
    const { resolveProvider } = loadProviderAdapters();
    const withVariant = resolveProvider(catalog, {
      assetRole: "llm",
      tier: "low",
      llmVariant: "default",
    });
    const withoutVariant = resolveProvider(catalog, {
      assetRole: "llm",
      tier: "low",
    });
    assert.equal(withVariant.key, withoutVariant.key);
  });

  it("resolves talking_head default to sadtalker_low", () => {
    const { resolveProvider } = loadProviderAdapters();
    const resolved = resolveProvider(catalog, {
      assetRole: "talking_head",
      tier: "low",
    });
    assert.equal(resolved.key, DEFAULT_LOW_TIER_PROVIDER_KEYS.talkingHead);
    assert.notEqual(resolved.key, DEFAULT_LOW_TIER_PROVIDER_KEYS.manual);
  });

  it("prefers musetalk_low when hasReferenceLoop is true", () => {
    const { resolveProvider } = loadProviderAdapters();
    const resolved = resolveProvider(catalog, {
      assetRole: "talking_head",
      tier: "low",
      hasReferenceLoop: true,
    });
    assert.equal(resolved.key, DEFAULT_LOW_TIER_PROVIDER_KEYS.talkingHeadLoop);
  });

  it("throws PROVIDER_NOT_FOUND for inactive high-tier rows", () => {
    const { resolveProvider, ProviderResolveError } = loadProviderAdapters();
    for (const assetRole of ["talking_head", "broll", "tts"] as const) {
      assert.throws(
        () => resolveProvider(catalog, { assetRole, tier: "high" }),
        (err: unknown) => {
          assert.ok(err instanceof ProviderResolveError);
          assert.equal(err.code, PROVIDER_NOT_FOUND);
          return true;
        },
      );
    }
  });

  it("excludes manual from auto path unless allowManualFallback", () => {
    const { resolveProvider } = loadProviderAdapters();
    const auto = resolveProvider(catalog, {
      assetRole: "talking_head",
      tier: "low",
    });
    assert.notEqual(auto.key, "manual");

    const manual = resolveProvider(catalog, {
      assetRole: "talking_head",
      tier: "low",
      allowManualFallback: true,
    });
    assert.equal(manual.key, "manual");
    assert.equal(manual.costModel.unitCostCents, 0);
  });

  it("rankCatalogCandidatesByCost picks cheapest active row", () => {
    const { rankCatalogCandidatesByCost } = withServerOnlyStub(() =>
      require("./rank-catalog-candidates-by-cost.ts"),
    );
    const cheaper = row("siliconflow_cosyvoice2", "tts", "low", true, {}, {
      unitCostCents: 1,
    });
    const pricier = row("siliconflow_wan21_turbo", "broll", "low", true, {}, {
      unitCostCents: 99,
    });
    const ranked = rankCatalogCandidatesByCost([pricier, cheaper]);
    assert.equal(ranked[0]?.key, "siliconflow_cosyvoice2");
  });

  it("resolveProvider picks cheapest talking_head when no loop preference", () => {
    const { resolveProvider } = loadProviderAdapters();
    const resolved = resolveProvider(catalog, {
      assetRole: "talking_head",
      tier: "low",
      hasReferenceLoop: false,
    });
    assert.equal(resolved.key, DEFAULT_LOW_TIER_PROVIDER_KEYS.talkingHead);
  });

  it("getCatalogRowByKey finds row by key", () => {
    const { getCatalogRowByKey } = loadProviderAdapters();
    const found = getCatalogRowByKey(catalog, "siliconflow_qwen");
    assert.equal(found?.key, "siliconflow_qwen");
  });
});

describe("provider-adapters module boundary", () => {
  it("includes import server-only", () => {
    const source = readFileSync(
      path.join(__dirname, "provider-adapters.ts"),
      "utf8",
    );
    assert.match(source, /import ["']server-only["']/);
  });
});

describe("getProviderCatalog module (server-only)", () => {
  it("file includes import server-only and MUST-import comment", () => {
    const source = readFileSync(
      path.join(__dirname, "get-provider-catalog.ts"),
      "utf8",
    );
    assert.match(source, /import ["']server-only["']/);
    assert.match(source, /MUST import this helper only/i);
    assert.match(source, /cache\(/);
  });

  it("returns loadFailed when Supabase unconfigured", async () => {
    const nodeModule = Module as unknown as NodeModuleLoad;
    const originalLoad = nodeModule._load.bind(nodeModule);

    nodeModule._load = function (request, parent, isMain) {
      if (request === "server-only") return {};
      if (request === "react") {
        return { cache: (fn: (...args: unknown[]) => unknown) => fn };
      }
      if (
        request === "@/lib/supabase/server" ||
        String(request).includes("lib/supabase/server")
      ) {
        return {
          isSupabaseConfigured: () => false,
          createServerSupabaseClient: () => {
            throw new Error("should not be called");
          },
        };
      }
      return originalLoad(request, parent, isMain);
    };

    try {
      clearProviderModuleCache();
      const { getProviderCatalog } = await import(
        `./get-provider-catalog.ts?unconfigured=${Date.now()}`
      );
      const result = await getProviderCatalog();
      assert.equal(
        providerCatalogLoadFailedSchema.safeParse(result).success,
        true,
      );
    } finally {
      nodeModule._load = originalLoad;
      clearProviderModuleCache();
    }
  });

  it("happy load returns 10 Zod-valid rows", async () => {
    const nodeModule = Module as unknown as NodeModuleLoad;
    const originalLoad = nodeModule._load.bind(nodeModule);

      nodeModule._load = function (request, parent, isMain) {
        if (request === "server-only") return {};
        if (request === "react") {
          return { cache: (fn: (...args: unknown[]) => unknown) => fn };
        }
        if (
          request === "@/lib/supabase/server" ||
          String(request).includes("lib/supabase/server")
        ) {
          return {
            isSupabaseConfigured: () => true,
            createServerSupabaseClient: () => ({
              from(table: string) {
                assert.equal(table, "neuramark_provider_catalog");
                const builder: Record<string, unknown> = {};
                const self = () => builder;
                builder.select = self;
                builder.order = self;
                builder.then = undefined;
                const terminal = async () => ({
                  data: buildSeedCatalog().map((p) => ({
                    key: p.key,
                    asset_role: p.assetRole,
                    tier: p.tier,
                    active: p.active,
                    capabilities: p.capabilities,
                    cost_model: p.costModel,
                    env_key_name: p.envKeyName,
                  })),
                  error: null,
                });
                builder.order = () => ({
                  order: () => ({
                    order: terminal,
                  }),
                });
                return builder;
              },
            }),
          };
        }
        return originalLoad(request, parent, isMain);
      };

      try {
        clearProviderModuleCache();
        const { getProviderCatalog } = await import(
          `./get-provider-catalog.ts?happy=${Date.now()}`
        );
        const result = await getProviderCatalog();
        assert.equal(
          providerCatalogSuccessSchema.safeParse(result).success,
          true,
        );
        assert.equal(result.providers.length, 10);
        for (const provider of result.providers) {
          assert.equal(providerCatalogRowSchema.safeParse(provider).success, true);
        }
      } finally {
        nodeModule._load = originalLoad;
        clearProviderModuleCache();
      }
  });
});

describe("getDefaultCostPolicy module (server-only)", () => {
  it("file includes import server-only", () => {
    const source = readFileSync(
      path.join(__dirname, "get-default-cost-policy.ts"),
      "utf8",
    );
    assert.match(source, /import ["']server-only["']/);
    assert.match(source, /cache\(/);
  });

  it("returns global default tier low and maxCostCents 150", async () => {
    const nodeModule = Module as unknown as NodeModuleLoad;
    const originalLoad = nodeModule._load.bind(nodeModule);

      nodeModule._load = function (request, parent, isMain) {
        if (request === "server-only") return {};
        if (request === "react") {
          return { cache: (fn: (...args: unknown[]) => unknown) => fn };
        }
        if (
          request === "@/lib/supabase/server" ||
          String(request).includes("lib/supabase/server")
        ) {
          return {
            isSupabaseConfigured: () => true,
            createServerSupabaseClient: () => ({
              from(table: string) {
                assert.equal(table, "neuramark_cost_policies");
                const builder: Record<string, unknown> = {};
                const self = () => builder;
                builder.select = self;
                builder.is = self;
                builder.limit = () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: "00000000-0000-4000-8000-000000000001",
                      client_id: null,
                      provider_tier: "low",
                      max_cost_cents: 150,
                      rules: null,
                      created_at: "2026-08-29T00:00:00.000Z",
                      updated_at: "2026-08-29T00:00:00.000Z",
                    },
                    error: null,
                  }),
                });
                return builder;
              },
            }),
          };
        }
        return originalLoad(request, parent, isMain);
      };

      try {
        clearProviderModuleCache();
        const { getDefaultCostPolicy } = await import(
          `./get-default-cost-policy.ts?happy=${Date.now()}`
        );
        const result = await getDefaultCostPolicy();
        assert.equal(
          defaultCostPolicySuccessSchema.safeParse(result).success,
          true,
        );
        if ("policy" in result && result.policy) {
          assert.equal(result.policy.providerTier, "low");
          assert.equal(result.policy.maxCostCents, 150);
          assert.equal(result.policy.clientId, null);
        }
      } finally {
        nodeModule._load = originalLoad;
        clearProviderModuleCache();
      }
  });

  it("returns loadFailed when global policy missing", async () => {
    const nodeModule = Module as unknown as NodeModuleLoad;
    const originalLoad = nodeModule._load.bind(nodeModule);

      nodeModule._load = function (request, parent, isMain) {
        if (request === "server-only") return {};
        if (request === "react") {
          return { cache: (fn: (...args: unknown[]) => unknown) => fn };
        }
        if (
          request === "@/lib/supabase/server" ||
          String(request).includes("lib/supabase/server")
        ) {
          return {
            isSupabaseConfigured: () => true,
            createServerSupabaseClient: () => ({
              from: () => ({
                select: () => ({
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
        clearProviderModuleCache();
        const { getDefaultCostPolicy } = await import(
          `./get-default-cost-policy.ts?missing=${Date.now()}`
        );
        const result = await getDefaultCostPolicy();
        assert.equal(
          defaultCostPolicyLoadFailedSchema.safeParse(result).success,
          true,
        );
      } finally {
        nodeModule._load = originalLoad;
        clearProviderModuleCache();
      }
  });
});

describe("HTTP surface (US-X.4)", () => {
  it("does not introduce a public provider-catalog Route Handler", () => {
    assert.equal(
      existsSync(path.join(repoRoot, "app/api/provider-catalog")),
      false,
    );
    assert.equal(isPublicPath("/api/provider-catalog"), false);
  });
});

describe("providerCostModelSchema", () => {
  it("rejects invalid billingUnit", () => {
    const parsed = providerCostModelSchema.safeParse({
      billingUnit: "per_gigabyte",
      unitCostCents: 1,
    });
    assert.equal(parsed.success, false);
  });
});
