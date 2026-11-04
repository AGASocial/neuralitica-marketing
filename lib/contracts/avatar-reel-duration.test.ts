import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  clampReelTargetDurationSec,
  reelTargetDurationBoundsForModality,
} from "./avatar-reel-duration";

describe("avatar reel duration bounds", () => {
  it("clamps avatar modalities to 8–15", () => {
    assert.deepEqual(reelTargetDurationBoundsForModality("own_avatar"), {
      min: 8,
      max: 15,
    });
    assert.equal(
      clampReelTargetDurationSec({
        targetDurationSec: 30,
        modalidad: "generic_avatar",
      }),
      15,
    );
    assert.equal(
      clampReelTargetDurationSec({
        targetDurationSec: 5,
        modalidad: "own_avatar",
      }),
      8,
    );
  });

  it("keeps faceless at 15–45", () => {
    assert.deepEqual(reelTargetDurationBoundsForModality("faceless"), {
      min: 15,
      max: 45,
    });
    assert.equal(
      clampReelTargetDurationSec({
        targetDurationSec: 30,
        modalidad: "faceless",
      }),
      30,
    );
  });
});
