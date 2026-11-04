import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FALLBACK_REEL_DURATION_POLICIES,
  clampReelTargetDurationSec,
  policyForVisualModality,
  reelDurationPolicyCatalogSchema,
  reelTargetDurationBoundsFromPolicy,
} from "./reel-duration-policy";

describe("reel duration policy bounds", () => {
  it("fallback catalog parses and clamps avatar to 8–15", () => {
    const parsed = reelDurationPolicyCatalogSchema.safeParse(
      FALLBACK_REEL_DURATION_POLICIES,
    );
    assert.equal(parsed.success, true);

    const avatar = policyForVisualModality(
      FALLBACK_REEL_DURATION_POLICIES,
      "own_avatar",
    );
    assert.deepEqual(reelTargetDurationBoundsFromPolicy(avatar), {
      min: 8,
      max: 15,
    });
    assert.equal(
      clampReelTargetDurationSec({
        targetDurationSec: 30,
        policy: avatar,
      }),
      15,
    );
    assert.equal(
      clampReelTargetDurationSec({
        targetDurationSec: 5,
        policy: avatar,
      }),
      8,
    );
  });

  it("keeps faceless at 15–45", () => {
    const faceless = policyForVisualModality(
      FALLBACK_REEL_DURATION_POLICIES,
      "faceless",
    );
    assert.deepEqual(reelTargetDurationBoundsFromPolicy(faceless), {
      min: 15,
      max: 45,
    });
    assert.equal(
      clampReelTargetDurationSec({
        targetDurationSec: 30,
        policy: faceless,
      }),
      30,
    );
  });
});
