import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  looksLikeTruncatedVoiceoverTail,
  voiceoverEndsWithCompleteSentence,
} from "./voiceover-completeness";

describe("voiceover completeness", () => {
  it("accepts finished Spanish and English sentences", () => {
    assert.equal(
      voiceoverEndsWithCompleteSentence(
        "Recuerda, yo soy tu aliado en cada proyecto.",
      ),
      true,
    );
    assert.equal(
      voiceoverEndsWithCompleteSentence("Remember, I am here to help!"),
      true,
    );
    assert.equal(looksLikeTruncatedVoiceoverTail("Listo. Guarda este tip."), false);
  });

  it("flags the prod truncation tail Recuerda, yo soy", () => {
    assert.equal(
      looksLikeTruncatedVoiceoverTail("Recuerda, yo soy"),
      true,
    );
    assert.equal(
      voiceoverEndsWithCompleteSentence("Recuerda, yo soy"),
      false,
    );
    assert.equal(
      looksLikeTruncatedVoiceoverTail("Remember, I am"),
      true,
    );
  });

  it("flags trailing conjunctions and commas", () => {
    assert.equal(looksLikeTruncatedVoiceoverTail("Antes del frío,"), true);
    assert.equal(looksLikeTruncatedVoiceoverTail("Revisa filtros y"), true);
  });
});
