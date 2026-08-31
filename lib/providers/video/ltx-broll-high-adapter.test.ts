/**
 * US-8.8 Phase A — FAL LTX 2.3 Pro I2V adapter — mocked HTTP only.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Module from "node:module";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { providerCatalogRowSchema } from "../../contracts/providers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CLIENT_ID = "22222222-2222-4222-8222-222222222222";
const REEL_SCRIPT_ID = "11111111-1111-4111-8111-111111111111";
const STILL_ASSET_ID = "33333333-3333-4333-8333-333333333333";
const REQUEST_ID = "ltx_mock_request_001";
const OUTPUT_URL =
  "https://v3b.fal.media/files/b/mock/ltx_clip_001.mp4";
const API_KEY = "fal-test-key-abcdefghijklmnopqrstuvwxyz123456";

type NodeModuleLoad = {
  _load: (
    request: string,
    parent: NodeModule | null | undefined,
    isMain: boolean,
  ) => unknown;
};

function clearLtxModuleCache() {
  for (const key of Object.keys(require.cache)) {
    const normalized = key.replace(/\\/g, "/");
    if (
      normalized.includes("/lib/providers/video/ltx-broll-high-adapter") ||
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
    clearLtxModuleCache();
    return run();
  } finally {
    nodeModule._load = originalLoad;
    clearLtxModuleCache();
  }
}

function loadLtxAdapterModule() {
  return withServerOnlyStub(
    () =>
      require("./ltx-broll-high-adapter.ts") as typeof import("./ltx-broll-high-adapter"),
  );
}

function loadNormalizeModule() {
  return withServerOnlyStub(() => require("../normalize-provider-response.ts"));
}

function loadContractsModule() {
  return require("../../contracts/ltx-broll-high.ts") as typeof import("../../contracts/ltx-broll-high");
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
    providerKey: "ltx_broll_high",
    providerTier: "high" as const,
    assetRole: "broll" as const,
    targetDurationSec: 5,
    referenceImageAssetId: STILL_ASSET_ID,
    prompt: "High-polish cinematic B-roll. <<BEAT>>Storefront morning light<</BEAT>>",
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

function buildCatalogWithLtx() {
  return [
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
      key: "musetalk_low",
      assetRole: "talking_head",
      tier: "low",
      active: true,
      capabilities: {},
      costModel: { billingUnit: "per_run", unitCostCents: 19 },
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
      key: "ltx_broll_high",
      assetRole: "broll",
      tier: "high",
      active: false,
      capabilities: {},
      costModel: {
        billingUnit: "per_clip",
        unitCostCents: 126,
        metadata: { clipDurationSec: 5, model: "ltx-2.3-pro" },
      },
      envKeyName: "FAL_API_KEY",
    }),
    providerCatalogRowSchema.parse({
      key: "manual",
      assetRole: "talking_head",
      tier: "low",
      active: true,
      capabilities: { manualFallback: true },
      costModel: { billingUnit: "per_run", unitCostCents: 0 },
      envKeyName: "NEURAMARK_MANUAL_FALLBACK",
    }),
  ];
}

describe("US-8.8 LTX adapter (Phase A)", () => {
  it("1 — mocked create → processing → completed → fetchAsset round-trip", async () => {
    const previousToken = process.env.FAL_API_KEY;
    process.env.FAL_API_KEY = API_KEY;

    const uploaded: { storageKey?: string; sizeBytes?: number } = {};
    const {
      LTX_SUBMIT_URL,
      buildLtxStatusUrl,
      buildLtxResultUrl,
    } = loadContractsModule();

    const fetchImpl = mockFetchSequence([
      (url, init) => {
        assert.equal(url, LTX_SUBMIT_URL);
        assert.equal(init?.method, "POST");
        const auth = (init?.headers as Record<string, string>)?.Authorization;
        assert.equal(auth, `Key ${API_KEY}`);
        return new Response(
          JSON.stringify({
            request_id: REQUEST_ID,
            status_url: buildLtxStatusUrl(REQUEST_ID),
            response_url: buildLtxResultUrl(REQUEST_ID),
            queue_position: 0,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
      (url, init) => {
        assert.equal(url, buildLtxStatusUrl(REQUEST_ID));
        assert.equal(init?.method, "GET");
        return new Response(JSON.stringify({ status: "IN_PROGRESS" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
      (url) => {
        assert.equal(url, buildLtxStatusUrl(REQUEST_ID));
        return new Response(JSON.stringify({ status: "COMPLETED" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
      (url) => {
        assert.equal(url, buildLtxResultUrl(REQUEST_ID));
        return new Response(
          JSON.stringify({
            video: {
              content_type: "video/mp4",
              file_name: "ltx_clip_001.mp4",
              url: OUTPUT_URL,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
      () =>
        new Response(Buffer.from("fake-ltx-mp4-bytes"), {
          status: 200,
          headers: { "Content-Type": "video/mp4" },
        }),
    ]);

    try {
      const { createLtxBrollHighAdapter } = loadLtxAdapterModule();
      const adapter = createLtxBrollHighAdapter({
        defaultEstimateCents: 126,
        unitCostCentsPerClip: 126,
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
      assert.equal(created.estimatedCostCents, 126);

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
      assert.equal(asset.actualCostCents, 126);
    } finally {
      if (previousToken === undefined) {
        delete process.env.FAL_API_KEY;
      } else {
        process.env.FAL_API_KEY = previousToken;
      }
    }
  });

  it("2 — missing FAL_API_KEY → PROVIDER_CONFIG_MISSING before fetch", async () => {
    const previousToken = process.env.FAL_API_KEY;
    delete process.env.FAL_API_KEY;

    let fetchCalled = false;
    const fetchImpl = (async () => {
      fetchCalled = true;
      return new Response("unexpected", { status: 500 });
    }) as typeof fetch;

    try {
      const { createLtxBrollHighAdapter } = loadLtxAdapterModule();
      const { PROVIDER_CONFIG_MISSING } = loadContractsModule();
      const adapter = createLtxBrollHighAdapter({
        defaultEstimateCents: 126,
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
        delete process.env.FAL_API_KEY;
      } else {
        process.env.FAL_API_KEY = previousToken;
      }
    }
  });

  it("3 — estimate: 1 clip = 126¢; clipCount 3 = 378¢", async () => {
    const { createLtxBrollHighAdapter } = loadLtxAdapterModule();
    const adapter = createLtxBrollHighAdapter({
      defaultEstimateCents: 126,
      unitCostCentsPerClip: 126,
    });

    const one = await adapter.estimateCost(baseJobInput());
    assert.equal(one.estimatedCostCents, 126);

    const three = await adapter.estimateCost(baseJobInput({ clipCount: 3 }));
    assert.equal(three.estimatedCostCents, 378);
  });

  it("4 — orchestrator duration 5 → FAL body duration: 6 (vendor floor)", async () => {
    const previousToken = process.env.FAL_API_KEY;
    process.env.FAL_API_KEY = API_KEY;
    const { LTX_SUBMIT_URL } = loadContractsModule();

    let submitBody: Record<string, unknown> | null = null;
    const fetchImpl = mockFetchSequence([
      (url, init) => {
        assert.equal(url, LTX_SUBMIT_URL);
        submitBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(JSON.stringify({ request_id: REQUEST_ID }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    ]);

    try {
      const { createLtxBrollHighAdapter } = loadLtxAdapterModule();
      const adapter = createLtxBrollHighAdapter({
        defaultEstimateCents: 126,
        fetchImpl,
        resolveMediaAssetUrl: async () => "https://example.com/still.jpg",
      });

      await adapter.createJob(baseJobInput({ targetDurationSec: 5 }));
      assert.equal(submitBody?.duration, 6);
      assert.equal(submitBody?.aspect_ratio, "9:16");
      assert.equal(submitBody?.generate_audio, false);
      assert.equal(submitBody?.resolution, "1080p");
      assert.equal(submitBody?.fps, 25);
    } finally {
      if (previousToken === undefined) {
        delete process.env.FAL_API_KEY;
      } else {
        process.env.FAL_API_KEY = previousToken;
      }
    }
  });

  it("5 — validateProviderOutputUrl rejects non-allowlisted / metadata IP hosts", () => {
    const {
      validateProviderOutputUrl,
      ProviderAdapterError,
      INVALID_PROVIDER_OUTPUT_URL,
    } = loadNormalizeModule();
    const { LTX_ALLOWED_OUTPUT_HOSTS } = loadContractsModule();

    assert.throws(
      () =>
        validateProviderOutputUrl(
          "https://evil.com/x.mp4",
          LTX_ALLOWED_OUTPUT_HOSTS,
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
          LTX_ALLOWED_OUTPUT_HOSTS,
        ),
      (err: unknown) => {
        assert.ok(err instanceof ProviderAdapterError);
        assert.equal(err.code, INVALID_PROVIDER_OUTPUT_URL);
        return true;
      },
    );
  });

  it("6 — mock FAL error with Key/key material → sanitized (no key substring)", async () => {
    const previousToken = process.env.FAL_API_KEY;
    process.env.FAL_API_KEY = API_KEY;

    const fetchImpl = mockFetchSequence([
      () =>
        new Response(
          JSON.stringify({
            error: `Unauthorized Key ${API_KEY} refused`,
          }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        ),
    ]);

    try {
      const { createLtxBrollHighAdapter } = loadLtxAdapterModule();
      const adapter = createLtxBrollHighAdapter({
        defaultEstimateCents: 126,
        fetchImpl,
        resolveMediaAssetUrl: async () => "https://example.com/still.jpg",
      });

      await assert.rejects(
        () => adapter.createJob(baseJobInput()),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.doesNotMatch(err.message, new RegExp(API_KEY));
          assert.doesNotMatch(err.message, /Key\s+fal-/i);
          return true;
        },
      );
    } finally {
      if (previousToken === undefined) {
        delete process.env.FAL_API_KEY;
      } else {
        process.env.FAL_API_KEY = previousToken;
      }
    }
  });

  it("7 — adapter module imports server-only", () => {
    const src = readFileSync(
      path.join(__dirname, "ltx-broll-high-adapter.ts"),
      "utf8",
    );
    assert.match(src, /import ["']server-only["']/);
  });

  it("8 — registry getVideoAdapter(ltx_broll_high) when catalog row present", async () => {
    const { createProviderRegistry, resetProviderRegistryForTests } =
      loadRegistryModule();
    resetProviderRegistryForTests();

    const registry = createProviderRegistry(buildCatalogWithLtx());
    const adapter = registry.getVideoAdapter("ltx_broll_high");
    assert.equal(adapter.providerKey, "ltx_broll_high");
    assert.equal(adapter.videoAssetRole, "broll");

    const previousToken = process.env.FAL_API_KEY;
    delete process.env.FAL_API_KEY;

    try {
      await assert.rejects(
        () => adapter.createJob(baseJobInput()),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.equal((err as { code?: string }).code, "PROVIDER_CONFIG_MISSING");
          assert.doesNotMatch(
            String((err as Error).message),
            /^stub-ltx_broll_high-/,
          );
          return true;
        },
      );
    } finally {
      if (previousToken === undefined) {
        delete process.env.FAL_API_KEY;
      } else {
        process.env.FAL_API_KEY = previousToken;
      }
    }
  });

  it("9 — submit uses Authorization: Key; status GET + result GET on completed", async () => {
    const previousToken = process.env.FAL_API_KEY;
    process.env.FAL_API_KEY = API_KEY;
    const {
      LTX_SUBMIT_URL,
      buildLtxStatusUrl,
      buildLtxResultUrl,
    } = loadContractsModule();

    const methods: string[] = [];
    const auths: string[] = [];

    const fetchImpl = mockFetchSequence([
      (url, init) => {
        assert.equal(url, LTX_SUBMIT_URL);
        methods.push(init?.method ?? "GET");
        auths.push(
          (init?.headers as Record<string, string>)?.Authorization ?? "",
        );
        return new Response(JSON.stringify({ request_id: REQUEST_ID }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
      (url, init) => {
        assert.equal(url, buildLtxStatusUrl(REQUEST_ID));
        methods.push(init?.method ?? "GET");
        auths.push(
          (init?.headers as Record<string, string>)?.Authorization ?? "",
        );
        return new Response(JSON.stringify({ status: "COMPLETED" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
      (url, init) => {
        assert.equal(url, buildLtxResultUrl(REQUEST_ID));
        methods.push(init?.method ?? "GET");
        auths.push(
          (init?.headers as Record<string, string>)?.Authorization ?? "",
        );
        return new Response(
          JSON.stringify({
            video: { url: OUTPUT_URL },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    ]);

    try {
      const { createLtxBrollHighAdapter } = loadLtxAdapterModule();
      const adapter = createLtxBrollHighAdapter({
        defaultEstimateCents: 126,
        fetchImpl,
        resolveMediaAssetUrl: async () => "https://example.com/still.jpg",
      });

      await adapter.createJob(baseJobInput());
      const status = await adapter.getJobStatus(REQUEST_ID);
      assert.equal(status.status, "completed");
      assert.equal(status.rawOutputUrl, OUTPUT_URL);

      assert.deepEqual(methods, ["POST", "GET", "GET"]);
      for (const auth of auths) {
        assert.equal(auth, `Key ${API_KEY}`);
        assert.doesNotMatch(auth, /^Bearer /);
      }
    } finally {
      if (previousToken === undefined) {
        delete process.env.FAL_API_KEY;
      } else {
        process.env.FAL_API_KEY = previousToken;
      }
    }
  });

  it("10 — create body includes aspect_ratio 9:16 and generate_audio false", async () => {
    const previousToken = process.env.FAL_API_KEY;
    process.env.FAL_API_KEY = API_KEY;

    let submitBody: Record<string, unknown> | null = null;
    const fetchImpl = mockFetchSequence([
      (_url, init) => {
        submitBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(JSON.stringify({ request_id: REQUEST_ID }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    ]);

    try {
      const { createLtxBrollHighAdapter } = loadLtxAdapterModule();
      const adapter = createLtxBrollHighAdapter({
        defaultEstimateCents: 126,
        fetchImpl,
        resolveMediaAssetUrl: async () => "https://example.com/still.jpg",
      });

      await adapter.createJob(baseJobInput());
      assert.equal(submitBody?.aspect_ratio, "9:16");
      assert.equal(submitBody?.generate_audio, false);
    } finally {
      if (previousToken === undefined) {
        delete process.env.FAL_API_KEY;
      } else {
        process.env.FAL_API_KEY = previousToken;
      }
    }
  });
});
