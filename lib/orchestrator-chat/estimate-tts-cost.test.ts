import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ELEVENLABS_UNIT_COST_CENTS_PER_1M_CHARS } from "../contracts/elevenlabs-tts";
import { estimateTtsCostCentsFromTextLength } from "./estimate-tts-cost";

describe("estimateTtsCostCentsFromTextLength", () => {
  it("uses ElevenLabs catalog constant and floors at 1¢ for short text", () => {
    assert.equal(ELEVENLABS_UNIT_COST_CENTS_PER_1M_CHARS, 300);
    assert.equal(estimateTtsCostCentsFromTextLength(0), 0);
    assert.equal(estimateTtsCostCentsFromTextLength(100), 1);
    assert.equal(
      estimateTtsCostCentsFromTextLength(1_000_000),
      ELEVENLABS_UNIT_COST_CENTS_PER_1M_CHARS,
    );
  });

  it("does not call providers (pure math)", () => {
    const cents = estimateTtsCostCentsFromTextLength(500_000, 300);
    assert.equal(cents, 150);
  });
});
