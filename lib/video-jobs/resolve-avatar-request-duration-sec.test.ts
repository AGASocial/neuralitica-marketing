import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveAvatarRequestDurationSec } from "./resolve-avatar-request-duration-sec";

describe("resolveAvatarRequestDurationSec", () => {
  it("ceils TTS duration into Gateway HeyGen 5–15 clamp", () => {
    assert.equal(
      resolveAvatarRequestDurationSec({
        voiceoverDurationSec: 9.43,
        scriptTargetDurationSec: 15,
      }),
      10,
    );
  });

  it("falls back to script target when TTS duration unknown (no clamp)", () => {
    assert.equal(
      resolveAvatarRequestDurationSec({
        voiceoverDurationSec: null,
        scriptTargetDurationSec: 30,
      }),
      30,
    );
  });

  it("clamps TTS above Gateway max to 15", () => {
    assert.equal(
      resolveAvatarRequestDurationSec({
        voiceoverDurationSec: 40,
        scriptTargetDurationSec: 30,
      }),
      15,
    );
  });
});
