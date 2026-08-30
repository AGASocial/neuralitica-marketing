/**
 * US-9.2 buildReelV1BrandingArgs golden snapshots.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BUNDLED_FONT_DIR } from "./constants.ts";
import { buildReelV1BrandingArgs } from "./build-reel-v1-branding-args.ts";

const BASE = "/tmp/neuramark-branding/job-1/base.mp4";
const BRANDED = "/tmp/neuramark-branding/job-1/branded.mp4";
const ASS = "/tmp/neuramark-branding/job-1/subtitles.ass";
const LOGO = "/tmp/neuramark-branding/job-1/logo.png";

function assertNoShellMetacharacters(args: string[]): void {
  for (const arg of args) {
    if (arg.startsWith("[") && arg.includes("]")) {
      continue;
    }
    assert.match(arg, /^[^\n\r|&`$<>\\]*$/);
  }
}

function assertNoRawBeatText(args: string[]): void {
  const joined = args.join(" ");
  assert.doesNotMatch(joined, /Beat one|Hello world|drawtext=/);
}

describe("buildReelV1BrandingArgs", () => {
  it("subtitles + logo — filter_complex golden snapshot", () => {
    const args = buildReelV1BrandingArgs({
      localBasePath: BASE,
      localBrandedPath: BRANDED,
      localAssPath: ASS,
      localLogoPath: LOGO,
      burnSubtitles: true,
      overlayLogo: true,
    });

    assert.deepEqual(args, [
      "-y",
      "-i",
      BASE,
      "-i",
      LOGO,
      "-filter_complex",
      `[0:v]subtitles=${ASS}:fontsdir=${BUNDLED_FONT_DIR}[vsub];[1:v]scale=130:-1[logo];[vsub][logo]overlay=W-w-48:48[vout]`,
      "-map",
      "[vout]",
      "-map",
      "0:a?",
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
      BRANDED,
    ]);
    assertNoShellMetacharacters(args);
    assertNoRawBeatText(args);
  });

  it("subtitles only", () => {
    const args = buildReelV1BrandingArgs({
      localBasePath: BASE,
      localBrandedPath: BRANDED,
      localAssPath: ASS,
      burnSubtitles: true,
      overlayLogo: false,
    });

    assert.ok(args.includes("-vf"));
    assert.equal(
      args[args.indexOf("-vf") + 1],
      `subtitles=${ASS}:fontsdir=${BUNDLED_FONT_DIR}`,
    );
    assert.ok(!args.includes("-filter_complex"));
    assertNoRawBeatText(args);
  });

  it("logo only", () => {
    const args = buildReelV1BrandingArgs({
      localBasePath: BASE,
      localBrandedPath: BRANDED,
      localLogoPath: LOGO,
      burnSubtitles: false,
      overlayLogo: true,
    });

    assert.match(args.join(" "), /overlay=W-w-48:48/);
    assert.ok(args.includes(LOGO));
    assertNoRawBeatText(args);
  });

  it("neither — stream copy for cover-only path", () => {
    const args = buildReelV1BrandingArgs({
      localBasePath: BASE,
      localBrandedPath: BRANDED,
      burnSubtitles: false,
      overlayLogo: false,
    });

    assert.deepEqual(args, [
      "-y",
      "-i",
      BASE,
      "-c:v",
      "copy",
      "-c:a",
      "copy",
      BRANDED,
    ]);
  });

  it("throws when burnSubtitles without ass path", () => {
    assert.throws(
      () =>
        buildReelV1BrandingArgs({
          localBasePath: BASE,
          localBrandedPath: BRANDED,
          burnSubtitles: true,
          overlayLogo: false,
        }),
      /localAssPath required/,
    );
  });
});
