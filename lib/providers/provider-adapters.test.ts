/**
 * US-8.1 Provider adapter interface, registry, and response normalizers.
 */
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import Module from "node:module";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  EXTERNAL_JOB_ID_MAX_LENGTH,
  PROVIDER_ADAPTER_NOT_FOUND,
  externalJobIdSchema,
  persistedVideoJobStatusSchema,
  providerCatalogRowSchema,
  videoJobStatusResultSchema,
  type ProviderCatalogRow,
} from "../contracts/providers";

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
      normalized.includes("/lib/providers/create-provider-registry") ||
      normalized.includes("/lib/providers/provider-adapters") ||
      normalized.includes("/lib/providers/normalize-provider-response") ||
      normalized.includes("/lib/providers/video/")
    ) {
      delete require.cache[key];
    }
  }
}

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
    clearProviderModuleCache();
    return run();
  } finally {
    nodeModule._load = originalLoad;
    clearProviderModuleCache();
  }
}

function loadRegistryModule() {
  return withServerOnlyStub(() => require("./create-provider-registry.ts"));
}

function loadNormalizeModule() {
  return withServerOnlyStub(() => require("./normalize-provider-response.ts"));
}

function loadProviderAdapters() {
  return withServerOnlyStub(() => require("./provider-adapters.ts"));
}

function row(
  key: string,
  assetRole: ProviderCatalogRow["assetRole"],
  tier: ProviderCatalogRow["tier"],
  active: boolean,
  costModelOverrides: Partial<ProviderCatalogRow["costModel"]> = {},
): ProviderCatalogRow {
  const defaults: Record<string, ProviderCatalogRow["costModel"]> = {
    sadtalker_low: { billingUnit: "per_run", unitCostCents: 10 },
    siliconflow_wan21_turbo: { billingUnit: "per_clip", unitCostCents: 21 },
    heygen_high: { billingUnit: "per_second", unitCostCents: 7 },
  };
  const envKeys: Record<string, string> = {
    sadtalker_low: "REPLICATE_API_TOKEN",
    siliconflow_wan21_turbo: "SILICONFLOW_API_KEY",
    heygen_high: "HEYGEN_API_KEY",
  };

  return providerCatalogRowSchema.parse({
    key,
    assetRole,
    tier,
    active,
    capabilities: {},
    costModel: { ...defaults[key], ...costModelOverrides },
    envKeyName: envKeys[key],
  });
}

function buildStubCatalog(): ProviderCatalogRow[] {
  return [
    row("sadtalker_low", "talking_head", "low", true),
    row("siliconflow_wan21_turbo", "broll", "low", true),
    row("heygen_high", "talking_head", "high", false),
  ];
}

