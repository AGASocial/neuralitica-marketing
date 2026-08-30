/**
 * US-9.3 closed voice catalog + voice picker visibility — server-only modules.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Module from "node:module";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
      normalized.includes("/lib/tts/") ||
      normalized.includes("/lib/contracts/tts-voiceover")
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

function loadVoiceCatalogModule() {
  return withServerOnlyStub(() =>
    require("./voice-catalog.ts") as typeof import("./voice-catalog"),
  );
}

describe("US-9.3 voice catalog", () => {
  it("1 — TTS_VOICE_CATALOG has four frozen ids (2 EN, 2 ES)", () => {
    const { TTS_VOICE_CATALOG } = loadVoiceCatalogModule();
    assert.equal(TTS_VOICE_CATALOG.length, 4);
    const ids = TTS_VOICE_CATALOG.map((entry) => entry.id);
    assert.deepEqual(ids.sort(), [
      "en_professional_male",
      "en_warm_female",
      "es_professional_male",
      "es_warm_female",
    ]);
  });

  it("2 — isAllowedVoiceId rejects unknown ids", () => {
    const { isAllowedVoiceId } = loadVoiceCatalogModule();
    assert.equal(isAllowedVoiceId("en_warm_female"), true);
    assert.equal(isAllowedVoiceId("clone_victim_voice"), false);
    assert.equal(isAllowedVoiceId(""), false);
  });

  it("3 — getVoiceById returns catalog entry without exposing providerVoice in DTO", () => {
    const { getVoiceById, toTtsVoiceOptionDto } = loadVoiceCatalogModule();
    const voice = getVoiceById("en_warm_female");
    assert.ok(voice);
    assert.match(voice.providerVoice, /CosyVoice2/);

    const dto = toTtsVoiceOptionDto(voice);
    assert.equal(dto.id, "en_warm_female");
    assert.equal(dto.sampleUrl, "/tts-samples/en_warm_female.mp3");
    assert.equal("providerVoice" in dto, false);
    assert.equal("toneTags" in dto, false);
  });

  it("4 — listVoicesForLocale filters by locale", () => {
    const { listVoicesForLocale } = loadVoiceCatalogModule();
    assert.equal(listVoicesForLocale("en").length, 2);
    assert.equal(listVoicesForLocale("es").length, 2);
    for (const voice of listVoicesForLocale("en")) {
      assert.equal(voice.locale, "en");
    }
  });

  it("5 — resolveDefaultVoiceId keyword map and locale fallback", () => {
    const { resolveDefaultVoiceId } = loadVoiceCatalogModule();
    assert.equal(
      resolveDefaultVoiceId({ preferredLocale: "en", profileTone: "corporate" }),
      "en_professional_male",
    );
    assert.equal(
      resolveDefaultVoiceId({ preferredLocale: "es", profileTone: "serio" }),
      "es_professional_male",
    );
    assert.equal(
      resolveDefaultVoiceId({ preferredLocale: "en", profileTone: "friendly" }),
      "en_warm_female",
    );
    assert.equal(
      resolveDefaultVoiceId({ preferredLocale: "es", profileTone: "neutral" }),
      "es_warm_female",
    );
  });

  it("6 — module includes import server-only", () => {
    const source = readFileSync(path.join(__dirname, "voice-catalog.ts"), "utf8");
    assert.match(source, /import ["']server-only["']/);
  });
});

describe("computeVoicePickerVisible", () => {
  it("hides picker for faceless-only music_only", () => {
    const { computeVoicePickerVisible } = require("../preferences/compute-voice-picker-visible.ts");
    assert.equal(
      computeVoicePickerVisible(
        ["faceless"],
        {
          voice: "music_only",
          onScreenText: "captions",
          broll: "stock",
        },
      ),
      false,
    );
  });

  it("shows picker for faceless ai_voiceover", () => {
    const { computeVoicePickerVisible } = require("../preferences/compute-voice-picker-visible.ts");
    assert.equal(
      computeVoicePickerVisible(
        ["faceless"],
        {
          voice: "ai_voiceover",
          onScreenText: "captions",
          broll: "stock",
        },
      ),
      true,
    );
  });
});
