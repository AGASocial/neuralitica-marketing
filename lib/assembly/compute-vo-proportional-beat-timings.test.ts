/**
 * US-9.2 Phase B — VO-proportional beat timings + voiceoverTimingHash.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";

import {
  computeEqualSplitBeatTimings,
  computeVoiceoverTimingHash,
  computeVoProportionalBeatTimings,
  tokenizeVoiceoverWords,
} from "./compute-vo-proportional-beat-timings.ts";

describe("tokenizeVoiceoverWords", () => {
  it("matches US-5.2 whitespace tokenizer", () => {
    assert.deepEqual(tokenizeVoiceoverWords("  one   two three  "), [
      "one",
      "two",
      "three",
    ]);
    assert.deepEqual(tokenizeVoiceoverWords(""), []);
    assert.deepEqual(tokenizeVoiceoverWords("   "), []);
  });
});

describe("computeVoProportionalBeatTimings", () => {
  it("partitions six tokens into three equal buckets over 30s", () => {
    const timings = computeVoProportionalBeatTimings({
      beatCount: 3,
      targetDurationSec: 30,
      voiceoverText: "one two three four five six",
    });
    assert.deepEqual(timings, [
      { startSec: 0, endSec: 10 },
      { startSec: 10, endSec: 20 },
      { startSec: 20, endSec: 30 },
    ]);
  });

  it("spreads remainder to leading buckets", () => {
    const timings = computeVoProportionalBeatTimings({
      beatCount: 3,
      targetDurationSec: 30,
      voiceoverText: "a b c d e",
    });
    // tokens=5; base=1 remainder=2 → buckets [2, 2, 1]
    // durations: 12, 12, 6
    assert.deepEqual(timings, [
      { startSec: 0, endSec: 12 },
      { startSec: 12, endSec: 24 },
      { startSec: 24, endSec: 30 },
    ]);
  });

  it("falls back to equal split when VO is empty", () => {
    const timings = computeVoProportionalBeatTimings({
      beatCount: 3,
      targetDurationSec: 30,
      voiceoverText: "   ",
    });
    assert.deepEqual(timings, computeEqualSplitBeatTimings(3, 30));
  });

  it("returns [] when beatCount is 0", () => {
    assert.deepEqual(
      computeVoProportionalBeatTimings({
        beatCount: 0,
        targetDurationSec: 30,
        voiceoverText: "one two",
      }),
      [],
    );
  });

  it("forces last endSec to targetDurationSec", () => {
    const timings = computeVoProportionalBeatTimings({
      beatCount: 3,
      targetDurationSec: 10,
      voiceoverText: "a b c",
    });
    assert.equal(timings[timings.length - 1]?.endSec, 10);
    assert.equal(timings[0]?.startSec, 0);
  });

  it("equal-split fallback forces last end when duration not divisible", () => {
    const timings = computeEqualSplitBeatTimings(3, 10);
    assert.equal(timings[2]?.endSec, 10);
    assert.equal(timings[0]?.startSec, 0);
  });
});

describe("computeVoiceoverTimingHash", () => {
  it("is stable for equivalent whitespace", () => {
    const a = computeVoiceoverTimingHash("one two three");
    const b = computeVoiceoverTimingHash("  one   two  three ");
    assert.equal(a, b);
    assert.match(a, /^[0-9a-f]{64}$/);
  });

  it("changes when a token changes", () => {
    const a = computeVoiceoverTimingHash("one two three");
    const b = computeVoiceoverTimingHash("one two four");
    assert.notEqual(a, b);
  });

  it("hashes empty string for empty VO", () => {
    const expected = createHash("sha256").update("").digest("hex");
    assert.equal(computeVoiceoverTimingHash(""), expected);
    assert.equal(computeVoiceoverTimingHash("   "), expected);
  });
});
