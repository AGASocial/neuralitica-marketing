/**
 * US-8.5 Phase A — SiliconFlow Wan2.1 I2V Turbo adapter — mocked HTTP only.
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
const STILL_ASSET_ID = "33333333-3333-4333-8333-333333333333";
const REQUEST_ID = "wan_mock_request_001";
const OUTPUT_URL =
  "https://sc-maas.oss-cn-shanghai.aliyuncs.com/mock/wan_clip_001.mp4";
const API_KEY = "sk-test-siliconflow-wan-key-abcdefghijklmnopqrstuvwxyz";

type NodeModuleLoad = {
  _load: (
    request: string,
    parent: NodeModule | null | undefined,
    isMain: boolean,
  ) => unknown;
};

function clearWanModuleCache() {
  for (const key of Object.keys(require.cache)) {
    const normalized = key.replace(/\\/g, "/");
    if (
      normalized.includes("/lib/providers/video/siliconflow-wan21-turbo-adapter") ||
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
    clearWanModuleCache();
    return run();
  } finally {
    nodeModule._load = originalLoad;
    clearWanModuleCache();
  }
}

function loadWanAdapterModule() {
  return withServerOnlyStub(
    () =>
      require("./siliconflow-wan21-turbo-adapter.ts") as typeof import("./siliconflow-wan21-turbo-adapter"),
  );
}

function loadNormalizeModule() {
  return withServerOnlyStub(() => require("../normalize-provider-response.ts"));
}

function loadContractsModule() {
  return require("../../contracts/siliconflow-wan21-turbo.ts") as typeof import("../../contracts/siliconflow-wan21-turbo");
}

function loadRegistryModule() {
  return withServerOnlyStub(
    () =>
      require("../create-provider-registry.ts") as typeof import("../create-provider-registry"),
  );
}

function baseJobInput(overrides: Record<string, unknown> = {}) {
  return {
    reelScriptId: REEL_SCRIPT_ID,
    clientId: CLIENT_ID,
    providerKey: "siliconflow_wan21_turbo",
    providerTier: "low" as const,
    assetRole: "broll" as const,
    targetDurationSec: 5,
    referenceImageAssetId: STILL_ASSET_ID,
    prompt: "Cinematic B-roll. <<BEAT>>Storefront morning light<</BEAT>>",
    ...overrides,
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

describe("US-8.5 Wan adapter (Phase A)", () => {
  it("1 — mocked create → processing → completed → fetchAsset round-trip", async () => {
    const previousToken = process.env.SILICONFLOW_API_KEY;
    process.env.SILICONFLOW_API_KEY = API_KEY;

    const uploaded: { storageKey?: string; sizeBytes?: number } = {};
    const fetchImpl = mockFetchSequence([
      (url, init) => {
        assert.match(url, /\/v1\/video\/submit$/);
        assert.equal(init?.method, "POST");
        const auth = (init?.headers as Record<string, string>)?.Authorization;
        assert.equal(auth, `Bearer ${API_KEY}`);
        return new Response(JSON.stringify({ requestId: REQUEST_ID }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
      (url, init) => {
        assert.match(url, /\/v1\/video\/status$/);
        assert.equal(init?.method, "POST");
        const body = JSON.parse(String(init?.body)) as { requestId?: string };
        assert.equal(body.requestId, REQUEST_ID);
        return new Response(
          JSON.stringify({ status: "InProgress", reason: "" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
      () =>
        new Response(
          JSON.stringify({
            status: "Succeed",
            reason: "",
            results: { videos: [{ url: OUTPUT_URL }] },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      () =>
        new Response(Buffer.from("fake-wan-mp4-bytes"), {
          status: 200,
          headers: { "Content-Type": "video/mp4" },
        }),
    ]);

    try {
      const { createSiliconflowWan21TurboAdapter } = loadWanAdapterModule();
      const adapter = createSiliconflowWan21TurboAdapter({
        defaultEstimateCents: 21,
        unitCostCentsPerClip: 21,
        fetchImpl,
        resolveMediaAssetUrl: async () =>
          "https://example.com/api/media/provider-assets/still.jpg",
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
      assert.equal(created.externalJobId, REQUEST_ID);
      assert.equal(created.status, "queued");
      assert.equal(created.estimatedCostCents, 21);

      const processing = await adapter.getJobStatus(REQUEST_ID);
      assert.equal(processing.status, "processing");
      assert.equal(processing.rawOutputUrl, undefined);

      const completed = await adapter.getJobStatus(REQUEST_ID);
      assert.equal(completed.status, "completed");
      assert.equal(completed.rawOutputUrl, OUTPUT_URL);

      const asset = await adapter.fetchAsset(REQUEST_ID, OUTPUT_URL);
      assert.equal(asset.storageKey, uploaded.storageKey);
      assert.match(asset.storageKey, /^[0-9a-f-]{36}\.mp4$/i);
      assert.equal(asset.mimeType, "video/mp4");
      assert.equal(asset.sizeBytes, uploaded.sizeBytes);
      assert.equal(asset.actualCostCents, 21);
    } finally {
      if (previousToken === undefined) {
        delete process.env.SILICONFLOW_API_KEY;
      } else {
        process.env.SILICONFLOW_API_KEY = previousToken;
      }
    }
  });

  it("2 — missing SILICONFLOW_API_KEY → PROVIDER_CONFIG_MISSING before fetch", async () => {
    const previousToken = process.env.SILICONFLOW_API_KEY;
    delete process.env.SILICONFLOW_API_KEY;

    let fetchCalled = false;
    const fetchImpl = (async () => {
      fetchCalled = true;
      return new Response("unexpected", { status: 500 });
    }) as typeof fetch;

    try {
      const { createSiliconflowWan21TurboAdapter } = loadWanAdapterModule();
      const { PROVIDER_CONFIG_MISSING } = loadContractsModule();
      const adapter = createSiliconflowWan21TurboAdapter({
        defaultEstimateCents: 21,
        fetchImpl,
        resolveMediaAssetUrl: async () => "https://example.com/still.jpg",
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
        delete process.env.SILICONFLOW_API_KEY;
      } else {
        process.env.SILICONFLOW_API_KEY = previousToken;
      }
    }
  });

  it("3 — estimate: 1 clip = 21¢; clipCount 3 = 63¢", async () => {
    const { createSiliconflowWan21TurboAdapter } = loadWanAdapterModule();
    const adapter = createSiliconflowWan21TurboAdapter({
      defaultEstimateCents: 21,
      unitCostCentsPerClip: 21,
    });

    const one = await adapter.estimateCost(baseJobInput());
    assert.equal(one.estimatedCostCents, 21);

    const three = await adapter.estimateCost(baseJobInput({ clipCount: 3 }));
    assert.equal(three.estimatedCostCents, 63);
  });

  it("4 — duration 12 → clamped to 5; duration 1 → clamped to 3", () => {
    const { clampWanClipDurationSec } = loadContractsModule();
    assert.equal(clampWanClipDurationSec(12), 5);
    assert.equal(clampWanClipDurationSec(1), 3);
    assert.equal(clampWanClipDurationSec(undefined), 5);
  });

  it("5 — validateProviderOutputUrl rejects non-allowlisted / metadata IP hosts", () => {
    const {
      validateProviderOutputUrl,
      ProviderAdapterError,
      INVALID_PROVIDER_OUTPUT_URL,
    } = loadNormalizeModule();
    const { WAN_ALLOWED_OUTPUT_HOSTS } = loadContractsModule();

    assert.throws(
      () =>
        validateProviderOutputUrl(
          "https://evil.com/x.mp4",
          WAN_ALLOWED_OUTPUT_HOSTS,
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
          "https://169.254.169.254/latest/meta-data/",
          WAN_ALLOWED_OUTPUT_HOSTS,
        ),
      (err: unknown) => {
        assert.ok(err instanceof ProviderAdapterError);
        assert.equal(err.code, INVALID_PROVIDER_OUTPUT_URL);
        return true;
      },
    );
  });

  it("6 — mock SiliconFlow error with Bearer/key → sanitized (no key substring)", async () => {
    const previousToken = process.env.SILICONFLOW_API_KEY;
    process.env.SILICONFLOW_API_KEY = API_KEY;

    const fetchImpl = mockFetchSequence([
      () =>
        new Response(
          JSON.stringify({
            message: `Unauthorized Bearer ${API_KEY} refused`,
          }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        ),
    ]);

    try {
      const { createSiliconflowWan21TurboAdapter } = loadWanAdapterModule();
      const adapter = createSiliconflowWan21TurboAdapter({
        defaultEstimateCents: 21,
        fetchImpl,
        resolveMediaAssetUrl: async () => "https://example.com/still.jpg",
      });

      await assert.rejects(
        () => adapter.createJob(baseJobInput()),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.doesNotMatch(err.message, new RegExp(API_KEY));
          assert.doesNotMatch(err.message, /Bearer\s+sk-/i);
          return true;
        },
      );
    } finally {
      if (previousToken === undefined) {
        delete process.env.SILICONFLOW_API_KEY;
      } else {
        process.env.SILICONFLOW_API_KEY = previousToken;
      }
    }
  });

  it("7 — adapter module imports server-only", () => {
    const src = readFileSync(
      path.join(__dirname, "siliconflow-wan21-turbo-adapter.ts"),
      "utf8",
    );
    assert.match(src, /import ["']server-only["']/);
  });

  it("8 — registry getVideoAdapter(siliconflow_wan21_turbo) is real (no stub id prefix)", async () => {
    const { getProviderRegistry, resetProviderRegistryForTests } =
      loadRegistryModule();
    resetProviderRegistryForTests();

    const adapter = getProviderRegistry().getVideoAdapter(
      "siliconflow_wan21_turbo",
    );
    assert.equal(adapter.providerKey, "siliconflow_wan21_turbo");
    assert.equal(adapter.videoAssetRole, "broll");

    const previousToken = process.env.SILICONFLOW_API_KEY;
    delete process.env.SILICONFLOW_API_KEY;

    try {
      await assert.rejects(
        () => adapter.createJob(baseJobInput()),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.equal((err as { code?: string }).code, "PROVIDER_CONFIG_MISSING");
          assert.doesNotMatch(
            String((err as Error).message),
            /^stub-siliconflow_wan21_turbo-/,
          );
          return true;
        },
      );
    } finally {
      if (previousToken === undefined) {
        delete process.env.SILICONFLOW_API_KEY;
      } else {
        process.env.SILICONFLOW_API_KEY = previousToken;
      }
    }
  });

  it("9 — submit body uses WAN_MODEL_ID + Bearer; status uses POST + requestId", async () => {
    const previousToken = process.env.SILICONFLOW_API_KEY;
    process.env.SILICONFLOW_API_KEY = API_KEY;
    const { WAN_MODEL_ID, WAN_SUBMIT_URL, WAN_STATUS_URL } =
      loadContractsModule();

    let submitBody: Record<string, unknown> | null = null;
    let statusBody: Record<string, unknown> | null = null;

    const fetchImpl = mockFetchSequence([
      (url, init) => {
        assert.equal(url, WAN_SUBMIT_URL);
        submitBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(JSON.stringify({ requestId: REQUEST_ID }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
      (url, init) => {
        assert.equal(url, WAN_STATUS_URL);
        assert.equal(init?.method, "POST");
        statusBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(JSON.stringify({ status: "InQueue" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    ]);

    try {
      const { createSiliconflowWan21TurboAdapter } = loadWanAdapterModule();
      const adapter = createSiliconflowWan21TurboAdapter({
        defaultEstimateCents: 21,
        fetchImpl,
        resolveMediaAssetUrl: async () => "https://example.com/still.jpg",
      });

      await adapter.createJob(baseJobInput({ targetDurationSec: 12 }));
      assert.equal(submitBody?.model, WAN_MODEL_ID);
      assert.equal(submitBody?.duration, 5);
      assert.equal(submitBody?.image_size, "720x1280");
      assert.equal(typeof submitBody?.prompt, "string");
      assert.equal(typeof submitBody?.image, "string");

      await adapter.getJobStatus(REQUEST_ID);
      assert.equal(statusBody?.requestId, REQUEST_ID);
    } finally {
      if (previousToken === undefined) {
        delete process.env.SILICONFLOW_API_KEY;
      } else {
        process.env.SILICONFLOW_API_KEY = previousToken;
      }
    }
  });
});
