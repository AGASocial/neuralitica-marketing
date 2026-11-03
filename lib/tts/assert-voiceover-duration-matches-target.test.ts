import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assertVoiceoverDurationMatchesTarget } from "./assert-voiceover-duration-matches-target";

describe("assertVoiceoverDurationMatchesTarget", () => {
  it("rejects 9.4s voiceover against 15±2 target (min 13)", () => {
    const result = assertVoiceoverDurationMatchesTarget({
      actualDurationSec: 9.4,
      targetDurationSec: 15,
      toleranceSec: 2,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "VOICEOVER_DURATION_MISMATCH");
      assert.equal(result.minAllowedSec, 13);
      assert.equal(result.maxAllowedSec, 17);
    }
  });

  it("accepts duration within tolerance", () => {
    const result = assertVoiceoverDurationMatchesTarget({
      actualDurationSec: 14.2,
      targetDurationSec: 15,
      toleranceSec: 2,
    });
    assert.equal(result.ok, true);
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
