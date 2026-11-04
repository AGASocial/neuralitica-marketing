import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assertVoiceoverDurationMatchesTarget } from "./assert-voiceover-duration-matches-target";

describe("assertVoiceoverDurationMatchesTarget", () => {
  it("rejects 9.4s voiceover against 15±2 faceless target (min 13)", () => {
    const result = assertVoiceoverDurationMatchesTarget({
      actualDurationSec: 9.4,
      targetDurationSec: 15,
      toleranceSec: 2,
      modalidad: "faceless",
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "VOICEOVER_DURATION_MISMATCH");
      assert.equal(result.minAllowedSec, 13);
      assert.equal(result.maxAllowedSec, 17);
    }
  });

  it("accepts duration within faceless tolerance", () => {
    const result = assertVoiceoverDurationMatchesTarget({
      actualDurationSec: 14.2,
      targetDurationSec: 15,
      toleranceSec: 2,
      modalidad: "faceless",
    });
    assert.equal(result.ok, true);
  });

  it("accepts 12.5s avatar VO in absolute 8–15 band (no stale 13s floor)", () => {
    const result = assertVoiceoverDurationMatchesTarget({
      actualDurationSec: 12.5,
      targetDurationSec: 15,
      modalidad: "generic_avatar",
    });
    assert.equal(result.ok, true);
  });

  it("rejects avatar VO below 8s", () => {
    const result = assertVoiceoverDurationMatchesTarget({
      actualDurationSec: 7.2,
      targetDurationSec: 12,
      modalidad: "own_avatar",
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.minAllowedSec, 8);
      assert.equal(result.maxAllowedSec, 15);
    }
  });

  it("passes through when duration unknown", () => {
    assert.equal(
      assertVoiceoverDurationMatchesTarget({
        actualDurationSec: null,
        targetDurationSec: 15,
      }).ok,
      true,
    );
  });
});
