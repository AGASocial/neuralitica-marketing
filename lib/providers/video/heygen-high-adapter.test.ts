/**
 * HeyGen DIRECT v3 adapter — mocked HTTP only (no live HEYGEN_API_KEY calls).
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
const LOOK_ID = "look_mock_001";
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
      normalized.includes("/lib/providers/video/heygen-v3-client") ||
      normalized.includes("/lib/providers/video/heygen-look-cache") ||
      normalized.includes("/lib/providers/normalize-provider-response") ||
      normalized.includes("/lib/media/resolve-media-asset-url-for-provider") ||
      normalized.includes("/lib/media/upload-generated-video-buffer") ||
      normalized.includes("/lib/media/crop-portrait-to-9x16") ||
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
  return withServerOnlyStub(
    () =>
      require("../normalize-provider-response.ts") as typeof import("../normalize-provider-response"),
  );
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

function audioDownloadThenUploadThenCreate(params: {
  onCreateBody?: (body: Record<string, unknown>) => void;
  videoId?: string;
}): Array<(url: string, init?: RequestInit) => Response> {
  return [
    // download audio
    () =>
      new Response(Buffer.from("fake-audio"), {
        status: 200,
        headers: { "Content-Type": "audio/mpeg" },
      }),
    // upload audio asset
    () =>
      new Response(
        JSON.stringify({ data: { asset_id: "audio_asset_1", url: "https://files.heygen.ai/a.mp3", mime_type: "audio/mpeg", size_bytes: 10 } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    // create video
    (_url, init) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      params.onCreateBody?.(body);
      return new Response(
        JSON.stringify({
          data: { video_id: params.videoId ?? VIDEO_ID, status: "waiting" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    },
  ];
}

describe("HeyGen DIRECT v3 adapter", () => {
  it("1 — generic avatar: upload audio → create audio-driven avatar video → poll → fetch", async () => {
    const previousToken = process.env.HEYGEN_API_KEY;
    process.env.HEYGEN_API_KEY = API_KEY;

    const uploaded: { storageKey?: string; sizeBytes?: number } = {};
    let createBody: Record<string, unknown> | null = null;
    const fetchImpl = mockFetchSequence([
      ...audioDownloadThenUploadThenCreate({
        onCreateBody: (body) => {
          createBody = body;
        },
      }),
      () =>
        new Response(
          JSON.stringify({ data: { id: VIDEO_ID, status: "processing" } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      () =>
        new Response(
          JSON.stringify({
            data: {
              id: VIDEO_ID,
              status: "completed",
              video_url: OUTPUT_URL,
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
        defaultEstimateCents: 120,
        unitCostCentsPerSecond: 4,
        heygenAvatarId: "avatar_studio_001",
        fetchImpl,
        resolveMediaAssetUrl: async () => "https://owned.example/voice.mp3",
        uploadGeneratedVideo: async ({ buffer }) => {
          uploaded.storageKey = "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee.mp4";
          uploaded.sizeBytes = buffer.length;
          return {
            storageKey: uploaded.storageKey,
            sizeBytes: buffer.length,
          };
        },
      });

      const created = await adapter.createJob(genericAvatarInput());
      assert.equal(created.externalJobId, VIDEO_ID);
      assert.ok(createBody);
      const body = createBody as Record<string, unknown>;
      assert.equal(body.type, "avatar");
      assert.equal(body.avatar_id, "avatar_studio_001");
      assert.equal(body.audio_asset_id, "audio_asset_1");
      assert.equal(body.resolution, "720p");
      assert.equal(body.aspect_ratio, "9:16");
      assert.equal(body.fit, "cover");
      assert.deepEqual(body.engine, { type: "avatar_iii" });

      const processing = await adapter.getJobStatus(VIDEO_ID);
      assert.equal(processing.status, "processing");

      const completed = await adapter.getJobStatus(VIDEO_ID);
      assert.equal(completed.status, "completed");
      assert.equal(completed.rawOutputUrl, OUTPUT_URL);

      const asset = await adapter.fetchAsset(VIDEO_ID, OUTPUT_URL);
      assert.equal(asset.storageKey, uploaded.storageKey);
      assert.equal(asset.mimeType, "video/mp4");
    } finally {
      if (previousToken === undefined) delete process.env.HEYGEN_API_KEY;
      else process.env.HEYGEN_API_KEY = previousToken;
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
        defaultEstimateCents: 120,
        unitCostCentsPerSecond: 4,
        heygenAvatarId: "avatar_studio_001",
        fetchImpl,
        resolveMediaAssetUrl: async () => "https://owned.example/x.jpg",
      });

      await assert.rejects(
        () => adapter.createJob(genericAvatarInput()),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.equal((err as { code?: string }).code, PROVIDER_CONFIG_MISSING);
          return true;
        },
      );
      assert.equal(fetchCalled, false);
    } finally {
      if (previousToken === undefined) delete process.env.HEYGEN_API_KEY;
      else process.env.HEYGEN_API_KEY = previousToken;
    }
  });

  it("3 — estimate: 30s × 4¢ = 120¢", async () => {
    const { createHeygenHighAdapter } = loadHeygenAdapterModule();
    const adapter = createHeygenHighAdapter({
      defaultEstimateCents: 999,
      unitCostCentsPerSecond: 4,
    });
    const estimate = await adapter.estimateCost(ownAvatarInput());
    assert.equal(estimate.estimatedCostCents, 120);
    assert.equal(estimate.providerKey, "heygen_high");
  });

  it("4 — own_avatar creates photo look then audio-driven avatar video (not type:image)", async () => {
    const previousToken = process.env.HEYGEN_API_KEY;
    process.env.HEYGEN_API_KEY = API_KEY;

    let createBody: Record<string, unknown> | null = null;
    const fetchImpl = mockFetchSequence([
      // download audio
      () =>
        new Response(Buffer.from("fake-audio"), {
          status: 200,
          headers: { "Content-Type": "audio/mpeg" },
        }),
      // upload audio
      () =>
        new Response(
          JSON.stringify({ data: { asset_id: "audio_asset_1" } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      // download portrait
      () =>
        new Response(Buffer.from("fake-portrait-bytes"), {
          status: 200,
          headers: { "Content-Type": "image/jpeg" },
        }),
      // upload cropped portrait
      () =>
        new Response(
          JSON.stringify({ data: { asset_id: "image_asset_1" } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      // create photo avatar
      () =>
        new Response(
          JSON.stringify({
            data: {
              avatar_item: {
                id: LOOK_ID,
                status: "completed",
                group_id: "group_1",
              },
              avatar_group: { id: "group_1" },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      // create video
      (_url, init) => {
        createBody = JSON.parse(String(init?.body ?? "{}")) as Record<
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
        defaultEstimateCents: 120,
        unitCostCentsPerSecond: 4,
        fetchImpl,
        resolveMediaAssetUrl: async (assetId) =>
          assetId === PORTRAIT_ASSET_ID
            ? "https://owned.example/portrait.jpg"
            : "https://owned.example/voice.mp3",
        getCachedLook: async () => null,
        upsertCachedLook: async () => undefined,
        cropPortrait: async () => ({
          buffer: Buffer.from("cropped-jpeg"),
          mimeType: "image/jpeg",
          width: 720,
          height: 1280,
        }),
      });

      await adapter.createJob(ownAvatarInput());
      assert.ok(createBody);
      const body = createBody as Record<string, unknown>;
      assert.equal(body.type, "avatar");
      assert.equal(body.avatar_id, LOOK_ID);
      assert.equal(body.audio_asset_id, "audio_asset_1");
      assert.equal(body.fit, "cover");
      assert.deepEqual(body.engine, { type: "avatar_iii" });
    } finally {
      if (previousToken === undefined) delete process.env.HEYGEN_API_KEY;
      else process.env.HEYGEN_API_KEY = previousToken;
    }
  });

  it("5 — reuses cached heygen look id (skips photo avatar create)", async () => {
    const previousToken = process.env.HEYGEN_API_KEY;
    process.env.HEYGEN_API_KEY = API_KEY;

    let createBody: Record<string, unknown> | null = null;
    const fetchImpl = mockFetchSequence(
      audioDownloadThenUploadThenCreate({
        onCreateBody: (body) => {
          createBody = body;
        },
      }),
    );

    try {
      const { createHeygenHighAdapter } = loadHeygenAdapterModule();
      const adapter = createHeygenHighAdapter({
        defaultEstimateCents: 120,
        unitCostCentsPerSecond: 4,
        fetchImpl,
        resolveMediaAssetUrl: async () => "https://owned.example/voice.mp3",
        getCachedLook: async () => ({
          heygenLookId: "look_cached",
          heygenGroupId: "group_cached",
          heygenImageAssetId: "img_cached",
        }),
        upsertCachedLook: async () => undefined,
      });

      await adapter.createJob(ownAvatarInput());
      assert.equal(createBody!.avatar_id, "look_cached");
    } finally {
      if (previousToken === undefined) delete process.env.HEYGEN_API_KEY;
      else process.env.HEYGEN_API_KEY = previousToken;
    }
  });

  it("6 — never posts avatar_iv / avatar_v", async () => {
    const previousToken = process.env.HEYGEN_API_KEY;
    process.env.HEYGEN_API_KEY = API_KEY;

    const bodies: Array<Record<string, unknown>> = [];
    const fetchImpl = mockFetchSequence(
      audioDownloadThenUploadThenCreate({
        onCreateBody: (body) => bodies.push(body),
        videoId: `${VIDEO_ID}_a`,
      }),
    );

    try {
      const { createHeygenHighAdapter } = loadHeygenAdapterModule();
      const { HEYGEN_FORBIDDEN_ENGINE_TYPES } = loadContractsModule();
      const adapter = createHeygenHighAdapter({
        defaultEstimateCents: 120,
        unitCostCentsPerSecond: 4,
        heygenAvatarId: "avatar_studio_001",
        fetchImpl,
        resolveMediaAssetUrl: async () => "https://owned.example/voice.mp3",
      });

      await adapter.createJob(genericAvatarInput());
      for (const body of bodies) {
        const serialized = JSON.stringify(body);
        for (const forbidden of HEYGEN_FORBIDDEN_ENGINE_TYPES) {
          assert.equal(serialized.includes(forbidden), false);
        }
        assert.deepEqual(body.engine, { type: "avatar_iii" });
      }
    } finally {
      if (previousToken === undefined) delete process.env.HEYGEN_API_KEY;
      else process.env.HEYGEN_API_KEY = previousToken;
    }
  });

  it("7 — validateProviderOutputUrl rejects non-allowlisted hosts", () => {
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
  });

  it("8 — adapter module imports server-only", () => {
    const source = readFileSync(
      path.join(__dirname, "heygen-high-adapter.ts"),
      "utf8",
    );
    assert.match(source, /import ["']server-only["']/);
  });

  it("9 — registry getVideoAdapter(heygen_high) is real", async () => {
    const { getProviderRegistry, resetProviderRegistryForTests } =
      loadRegistryModule();
    resetProviderRegistryForTests();

    const adapter = getProviderRegistry().getVideoAdapter("heygen_high");
    assert.equal(adapter.providerKey, "heygen_high");

    const previousToken = process.env.HEYGEN_API_KEY;
    delete process.env.HEYGEN_API_KEY;

    try {
      await assert.rejects(
        () => adapter.createJob(genericAvatarInput()),
        (err: unknown) => {
          assert.equal((err as { code?: string }).code, "PROVIDER_CONFIG_MISSING");
          return true;
        },
      );
      const estimate = await adapter.estimateCost(ownAvatarInput());
      assert.equal(estimate.estimatedCostCents, 120);
    } finally {
      if (previousToken === undefined) delete process.env.HEYGEN_API_KEY;
      else process.env.HEYGEN_API_KEY = previousToken;
      resetProviderRegistryForTests();
    }
  });
});
