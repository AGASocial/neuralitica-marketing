/**
 * US-9.3 Phase B — ElevenLabs TTS adapter (mocked HTTP only).
 */
import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  ELEVENLABS_ENV_KEY_NAME,
  ELEVENLABS_MODEL_ID,
  ELEVENLABS_TTS_PROVIDER_KEY,
  ELEVENLABS_TTS_URL_PREFIX,
} from "../../contracts/elevenlabs-tts";
import {
  PROVIDER_CONFIG_MISSING,
  PROVIDER_REQUEST_FAILED,
  PROVIDER_RESPONSE_INVALID,
} from "../../contracts/tts-voiceover";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CLIENT_ID = "00000000-0000-4000-8000-000000000002";
const REEL_SCRIPT_ID = "00000000-0000-4000-8000-000000000001";
const FAKE_MP3 = Buffer.from([0xff, 0xfb, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00]);
const SARAH_VOICE_ID = "EXAVITQu4vr4xnSDxMaL";

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
      normalized.includes("/lib/providers/tts/elevenlabs-tts-adapter") ||
      normalized.includes("/lib/providers/create-provider-registry") ||
      normalized.includes("/lib/providers/normalize-provider-response") ||
      normalized.includes("/lib/tts/voice-catalog") ||
      normalized.includes("/lib/contracts/elevenlabs-tts") ||
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
    require("./elevenlabs-tts-adapter.ts") as typeof import("./elevenlabs-tts-adapter"),
  );
}

function loadRegistryModule() {
  return withServerOnlyStub(() => require("../create-provider-registry.ts"));
}

function baseSynthesizeInput() {
  return {
    reelScriptId: REEL_SCRIPT_ID,
    clientId: CLIENT_ID,
    providerKey: ELEVENLABS_TTS_PROVIDER_KEY,
    text: "Hola, este es un voiceover en español.",
    voiceId: "es_warm_female",
    locale: "es" as const,
  };
}

function resolveFetchUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
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

