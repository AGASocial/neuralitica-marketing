/**
 * AI Gateway HeyGen avatar adapter — mocked startVideo / getVideoStatus only.
 */
import assert from "node:assert/strict";
import Module from "node:module";
import { describe, it } from "node:test";

const CLIENT_ID = "22222222-2222-4222-8222-222222222222";
const REEL_SCRIPT_ID = "11111111-1111-4111-8111-111111111111";
const PORTRAIT_ASSET_ID = "33333333-3333-4333-8333-333333333333";
const VOICEOVER_ASSET_ID = "44444444-4444-4444-8444-444444444444";
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
      normalized.includes("/lib/providers/video/ai-gateway-heygen-avatar") ||
      normalized.includes("/lib/providers/video/ai-gateway-video-shared") ||
      normalized.includes("/lib/providers/normalize-provider-response") ||
      normalized.includes("/lib/media/resolve-media-asset-url-for-provider") ||
      normalized.includes("/lib/media/upload-generated-video-buffer") ||
      normalized.includes("/lib/providers/create-provider-registry")
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
      require("./ai-gateway-heygen-avatar-adapter.ts") as typeof import("./ai-gateway-heygen-avatar-adapter"),
  );
}

function loadSharedModule() {
  return withServerOnlyStub(
    () =>
      require("./ai-gateway-video-shared.ts") as typeof import("./ai-gateway-video-shared"),
  );
}

function loadRegistryModule() {
  return withServerOnlyStub(
    () =>
      require("../create-provider-registry.ts") as typeof import("../create-provider-registry"),
  );
}

function loadContracts() {
  return require("../../contracts/ai-gateway-video.ts") as typeof import("../../contracts/ai-gateway-video");
}

function loadProvidersContracts() {
  return require("../../contracts/providers.ts") as typeof import("../../contracts/providers");
}

function ownAvatarInput(providerKey: string) {
  return {
    reelScriptId: REEL_SCRIPT_ID,
    clientId: CLIENT_ID,
    providerKey,
    providerTier: "high" as const,
    assetRole: "primary" as const,
    targetDurationSec: 8,
    portraitAssetId: PORTRAIT_ASSET_ID,
    voiceoverAssetId: VOICEOVER_ASSET_ID,
  };
}

