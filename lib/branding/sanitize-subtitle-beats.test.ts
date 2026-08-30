/**
 * US-9.2 sanitizeSubtitleBeats — injection fixtures + ellipsis policy.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";

import { REEL_SCRIPT_MAX_CHARS_PER_BEAT_LINE } from "@/lib/contracts/reel-script-readability";

import { resolveSubtitleBeats } from "./resolve-subtitle-beats.ts";
import {
  sanitizeOnScreenText,
  sanitizeSubtitleBeats,
} from "./sanitize-subtitle-beats.ts";

describe("resolveSubtitleBeats", () => {
  it("splits on newlines, trims, drops empty, caps at 8", () => {
    const beats = resolveSubtitleBeats(
      "  First beat  \n\nSecond\nThird\nFourth\nFifth\nSixth\nSeventh\nEighth\nNinth\n",
    );
    assert.equal(beats.length, 8);
    assert.equal(beats[0], "First beat");
    assert.equal(beats[7], "Eighth");
  });
});

describe("sanitizeSubtitleBeats", () => {
  it("escapes ASS metacharacters and computes hash", () => {
    const result = sanitizeSubtitleBeats(["100% done", "Line\\two"]);
    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.deepEqual(result.sanitizedBeats, [
      "100\\% done",
      "Line\\\\two",
    ]);
    const expectedHash = createHash("sha256")
      .update(result.sanitizedBeats.join("\n"))
      .digest("hex");
    assert.equal(result.subtitleSourceHash, expectedHash);
  });

  it("truncates long lines with ellipsis to 40 chars", () => {
    const longLine = "A".repeat(50);
    const result = sanitizeSubtitleBeats([longLine]);
    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.equal(result.sanitizedBeats[0]?.length, REEL_SCRIPT_MAX_CHARS_PER_BEAT_LINE);
    assert.ok(result.sanitizedBeats[0]?.endsWith("..."));
  });

  it("strips ASCII control characters", () => {
    const result = sanitizeSubtitleBeats(["Hello\u0007World"]);
    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.equal(result.sanitizedBeats[0], "HelloWorld");
  });

  it("collapses internal newlines to space", () => {
    const result = sanitizeSubtitleBeats(["Line one\nLine two"]);
    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.equal(result.sanitizedBeats[0], "Line one Line two");
  });

  it("fail-closed on ASS override injection fixture", () => {
    const result = sanitizeSubtitleBeats(["{\\fs999}"]);
    assert.equal(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.equal(result.code, "SUBTITLE_SANITIZE_FAILED");
    assert.equal(result.messageKey, "scripts.branding.failure.subtitleSanitize");
  });

  it("sanitizeOnScreenText integrates resolve + sanitize", () => {
    const result = sanitizeOnScreenText("Beat one\nBeat two");
    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.deepEqual(result.sanitizedBeats, ["Beat one", "Beat two"]);
  });

  it("returns empty beats for blank input", () => {
    const result = sanitizeOnScreenText("  \n  ");
    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.deepEqual(result.sanitizedBeats, []);
    assert.equal(result.subtitleSourceHash, createHash("sha256").update("").digest("hex"));
  });
});
