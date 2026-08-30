/**
 * US-8.2 SadTalker low-tier Replicate adapter — mocked HTTP only.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Module from "node:module";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CLIENT_ID = "00000000-0000-4000-8000-000000000002";
const REEL_SCRIPT_ID = "00000000-0000-4000-8000-000000000001";
const PORTRAIT_ASSET_ID = "00000000-0000-4000-8000-000000000010";
const VOICEOVER_ASSET_ID = "00000000-0000-4000-8000-000000000011";
const PREDICTION_ID = "pred-abc123";
const OUTPUT_URL = "https://replicate.delivery/pbxt/out.mp4";

type NodeModuleLoad = {
  _load: (
    request: string,
    parent: NodeModule | null | undefined,
    isMain: boolean,
  ) => unknown;
};

function clearSadtalkerModuleCache() {
  for (const key of Object.keys(require.cache)) {
    const normalized = key.replace(/\\/g, "/");
    if (
      normalized.includes("/lib/providers/video/sadtalker-low-adapter") ||
      normalized.includes("/lib/providers/normalize-provider-response") ||
      normalized.includes("/lib/media/resolve-media-asset-url-for-provider") ||
      normalized.includes("/lib/media/upload-generated-video-buffer")
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
    clearSadtalkerModuleCache();
    return run();
  } finally {
    nodeModule._load = originalLoad;
    clearSadtalkerModuleCache();
  }
}

function loadSadtalkerAdapterModule() {
  return withServerOnlyStub(() =>
    require("./sadtalker-low-adapter.ts") as typeof import("./sadtalker-low-adapter"),
  );
}

function loadNormalizeModule() {
  return withServerOnlyStub(() => require("../normalize-provider-response.ts"));
}

function loadContractsModule() {
  return require("../../contracts/sadtalker-low.ts") as typeof import("../../contracts/sadtalker-low");
}

function loadProvidersContractsModule() {
  return require("../../contracts/providers.ts") as typeof import("../../contracts/providers");
}

function baseJobInput() {
  return {
    reelScriptId: REEL_SCRIPT_ID,
    clientId: CLIENT_ID,
    providerKey: "sadtalker_low",
    providerTier: "low" as const,
    assetRole: "primary" as const,
    targetDurationSec: 30,
    portraitAssetId: PORTRAIT_ASSET_ID,
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

describe("US-8.2 SadTalker adapter", () => {
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
      const { createSadtalkerLowAdapter } = loadSadtalkerAdapterModule();
      const adapter = createSadtalkerLowAdapter({
        defaultEstimateCents: 10,
        fetchImpl,
        resolveMediaAssetUrl: async (assetId) =>
          assetId === PORTRAIT_ASSET_ID
            ? "https://replicate.delivery/pbxt/portrait.jpg"
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
      assert.equal(created.estimatedCostCents, 10);

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
      assert.equal(asset.actualCostCents, 10);
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
      const { createSadtalkerLowAdapter } = loadSadtalkerAdapterModule();
      const { PROVIDER_CONFIG_MISSING } = loadContractsModule();
      const adapter = createSadtalkerLowAdapter({
        defaultEstimateCents: 10,
        fetchImpl,
        resolveMediaAssetUrl: async () => "https://replicate.delivery/pbxt/x.jpg",
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

  it("3 — validateProviderOutputUrl rejects https://evil.com/x", () => {
    const { validateProviderOutputUrl, ProviderAdapterError, INVALID_PROVIDER_OUTPUT_URL } =
      loadNormalizeModule();
    const { SADTALKER_ALLOWED_OUTPUT_HOSTS } = loadContractsModule();

    assert.throws(
      () => validateProviderOutputUrl("https://evil.com/x", SADTALKER_ALLOWED_OUTPUT_HOSTS),
      (err: unknown) => {
        assert.ok(err instanceof ProviderAdapterError);
        assert.equal(err.code, INVALID_PROVIDER_OUTPUT_URL);
        return true;
      },
    );
  });

  it("4 — metadata IP URL rejected", () => {
    const { validateProviderOutputUrl, ProviderAdapterError, INVALID_PROVIDER_OUTPUT_URL } =
      loadNormalizeModule();
    const { SADTALKER_ALLOWED_OUTPUT_HOSTS } = loadContractsModule();

    assert.throws(
      () =>
        validateProviderOutputUrl(
          "https://127.0.0.1/video.mp4",
          SADTALKER_ALLOWED_OUTPUT_HOSTS,
        ),
      (err: unknown) => {
        assert.ok(err instanceof ProviderAdapterError);
        assert.equal(err.code, INVALID_PROVIDER_OUTPUT_URL);
        return true;
      },
    );
  });

  it("5 — Replicate 401 body with Bearer token is sanitized", async () => {
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
      const { createSadtalkerLowAdapter } = loadSadtalkerAdapterModule();
      const adapter = createSadtalkerLowAdapter({
        defaultEstimateCents: 10,
        fetchImpl,
        resolveMediaAssetUrl: async () => "https://replicate.delivery/pbxt/x.jpg",
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

  it("6 — externalJobIdSchema rejects path chars in prediction id handling", async () => {
    const previousToken = process.env.REPLICATE_API_TOKEN;
    process.env.REPLICATE_API_TOKEN = "r8_test_token";
    const { externalJobIdSchema } = loadProvidersContractsModule();

    const fetchImpl = mockFetchSequence([
      () =>
        new Response(
          JSON.stringify({
            id: "../evil/prediction",
            status: "starting",
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        ),
    ]);

    try {
      const { createSadtalkerLowAdapter } = loadSadtalkerAdapterModule();
      const adapter = createSadtalkerLowAdapter({
        defaultEstimateCents: 10,
        fetchImpl,
        resolveMediaAssetUrl: async () => "https://replicate.delivery/pbxt/x.jpg",
      });

      await assert.rejects(() => adapter.createJob(baseJobInput()));
      assert.equal(externalJobIdSchema.safeParse("../evil/prediction").success, false);
    } finally {
      if (previousToken === undefined) {
        delete process.env.REPLICATE_API_TOKEN;
      } else {
        process.env.REPLICATE_API_TOKEN = previousToken;
      }
    }
  });

  it("7 — adapter module imports server-only", () => {
    const source = readFileSync(
      path.join(__dirname, "sadtalker-low-adapter.ts"),
      "utf8",
    );
    assert.match(source, /import ["']server-only["']/);
  });
});
