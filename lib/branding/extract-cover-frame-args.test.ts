/**
 * US-9.2 extractCoverFrameArgs golden snapshot.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { extractCoverFrameArgs } from "./extract-cover-frame-args.ts";

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
