/**
 * SiliconFlow base URL resolution — international .com default + allowlisted .cn.
 */
import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type NodeModuleLoad = {
  _load: (
    request: string,
    parent: NodeModule | null | undefined,
    isMain: boolean,
  ) => unknown;
};

function clearBaseUrlModuleCache() {
  for (const key of Object.keys(require.cache)) {
    if (key.replace(/\\/g, "/").includes("/lib/providers/siliconflow-base-url")) {
      delete require.cache[key];
    }
  }
}

function withServerOnlyStub<T>(run: () => T): T {
  const moduleAny = Module as unknown as NodeModuleLoad;
  const originalLoad = moduleAny._load;
  moduleAny._load = function (
    request: string,
    parent: NodeModule | null | undefined,
    isMain: boolean,
  ) {
    if (request === "server-only") {
      return {};
    }
    return originalLoad(request, parent, isMain);
  };
  try {
    return run();
  } finally {
    moduleAny._load = originalLoad;
  }
}

function loadBaseUrlModule() {
  clearBaseUrlModuleCache();
  return withServerOnlyStub(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(path.join(__dirname, "siliconflow-base-url.ts")) as {
      resolveSiliconFlowApiBaseUrl: () => string;
      resolveSiliconFlowTtsSpeechUrl: () => string;
      resolveSiliconFlowChatCompletionsUrl: () => string;
    };
  });
}

describe("resolveSiliconFlowApiBaseUrl", () => {
  const previous = process.env.SILICONFLOW_BASE_URL;

  afterEach(() => {
    if (previous === undefined) {
      delete process.env.SILICONFLOW_BASE_URL;
    } else {
      process.env.SILICONFLOW_BASE_URL = previous;
    }
    clearBaseUrlModuleCache();
  });

  it("defaults to international .com host", () => {
    delete process.env.SILICONFLOW_BASE_URL;
    const {
      resolveSiliconFlowApiBaseUrl,
      resolveSiliconFlowTtsSpeechUrl,
      resolveSiliconFlowChatCompletionsUrl,
    } = loadBaseUrlModule();
    assert.equal(
      resolveSiliconFlowApiBaseUrl(),
      "https://api.siliconflow.com",
    );
    assert.equal(
      resolveSiliconFlowTtsSpeechUrl(),
      "https://api.siliconflow.com/v1/audio/speech",
    );
    assert.equal(
      resolveSiliconFlowChatCompletionsUrl(),
      "https://api.siliconflow.com/v1/chat/completions",
    );
  });

  it("accepts allowlisted China host override", () => {
    process.env.SILICONFLOW_BASE_URL = "https://api.siliconflow.cn";
    const { resolveSiliconFlowApiBaseUrl, resolveSiliconFlowTtsSpeechUrl } =
      loadBaseUrlModule();
    assert.equal(resolveSiliconFlowApiBaseUrl(), "https://api.siliconflow.cn");
    assert.equal(
      resolveSiliconFlowTtsSpeechUrl(),
      "https://api.siliconflow.cn/v1/audio/speech",
    );
  });

  it("rejects non-allowlisted hosts", () => {
    process.env.SILICONFLOW_BASE_URL = "https://evil.example/v1";
    const { resolveSiliconFlowApiBaseUrl } = loadBaseUrlModule();
    assert.equal(
      resolveSiliconFlowApiBaseUrl(),
      "https://api.siliconflow.com",
    );
  });
});
