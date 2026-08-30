/**
 * US-9.3 — synthesizeVoiceoverForReelScript orchestrator tests.
 */
import assert from "node:assert/strict";
import Module from "node:module";
import { afterEach, describe, it } from "node:test";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const REEL_SCRIPT_ID = "33333333-3333-4333-8333-333333333333";
const VOICEOVER_ASSET_ID = "77777777-7777-4777-8777-777777777777";

type NodeModuleLoad = {
  _load: (
    request: string,
    parent: NodeModule | null | undefined,
    isMain: boolean,
  ) => unknown;
};

function withServerOnlyStub<T>(run: () => T | Promise<T>): Promise<T> {
  const nodeModule = Module as unknown as NodeModuleLoad;
  const originalLoad = nodeModule._load.bind(nodeModule);
  nodeModule._load = function (request, parent, isMain) {
    if (request === "server-only") {
      return {};
    }
    return originalLoad(request, parent, isMain);
  };
  return Promise.resolve(run()).finally(() => {
    nodeModule._load = originalLoad;
  });
}

function clearTtsModuleCache() {
  for (const key of Object.keys(require.cache)) {
    const normalized = key.replace(/\\/g, "/");
    if (
      normalized.includes("/lib/tts/") ||
      normalized.includes("/lib/auth/require-user") ||
      normalized.includes("/lib/supabase/server")
    ) {
      delete require.cache[key];
    }
  }
}

function loadTtsModule<T = Record<string, unknown>>(relativePath: string): T {
  clearTtsModuleCache();
  return require(relativePath) as T;
}

type MockOptions = {
  role?: "operator" | "client";
  voiceoverText?: string;
  priorVoiceoverAssetId?: string | null;
  budgetOk?: boolean;
  synthesizeThrows?: boolean;
  onSynthesize?: () => void;
  onSpend?: () => void;
};

function installMocks(options: MockOptions = {}) {
  const nodeModule = Module as unknown as NodeModuleLoad;
  const originalLoad = nodeModule._load.bind(nodeModule);
  let synthesizeCalled = false;
  let spendCalled = false;

  const mockAdapter = {
    estimateCost: async () => ({ estimatedCostCents: 1 }),
    synthesize: async () => {
      synthesizeCalled = true;
      options.onSynthesize?.();
      if (options.synthesizeThrows) {
        throw new Error("vendor failed");
      }
      return {
        storageKey: `neuramark/${CLIENT_ID}/${REEL_SCRIPT_ID}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.mp3`,
        mimeType: "audio/mpeg",
        sizeBytes: 1024,
        actualCostCents: 1,
      };
    },
  };

  nodeModule._load = function (request, parent, isMain) {
    if (request === "server-only") return {};
    const req = String(request);

    if (req.includes("require-user")) {
      return {
        isAuthGuardError: (error: unknown) =>
          Boolean(
            error &&
              typeof error === "object" &&
              "status" in error &&
              ((error as { status: number }).status === 401 ||
                (error as { status: number }).status === 403),
          ),
        requireOperator: async () => {
          if (options.role === "client") {
            const err = Object.assign(new Error("forbidden"), { status: 403 });
            throw err;
          }
          return {
            id: CLIENT_ID,
            role: "operator",
            preferredLocale: "en",
          };
        },
      };
    }

    if (req.includes("load-reel-script-for-voiceover")) {
      return {
        loadReelScriptForVoiceover: async () => ({
          reelScriptId: REEL_SCRIPT_ID,
          clientId: CLIENT_ID,
          strategyId: "22222222-2222-4222-8222-222222222222",
          slotIndex: 0,
          voiceoverText: options.voiceoverText ?? "Hello world voiceover",
          visualMode: "faceless",
          modalidad: "faceless",
          preferredVoiceId: "en_warm_female",
          profileTone: "warm",
          preferredLocale: "en",
          targetDurationSec: 30,
        }),
      };
    }

    if (req.includes("resolve-provider-for-job")) {
      return {
        resolveProviderForJob: async () => ({
          ok: true,
          decision: { providerKey: "siliconflow_cosyvoice2", providerTier: "low" },
        }),
      };
    }

    if (req.includes("create-provider-registry")) {
      return {
        initializeProviderRegistryFromCatalog: async () => ({
          getTtsAdapter: () => mockAdapter,
        }),
      };
    }

    if (req.includes("assert-reel-budget-allows-estimated-spend")) {
      return {
        assertReelBudgetAllowsEstimatedSpend: async () =>
          options.budgetOk === false
            ? { ok: false, code: "BUDGET_EXCEEDED" }
            : {
                ok: true,
                estimatedCostCents: 1,
                cumulativeCostCents: 0,
                maxCostCents: 150,
                providerTier: "low",
              },
      };
    }

    if (req.includes("get-voiceover-summaries-for-reel-scripts")) {
      return {
        findLatestVoiceoverAssetId: async () =>
          options.priorVoiceoverAssetId === undefined
            ? null
            : options.priorVoiceoverAssetId,
      };
    }

    if (req.includes("insert-voiceover-media-asset")) {
      return {
        insertVoiceoverMediaAsset: async () => ({
          mediaAssetId: VOICEOVER_ASSET_ID,
        }),
      };
    }

    if (req.includes("record-reel-spend-event")) {
      return {
        recordReelSpendEvent: async () => {
          spendCalled = true;
          options.onSpend?.();
          return { spendEventId: "spend-1" };
        },
      };
    }

    return originalLoad(request, parent, isMain);
  };

  return {
    restore: () => {
      nodeModule._load = originalLoad;
    },
    wasSynthesizeCalled: () => synthesizeCalled,
    wasSpendCalled: () => spendCalled,
  };
}

