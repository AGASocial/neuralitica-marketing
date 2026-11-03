import assert from "node:assert/strict";
import Module from "node:module";
import { describe, it } from "node:test";

type NodeModuleLoad = {
  _load: (
    request: string,
    parent: NodeModule | null | undefined,
    isMain: boolean,
  ) => unknown;
};

async function loadMapping() {
  const nodeModule = Module as unknown as NodeModuleLoad;
  const originalLoad = nodeModule._load.bind(nodeModule);
  nodeModule._load = function (request, parent, isMain) {
    if (request === "server-only") return {};
    return originalLoad(request, parent, isMain);
  };
  try {
    for (const key of Object.keys(require.cache)) {
      if (key.replace(/\\/g, "/").includes("/lib/tts/")) {
        delete require.cache[key];
      }
    }
    return await import("./avatar-voice-mapping");
  } finally {
    nodeModule._load = originalLoad;
  }
}

describe("avatar gender+language voice mapping", () => {
  it("maps male+es to es_professional_male (never es_warm_female)", async () => {
    const {
      mapAvatarGenderLanguageToCatalogVoiceId,
      resolveAvatarTtsVoice,
    } = await loadMapping();

    assert.equal(
      mapAvatarGenderLanguageToCatalogVoiceId({
        gender: "male",
        language: "es",
      }),
      "es_professional_male",
    );
    assert.notEqual(
      mapAvatarGenderLanguageToCatalogVoiceId({
        gender: "male",
        language: "es",
      }),
      "es_warm_female",
    );

    const withClone = resolveAvatarTtsVoice({
      gender: "male",
      language: "es",
      elevenLabsVoiceId: "ulhSmqhbTnrunZUQjKqA",
    });
    assert.equal(withClone.usedCustomClone, true);
    assert.equal(withClone.elevenLabsVoiceId, "ulhSmqhbTnrunZUQjKqA");
    assert.equal(withClone.catalogVoiceId, "es_professional_male");
    assert.equal(withClone.language, "es");

    const withoutClone = resolveAvatarTtsVoice({
      gender: "male",
      language: "es",
      elevenLabsVoiceId: null,
    });
    assert.equal(withoutClone.usedCustomClone, false);
    assert.equal(withoutClone.catalogVoiceId, "es_professional_male");
  });

  it("maps female+es to es_warm_female and male+en to en_professional_male", async () => {
    const { mapAvatarGenderLanguageToCatalogVoiceId } = await loadMapping();
    assert.equal(
      mapAvatarGenderLanguageToCatalogVoiceId({
        gender: "female",
        language: "es",
      }),
      "es_warm_female",
    );
    assert.equal(
      mapAvatarGenderLanguageToCatalogVoiceId({
        gender: "male",
        language: "en",
      }),
      "en_professional_male",
    );
  });
});