describe("US-8.1 provider registry", () => {
  it("1 — registry singleton returns same instance", () => {
    const {
      getProviderRegistry,
      resetProviderRegistryForTests,
    } = loadRegistryModule();

    resetProviderRegistryForTests();
    const first = getProviderRegistry();
    const second = getProviderRegistry();
    assert.equal(first, second);
  });

  it("2 — stub registration exposes four video adapter methods", () => {
    const { getProviderRegistry, resetProviderRegistryForTests } =
      loadRegistryModule();
    resetProviderRegistryForTests();

    const adapter = getProviderRegistry().getVideoAdapter("sadtalker_low");
    assert.equal(typeof adapter.estimateCost, "function");
    assert.equal(typeof adapter.createJob, "function");
    assert.equal(typeof adapter.getJobStatus, "function");
    assert.equal(typeof adapter.fetchAsset, "function");
    assert.equal(adapter.videoAssetRole, "primary");
  });

  it("3 — missing adapter throws ProviderAdapterNotFoundError", () => {
    const {
      getProviderRegistry,
      resetProviderRegistryForTests,
    } = loadRegistryModule();
    resetProviderRegistryForTests();

    assert.throws(
      () => getProviderRegistry().getVideoAdapter("unknown_key"),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal(err.name, "ProviderAdapterNotFoundError");
        assert.equal(
          (err as { code?: string; providerKey?: string }).code,
          PROVIDER_ADAPTER_NOT_FOUND,
        );
        assert.equal(
          (err as { providerKey?: string }).providerKey,
          "unknown_key",
        );
        return true;
      },
    );
  });

  it("4 — registerVideo after freeze throws RegistryFrozenError", () => {
    const {
      createProviderRegistry,
      getProviderRegistry,
      resetProviderRegistryForTests,
    } = loadRegistryModule();
    resetProviderRegistryForTests();

    const registry = getProviderRegistry();
    assert.throws(
      () =>
        registry.registerVideo({
          providerKey: "extra",
          videoAssetRole: "primary",
          estimateCost: async () => ({
            estimatedCostCents: 1,
            currency: "USD",
            providerKey: "extra",
          }),
          createJob: async () => ({
            externalJobId: "stub-extra-id",
            status: "queued",
            estimatedCostCents: 1,
          }),
          getJobStatus: async () => ({ status: "completed" }),
          fetchAsset: async () => ({
            storageKey: "stub/extra.mp4",
            mimeType: "video/mp4",
            sizeBytes: 1,
            actualCostCents: 1,
          }),
        }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal(err.name, "RegistryFrozenError");
        assert.equal((err as { code?: string }).code, "REGISTRY_FROZEN");
        return true;
      },
    );

    const fresh = createProviderRegistry(buildStubCatalog());
    assert.throws(
      () => fresh.registerVideo(fresh.getVideoAdapter("sadtalker_low")),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal(err.name, "RegistryFrozenError");
        return true;
      },
    );
  });

  it("5 — stub round-trip createJob → getJobStatus → fetchAsset (wan stub)", async () => {
    const { getProviderRegistry, resetProviderRegistryForTests } =
      loadRegistryModule();
    const { VIDEO_JOB_STATUSES } = loadProviderAdapters();
    resetProviderRegistryForTests();

    const adapter = getProviderRegistry().getVideoAdapter(
      "siliconflow_wan21_turbo",
    );
    const input = {
      reelScriptId: "00000000-0000-4000-8000-000000000001",
      clientId: "00000000-0000-4000-8000-000000000002",
      providerKey: "siliconflow_wan21_turbo",
      providerTier: "low" as const,
      assetRole: "broll" as const,
      targetDurationSec: 30,
    };

    const created = await adapter.createJob(input);
    assert.equal(created.status, "queued");
    assert.match(created.externalJobId, /^stub-siliconflow_wan21_turbo-/);

    const status = await adapter.getJobStatus(created.externalJobId);
    assert.ok(VIDEO_JOB_STATUSES.includes(status.status));

    const asset = await adapter.fetchAsset(created.externalJobId);
    assert.match(asset.storageKey, /^stub\/siliconflow_wan21_turbo\//);
    assert.equal(asset.mimeType, "video/mp4");
  });

  it("5b — sadtalker registry adapter is real (no stub prefix)", async () => {
    const { getProviderRegistry, resetProviderRegistryForTests } =
      loadRegistryModule();
    resetProviderRegistryForTests();

    const adapter = getProviderRegistry().getVideoAdapter("sadtalker_low");
    assert.equal(adapter.providerKey, "sadtalker_low");
    assert.equal(adapter.videoAssetRole, "primary");

    const previousToken = process.env.REPLICATE_API_TOKEN;
    delete process.env.REPLICATE_API_TOKEN;

    try {
      await assert.rejects(
        () =>
          adapter.createJob({
            reelScriptId: "00000000-0000-4000-8000-000000000001",
            clientId: "00000000-0000-4000-8000-000000000002",
            providerKey: "sadtalker_low",
            providerTier: "low",
            assetRole: "primary",
            targetDurationSec: 30,
            portraitAssetId: "00000000-0000-4000-8000-000000000010",
            voiceoverAssetId: "00000000-0000-4000-8000-000000000011",
          }),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.equal((err as { code?: string }).code, "PROVIDER_CONFIG_MISSING");
          return true;
        },
      );
    } finally {
      if (previousToken === undefined) {
        delete process.env.REPLICATE_API_TOKEN;
      } else {
        process.env.REPLICATE_API_TOKEN = previousToken;
      }
    }
  });
});

