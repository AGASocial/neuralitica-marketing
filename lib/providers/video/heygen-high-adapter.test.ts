/**
 * US-8.7 Phase A — HeyGen high-tier adapter — mocked HTTP only.
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
const PORTRAIT_ASSET_ID = "33333333-3333-4333-8333-333333333333";
const VOICEOVER_ASSET_ID = "44444444-4444-4444-8444-444444444444";
const VIDEO_ID = "v_mock_heygen_001";
const OUTPUT_URL = "https://files.heygen.com/video/v_mock_heygen_001.mp4";
const API_KEY = "hg_test_key_abcdefghijklmnopqrstuvwxyz0123456789";

type NodeModuleLoad = {
  _load: (
    request: string,
    parent: NodeModule | null | undefined,
    isMain: boolean,
  ) => unknown;
};

function clearHeygenModuleCache() {
  for (const key of Object.keys(require.cache)) {
    const normalized = key.replace(/\\/g, "/");
    if (
      normalized.includes("/lib/providers/video/heygen-high-adapter") ||
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
    clearHeygenModuleCache();
    return run();
  } finally {
    nodeModule._load = originalLoad;
    clearHeygenModuleCache();
  }
}

function loadHeygenAdapterModule() {
  return withServerOnlyStub(() =>
    require("./heygen-high-adapter.ts") as typeof import("./heygen-high-adapter"),
  );
}

function loadNormalizeModule() {
  return withServerOnlyStub(() => require("../normalize-provider-response.ts"));
}

function loadContractsModule() {
  return require("../../contracts/heygen-high.ts") as typeof import("../../contracts/heygen-high");
}

function loadRegistryModule() {
  return withServerOnlyStub(
    () =>
      require("../create-provider-registry.ts") as typeof import("../create-provider-registry"),
  );
}

function ownAvatarInput() {
  return {
    reelScriptId: REEL_SCRIPT_ID,
    clientId: CLIENT_ID,
    providerKey: "heygen_high",
    providerTier: "high" as const,
    assetRole: "primary" as const,
    targetDurationSec: 30,
    portraitAssetId: PORTRAIT_ASSET_ID,
    voiceoverAssetId: VOICEOVER_ASSET_ID,
  };
}

function genericAvatarInput() {
  return {
    reelScriptId: REEL_SCRIPT_ID,
    clientId: CLIENT_ID,
    providerKey: "heygen_high",
    providerTier: "high" as const,
    assetRole: "primary" as const,
    targetDurationSec: 30,
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

describe("US-8.7 HeyGen adapter", () => {
  it("1 — mocked create → processing → completed → fetchAsset round-trip", async () => {
    const previousToken = process.env.HEYGEN_API_KEY;
    process.env.HEYGEN_API_KEY = API_KEY;

    const uploaded: { storageKey?: string; sizeBytes?: number } = {};
    const fetchImpl = mockFetchSequence([
      () =>
        new Response(
          JSON.stringify({
            data: { video_id: VIDEO_ID, status: "waiting" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      () =>
        new Response(
          JSON.stringify({
            data: { id: VIDEO_ID, status: "processing" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      () =>
        new Response(
          JSON.stringify({
            data: {
              id: VIDEO_ID,
              status: "completed",
              video_url: OUTPUT_URL,
              duration: 30.0,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      () =>
        new Response(Buffer.from("fake-heygen-mp4-bytes"), {
          status: 200,
          headers: { "Content-Type": "video/mp4" },
        }),
    ]);

    try {
      const { createHeygenHighAdapter } = loadHeygenAdapterModule();
      const adapter = createHeygenHighAdapter({
        defaultEstimateCents: 60,
        unitCostCentsPerSecond: 2,
        fetchImpl,
        resolveMediaAssetUrl: async (assetId) =>
          assetId === PORTRAIT_ASSET_ID
            ? "https://owned.example/portrait.jpg"
            : "https://owned.example/voice.wav",
        uploadGeneratedVideo: async ({ buffer }) => {
          uploaded.storageKey = "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee.mp4";
          uploaded.sizeBytes = buffer.length;
          return {
            storageKey: uploaded.storageKey,
            sizeBytes: buffer.length,
          };
        },
      });

      const created = await adapter.createJob(ownAvatarInput());
      assert.equal(created.externalJobId, VIDEO_ID);
      assert.equal(created.status, "queued");
      assert.equal(created.estimatedCostCents, 60);

      const processing = await adapter.getJobStatus(VIDEO_ID);
      assert.equal(processing.status, "processing");
      assert.equal(processing.rawOutputUrl, undefined);

      const completed = await adapter.getJobStatus(VIDEO_ID);
      assert.equal(completed.status, "completed");
      assert.equal(completed.rawOutputUrl, OUTPUT_URL);

      const asset = await adapter.fetchAsset(VIDEO_ID, OUTPUT_URL);
      assert.equal(asset.storageKey, uploaded.storageKey);
      assert.match(asset.storageKey, /^[0-9a-f-]{36}\.mp4$/i);
      assert.equal(asset.mimeType, "video/mp4");
      assert.equal(asset.sizeBytes, uploaded.sizeBytes);
    } finally {
      if (previousToken === undefined) {
        delete process.env.HEYGEN_API_KEY;
      } else {
        process.env.HEYGEN_API_KEY = previousToken;
      }
    }
  });

  it("2 — missing HEYGEN_API_KEY → PROVIDER_CONFIG_MISSING before fetch", async () => {
    const previousToken = process.env.HEYGEN_API_KEY;
    delete process.env.HEYGEN_API_KEY;

    let fetchCalled = false;
    const fetchImpl = (async () => {
      fetchCalled = true;
      return new Response("unexpected", { status: 500 });
    }) as typeof fetch;

    try {
      const { createHeygenHighAdapter } = loadHeygenAdapterModule();
      const { PROVIDER_CONFIG_MISSING } = loadContractsModule();
      const adapter = createHeygenHighAdapter({
        defaultEstimateCents: 60,
        unitCostCentsPerSecond: 2,
        fetchImpl,
        resolveMediaAssetUrl: async () => "https://owned.example/x.jpg",
      });

      await assert.rejects(
        () => adapter.createJob(ownAvatarInput()),
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
        delete process.env.HEYGEN_API_KEY;
      } else {
        process.env.HEYGEN_API_KEY = previousToken;
      }
    }
  });

  it("3 — estimate: 30s × 2¢ = 60¢", async () => {
    const { createHeygenHighAdapter } = loadHeygenAdapterModule();
    const adapter = createHeygenHighAdapter({
      defaultEstimateCents: 999,
      unitCostCentsPerSecond: 2,
    });
    const estimate = await adapter.estimateCost(ownAvatarInput());
    assert.equal(estimate.estimatedCostCents, 60);
    assert.equal(estimate.providerKey, "heygen_high");
    assert.equal(estimate.currency, "USD");
  });

  it("4 — avatar create body includes engine.type === avatar_iii", async () => {
    const previousToken = process.env.HEYGEN_API_KEY;
    const previousAvatar = process.env.HEYGEN_DEFAULT_AVATAR_ID;
    process.env.HEYGEN_API_KEY = API_KEY;
    process.env.HEYGEN_DEFAULT_AVATAR_ID = "avatar_studio_001";

    let postedBody: Record<string, unknown> | null = null;
    const fetchImpl = mockFetchSequence([
      (_url, init) => {
        postedBody = JSON.parse(String(init?.body ?? "{}")) as Record<
          string,
          unknown
        >;
        return new Response(
          JSON.stringify({
            data: { video_id: VIDEO_ID, status: "waiting" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    ]);

    try {
      const { createHeygenHighAdapter } = loadHeygenAdapterModule();
      const adapter = createHeygenHighAdapter({
        defaultEstimateCents: 60,
        unitCostCentsPerSecond: 2,
        heygenAvatarId: "avatar_studio_001",
        fetchImpl,
        resolveMediaAssetUrl: async () => "https://owned.example/voice.wav",
      });

      await adapter.createJob(genericAvatarInput());
      assert.ok(postedBody);
      assert.equal(postedBody!.type, "avatar");
      assert.equal(postedBody!.avatar_id, "avatar_studio_001");
      assert.deepEqual(postedBody!.engine, { type: "avatar_iii" });
      assert.equal("engine" in postedBody!, true);
    } finally {
      if (previousToken === undefined) delete process.env.HEYGEN_API_KEY;
      else process.env.HEYGEN_API_KEY = previousToken;
      if (previousAvatar === undefined) {
        delete process.env.HEYGEN_DEFAULT_AVATAR_ID;
      } else {
        process.env.HEYGEN_DEFAULT_AVATAR_ID = previousAvatar;
      }
    }
  });

  it("5 — image create body has no engine field", async () => {
    const previousToken = process.env.HEYGEN_API_KEY;
    process.env.HEYGEN_API_KEY = API_KEY;

    let postedBody: Record<string, unknown> | null = null;
    const fetchImpl = mockFetchSequence([
      (_url, init) => {
        postedBody = JSON.parse(String(init?.body ?? "{}")) as Record<
          string,
          unknown
        >;
        return new Response(
          JSON.stringify({
            data: { video_id: VIDEO_ID, status: "waiting" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    ]);

    try {
      const { createHeygenHighAdapter } = loadHeygenAdapterModule();
      const adapter = createHeygenHighAdapter({
        defaultEstimateCents: 60,
        unitCostCentsPerSecond: 2,
        fetchImpl,
        resolveMediaAssetUrl: async (assetId) =>
          assetId === PORTRAIT_ASSET_ID
            ? "https://owned.example/portrait.jpg"
            : "https://owned.example/voice.wav",
      });

      await adapter.createJob(ownAvatarInput());
      assert.ok(postedBody);
      assert.equal(postedBody!.type, "image");
      assert.equal("engine" in postedBody!, false);
    } finally {
      if (previousToken === undefined) delete process.env.HEYGEN_API_KEY;
      else process.env.HEYGEN_API_KEY = previousToken;
    }
  });

  it("6 — never posts avatar_iv / avatar_v", async () => {
    const previousToken = process.env.HEYGEN_API_KEY;
    process.env.HEYGEN_API_KEY = API_KEY;
    process.env.HEYGEN_DEFAULT_AVATAR_ID = "avatar_studio_001";

    const bodies: Array<Record<string, unknown>> = [];
    const fetchImpl = mockFetchSequence([
      (_url, init) => {
        bodies.push(
          JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
        );
        return new Response(
          JSON.stringify({
            data: { video_id: `${VIDEO_ID}_a`, status: "waiting" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
      (_url, init) => {
        bodies.push(
          JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
        );
        return new Response(
          JSON.stringify({
            data: { video_id: `${VIDEO_ID}_b`, status: "waiting" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    ]);

    try {
      const { createHeygenHighAdapter } = loadHeygenAdapterModule();
      const { HEYGEN_FORBIDDEN_ENGINE_TYPES } = loadContractsModule();
      const adapter = createHeygenHighAdapter({
        defaultEstimateCents: 60,
        unitCostCentsPerSecond: 2,
        heygenAvatarId: "avatar_studio_001",
        fetchImpl,
        resolveMediaAssetUrl: async (assetId) =>
          assetId === PORTRAIT_ASSET_ID
            ? "https://owned.example/portrait.jpg"
            : "https://owned.example/voice.wav",
      });

      await adapter.createJob(genericAvatarInput());
      await adapter.createJob(ownAvatarInput());

      for (const body of bodies) {
        const serialized = JSON.stringify(body);
        for (const forbidden of HEYGEN_FORBIDDEN_ENGINE_TYPES) {
          assert.equal(serialized.includes(forbidden), false);
        }
        if (body.type === "avatar") {
          assert.deepEqual(body.engine, { type: "avatar_iii" });
        }
      }
    } finally {
      if (previousToken === undefined) delete process.env.HEYGEN_API_KEY;
      else process.env.HEYGEN_API_KEY = previousToken;
      delete process.env.HEYGEN_DEFAULT_AVATAR_ID;
    }
  });

  it("7 — validateProviderOutputUrl rejects non-allowlisted / metadata IP hosts", () => {
    const {
      validateProviderOutputUrl,
      ProviderAdapterError,
      INVALID_PROVIDER_OUTPUT_URL,
    } = loadNormalizeModule();
    const { HEYGEN_ALLOWED_OUTPUT_HOSTS } = loadContractsModule();

    assert.throws(
      () =>
        validateProviderOutputUrl(
          "https://evil.com/x.mp4",
          HEYGEN_ALLOWED_OUTPUT_HOSTS,
        ),
      (err: unknown) => {
        assert.ok(err instanceof ProviderAdapterError);
        assert.equal(err.code, INVALID_PROVIDER_OUTPUT_URL);
        return true;
      },
    );

    assert.throws(
      () =>
        validateProviderOutputUrl(
          "https://169.254.169.254/latest/meta-data",
          HEYGEN_ALLOWED_OUTPUT_HOSTS,
        ),
      (err: unknown) => {
        assert.ok(err instanceof ProviderAdapterError);
        assert.equal(err.code, INVALID_PROVIDER_OUTPUT_URL);
        return true;
      },
    );

    assert.throws(
      () =>
        validateProviderOutputUrl(
          "https://replicate.delivery/pbxt/out.mp4",
          HEYGEN_ALLOWED_OUTPUT_HOSTS,
        ),
      (err: unknown) => {
        assert.ok(err instanceof ProviderAdapterError);
        assert.equal(err.code, INVALID_PROVIDER_OUTPUT_URL);
        return true;
      },
    );
  });

  it("8 — mock HeyGen error with key material is sanitized", async () => {
    const previousToken = process.env.HEYGEN_API_KEY;
    process.env.HEYGEN_API_KEY = API_KEY;

    const fetchImpl = mockFetchSequence([
      () =>
        new Response(
          JSON.stringify({
            error: `Unauthorized invalid key ${API_KEY} for request`,
          }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        ),
    ]);

    try {
      const { createHeygenHighAdapter } = loadHeygenAdapterModule();
      const adapter = createHeygenHighAdapter({
        defaultEstimateCents: 60,
        unitCostCentsPerSecond: 2,
        fetchImpl,
        resolveMediaAssetUrl: async () => "https://owned.example/x.jpg",
      });

      await assert.rejects(
        () => adapter.createJob(ownAvatarInput()),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.equal((err as { name?: string }).name, "ProviderAdapterError");
          assert.equal(
            (err as { message?: string }).message?.includes(API_KEY),
            false,
          );
          return true;
        },
      );
    } finally {
      if (previousToken === undefined) delete process.env.HEYGEN_API_KEY;
      else process.env.HEYGEN_API_KEY = previousToken;
    }
  });

  it("9 — adapter module imports server-only", () => {
    const source = readFileSync(
      path.join(__dirname, "heygen-high-adapter.ts"),
      "utf8",
    );
    assert.match(source, /import ["']server-only["']/);
  });

  it("10 — registry getVideoAdapter(heygen_high) is real (no stub id prefix)", async () => {
    const { getProviderRegistry, resetProviderRegistryForTests } =
      loadRegistryModule();
    resetProviderRegistryForTests();

    const adapter = getProviderRegistry().getVideoAdapter("heygen_high");
    assert.equal(adapter.providerKey, "heygen_high");
    assert.equal(adapter.videoAssetRole, "primary");

    const previousToken = process.env.HEYGEN_API_KEY;
    delete process.env.HEYGEN_API_KEY;

    try {
      await assert.rejects(
        () => adapter.createJob(ownAvatarInput()),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.equal((err as { code?: string }).code, "PROVIDER_CONFIG_MISSING");
          return true;
        },
      );

      const estimate = await adapter.estimateCost(ownAvatarInput());
      assert.equal(estimate.estimatedCostCents, 60);
      assert.equal(estimate.providerKey, "heygen_high");
    } finally {
      if (previousToken === undefined) delete process.env.HEYGEN_API_KEY;
      else process.env.HEYGEN_API_KEY = previousToken;
      resetProviderRegistryForTests();
    }
  });
});