describe("synthesizeVoiceoverForReelScript", () => {
  afterEach(() => {
    clearTtsModuleCache();
  });

  it("rejects forbidden providerKey on input", async () => {
    await withServerOnlyStub(async () => {
      const mocks = installMocks();
      const { synthesizeVoiceoverForReelScript } = loadTtsModule(
        "../tts/synthesize-voiceover-for-reel-script",
      );
      const result = await synthesizeVoiceoverForReelScript({
        reelScriptId: REEL_SCRIPT_ID,
        providerKey: "elevenlabs_tts_high",
      });
      mocks.restore();
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.error.code, "FORBIDDEN_FIELDS");
      }
    });
  });

  it("returns 403 envelope for non-operator", async () => {
    await withServerOnlyStub(async () => {
      const mocks = installMocks({ role: "client" });
      const { synthesizeVoiceoverForReelScript } = loadTtsModule(
        "../tts/synthesize-voiceover-for-reel-script",
      );
      const result = await synthesizeVoiceoverForReelScript({
        reelScriptId: REEL_SCRIPT_ID,
      });
      mocks.restore();
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.error.code, "FORBIDDEN");
      }
    });
  });

  it("blocks budget before vendor I/O", async () => {
    await withServerOnlyStub(async () => {
      const mocks = installMocks({ budgetOk: false });
      const { synthesizeVoiceoverForReelScript } = loadTtsModule(
        "../tts/synthesize-voiceover-for-reel-script",
      );
      const result = await synthesizeVoiceoverForReelScript({
        reelScriptId: REEL_SCRIPT_ID,
      });
      mocks.restore();
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.error.code, "BUDGET_EXCEEDED");
      }
      assert.equal(mocks.wasSynthesizeCalled(), false);
      assert.equal(mocks.wasSpendCalled(), false);
    });
  });

  it("rejects empty voiceover text without vendor call", async () => {
    await withServerOnlyStub(async () => {
      const mocks = installMocks({ voiceoverText: "" });
      const { synthesizeVoiceoverForReelScript } = loadTtsModule(
        "../tts/synthesize-voiceover-for-reel-script",
      );
      const result = await synthesizeVoiceoverForReelScript({
        reelScriptId: REEL_SCRIPT_ID,
      });
      mocks.restore();
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.error.code, "EMPTY_VOICEOVER_TEXT");
      }
      assert.equal(mocks.wasSynthesizeCalled(), false);
    });
  });

  it("happy path records spend after insert", async () => {
    await withServerOnlyStub(async () => {
      const mocks = installMocks();
      const { synthesizeVoiceoverForReelScript } = loadTtsModule(
        "../tts/synthesize-voiceover-for-reel-script",
      );
      const result = await synthesizeVoiceoverForReelScript({
        reelScriptId: REEL_SCRIPT_ID,
      });
      mocks.restore();
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.voiceoverAssetId, VOICEOVER_ASSET_ID);
        assert.equal(result.jobKind, "tts_generate");
        assert.equal(result.providerKey, "siliconflow_cosyvoice2");
      }
      assert.equal(mocks.wasSpendCalled(), true);
    });
  });

  it("uses tts_regenerate when prior asset exists", async () => {
    await withServerOnlyStub(async () => {
      const mocks = installMocks({
        priorVoiceoverAssetId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      });
      const { synthesizeVoiceoverForReelScript } = loadTtsModule(
        "../tts/synthesize-voiceover-for-reel-script",
      );
      const result = await synthesizeVoiceoverForReelScript({
        reelScriptId: REEL_SCRIPT_ID,
      });
      mocks.restore();
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.jobKind, "tts_regenerate");
      }
    });
  });
});
