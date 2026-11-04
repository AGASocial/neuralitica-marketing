import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computeBrollClipCount } from "./broll-clip-count";

describe("computeBrollClipCount — duration coverage", () => {
  it("uses ceil(targetDuration / clipSec) when beats are empty", () => {
    const count = computeBrollClipCount({
      needsBroll: true,
      brollBeats: [],
      hook: "Hook",
      body: "Body",
      targetDurationSec: 15,
      clipDurationSec: 5,
    });
    assert.equal(count, 3);
  });

  it("takes the max of beats and duration coverage", () => {
    const count = computeBrollClipCount({
      needsBroll: true,
      brollBeats: ["a", "b", "c", "d"],
      hook: "Hook",
      body: "Body",
      targetDurationSec: 10,
      clipDurationSec: 5,
    });
    assert.equal(count, 4);
  });

  it("clamps to max clips per reel", () => {
    const count = computeBrollClipCount({
      needsBroll: true,
      brollBeats: [],
      hook: "Hook",
      body: "Body",
      targetDurationSec: 120,
      clipDurationSec: 5,
    });
    assert.equal(count, 8);
  });

  it("returns 0 when b-roll is not needed", () => {
    assert.equal(
      computeBrollClipCount({
        needsBroll: false,
        brollBeats: ["a"],
        hook: "H",
        body: "B",
        targetDurationSec: 15,
      }),
      0,
    );
  });
});
