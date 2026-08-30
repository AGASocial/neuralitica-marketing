/**
 * US-8.6 MuseTalk low-tier Replicate adapter — mocked HTTP only.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Module from "node:module";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CLIENT_ID = "22222222-2222-4222-8222-222222222222";
const REEL_SCRIPT_ID = "11111111-1111-4111-8111-111111111111";
const REFERENCE_VIDEO_ASSET_ID = "33333333-3333-4333-8333-333333333333";
const VOICEOVER_ASSET_ID = "44444444-4444-4444-8444-444444444444";
const PORTRAIT_ASSET_ID = "00000000-0000-4000-8000-000000000010";
const PREDICTION_ID = "abc123prediction";
const OUTPUT_URL = "https://replicate.delivery/pbxt/out.mp4";

type NodeModuleLoad = {
  _load: (
    request: string,
    parent: NodeModule | null | undefined,
    isMain: boolean,
  ) => unknown;
};

function clearMusetalkModuleCache() {
  for (const key of Object.keys(require.cache)) {
    const normalized = key.replace(/\\/g, "/");
    if (
      normalized.includes("/lib/providers/video/musetalk-low-adapter") ||
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
    if (request === "react") {
      return { cache: (fn: (...args: unknown[]) => unknown) => fn };
    }
    return originalLoad(request, parent, isMain);
  };
  try {
    clearMusetalkModuleCache();
    return run();
  } finally {
    nodeModule._load = originalLoad;
    clearMusetalkModuleCache();
  }
}

function loadMusetalkAdapterModule() {
  return withServerOnlyStub(() =>
    require("./musetalk-low-adapter.ts") as typeof import("./musetalk-low-adapter"),
  );
}

function loadNormalizeModule() {
  return withServerOnlyStub(() => require("../normalize-provider-response.ts"));
}

function loadContractsModule() {
  return require("../../contracts/musetalk-low.ts") as typeof import("../../contracts/musetalk-low");
}

function loadRegistryModule() {
  return withServerOnlyStub(() => require("../create-provider-registry.ts"));
}

function loadResolverModule() {
  return withServerOnlyStub(() =>
    require("../../media/resolve-media-asset-url-for-provider.ts"),
  );
}

function baseJobInput() {
  return {
    reelScriptId: REEL_SCRIPT_ID,
    clientId: CLIENT_ID,
    providerKey: "musetalk_low",
    providerTier: "low" as const,
    assetRole: "primary" as const,
    targetDurationSec: 30,
    referenceVideoAssetId: REFERENCE_VIDEO_ASSET_ID,
    voiceoverAssetId: VOICEOVER_ASSET_ID,
  };
}

function mockFetchSequence(
  handlers: Array<(url: string, init?: RequestInit) => Response | Promise<Response>>,
): typeof fetch {
  let callIndex = 0;
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const handler = handlers[callIndex];
    if (!handler) {
      throw new Error(`Unexpected fetch call #${callIndex}: ${url}`);
    }
    callIndex += 1;
    return handler(url, init);
  }) as typeof fetch;
}

describe("US-8.6 MuseTalk adapter", () => {
  it("1 — mocked create → processing → completed → fetchAsset round-trip", async () => {
    const previousToken = process.env.REPLICATE_API_TOKEN;
    process.env.REPLICATE_API_TOKEN = "r8_test_token";

    const uploaded: { storageKey?: string; sizeBytes?: number } = {};
    const fetchImpl = mockFetchSequence([
      () =>
        new Response(
          JSON.stringify({
            id: PREDICTION_ID,
            status: "starting",
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        ),
      () =>
        new Response(
          JSON.stringify({
            id: PREDICTION_ID,
            status: "processing",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      () =>
        new Response(
          JSON.stringify({
            id: PREDICTION_ID,
            status: "succeeded",
            output: OUTPUT_URL,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      () =>
        new Response(Buffer.from("fake-mp4-bytes"), {
          status: 200,
          headers: { "Content-Type": "video/mp4" },
        }),
    ]);

    try {
      const { createMusetalkLowAdapter } = loadMusetalkAdapterModule();
      const adapter = createMusetalkLowAdapter({
        defaultEstimateCents: 19,
        fetchImpl,
        resolveMediaAssetUrl: async (assetId, _clientId, kind) =>
          kind === "video"
            ? "https://replicate.delivery/pbxt/loop.mp4"
            : "https://replicate.delivery/pbxt/voice.wav",
        uploadGeneratedVideo: async ({ buffer }) => {
          uploaded.storageKey = "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee.mp4";
          uploaded.sizeBytes = buffer.length;
          return {
            storageKey: uploaded.storageKey,
            sizeBytes: buffer.length,
          };
        },
      });

      const created = await adapter.createJob(baseJobInput());
      assert.equal(created.externalJobId, PREDICTION_ID);
      assert.equal(created.status, "queued");
      assert.equal(created.estimatedCostCents, 19);

      const processing = await adapter.getJobStatus(PREDICTION_ID);
      assert.equal(processing.status, "processing");
      assert.equal(processing.rawOutputUrl, undefined);

      const completed = await adapter.getJobStatus(PREDICTION_ID);
      assert.equal(completed.status, "completed");
      assert.equal(completed.rawOutputUrl, OUTPUT_URL);

      const asset = await adapter.fetchAsset(PREDICTION_ID, OUTPUT_URL);
      assert.equal(asset.storageKey, uploaded.storageKey);
      assert.equal(asset.mimeType, "video/mp4");
      assert.equal(asset.sizeBytes, uploaded.sizeBytes);
      assert.equal(asset.actualCostCents, 19);
    } finally {
      if (previousToken === undefined) {
        delete process.env.REPLICATE_API_TOKEN;
      } else {
        process.env.REPLICATE_API_TOKEN = previousToken;
      }
    }
  });

  it("2 — missing REPLICATE_API_TOKEN → PROVIDER_CONFIG_MISSING before fetch", async () => {
    const previousToken = process.env.REPLICATE_API_TOKEN;
    delete process.env.REPLICATE_API_TOKEN;

    let fetchCalled = false;
    const fetchImpl = (async () => {
      fetchCalled = true;
      return new Response("unexpected", { status: 500 });
    }) as typeof fetch;

    try {
      const { createMusetalkLowAdapter } = loadMusetalkAdapterModule();
      const { PROVIDER_CONFIG_MISSING } = loadContractsModule();
      const adapter = createMusetalkLowAdapter({
        defaultEstimateCents: 19,
        fetchImpl,
        resolveMediaAssetUrl: async () => "https://replicate.delivery/pbxt/x.mp4",
      });

      await assert.rejects(
        () => adapter.createJob(baseJobInput()),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.equal((err as { code?: string }).code, PROVIDER_CONFIG_MISSING);
          assert.equal((err as { name?: string }).name, "ProviderAdapterError");
          return true;
        },
      );
      assert.equal(fetchCalled, false);
    } finally {
      if (previousToken === undefined) {
        delete process.env.REPLICATE_API_TOKEN;
      } else {
        process.env.REPLICATE_API_TOKEN = previousToken;
      }
    }
  });

  it("3 — rejects portraitAssetId / missing referenceVideoAssetId", async () => {
    const { createMusetalkLowAdapter } = loadMusetalkAdapterModule();
    const adapter = createMusetalkLowAdapter({
      defaultEstimateCents: 19,
      resolveMediaAssetUrl: async () => "https://replicate.delivery/pbxt/x.mp4",
    });

    await assert.rejects(
      () =>
        adapter.createJob({
          ...baseJobInput(),
          portraitAssetId: PORTRAIT_ASSET_ID,
        }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal((err as { code?: string }).code, "INVALID_PROVIDER_INPUT");
        return true;
      },
    );

    await assert.rejects(
      () =>
        adapter.createJob({
          ...baseJobInput(),
          referenceVideoAssetId: undefined,
        }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal((err as { code?: string }).code, "INVALID_PROVIDER_INPUT");
        return true;
      },
    );
  });

  it("4 — validateProviderOutputUrl rejects non-allowlisted host", () => {
    const { validateProviderOutputUrl, ProviderAdapterError, INVALID_PROVIDER_OUTPUT_URL } =
      loadNormalizeModule();
    const { MUSETALK_ALLOWED_OUTPUT_HOSTS } = loadContractsModule();

    assert.throws(
      () => validateProviderOutputUrl("https://evil.com/x", MUSETALK_ALLOWED_OUTPUT_HOSTS),
      (err: unknown) => {
        assert.ok(err instanceof ProviderAdapterError);
        assert.equal(err.code, INVALID_PROVIDER_OUTPUT_URL);
        return true;
      },
    );
  });

  it("5 — Replicate 401 body with token is sanitized", async () => {
    const previousToken = process.env.REPLICATE_API_TOKEN;
    process.env.REPLICATE_API_TOKEN = "r8_test_token";

    const fetchImpl = mockFetchSequence([
      () =>
        new Response(
          JSON.stringify({
            detail:
              "Unauthorized Bearer r8_abcdefghijklmnopqrstuvwxyz1234567890ABCDEF",
          }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        ),
    ]);

    try {
      const { createMusetalkLowAdapter } = loadMusetalkAdapterModule();
      const adapter = createMusetalkLowAdapter({
        defaultEstimateCents: 19,
        fetchImpl,
        resolveMediaAssetUrl: async () => "https://replicate.delivery/pbxt/x.mp4",
      });

      await assert.rejects(
        () => adapter.createJob(baseJobInput()),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.equal((err as { name?: string }).name, "ProviderAdapterError");
          assert.equal((err as { message?: string }).message?.includes("Bearer"), false);
          assert.equal(
            (err as { message?: string }).message?.includes(
              "r8_abcdefghijklmnopqrstuvwxyz1234567890ABCDEF",
            ),
            false,
          );
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

  it("6 — video/quicktime rejected when resolving as audio kind", async () => {
    const nodeModule = Module as unknown as NodeModuleLoad;
    const originalLoad = nodeModule._load.bind(nodeModule);
    const assetId = REFERENCE_VIDEO_ASSET_ID;

    nodeModule._load = function (request, parent, isMain) {
      if (request === "server-only") return {};
      if (
        request === "@/lib/supabase/server" ||
        String(request).includes("lib/supabase/server")
      ) {
        return {
          isSupabaseConfigured: () => true,
          createServerSupabaseClient: () => ({
            from(table: string) {
              assert.equal(table, "neuramark_media_assets");
              const builder: Record<string, unknown> = {};
              const self = () => builder;
              builder.select = self;
              builder.eq = self;
              builder.maybeSingle = async () => ({
                data: {
                  id: assetId,
                  client_id: CLIENT_ID,
                  storage_key: `${assetId}.mp4`,
                  metadata: { detectedMime: "video/quicktime" },
                },
                error: null,
              });
              return builder;
            },
          }),
        };
      }
      return originalLoad(request, parent, isMain);
    };

    try {
      clearMusetalkModuleCache();
      const {
        resolveMediaAssetUrlForProvider,
        PROVIDER_ASSET_MIME_REJECTED,
      } = loadResolverModule();

      await assert.rejects(
        () =>
          resolveMediaAssetUrlForProvider({
            assetId,
            clientId: CLIENT_ID,
            kind: "audio",
          }),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.equal((err as { code?: string }).code, PROVIDER_ASSET_MIME_REJECTED);
          return true;
        },
      );
    } finally {
      nodeModule._load = originalLoad;
      clearMusetalkModuleCache();
    }
  });

  it("7 — adapter module imports server-only", () => {
    const source = readFileSync(
      path.join(__dirname, "musetalk-low-adapter.ts"),
      "utf8",
    );
    assert.match(source, /import ["']server-only["']/);
  });

  it("8 — registry getVideoAdapter(musetalk_low) is real adapter", async () => {
    const { getProviderRegistry, resetProviderRegistryForTests } =
      loadRegistryModule();
    resetProviderRegistryForTests();

    const adapter = getProviderRegistry().getVideoAdapter("musetalk_low");
    assert.equal(adapter.providerKey, "musetalk_low");
    assert.equal(adapter.videoAssetRole, "primary");

    const previousToken = process.env.REPLICATE_API_TOKEN;
    delete process.env.REPLICATE_API_TOKEN;

    try {
      await assert.rejects(
        () =>
          adapter.createJob({
            ...baseJobInput(),
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
