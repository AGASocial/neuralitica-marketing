/**
 * US-9.1 buildReelV1BasicArgs golden snapshots.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildReelV1BasicArgs } from "./build-reel-v1-basic-args.ts";

const PRIMARY = "/tmp/neuramark-assembly/job-1/primary.mp4";
const OUTPUT = "/tmp/neuramark-assembly/job-1/output.mp4";
const VOICEOVER = "/tmp/neuramark-assembly/job-1/voiceover.mp3";

function assertNoShellMetacharacters(args: string[]): void {
  for (const arg of args) {
    assert.match(arg, /^[^\n\r;|&`$<>\\]*$/);
  }
}

describe("buildReelV1BasicArgs", () => {
  it("normalize within tolerance — primary audio", () => {
    const args = buildReelV1BasicArgs({
      localPrimaryPath: PRIMARY,
      localOutputPath: OUTPUT,
      remuxVoiceover: false,
      primaryDurationSec: 29.5,
      targetDurationSec: 30,
      toleranceSec: 2,
    });

    assert.deepEqual(args, [
      "-y",
      "-i",
      PRIMARY,
      "-vf",
      "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920",
      "-map",
      "0:v:0",
      "-map",
      "0:a:0?",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      OUTPUT,
    ]);
    assertNoShellMetacharacters(args);
  });

  it("trim when primary exceeds target + tolerance", () => {
    const args = buildReelV1BasicArgs({
      localPrimaryPath: PRIMARY,
      localOutputPath: OUTPUT,
      remuxVoiceover: false,
      primaryDurationSec: 45,
      targetDurationSec: 30,
      toleranceSec: 2,
    });

    assert.ok(args.includes("-t"));
    assert.ok(args.includes("30"));
    assert.equal(args.at(-1), OUTPUT);
    assertNoShellMetacharacters(args);
  });

  it("pad video and audio when primary is shorter than target - tolerance", () => {
    const args = buildReelV1BasicArgs({
      localPrimaryPath: PRIMARY,
      localOutputPath: OUTPUT,
      remuxVoiceover: false,
      primaryDurationSec: 20,
      targetDurationSec: 30,
      toleranceSec: 2,
    });

    const vfIndex = args.indexOf("-vf");
    assert.ok(vfIndex >= 0);
    assert.match(args[vfIndex + 1], /tpad=stop_mode=add:stop_duration=10/);

    const afIndex = args.indexOf("-af");
    assert.ok(afIndex >= 0);
    assert.equal(args[afIndex + 1], "apad=pad_dur=10");
    assertNoShellMetacharacters(args);
  });

  it("remux voiceover when primary has no audio track", () => {
    const args = buildReelV1BasicArgs({
      localPrimaryPath: PRIMARY,
      localOutputPath: OUTPUT,
      localVoiceoverPath: VOICEOVER,
      remuxVoiceover: true,
      primaryDurationSec: 30,
      targetDurationSec: 30,
      toleranceSec: 2,
    });

    assert.deepEqual(args.slice(0, 5), [
      "-y",
      "-i",
      PRIMARY,
      "-i",
      VOICEOVER,
    ]);
    assert.ok(args.includes("-map"));
    assert.ok(args.includes("0:v:0"));
    assert.ok(args.includes("1:a:0"));
    assert.ok(!args.includes("0:a:0?"));
    assertNoShellMetacharacters(args);
  });

  it("remux + pad applies tpad and apad", () => {
    const args = buildReelV1BasicArgs({
      localPrimaryPath: PRIMARY,
      localOutputPath: OUTPUT,
      localVoiceoverPath: VOICEOVER,
      remuxVoiceover: true,
      primaryDurationSec: 25,
      targetDurationSec: 30,
      toleranceSec: 2,
    });

    const vfIndex = args.indexOf("-vf");
    assert.match(args[vfIndex + 1], /tpad=stop_mode=add:stop_duration=5/);
    assert.ok(args.includes("apad=pad_dur=5"));
    assertNoShellMetacharacters(args);
  });

  it("throws when remuxVoiceover without voiceover path", () => {
    assert.throws(
      () =>
        buildReelV1BasicArgs({
          localPrimaryPath: PRIMARY,
          localOutputPath: OUTPUT,
          remuxVoiceover: true,
          primaryDurationSec: 30,
          targetDurationSec: 30,
          toleranceSec: 2,
        }),
      /localVoiceoverPath required/,
    );
  });
});
