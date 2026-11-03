/**
 * AI Gateway Seedance B-roll adapter — mocked startVideo / getVideoStatus only.
 */
import assert from "node:assert/strict";
import Module from "node:module";
import { describe, it } from "node:test";

const CLIENT_ID = "22222222-2222-4222-8222-222222222222";
const REEL_SCRIPT_ID = "11111111-1111-4111-8111-111111111111";
const STILL_ASSET_ID = "55555555-5555-4555-8555-555555555555";
const API_KEY = "vercel_ai_gateway_test_key_abcdefghijklmnopqrstuvwxyz";

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
      normalized.includes("/lib/providers/video/ai-gateway-seedance") ||
      normalized.includes("/lib/providers/video/ai-gateway-video-shared") ||
      normalized.includes("/lib/providers/normalize-provider-response") ||
      normalized.includes("/lib/media/") ||
      normalized.includes("/lib/providers/create-provider-registry") ||
      normalized.includes("/lib/providers/provider-adapters")
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
    return originalLoad(request, parent, isMain);
  };
  try {
    clearModuleCache();
    return run();
  } finally {
    nodeModule._load = originalLoad;
    clearModuleCache();
  }
}

function loadAdapterModule() {
  return withServerOnlyStub(
    () =>
      require("./ai-gateway-seedance-broll-adapter.ts") as typeof import("./ai-gateway-seedance-broll-adapter"),
  );
}

function loadContracts() {
  return require("../../contracts/ai-gateway-video.ts") as typeof import("../../contracts/ai-gateway-video");
}

function loadProvidersContracts() {
  return require("../../contracts/providers.ts") as typeof import("../../contracts/providers");
}

function loadLtxContracts() {
  return require("../../contracts/ltx-broll-high.ts") as typeof import("../../contracts/ltx-broll-high");
}

function brollInput(providerKey: string) {
  return {
    reelScriptId: REEL_SCRIPT_ID,
    clientId: CLIENT_ID,
    providerKey,
    providerTier: "low" as const,
    assetRole: "broll" as const,
    targetDurationSec: 5,
    referenceImageAssetId: STILL_ASSET_ID,
    prompt: "A product close-up with soft camera push-in.",
    clipCount: 1,
  };
}

