import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { splitAvatarVoiceoverSegments } from "./split-avatar-voiceover-segments";

describe("splitAvatarVoiceoverSegments", () => {
  it("keeps a single segment when total ≤ 8s", () => {
    const result = splitAvatarVoiceoverSegments({
      voiceoverText: "Hola. Esto es corto.",
      totalDurationSec: 6,
    });
    assert.equal(result.segments.length, 1);
    assert.equal(result.segments[0]!.startSec, 0);
    assert.equal(result.segments[0]!.durationSec, 6);
  });

  it("splits into two segments on sentence boundaries under 8s each", () => {
    const result = splitAvatarVoiceoverSegments({
      voiceoverText:
        "Primera idea clara y completa. Segunda idea también termina bien. Tercera cierre final.",
      totalDurationSec: 12,
    });
    assert.equal(result.segments.length, 2);
    assert.ok(result.segments[0]!.durationSec <= 8 + 1e-6);
    assert.ok(result.segments[1]!.durationSec <= 8 + 1e-6);
    assert.ok(
      Math.abs(
        result.segments[0]!.durationSec +
          result.segments[1]!.durationSec -
          12,
      ) < 0.05,
    );
    assert.equal(
      result.segments[1]!.startSec,
      result.segments[0]!.durationSec,
    );
  });
});