describe("AI Gateway HeyGen avatar adapter", () => {
  it("1 — createJob → getJobStatus completed → fetchAsset round-trip", async () => {
    const previous = process.env.AI_GATEWAY_API_KEY;
    process.env.AI_GATEWAY_API_KEY = API_KEY;

    try {
      const { createAiGatewayHeygenAvatarAdapter } = loadAdapterModule();
      const { AI_GATEWAY_HEYGEN_AVATAR_PROVIDER_KEY } = loadContracts();
      const operation = { type: "gateway-async-job", jobId: "job_heygen_1" };
      const videoBytes = Buffer.from("fake-mp4-bytes-heygen");

      const startCapture: { args: Record<string, unknown> | undefined } = {
        args: undefined,
      };
      const startVideo = async (args: Record<string, unknown>) => {
        startCapture.args = args;
        return {
          operation,
          warnings: [],
          response: { timestamp: new Date(), modelId: "heygen/heygen-video-1" },
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
          modelId: "heygen/heygen-video-1",
          headers: undefined,
        },
      });

      const uploaded: { storageKey?: string; sizeBytes?: number } = {};
      const adapter = createAiGatewayHeygenAvatarAdapter({
        defaultEstimateCents: 8,
        unitCostCentsPerSecond: 1,
        resolveMediaAssetUrl: async (assetId, _clientId, kind) =>
          `https://example.com/${kind}/${assetId}`,
        uploadGeneratedVideo: async ({ buffer }) => {
          uploaded.storageKey = `clients/${CLIENT_ID}/generated/${REEL_SCRIPT_ID}.mp4`;
          uploaded.sizeBytes = buffer.byteLength;
          return {
            storageKey: uploaded.storageKey,
            sizeBytes: uploaded.sizeBytes,
          };
        },
        startVideo: startVideo as never,
        getVideoStatus: getVideoStatus as never,
      });

      assert.equal(adapter.providerKey, AI_GATEWAY_HEYGEN_AVATAR_PROVIDER_KEY);

      const created = await adapter.createJob(
        ownAvatarInput(AI_GATEWAY_HEYGEN_AVATAR_PROVIDER_KEY),
      );
      assert.equal(created.status, "queued");
      assert.ok(created.externalJobId.length > 0);
      assert.equal(created.estimatedCostCents, 8);

      assert.ok(startCapture.args);
      const startArgs = startCapture.args;
      assert.equal(startArgs.generateAudio, true);
      assert.equal(typeof startArgs.prompt, "string");
      assert.match(String(startArgs.prompt), /<Picture 1>/);
      assert.match(String(startArgs.prompt), /<Audio 1>/);
      const refs = startArgs.inputReferences as Array<{
        data: string;
        mediaType: string;
      }>;
      assert.equal(refs?.length, 2);
      assert.equal(
        refs?.[0]?.data,
        `https://example.com/portrait/${PORTRAIT_ASSET_ID}`,
      );
      assert.equal(refs?.[0]?.mediaType, "image/jpeg");
      assert.equal(
        refs?.[1]?.data,
        `https://example.com/audio/${VOICEOVER_ASSET_ID}`,
      );
      assert.equal(refs?.[1]?.mediaType, "audio/mpeg");
      const heygenOpts = (
        startArgs.providerOptions as {
          heygen: {
            mode: string;
            referenceAudio: Array<{ url: string }>;
            referenceImages: Array<{ url: string }>;
          };
        }
      ).heygen;
      assert.equal(heygenOpts.mode, "reference_to_video");
      assert.equal(
        heygenOpts.referenceAudio[0]?.url,
        `https://example.com/audio/${VOICEOVER_ASSET_ID}`,
      );
      assert.equal(
        heygenOpts.referenceImages[0]?.url,
        `https://example.com/portrait/${PORTRAIT_ASSET_ID}`,
      );

      const status = await adapter.getJobStatus(created.externalJobId);
      assert.equal(status.status, "completed");

      const asset = await adapter.fetchAsset(created.externalJobId);
      assert.equal(asset.storageKey, uploaded.storageKey);
      assert.equal(asset.sizeBytes, videoBytes.byteLength);
      assert.equal(asset.mimeType, "video/mp4");
    } finally {
      if (previous === undefined) delete process.env.AI_GATEWAY_API_KEY;
      else process.env.AI_GATEWAY_API_KEY = previous;
    }
  });

  it("2 — missing AI_GATEWAY_API_KEY → PROVIDER_CONFIG_MISSING", async () => {
    const previous = process.env.AI_GATEWAY_API_KEY;
    delete process.env.AI_GATEWAY_API_KEY;

    try {
      const { createAiGatewayHeygenAvatarAdapter } = loadAdapterModule();
      const { AI_GATEWAY_HEYGEN_AVATAR_PROVIDER_KEY } = loadContracts();

      const adapter = createAiGatewayHeygenAvatarAdapter({
        defaultEstimateCents: 8,
        resolveMediaAssetUrl: async () => "https://example.com/x",
        startVideo: (async () => {
          throw new Error("should not start");
        }) as never,
      });

      await assert.rejects(
        () =>
          adapter.createJob(
            ownAvatarInput(AI_GATEWAY_HEYGEN_AVATAR_PROVIDER_KEY),
          ),
        (error: unknown) =>
          error instanceof Error &&
          "code" in error &&
          (error as { code: string }).code === "PROVIDER_CONFIG_MISSING",
      );
    } finally {
      if (previous === undefined) delete process.env.AI_GATEWAY_API_KEY;
      else process.env.AI_GATEWAY_API_KEY = previous;
    }
  });

  it("3 — encode/decode round-trip for gateway operation id", () => {
    const { encodeGatewayVideoOperation, decodeGatewayVideoOperation } =
      loadSharedModule();
    const operation = { type: "gateway-async-job", jobId: "abc:123" };
    const encoded = encodeGatewayVideoOperation(operation);
    assert.match(encoded, /^[A-Za-z0-9_\-:.]+$/);
    assert.deepEqual(decodeGatewayVideoOperation(encoded), operation);
  });

  it("4 — registry registers ai_gateway_heygen_avatar from bootstrap catalog", () => {
    const previous = process.env.AI_GATEWAY_API_KEY;
    process.env.AI_GATEWAY_API_KEY = API_KEY;
    try {
      const { createProviderRegistry, resetProviderRegistryForTests } =
        loadRegistryModule();
      const { AI_GATEWAY_HEYGEN_AVATAR_PROVIDER_KEY } = loadContracts();
      const { providerCatalogRowSchema } = loadProvidersContracts();

      resetProviderRegistryForTests();
      const catalog = [
        providerCatalogRowSchema.parse({
          key: "sadtalker_low",
          assetRole: "talking_head",
          tier: "low",
          active: true,
          capabilities: {},
          costModel: { billingUnit: "per_run", unitCostCents: 10 },
          envKeyName: "REPLICATE_API_TOKEN",
        }),
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
          key: "heygen_high",
          assetRole: "talking_head",
          tier: "high",
          active: false,
          capabilities: {},
          costModel: { billingUnit: "per_second", unitCostCents: 2 },
          envKeyName: "HEYGEN_API_KEY",
        }),
        providerCatalogRowSchema.parse({
          key: AI_GATEWAY_HEYGEN_AVATAR_PROVIDER_KEY,
          assetRole: "talking_head",
          tier: "high",
          active: true,
          capabilities: {},
          costModel: {
            billingUnit: "per_second",
            unitCostCents: 1,
            metadata: { gatewayModel: "heygen/heygen-video-1" },
          },
          envKeyName: "AI_GATEWAY_API_KEY",
        }),
      ];

      const registry = createProviderRegistry(catalog);
      const adapter = registry.getVideoAdapter(
        AI_GATEWAY_HEYGEN_AVATAR_PROVIDER_KEY,
      );
      assert.equal(adapter.providerKey, AI_GATEWAY_HEYGEN_AVATAR_PROVIDER_KEY);
    } finally {
      if (previous === undefined) delete process.env.AI_GATEWAY_API_KEY;
      else process.env.AI_GATEWAY_API_KEY = previous;
    }
  });

  it("5 — resolveProvider prefers gateway heygen over heygen_high when both active", () => {
    const { resolveProvider } = withServerOnlyStub(
      () =>
        require("../provider-adapters.ts") as typeof import("../provider-adapters"),
    );
    const { AI_GATEWAY_HEYGEN_AVATAR_PROVIDER_KEY } = loadContracts();
    const { providerCatalogRowSchema } = loadProvidersContracts();

    const catalog = [
      providerCatalogRowSchema.parse({
        key: "heygen_high",
        assetRole: "talking_head",
        tier: "high",
        active: true,
        capabilities: {},
        costModel: { billingUnit: "per_second", unitCostCents: 2 },
        envKeyName: "HEYGEN_API_KEY",
      }),
      providerCatalogRowSchema.parse({
        key: AI_GATEWAY_HEYGEN_AVATAR_PROVIDER_KEY,
        assetRole: "talking_head",
        tier: "high",
        active: true,
        capabilities: {},
        costModel: { billingUnit: "per_second", unitCostCents: 1 },
        envKeyName: "AI_GATEWAY_API_KEY",
      }),
    ];

    const resolved = resolveProvider(catalog, {
      assetRole: "talking_head",
      tier: "high",
    });
    assert.equal(resolved.key, AI_GATEWAY_HEYGEN_AVATAR_PROVIDER_KEY);
  });
});
