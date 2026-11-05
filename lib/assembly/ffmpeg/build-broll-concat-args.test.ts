/**
 * US-9.1 Phase B — buildBrollConcatArgs golden snapshots.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildBrollConcatArgs,
  expandBrollClipSequenceForDuration,
  formatBrollConcatListContents,
  resolveBrollOutputDurationSec,
} from "./build-broll-concat-args";

const TEMP = "/tmp/neuramark-assembly/job-b";
const CONCAT = `${TEMP}/concat.txt`;
const VOICEOVER = `${TEMP}/voiceover.mp3`;
const OUTPUT = `${TEMP}/output.mp4`;

function clipPaths(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `${TEMP}/broll-${i}.mp4`);
}

function assertNoShellMetacharacters(args: string[]): void {
  for (const arg of args) {
    assert.match(arg, /^[^\n\r;|&`$<>\\]*$/);
  }
}

function assertNoForbiddenText(args: string[]): void {
  const joined = args.join(" ");
  assert.ok(!joined.includes("brollBeats"));
  assert.ok(!joined.includes("cold_open"));
  assert.ok(!joined.includes("Abrir con"));
  assert.ok(!joined.includes("http://"));
  assert.ok(!joined.includes("https://"));
}

describe("buildBrollConcatArgs", () => {
  it("1 clip — within tolerance, no cold-open", () => {
    const clips = clipPaths(1);
    const args = buildBrollConcatArgs({
      localConcatListPath: CONCAT,
      localClipPaths: clips,
      localVoiceoverPath: VOICEOVER,
      localOutputPath: OUTPUT,
      sourceDurationSec: 29.5,
      targetDurationSec: 30,
      toleranceSec: 2,
      coldOpenTrimSec: null,
    });

    assert.equal(args[0], "-y");
    assert.ok(!args.includes("-ss"));
    assert.deepEqual(args.slice(1, 9), [
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      CONCAT,
      "-i",
      VOICEOVER,
    ]);
    assert.ok(args.includes("0:v:0"));
    assert.ok(args.includes("1:a:0"));
    assert.ok(!args.includes("-t"));
    assert.equal(args.at(-1), OUTPUT);
    assertNoShellMetacharacters(args);
    assertNoForbiddenText(args);
  });

  it("2 clips — trim + cold-open 2s (CONTRACT snapshot)", () => {
    const clips = clipPaths(2);
    const args = buildBrollConcatArgs({
      localConcatListPath: CONCAT,
      localClipPaths: clips,
      localVoiceoverPath: VOICEOVER,
      localOutputPath: OUTPUT,
      sourceDurationSec: 45,
      targetDurationSec: 30,
      toleranceSec: 2,
      coldOpenTrimSec: 2,
    });

    assert.deepEqual(args.slice(0, 12), [
      "-y",
      "-ss",
      "2",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      CONCAT,
      "-i",
      VOICEOVER,
      "-vf",
    ]);
    assert.ok(args.includes("-t"));
    assert.ok(args.includes("30"));
    assertNoShellMetacharacters(args);
    assertNoForbiddenText(args);
  });

  it("3 clips — trim when long (unchanged)", () => {
    const clips = clipPaths(3);
    const args = buildBrollConcatArgs({
      localConcatListPath: CONCAT,
      localClipPaths: clips,
      localVoiceoverPath: VOICEOVER,
      localOutputPath: OUTPUT,
      sourceDurationSec: 40,
      targetDurationSec: 30,
      toleranceSec: 2,
      coldOpenTrimSec: null,
    });

    assert.ok(args.includes("-t"));
    assert.ok(args.includes("30"));
    assert.ok(!args.join(" ").includes("tpad"));
    assertNoShellMetacharacters(args);
  });

  it("short total after loop — trims to voiceover length", () => {
    const clips = clipPaths(1);
    const clipPath = clips[0]!;
    const voiceoverSec = 30.35;
    const clipSec = 5.04;
    const { expandedPaths, totalDurationSec } =
      expandBrollClipSequenceForDuration({
        clipPaths: [clipPath],
        clipDurationSecs: [clipSec],
        requiredTotalDurationSec: voiceoverSec,
      });
    assert.ok(expandedPaths.length >= 7);
    assert.ok(totalDurationSec >= voiceoverSec);

    const args = buildBrollConcatArgs({
      localConcatListPath: CONCAT,
      localClipPaths: clips,
      localVoiceoverPath: VOICEOVER,
      localOutputPath: OUTPUT,
      sourceDurationSec: totalDurationSec,
      targetDurationSec: 32,
      toleranceSec: 2,
      coldOpenTrimSec: null,
      voiceoverDurationSec: voiceoverSec,
    });

    assert.ok(args.includes("-t"));
    assert.ok(args.includes("30.35"));
    assert.ok(!args.join(" ").includes("tpad"));
    assertNoShellMetacharacters(args);
  });

  it("8 clips — accepts max clip count", () => {
    const clips = clipPaths(8);
    const args = buildBrollConcatArgs({
      localConcatListPath: CONCAT,
      localClipPaths: clips,
      localVoiceoverPath: VOICEOVER,
      localOutputPath: OUTPUT,
      sourceDurationSec: 40,
      targetDurationSec: 30,
      toleranceSec: 2,
      coldOpenTrimSec: null,
    });
    assert.equal(args.at(-1), OUTPUT);
    assert.ok(args.includes("-t"));
  });

  it("rejects 0 clips and >8 clips", () => {
    assert.throws(
      () =>
        buildBrollConcatArgs({
          localConcatListPath: CONCAT,
          localClipPaths: [],
          localVoiceoverPath: VOICEOVER,
          localOutputPath: OUTPUT,
          sourceDurationSec: 30,
          targetDurationSec: 30,
          toleranceSec: 2,
          coldOpenTrimSec: null,
        }),
      /localClipPaths length/,
    );
    assert.throws(
      () =>
        buildBrollConcatArgs({
          localConcatListPath: CONCAT,
          localClipPaths: clipPaths(9),
          localVoiceoverPath: VOICEOVER,
          localOutputPath: OUTPUT,
          sourceDurationSec: 30,
          targetDurationSec: 30,
          toleranceSec: 2,
          coldOpenTrimSec: null,
        }),
      /localClipPaths length/,
    );
  });

  it("malicious cold_open_notes never appear — only numeric trim", () => {
    const args = buildBrollConcatArgs({
      localConcatListPath: CONCAT,
      localClipPaths: clipPaths(1),
      localVoiceoverPath: VOICEOVER,
      localOutputPath: OUTPUT,
      sourceDurationSec: 40,
      targetDurationSec: 30,
      toleranceSec: 2,
      coldOpenTrimSec: 3,
    });
    const joined = args.join(" ");
    assert.ok(!joined.includes("; rm"));
    assert.ok(!joined.includes("-vf evil"));
    assert.ok(args.includes("-ss"));
    assert.ok(args.includes("3"));
    assertNoForbiddenText(args);
  });
});

describe("expandBrollClipSequenceForDuration", () => {
  it("loops clip order until required duration is met", () => {
    const paths = clipPaths(2);
    const { expandedPaths, totalDurationSec } =
      expandBrollClipSequenceForDuration({
        clipPaths: paths,
        clipDurationSecs: [5, 5],
        requiredTotalDurationSec: 30,
      });
    assert.equal(expandedPaths.length, 6);
    assert.deepEqual(expandedPaths, [
      paths[0],
      paths[1],
      paths[0],
      paths[1],
      paths[0],
      paths[1],
    ]);
    assert.equal(totalDurationSec, 30);
  });

  it("does not repeat when one cycle already covers duration", () => {
    const paths = clipPaths(3);
    const { expandedPaths, totalDurationSec } =
      expandBrollClipSequenceForDuration({
        clipPaths: paths,
        clipDurationSecs: [12, 12, 12],
        requiredTotalDurationSec: 30,
      });
    assert.equal(expandedPaths.length, 3);
    assert.equal(totalDurationSec, 36);
  });

  it("includes cold-open offset in required duration via caller", () => {
    const outputSec = resolveBrollOutputDurationSec({
      targetDurationSec: 30,
      voiceoverDurationSec: 30.35,
    });
    assert.equal(outputSec, 30.35);
    const paths = clipPaths(1);
    const { totalDurationSec } = expandBrollClipSequenceForDuration({
      clipPaths: paths,
      clipDurationSecs: [5.04],
      requiredTotalDurationSec: outputSec + 2,
    });
    assert.ok(totalDurationSec >= 32.35);
  });
});

describe("formatBrollConcatListContents", () => {
  it("writes demuxer file lines for absolute paths", () => {
    const body = formatBrollConcatListContents([
      `${TEMP}/broll-0.mp4`,
      `${TEMP}/broll-1.mp4`,
    ]);
    assert.equal(
      body,
      `file '${TEMP}/broll-0.mp4'\nfile '${TEMP}/broll-1.mp4'`,
    );
  });
});
