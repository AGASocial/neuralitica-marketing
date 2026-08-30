/**
 * US-9.3 CosyVoice2 TTS adapter — mocked HTTP only.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Module from "node:module";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  PROVIDER_CONFIG_MISSING,
  PROVIDER_REQUEST_FAILED,
  PROVIDER_RESPONSE_INVALID,
  SILICONFLOW_TTS_SPEECH_URL,
  TTS_MAX_AUDIO_BYTES,
} from "../../contracts/tts-voiceover";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CLIENT_ID = "00000000-0000-4000-8000-000000000002";
const REEL_SCRIPT_ID = "00000000-0000-4000-8000-000000000001";

const FAKE_MP3 = Buffer.from([0xff, 0xfb, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00]);

type NodeModuleLoad = {
  _load: (
    request: string,
    parent: NodeModule | null | undefined,
    isMain: boolean,
  ) => unknown;
};

function clearTtsModuleCache() {
  for (const key of Object.keys(require.cache)) {
    const normalized = key.replace(/\\/g, "/");
    if (
      normalized.includes("/lib/providers/tts/siliconflow-cosyvoice2-adapter") ||
      normalized.includes("/lib/providers/create-provider-registry") ||
      normalized.includes("/lib/providers/normalize-provider-response") ||
      normalized.includes("/lib/tts/voice-catalog") ||
      normalized.includes("/lib/media/upload-voiceover-buffer") ||
      normalized.includes("/lib/media/storage/")
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
    clearTtsModuleCache();
    return run();
  } finally {
    nodeModule._load = originalLoad;
    clearTtsModuleCache();
  }
}

function loadAdapterModule() {
  return withServerOnlyStub(() =>
    require("./siliconflow-cosyvoice2-adapter.ts") as typeof import("./siliconflow-cosyvoice2-adapter"),
  );
}

function loadRegistryModule() {
  return withServerOnlyStub(() => require("../create-provider-registry.ts"));
}

function baseSynthesizeInput() {
  return {
    reelScriptId: REEL_SCRIPT_ID,
    clientId: CLIENT_ID,
    providerKey: "siliconflow_cosyvoice2",
    text: "Hello from CosyVoice2.",
    voiceId: "en_warm_female",
    locale: "en" as const,
  };
}

function resolveFetchUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  return input.url;
}

function mockFetch(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = resolveFetchUrl(input);
    return handler(url, init);
  }) as typeof fetch;
}

describe("US-9.3 CosyVoice2 adapter", () => {
  it("1 — estimateCost uses per_1m_chars with minimum 1 cent", async () => {
    const previousKey = process.env.SILICONFLOW_API_KEY;
    process.env.SILICONFLOW_API_KEY = "sf_test_key";

    try {
      const { createSiliconflowCosyvoice2Adapter } = loadAdapterModule();
      const adapter = createSiliconflowCosyvoice2Adapter({
        defaultUnitCostCents: 1,
      });

      const short = await adapter.estimateCost(baseSynthesizeInput());
      assert.equal(short.estimatedCostCents, 1);
      assert.equal(short.providerKey, "siliconflow_cosyvoice2");

      const longText = "x".repeat(2_000_000);
      const long = await adapter.estimateCost({
        ...baseSynthesizeInput(),
        text: longText,
      });
      assert.equal(long.estimatedCostCents, 2);
    } finally {
      if (previousKey === undefined) {
        delete process.env.SILICONFLOW_API_KEY;
      } else {
        process.env.SILICONFLOW_API_KEY = previousKey;
      }
    }
  });

  it("2 — missing SILICONFLOW_API_KEY → PROVIDER_CONFIG_MISSING before fetch", async () => {
    const previousKey = process.env.SILICONFLOW_API_KEY;
    delete process.env.SILICONFLOW_API_KEY;

    try {
      const { createSiliconflowCosyvoice2Adapter } = loadAdapterModule();
      const adapter = createSiliconflowCosyvoice2Adapter({
        defaultUnitCostCents: 1,
        fetchImpl: mockFetch(() => {
          throw new Error("fetch must not be called");
        }),
      });

      await assert.rejects(
        () => adapter.synthesize(baseSynthesizeInput()),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.equal((err as { code?: string }).code, PROVIDER_CONFIG_MISSING);
          return true;
        },
      );
    } finally {
      if (previousKey === undefined) {
        delete process.env.SILICONFLOW_API_KEY;
      } else {
        process.env.SILICONFLOW_API_KEY = previousKey;
      }
    }
  });

  it("3 — mocked synthesize round-trip uploads mp3 with storage key pattern", async () => {
    const previousKey = process.env.SILICONFLOW_API_KEY;
    process.env.SILICONFLOW_API_KEY = "sf_test_key";

    let requestBody: Record<string, unknown> | null = null;
    const uploaded: { storageKey?: string; sizeBytes?: number } = {};

    try {
      const { createSiliconflowCosyvoice2Adapter } = loadAdapterModule();
      const adapter = createSiliconflowCosyvoice2Adapter({
        defaultUnitCostCents: 1,
        fetchImpl: mockFetch((url, init) => {
          assert.equal(url, SILICONFLOW_TTS_SPEECH_URL);
          const authHeader =
            init?.headers instanceof Headers
              ? init.headers.get("Authorization")
              : (init?.headers as Record<string, string> | undefined)
                  ?.Authorization;
          assert.equal(authHeader, "Bearer sf_test_key");
          requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
          return new Response(FAKE_MP3, {
            status: 200,
            headers: { "Content-Type": "audio/mpeg" },
          });
        }),
        uploadAudioBuffer: async (args) => {
          uploaded.storageKey = `neuramark/${args.clientId}/${args.reelScriptId}/test-id.mp3`;
          uploaded.sizeBytes = args.buffer.length;
          return {
            storageKey: uploaded.storageKey,
            sizeBytes: args.buffer.length,
          };
        },
      });

      const result = await adapter.synthesize(baseSynthesizeInput());

      assert.equal(requestBody?.model, "FunAudioLLM/CosyVoice2-0.5B");
      assert.equal(requestBody?.voice, "FunAudioLLM/CosyVoice2-0.5B:claire");
      assert.equal(requestBody?.response_format, "mp3");
      assert.match(String(uploaded.storageKey), /^neuramark\/.+\/.+\/.+\.mp3$/);
      assert.equal(result.mimeType, "audio/mpeg");
      assert.equal(result.sizeBytes, FAKE_MP3.length);
      assert.equal(result.actualCostCents, 1);
    } finally {
      if (previousKey === undefined) {
        delete process.env.SILICONFLOW_API_KEY;
      } else {
        process.env.SILICONFLOW_API_KEY = previousKey;
      }
    }
  });

  it("4 — non-2xx response → PROVIDER_REQUEST_FAILED with sanitized message", async () => {
    const previousKey = process.env.SILICONFLOW_API_KEY;
    process.env.SILICONFLOW_API_KEY = "sf_test_key";

    try {
      const { createSiliconflowCosyvoice2Adapter } = loadAdapterModule();
      const adapter = createSiliconflowCosyvoice2Adapter({
        defaultUnitCostCents: 1,
        fetchImpl: mockFetch(() =>
          new Response("Bearer sk-leaked-token failed", { status: 502 }),
        ),
        uploadAudioBuffer: async () => ({
          storageKey: "unused",
          sizeBytes: 1,
        }),
      });

      await assert.rejects(
        () => adapter.synthesize(baseSynthesizeInput()),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.equal((err as { code?: string }).code, PROVIDER_REQUEST_FAILED);
          assert.equal(String(err).includes("sk-leaked"), false);
          assert.equal(String(err).includes("Bearer"), false);
          return true;
        },
      );
    } finally {
      if (previousKey === undefined) {
        delete process.env.SILICONFLOW_API_KEY;
      } else {
        process.env.SILICONFLOW_API_KEY = previousKey;
      }
    }
  });

  it("5 — oversized audio → PROVIDER_RESPONSE_INVALID", async () => {
    const previousKey = process.env.SILICONFLOW_API_KEY;
    process.env.SILICONFLOW_API_KEY = "sf_test_key";

    try {
      const { createSiliconflowCosyvoice2Adapter } = loadAdapterModule();
      const oversized = Buffer.alloc(TTS_MAX_AUDIO_BYTES + 1, 0xff);
      oversized[1] = 0xfb;

      const adapter = createSiliconflowCosyvoice2Adapter({
        defaultUnitCostCents: 1,
        fetchImpl: mockFetch(() =>
          new Response(oversized, {
            status: 200,
            headers: { "Content-Type": "audio/mpeg" },
          }),
        ),
        uploadAudioBuffer: async () => ({
          storageKey: "unused",
          sizeBytes: 1,
        }),
      });

      await assert.rejects(
        () => adapter.synthesize(baseSynthesizeInput()),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.equal((err as { code?: string }).code, PROVIDER_RESPONSE_INVALID);
          return true;
        },
      );
    } finally {
      if (previousKey === undefined) {
        delete process.env.SILICONFLOW_API_KEY;
      } else {
        process.env.SILICONFLOW_API_KEY = previousKey;
      }
    }
  });

  it("6 — invalid audio bytes → PROVIDER_RESPONSE_INVALID", async () => {
    const previousKey = process.env.SILICONFLOW_API_KEY;
    process.env.SILICONFLOW_API_KEY = "sf_test_key";

    try {
      const { createSiliconflowCosyvoice2Adapter } = loadAdapterModule();
      const adapter = createSiliconflowCosyvoice2Adapter({
        defaultUnitCostCents: 1,
        fetchImpl: mockFetch(() =>
          new Response(Buffer.from("not-audio"), {
            status: 200,
            headers: { "Content-Type": "text/plain" },
          }),
        ),
        uploadAudioBuffer: async () => ({
          storageKey: "unused",
          sizeBytes: 1,
        }),
      });

      await assert.rejects(
        () => adapter.synthesize(baseSynthesizeInput()),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.equal((err as { code?: string }).code, PROVIDER_RESPONSE_INVALID);
          return true;
        },
      );
    } finally {
      if (previousKey === undefined) {
        delete process.env.SILICONFLOW_API_KEY;
      } else {
        process.env.SILICONFLOW_API_KEY = previousKey;
      }
    }
  });

  it("7 — isMp3Buffer detects ID3 and frame sync", () => {
    const { isMp3Buffer } = loadAdapterModule();
    assert.equal(isMp3Buffer(Buffer.from("ID3")), true);
    assert.equal(isMp3Buffer(FAKE_MP3), true);
    assert.equal(isMp3Buffer(Buffer.from("plain")), false);
  });

  it("8 — module includes import server-only", () => {
    const source = readFileSync(
      path.join(__dirname, "siliconflow-cosyvoice2-adapter.ts"),
      "utf8",
    );
    assert.match(source, /import ["']server-only["']/);
  });
});

describe("US-9.3 TTS registry", () => {
  it("9 — getTtsAdapter(siliconflow_cosyvoice2) returns real adapter when env set", () => {
    const previousKey = process.env.SILICONFLOW_API_KEY;
    process.env.SILICONFLOW_API_KEY = "sf_test_key";

    try {
      clearTtsModuleCache();
      const {
        createProviderRegistry,
        resetProviderRegistryForTests,
      } = loadRegistryModule();
      resetProviderRegistryForTests();

      const registry = createProviderRegistry();
      const adapter = registry.getTtsAdapter("siliconflow_cosyvoice2");
      assert.equal(adapter.providerKey, "siliconflow_cosyvoice2");
      assert.equal(typeof adapter.estimateCost, "function");
      assert.equal(typeof adapter.synthesize, "function");
    } finally {
      if (previousKey === undefined) {
        delete process.env.SILICONFLOW_API_KEY;
      } else {
        process.env.SILICONFLOW_API_KEY = previousKey;
      }
    }
  });
});