describe("US-9.3 Phase B ElevenLabs TTS adapter", () => {
  it("1 — estimateCost uses per_1m_chars with minimum 1 cent", async () => {
    const previousKey = process.env[ELEVENLABS_ENV_KEY_NAME];
    process.env[ELEVENLABS_ENV_KEY_NAME] = "el_test_key";

    try {
      const { createElevenlabsTtsAdapter } = loadAdapterModule();
      const adapter = createElevenlabsTtsAdapter({
        defaultUnitCostCents: 300,
      });

      const short = await adapter.estimateCost(baseSynthesizeInput());
      assert.equal(short.estimatedCostCents, 1);
      assert.equal(short.providerKey, ELEVENLABS_TTS_PROVIDER_KEY);

      const longText = "x".repeat(2_000_000);
      const long = await adapter.estimateCost({
        ...baseSynthesizeInput(),
        text: longText,
      });
      assert.equal(long.estimatedCostCents, 600);
    } finally {
      if (previousKey === undefined) {
        delete process.env[ELEVENLABS_ENV_KEY_NAME];
      } else {
        process.env[ELEVENLABS_ENV_KEY_NAME] = previousKey;
      }
    }
  });

  it("2 — missing ELEVENLABS_API_KEY → PROVIDER_CONFIG_MISSING before fetch", async () => {
    const previousKey = process.env[ELEVENLABS_ENV_KEY_NAME];
    delete process.env[ELEVENLABS_ENV_KEY_NAME];

    try {
      const { createElevenlabsTtsAdapter } = loadAdapterModule();
      const adapter = createElevenlabsTtsAdapter({
        defaultUnitCostCents: 300,
        fetchImpl: mockFetch(() => {
          throw new Error("fetch must not be called");
        }),
      });

      await assert.rejects(
        () => adapter.synthesize(baseSynthesizeInput()),
        (error: unknown) => {
          assert.ok(error && typeof error === "object" && "code" in error);
          assert.equal(
            (error as { code: string }).code,
            PROVIDER_CONFIG_MISSING,
          );
          return true;
        },
      );
    } finally {
      if (previousKey === undefined) {
        delete process.env[ELEVENLABS_ENV_KEY_NAME];
      } else {
        process.env[ELEVENLABS_ENV_KEY_NAME] = previousKey;
      }
    }
  });

  it("3 — synthesize posts to ElevenLabs and uploads mp3", async () => {
    const previousKey = process.env[ELEVENLABS_ENV_KEY_NAME];
    process.env[ELEVENLABS_ENV_KEY_NAME] = "el_test_key";

    try {
      const { createElevenlabsTtsAdapter } = loadAdapterModule();
      let capturedUrl = "";
      let capturedBody: Record<string, unknown> | null = null;
      let capturedApiKey = "";

      const adapter = createElevenlabsTtsAdapter({
        defaultUnitCostCents: 300,
        uploadAudioBuffer: async ({ buffer, mimeType }) => {
          assert.equal(mimeType, "audio/mpeg");
          assert.ok(buffer.equals(FAKE_MP3));
          return {
            storageKey: `neuramark/${CLIENT_ID}/${REEL_SCRIPT_ID}/voice.mp3`,
            sizeBytes: buffer.length,
          };
        },
        fetchImpl: mockFetch((url, init) => {
          capturedUrl = url;
          capturedApiKey = String(
            (init?.headers as Record<string, string>)?.["xi-api-key"] ?? "",
          );
          capturedBody = JSON.parse(String(init?.body ?? "{}")) as Record<
            string,
            unknown
          >;
          return new Response(FAKE_MP3, {
            status: 200,
            headers: { "content-type": "audio/mpeg" },
          });
        }),
      });

      const result = await adapter.synthesize(baseSynthesizeInput());
      assert.equal(
        result.storageKey,
        `neuramark/${CLIENT_ID}/${REEL_SCRIPT_ID}/voice.mp3`,
      );
      assert.equal(result.mimeType, "audio/mpeg");
      assert.equal(result.actualCostCents, 1);
      assert.ok(
        capturedUrl.startsWith(
          `${ELEVENLABS_TTS_URL_PREFIX}/${SARAH_VOICE_ID}`,
        ),
      );
      assert.equal(capturedApiKey, "el_test_key");
      assert.equal(capturedBody?.model_id, ELEVENLABS_MODEL_ID);
      assert.equal(
        capturedBody?.text,
        "Hola, este es un voiceover en español.",
      );
    } finally {
      if (previousKey === undefined) {
        delete process.env[ELEVENLABS_ENV_KEY_NAME];
      } else {
        process.env[ELEVENLABS_ENV_KEY_NAME] = previousKey;
      }
    }
  });

  it("4 — vendor 4xx → PROVIDER_REQUEST_FAILED", async () => {
    const previousKey = process.env[ELEVENLABS_ENV_KEY_NAME];
    process.env[ELEVENLABS_ENV_KEY_NAME] = "el_test_key";

    try {
      const { createElevenlabsTtsAdapter } = loadAdapterModule();
      const adapter = createElevenlabsTtsAdapter({
        defaultUnitCostCents: 300,
        fetchImpl: mockFetch(
          () =>
            new Response(JSON.stringify({ detail: { status: "quota_exceeded" } }), {
              status: 401,
            }),
        ),
      });

      await assert.rejects(
        () => adapter.synthesize(baseSynthesizeInput()),
        (error: unknown) => {
          assert.equal(
            (error as { code: string }).code,
            PROVIDER_REQUEST_FAILED,
          );
          return true;
        },
      );
    } finally {
      if (previousKey === undefined) {
        delete process.env[ELEVENLABS_ENV_KEY_NAME];
      } else {
        process.env[ELEVENLABS_ENV_KEY_NAME] = previousKey;
      }
    }
  });

  it("5 — non-mp3 body → PROVIDER_RESPONSE_INVALID", async () => {
    const previousKey = process.env[ELEVENLABS_ENV_KEY_NAME];
    process.env[ELEVENLABS_ENV_KEY_NAME] = "el_test_key";

    try {
      const { createElevenlabsTtsAdapter } = loadAdapterModule();
      const adapter = createElevenlabsTtsAdapter({
        defaultUnitCostCents: 300,
        fetchImpl: mockFetch(
          () =>
            new Response(Buffer.from("not-audio"), {
              status: 200,
              headers: { "content-type": "application/json" },
            }),
        ),
      });

      await assert.rejects(
        () => adapter.synthesize(baseSynthesizeInput()),
        (error: unknown) => {
          assert.equal(
            (error as { code: string }).code,
            PROVIDER_RESPONSE_INVALID,
          );
          return true;
        },
      );
    } finally {
      if (previousKey === undefined) {
        delete process.env[ELEVENLABS_ENV_KEY_NAME];
      } else {
        process.env[ELEVENLABS_ENV_KEY_NAME] = previousKey;
      }
    }
  });

  it("6 — getTtsAdapter(elevenlabs_tts_high) when env set", () => {
    const previousKey = process.env[ELEVENLABS_ENV_KEY_NAME];
    process.env[ELEVENLABS_ENV_KEY_NAME] = "el_test_key";

    try {
      const { createProviderRegistry, resetProviderRegistryForTests } =
        loadRegistryModule() as {
          createProviderRegistry: () => {
            getTtsAdapter: (key: string) => { providerKey: string };
          };
          resetProviderRegistryForTests: () => void;
        };
      resetProviderRegistryForTests();
      const registry = createProviderRegistry();
      const adapter = registry.getTtsAdapter(ELEVENLABS_TTS_PROVIDER_KEY);
      assert.equal(adapter.providerKey, ELEVENLABS_TTS_PROVIDER_KEY);
    } finally {
      if (previousKey === undefined) {
        delete process.env[ELEVENLABS_ENV_KEY_NAME];
      } else {
        process.env[ELEVENLABS_ENV_KEY_NAME] = previousKey;
      }
    }
  });

  void __dirname;
});
