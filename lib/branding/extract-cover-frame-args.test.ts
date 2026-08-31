/**
 * US-9.2 extractCoverFrameArgs + clampCoverSeekSec (Phase B).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  clampCoverSeekSec,
  extractCoverFrameArgs,
} from "./extract-cover-frame-args.ts";

const BRANDED = "/tmp/neuramark-branding/job-1/branded.mp4";
const COVER = "/tmp/neuramark-branding/job-1/cover.jpg";

describe("extractCoverFrameArgs", () => {
  it("uses numeric coverFrameSec for -ss", () => {
    const args = extractCoverFrameArgs({
      localBrandedPath: BRANDED,
      localCoverPath: COVER,
      coverFrameSec: 1.0,
    });

    assert.deepEqual(args, [
      "-y",
      "-ss",
      "1",
      "-i",
      BRANDED,
      "-vframes",
      "1",
      "-q:v",
      "2",
      COVER,
    ]);
  });

  it("preserves fractional seconds", () => {
    const args = extractCoverFrameArgs({
      localBrandedPath: BRANDED,
      localCoverPath: COVER,
      coverFrameSec: 2.5,
    });

    assert.equal(args[2], "2.5");
  });
});

describe("clampCoverSeekSec", () => {
  it("clamps to duration − 0.05", () => {
    assert.equal(
      clampCoverSeekSec({ coverFrameSec: 45, durationSec: 30 }),
      29.95,
    );
  });

  it("clamps negative to 0", () => {
    assert.equal(
      clampCoverSeekSec({ coverFrameSec: -1, durationSec: 30 }),
      0,
    );
  });

  it("passes through in-range values", () => {
    assert.equal(
      clampCoverSeekSec({ coverFrameSec: 2.5, durationSec: 30 }),
      2.5,
    );
  });

  it("feeds clamped numeric -ss only", () => {
    const seek = clampCoverSeekSec({ coverFrameSec: 40, durationSec: 20 });
    const args = extractCoverFrameArgs({
      localBrandedPath: BRANDED,
      localCoverPath: COVER,
      coverFrameSec: seek,
    });
    assert.equal(args[2], "19.95");
    assert.equal(typeof args[2], "string");
    assert.doesNotMatch(args[2]!, /;/);
  });
});
