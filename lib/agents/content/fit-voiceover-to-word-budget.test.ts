/**
 * Sentence-boundary voiceover word-budget fit (post-LLM).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  fitVoiceoverToWordBudget,
  splitVoiceoverSentences,
  voiceoverWordBudget,
} from "./fit-voiceover-to-word-budget";

describe("fitVoiceoverToWordBudget", () => {
  it("computes ~2.5 words/sec budget", () => {
    assert.equal(voiceoverWordBudget(30), 75);
    assert.equal(voiceoverWordBudget(15), 38);
  });

  it("splits on sentence-final punctuation", () => {
    assert.deepEqual(
      splitVoiceoverSentences("Uno. Dos! Tres? Cuatro…"),
      ["Uno.", "Dos!", "Tres?", "Cuatro…"],
    );
  });

  it("keeps text under budget unchanged", () => {
    const voiceoverText = "Hola. Guarda este tip.";
    const result = fitVoiceoverToWordBudget({
      voiceoverText,
      targetDurationSec: 15,
    });
    assert.equal(result.trimmed, false);
    assert.equal(result.voiceoverText, voiceoverText);
  });

  it("cuts at sentence boundaries — never mid-sentence like prod CTA", () => {
    // ~2.5 wps × 8s = 20 words budget
    const voiceoverText = [
      "En tan solo un día, le dimos vida a tu marca con color.",
      "Revisa la pared y elige el tono correcto para tu sala.",
      "Guarda este tip y escríbenos para cotizar hoy mismo.",
    ].join(" ");

    const result = fitVoiceoverToWordBudget({
      voiceoverText,
      targetDurationSec: 8,
    });

    assert.equal(result.trimmed, true);
    assert.ok(result.wordCount <= result.targetWordCount + 12); // first-sentence exception slack
    assert.match(result.voiceoverText, /[.!?…]\s*$/u);
    assert.equal(
      result.voiceoverText.includes("En tan solo un día, le dimos vida a tu marca con color."),
      true,
    );
    // Must not end on the incomplete prod-style fragment without punctuation.
    assert.notEqual(result.voiceoverText, "En tan solo un día, le dimos vida");
  });

  it("prefers keeping first full sentence when it alone exceeds budget", () => {
    const longFirst =
      "Palabra ".repeat(40).trim() + " final.";
    const result = fitVoiceoverToWordBudget({
      voiceoverText: `${longFirst} Segunda oración corta.`,
      targetDurationSec: 5, // budget 13
    });
    assert.equal(result.voiceoverText, longFirst);
    assert.match(result.voiceoverText, /\.$/);
  });
});
