/**
 * US-9.2 buildAssFromBeats — equal split + VO-proportional timings.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computeVoProportionalBeatTimings } from "../assembly/compute-vo-proportional-beat-timings.ts";
import {
  BRANDING_ASS_FONT_NAME,
  BRANDING_ASS_MARGIN_V,
} from "./constants.ts";
import { buildAssFromBeats } from "./build-ass-from-beats.ts";

describe("buildAssFromBeats", () => {
  it("equal-split beat timings for 30s / 3 beats", () => {
    const { assContent, beatTimings } = buildAssFromBeats({
      sanitizedBeats: ["One", "Two", "Three"],
      targetDurationSec: 30,
      outputAssPath: "/tmp/subtitles.ass",
    });

    assert.deepEqual(beatTimings, [
      { startSec: 0, endSec: 10 },
      { startSec: 10, endSec: 20 },
      { startSec: 20, endSec: 30 },
    ]);

    assert.match(assContent, /Dialogue: 0,0:00:00.00,0:00:10.00,Default,,0,0,0,,One/);
    assert.match(assContent, /Dialogue: 0,0:00:20.00,0:00:30.00,Default,,0,0,0,,Three/);
  });

  it("uses explicit VO-proportional timings for Dialogue timestamps", () => {
    const voiceoverText = "one two three four five six seven eight";
    const sanitizedBeats = ["Hook", "Body", "CTA"];
    const beatTimings = computeVoProportionalBeatTimings({
      beatCount: sanitizedBeats.length,
      targetDurationSec: 30,
      voiceoverText,
    });
    // 8 tokens → [3,3,2] → 11.25, 11.25, 7.5
    assert.deepEqual(beatTimings, [
      { startSec: 0, endSec: 11.25 },
      { startSec: 11.25, endSec: 22.5 },
      { startSec: 22.5, endSec: 30 },
    ]);

    const { assContent } = buildAssFromBeats({
      sanitizedBeats,
      targetDurationSec: 30,
      outputAssPath: "/tmp/subtitles.ass",
      beatTimings,
    });

    assert.match(
      assContent,
      /Dialogue: 0,0:00:00.00,0:00:11.25,Default,,0,0,0,,Hook/,
    );
    assert.match(
      assContent,
      /Dialogue: 0,0:00:22.50,0:00:30.00,Default,,0,0,0,,CTA/,
    );
    assert.doesNotMatch(assContent, /one two three/);
    assert.doesNotMatch(assContent, /voiceover/);
  });

  it("falls back to equal split when beatTimings length mismatches", () => {
    const { beatTimings, assContent } = buildAssFromBeats({
      sanitizedBeats: ["A", "B"],
      targetDurationSec: 20,
      outputAssPath: "/tmp/subtitles.ass",
      beatTimings: [{ startSec: 0, endSec: 5 }],
    });
    assert.deepEqual(beatTimings, [
      { startSec: 0, endSec: 10 },
      { startSec: 10, endSec: 20 },
    ]);
    assert.match(assContent, /Dialogue: 0,0:00:00.00,0:00:10.00,Default,,0,0,0,,A/);
  });

  it("includes frozen typography constants", () => {
    const { assContent } = buildAssFromBeats({
      sanitizedBeats: ["Hello"],
      targetDurationSec: 10,
      outputAssPath: "/tmp/subtitles.ass",
    });

    assert.match(assContent, new RegExp(`Style: Default,${BRANDING_ASS_FONT_NAME}`));
    assert.match(assContent, /PlayResX: 1080/);
    assert.match(assContent, /PlayResY: 1920/);
    assert.match(assContent, new RegExp(`,${BRANDING_ASS_MARGIN_V},1`));
    assert.match(assContent, /BorderStyle, Outline, Shadow/);
    assert.match(assContent, /&H80000000/);
  });

  it("returns header-only content for empty beats", () => {
    const { assContent, beatTimings } = buildAssFromBeats({
      sanitizedBeats: [],
      targetDurationSec: 30,
      outputAssPath: "/tmp/subtitles.ass",
    });

    assert.deepEqual(beatTimings, []);
    assert.doesNotMatch(assContent, /Dialogue:/);
    assert.match(assContent, /\[Events\]/);
  });
});