describe("AI Gateway Seedance B-roll adapter", () => {
  it("1 — createJob passes Seedance model + gateway fallbacks, then fetchAsset", async () => {
    const previous = process.env.AI_GATEWAY_API_KEY;
    process.env.AI_GATEWAY_API_KEY = API_KEY;

    try {
      const { createAiGatewaySeedanceBrollAdapter } = loadAdapterModule();
      const {
        AI_GATEWAY_SEEDANCE_BROLL_PROVIDER_KEY,
        AI_GATEWAY_SEEDANCE_BROLL_FALLBACK_MODELS,
      } = loadContracts();

      const operation = { type: "gateway-async-job", jobId: "job_seedance_1" };
      const videoBytes = Buffer.from("fake-mp4-bytes-seedance");
      let capturedModels: unknown;

      const startVideo = async (args: {
        providerOptions?: { gateway?: { models?: unknown } };
      }) => {
        capturedModels = args.providerOptions?.gateway?.models;
        return {
          operation,
          warnings: [],
          response: {
            timestamp: new Date(),
            modelId: "bytedance/seedance-v1.0-pro-fast",
          },
        };
      };

      const getVideoStatus = async () => ({
        status: "completed" as const,
        videos: [
          {
            type: "binary" as const,
            data: new Uint8Array(videoBytes),
            mediaType: "video/mp4",
          },
        ],
        warnings: [],
        response: {
          timestamp: new Date(),
          modelId: "bytedance/seedance-v1.0-pro-fast",
          headers: undefined,
        },
      });

      const adapter = createAiGatewaySeedanceBrollAdapter({
        defaultEstimateCents: 5,
        unitCostCentsPerClip: 5,
        resolveMediaAssetUrl: async (assetId) =>
          `https://example.com/still/${assetId}`,
        uploadGeneratedVideo: async ({ buffer }) => ({
          storageKey: `clients/${CLIENT_ID}/broll/${REEL_SCRIPT_ID}.mp4`,
          sizeBytes: buffer.byteLength,
        }),
        startVideo: startVideo as never,
        getVideoStatus: getVideoStatus as never,
      });

      assert.equal(adapter.providerKey, AI_GATEWAY_SEEDANCE_BROLL_PROVIDER_KEY);
      assert.equal(adapter.videoAssetRole, "broll");

      const created = await adapter.createJob(
        brollInput(AI_GATEWAY_SEEDANCE_BROLL_PROVIDER_KEY),
      );
      assert.equal(created.status, "queued");
      assert.deepEqual(capturedModels, [
        ...AI_GATEWAY_SEEDANCE_BROLL_FALLBACK_MODELS,
      ]);

      const status = await adapter.getJobStatus(created.externalJobId);
      assert.equal(status.status, "completed");

      const asset = await adapter.fetchAsset(created.externalJobId);
      assert.equal(asset.mimeType, "video/mp4");
      assert.equal(asset.sizeBytes, videoBytes.byteLength);
      assert.equal(asset.actualCostCents, 5);
    } finally {
      if (previous === undefined) delete process.env.AI_GATEWAY_API_KEY;
      else process.env.AI_GATEWAY_API_KEY = previous;
    }
  });

  it("2 — missing prompt rejected", async () => {
    const previous = process.env.AI_GATEWAY_API_KEY;
    process.env.AI_GATEWAY_API_KEY = API_KEY;
    try {
      const { createAiGatewaySeedanceBrollAdapter } = loadAdapterModule();
      const { AI_GATEWAY_SEEDANCE_BROLL_PROVIDER_KEY } = loadContracts();

      const adapter = createAiGatewaySeedanceBrollAdapter({
        defaultEstimateCents: 5,
        startVideo: (async () => {
          throw new Error("should not start");
        }) as never,
      });

      await assert.rejects(
        () =>
          adapter.createJob({
            ...brollInput(AI_GATEWAY_SEEDANCE_BROLL_PROVIDER_KEY),
            prompt: "   ",
          }),
        (error: unknown) =>
          error instanceof Error &&
          "code" in error &&
          (error as { code: string }).code === "INVALID_PROVIDER_INPUT",
      );
    } finally {
      if (previous === undefined) delete process.env.AI_GATEWAY_API_KEY;
      else process.env.AI_GATEWAY_API_KEY = previous;
    }
  });

  it("3 — isAllowedBrollProviderPair accepts seedance + low", () => {
    const { isAllowedBrollProviderPair } = loadLtxContracts();
    const { AI_GATEWAY_SEEDANCE_BROLL_PROVIDER_KEY } = loadContracts();
    assert.equal(
      isAllowedBrollProviderPair(AI_GATEWAY_SEEDANCE_BROLL_PROVIDER_KEY, "low"),
      true,
    );
    assert.equal(
      isAllowedBrollProviderPair(AI_GATEWAY_SEEDANCE_BROLL_PROVIDER_KEY, "high"),
      false,
    );
  });

  it("4 — resolveProvider prefers gateway seedance over wan when both active", () => {
    const { resolveProvider } = withServerOnlyStub(
      () =>
        require("../provider-adapters.ts") as typeof import("../provider-adapters"),
    );
    const { AI_GATEWAY_SEEDANCE_BROLL_PROVIDER_KEY } = loadContracts();
    const { providerCatalogRowSchema } = loadProvidersContracts();

    const catalog = [
      providerCatalogRowSchema.parse({
        key: "siliconflow_wan21_turbo",
        assetRole: "broll",
        tier: "low",
        active: true,
        capabilities: {},
        costModel: { billingUnit: "per_clip", unitCostCents: 21 },
        envKeyName: "SILICONFLOW_API_KEY",
      }),
      providerCatalogRowSchema.parse({
        key: AI_GATEWAY_SEEDANCE_BROLL_PROVIDER_KEY,
        assetRole: "broll",
        tier: "low",
        active: true,
        capabilities: {},
        costModel: { billingUnit: "per_clip", unitCostCents: 5 },
        envKeyName: "AI_GATEWAY_API_KEY",
      }),
    ];

    const resolved = resolveProvider(catalog, {
      assetRole: "broll",
      tier: "low",
    });
    assert.equal(resolved.key, AI_GATEWAY_SEEDANCE_BROLL_PROVIDER_KEY);
  });

  it("5 — pending status maps to processing", async () => {
    const previous = process.env.AI_GATEWAY_API_KEY;
    process.env.AI_GATEWAY_API_KEY = API_KEY;
    try {
      const { createAiGatewaySeedanceBrollAdapter } = loadAdapterModule();
      const { AI_GATEWAY_SEEDANCE_BROLL_PROVIDER_KEY } = loadContracts();
      const operation = { type: "gateway-async-job", jobId: "job_pending" };

      const adapter = createAiGatewaySeedanceBrollAdapter({
        defaultEstimateCents: 5,
        resolveMediaAssetUrl: async () => "https://example.com/still.jpg",
        startVideo: (async () => ({
          operation,
          warnings: [],
          response: { timestamp: new Date(), modelId: "x" },
        })) as never,
        getVideoStatus: (async () => ({
          status: "pending" as const,
          warnings: [],
          response: {
            timestamp: new Date(),
            modelId: "x",
            headers: undefined,
          },
        })) as never,
      });

      const created = await adapter.createJob(
        brollInput(AI_GATEWAY_SEEDANCE_BROLL_PROVIDER_KEY),
      );
      const status = await adapter.getJobStatus(created.externalJobId);
      assert.equal(status.status, "processing");
    } finally {
      if (previous === undefined) delete process.env.AI_GATEWAY_API_KEY;
      else process.env.AI_GATEWAY_API_KEY = previous;
    }
  });
});