describe("US-8.1 response normalization", () => {
  it("6 — externalJobIdSchema rejects traversal and invalid ids", () => {
    for (const invalid of ["", "../evil", "foo/bar", "foo\\bar", "a".repeat(513)]) {
      assert.equal(externalJobIdSchema.safeParse(invalid).success, false);
    }

    assert.equal(
      externalJobIdSchema.safeParse("stub-sadtalker_low-00000000-0000-4000-8000-000000000001")
        .success,
      true,
    );
    assert.equal(EXTERNAL_JOB_ID_MAX_LENGTH, 512);
  });

  it("7 — normalizeProviderJobStatus maps vendor strings", () => {
    const { normalizeProviderJobStatus } = loadNormalizeModule();
    assert.equal(normalizeProviderJobStatus("RUNNING"), "processing");
    assert.equal(normalizeProviderJobStatus("bogus"), "failed");
    assert.equal(normalizeProviderJobStatus(""), "failed");
  });

  it("8 — sanitizeProviderErrorMessage redacts secrets and empty fallback", () => {
    const { sanitizeProviderErrorMessage } = loadNormalizeModule();
    const redacted = sanitizeProviderErrorMessage("Bearer sk-test leaked");
    assert.equal(redacted.includes("Bearer"), false);
    assert.equal(redacted.includes("sk-test"), false);
    assert.equal(sanitizeProviderErrorMessage(""), "Provider request failed");
    assert.equal(sanitizeProviderErrorMessage(null), "Provider request failed");
  });

  it("9 — videoJobStatusResultSchema rejects invalid status and http urls", () => {
    assert.equal(
      videoJobStatusResultSchema.safeParse({ status: "not-a-status" }).success,
      false,
    );
    assert.equal(
      videoJobStatusResultSchema.safeParse({
        status: "completed",
        rawOutputUrl: "http://example.com/video.mp4",
      }).success,
      false,
    );
    assert.equal(
      videoJobStatusResultSchema.safeParse({
        status: "completed",
        rawOutputUrl: "https://cdn.example.com/video.mp4",
      }).success,
      true,
    );
  });

  it("10 — persistedVideoJobStatusSchema rejects rawOutputUrl key", () => {
    assert.equal(
      persistedVideoJobStatusSchema.safeParse({
        status: "completed",
        rawOutputUrl: "https://cdn.example.com/video.mp4",
      }).success,
      false,
    );
    assert.equal(
      persistedVideoJobStatusSchema.safeParse({ status: "completed" }).success,
      true,
    );
  });
});

describe("US-8.1 module boundaries", () => {
  it("11 — server-only imports on adapter and registry modules", () => {
    for (const file of ["provider-adapters.ts", "create-provider-registry.ts"]) {
      const source = readFileSync(path.join(__dirname, file), "utf8");
      assert.match(source, /import ["']server-only["']/);
    }
  });

  it("12 — registerVideo( appears only in create-provider-registry (+ tests)", () => {
    const output = execSync(
      `rg -l "registerVideo\\(" "${repoRoot}/lib" "${repoRoot}/app" || true`,
      { encoding: "utf8" },
    ).trim();

    const files = output.length > 0 ? output.split("\n").sort() : [];
    const allowed = new Set([
      path.join(repoRoot, "lib/providers/create-provider-registry.ts"),
      path.join(repoRoot, "lib/providers/provider-adapters.test.ts"),
      path.join(repoRoot, "lib/providers/provider-adapters.ts"),
    ]);

    for (const file of files) {
      assert.ok(
        allowed.has(file),
        `registerVideo( found in unexpected file: ${file}`,
      );
    }
  });

  it("13 — no vendor host strings outside lib/providers (except tests/plan)", () => {
    const patterns = ["replicate.com", "heygen.com", "api.heygen"];
    for (const pattern of patterns) {
      const output = execSync(
        `rg -l "${pattern}" "${repoRoot}" --glob '!plan/**' --glob '!**/*.test.ts' || true`,
        { encoding: "utf8" },
      ).trim();

      const files = output.length > 0 ? output.split("\n") : [];
      for (const file of files) {
        const normalized = file.replace(/\\/g, "/");
        if (normalized.endsWith("/lib/contracts/sadtalker-low.ts")) {
          continue;
        }
        assert.match(
          normalized,
          /lib\/providers\//,
          `${pattern} found outside lib/providers: ${file}`,
        );
      }
    }
  });
});

describe("US-8.1 estimateVideoJobCost integration", () => {
  it("14 — estimateVideoJobCost with stub registry returns estimate", async () => {
    const { estimateVideoJobCost } = loadProviderAdapters();
    const { createProviderRegistry } = loadRegistryModule();
    const catalog = buildStubCatalog();
    const registry = createProviderRegistry(catalog);

    const estimate = await estimateVideoJobCost(
      catalog,
      registry,
      { assetRole: "talking_head", tier: "low" },
      {
        reelScriptId: "00000000-0000-4000-8000-000000000003",
        clientId: "00000000-0000-4000-8000-000000000004",
        targetDurationSec: 30,
        assetRole: "primary",
      },
    );

    assert.equal(estimate.providerKey, "sadtalker_low");
    assert.equal(estimate.currency, "USD");
    assert.equal(estimate.estimatedCostCents, 10);
  });
});
