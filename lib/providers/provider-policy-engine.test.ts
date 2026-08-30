/**
 * US-7.2 Provider policy engine — ranking, routing, forbidden keys.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Module from "node:module";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { FORBIDDEN_PROVIDER_AUTHORITY_KEYS } from "../contracts/provider-decisions";
import {
  providerRationaleKeySchema,
  DEFAULT_LOW_TIER_PROVIDER_KEYS,
  providerCatalogRowSchema,
  type ProviderCatalogRow,
} from "../contracts/providers";
import { findForbiddenReelCaptionKeys } from "../reel-captions/find-forbidden-keys";
import { findForbiddenReelScriptKeys } from "../reel-scripts/find-forbidden-keys";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

type NodeModuleLoad = {
  _load: (
    request: string,
    parent: NodeModule | null | undefined,
    isMain: boolean,
  ) => unknown;
};

function withServerOnlyStub<T>(run: () => T): T {
  const nodeModule = Module as unknown as NodeModuleLoad;
  const originalLoad = nodeModule._load.bind(nodeModule);
  nodeModule._load = function (request, parent, isMain) {
    if (request === "server-only") return {};
    if (request === "react") {
      return { cache: (fn: (...args: unknown[]) => unknown) => fn };
    }
    return originalLoad(request, parent, isMain);
  };
  try {
    return run();
  } finally {
    nodeModule._load = originalLoad;
  }
}

function row(
  key: string,
  assetRole: ProviderCatalogRow["assetRole"],
  tier: ProviderCatalogRow["tier"],
  unitCostCents: number,
  capabilities: Record<string, unknown> = {},
): ProviderCatalogRow {
  const billingByRole: Record<string, ProviderCatalogRow["costModel"]> = {
    llm: { billingUnit: "per_1m_tokens", unitCostCents },
    tts: { billingUnit: "per_1m_chars", unitCostCents },
    talking_head: { billingUnit: "per_run", unitCostCents },
    broll: { billingUnit: "per_clip", unitCostCents },
  };

  return providerCatalogRowSchema.parse({
    key,
    assetRole,
    tier,
    active: true,
    capabilities,
    costModel: billingByRole[assetRole],
    envKeyName: "SILICONFLOW_API_KEY",
  });
}

describe("rankCatalogCandidatesByCost (US-7.2)", () => {
  it("sorts by unitCostCents ascending with lexicographic key tie-break", () => {
    const { rankCatalogCandidatesByCost } = withServerOnlyStub(() =>
      require("./rank-catalog-candidates-by-cost.ts"),
    );
    const cheap = row("alpha_talking", "talking_head", "low", 5);
    const mid = row("beta_talking", "talking_head", "low", 10);
    const ranked = rankCatalogCandidatesByCost([mid, cheap]);
    assert.equal(ranked[0]?.key, "alpha_talking");
    assert.equal(ranked[1]?.key, "beta_talking");
  });

  it("resolveProvider picks cheapest among non-loop talking_head candidates", () => {
    const { resolveProvider } = withServerOnlyStub(() =>
      require("./provider-adapters.ts"),
    );

    const sadtalker = row("sadtalker_low", "talking_head", "low", 10);
    const expensive = row("expensive_head", "talking_head", "low", 25);
    const musetalk = row("musetalk_low", "talking_head", "low", 19, {
      prefersReferenceLoop: true,
    });

    const resolved = resolveProvider([expensive, sadtalker, musetalk], {
      assetRole: "talking_head",
      tier: "low",
      hasReferenceLoop: false,
    });

    assert.equal(resolved.key, "sadtalker_low");
    assert.notEqual(resolved.key, "heygen_high");
  });

  it("prefers musetalk when hasReferenceLoop and loop row is cheapest loop candidate", () => {
    const { resolveProvider } = withServerOnlyStub(() =>
      require("./provider-adapters.ts"),
    );

    const sadtalker = row("sadtalker_low", "talking_head", "low", 10);
    const musetalk = row("musetalk_low", "talking_head", "low", 19, {
      prefersReferenceLoop: true,
    });

    const resolved = resolveProvider([sadtalker, musetalk], {
      assetRole: "talking_head",
      tier: "low",
      hasReferenceLoop: true,
    });

    assert.equal(resolved.key, DEFAULT_LOW_TIER_PROVIDER_KEYS.talkingHeadLoop);
  });
});

describe("resolveProviderForJob routing (US-7.2)", () => {
  it("rejects talking_head when production path is faceless", async () => {
    const nodeModule = Module as unknown as NodeModuleLoad;
    const originalLoad = nodeModule._load.bind(nodeModule);

    nodeModule._load = function (request, parent, isMain) {
      if (request === "server-only") return {};
      if (request === "react") {
        return { cache: (fn: (...args: unknown[]) => unknown) => fn };
      }
      if (String(request).includes("get-cost-policy-for-client")) {
        return {
          getCostPolicyForClient: async () => ({
            ok: true,
            policy: {
              id: "00000000-0000-4000-8000-000000000001",
              clientId: null,
              providerTier: "low",
              maxCostCents: 150,
              rules: null,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          }),
        };
      }
      if (String(request).includes("get-provider-catalog")) {
        return {
          getProviderCatalog: async () => ({
            providers: [
              row("sadtalker_low", "talking_head", "low", 10),
              row("siliconflow_wan21_turbo", "broll", "low", 21),
            ],
          }),
        };
      }
      return originalLoad(request, parent, isMain);
    };

    try {
      const { resolveProviderForJob } = await import(
        `./resolve-provider-for-job.ts?faceless=${Date.now()}`
      );
      const result = await resolveProviderForJob({
        clientId: "22222222-2222-4222-8222-222222222222",
        assetRole: "talking_head",
        productionContext: {
          visualMode: "faceless",
          modalidad: "faceless",
          hasReferenceLoop: false,
          needsBroll: true,
          targetDurationSec: 30,
          brollClipCount: 1,
        },
      });
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.code, "PROVIDER_UNAVAILABLE");
      }
    } finally {
      nodeModule._load = originalLoad;
    }
  });

  it("at low tier never returns inactive high-tier keys for LLM fallback", async () => {
    const nodeModule = Module as unknown as NodeModuleLoad;
    const originalLoad = nodeModule._load.bind(nodeModule);

    nodeModule._load = function (request, parent, isMain) {
      if (request === "server-only") return {};
      if (request === "react") {
        return { cache: (fn: (...args: unknown[]) => unknown) => fn };
      }
      if (String(request).includes("get-cost-policy-for-client")) {
        return {
          getCostPolicyForClient: async () => ({
            ok: true,
            policy: {
              id: "00000000-0000-4000-8000-000000000001",
              clientId: null,
              providerTier: "low",
              maxCostCents: 150,
              rules: null,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          }),
        };
      }
      if (String(request).includes("get-provider-catalog")) {
        return {
          getProviderCatalog: async () => ({
            providers: [
              row("siliconflow_deepseek_flash", "llm", "low", 14),
              row("siliconflow_qwen", "llm", "low", 18),
              row("heygen_high", "talking_head", "high", 7),
            ],
          }),
        };
      }
      if (String(request).includes("siliconflow-llm-adapter")) {
        return {
          createSiliconFlowLlmAdapter: () => ({
            providerKey: "siliconflow_qwen",
            estimateCost: async () => ({
              estimatedCostCents: 2,
              currency: "USD" as const,
              providerKey: "siliconflow_qwen",
            }),
          }),
        };
      }
      return originalLoad(request, parent, isMain);
    };

    try {
      const { resolveProviderForJob } = await import(
        `./resolve-provider-for-job.ts?llm=${Date.now()}`
      );
      const result = await resolveProviderForJob({
        clientId: "22222222-2222-4222-8222-222222222222",
        assetRole: "llm",
        llmVariant: "fallback",
      });
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.decision.providerKey, "siliconflow_qwen");
        assert.equal(result.decision.providerTier, "low");
        assert.equal(result.decision.rationaleKey, "llm_variant_fallback");
        assert.notEqual(result.decision.providerKey, "heygen_high");
      }
    } finally {
      nodeModule._load = originalLoad;
    }
  });
});

describe("forbidden provider authority keys (US-7.2)", () => {
  it("rejects providerKey on script generate input", () => {
    const keys = findForbiddenReelScriptKeys({
      weekStart: "2026-01-05",
      providerKey: "heygen_high",
    });
    assert.ok(keys.includes("providerKey"));
  });

  it("rejects tier-only smuggle on caption generate input", () => {
    const keys = findForbiddenReelCaptionKeys({
      weekStart: "2026-01-05",
      tier: "high",
    });
    assert.ok(keys.includes("tier"));
  });

  it("FORBIDDEN_PROVIDER_AUTHORITY_KEYS covers catalog smuggle keys", () => {
    assert.ok(FORBIDDEN_PROVIDER_AUTHORITY_KEYS.includes("costModel"));
    assert.ok(FORBIDDEN_PROVIDER_AUTHORITY_KEYS.includes("hasReferenceLoop"));
    assert.ok(FORBIDDEN_PROVIDER_AUTHORITY_KEYS.includes("modalidad"));
  });
});

describe("neuramark_provider_decisions migration (US-7.2)", () => {
  const migration = readFileSync(
    path.join(
      repoRoot,
      "supabase/migrations/20260830510300_neuramark_provider_decisions.sql",
    ),
    "utf8",
  );

  it("defines append-only table with rationale_key and RLS deny-by-default", () => {
    assert.match(migration, /neuramark_provider_decisions/);
    assert.match(migration, /rationale_key/);
    assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
    assert.equal(/CREATE POLICY/i.test(migration), false);
    assert.doesNotMatch(migration, /cost_model/);
    assert.doesNotMatch(migration, /env_key_name/);
  });
});
