import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildAvatarSegmentTimelineArgs } from "./build-avatar-segment-timeline-args";

describe("buildAvatarSegmentTimelineArgs", () => {
  it("maps full voiceover and trims to VO length", () => {
    const args = buildAvatarSegmentTimelineArgs({
      segments: [
        { localPath: "/tmp/seg0.mp4", startSec: 0, durationSec: 6 },
        { localPath: "/tmp/seg1.mp4", startSec: 6, durationSec: 6 },
      ],
      brollPaths: ["/tmp/broll.mp4"],
      localVoiceoverPath: "/tmp/vo.mp3",
      localOutputPath: "/tmp/out.mp4",
      voiceoverDurationSec: 12,
    });

    assert.ok(args.includes("/tmp/vo.mp3"));
    assert.ok(args.includes("/tmp/out.mp4"));
    const tIdx = args.indexOf("-t");
    assert.ok(tIdx >= 0);
    assert.equal(args[tIdx + 1], "12");
    const filter = args[args.indexOf("-filter_complex") + 1]!;
    assert.match(filter, /overlay/);
    assert.match(filter, /broll0/);
  });

  it("works with a single segment and no b-roll", () => {
    const args = buildAvatarSegmentTimelineArgs({
      segments: [{ localPath: "/tmp/seg0.mp4", startSec: 0, durationSec: 10 }],
      brollPaths: [],
      localVoiceoverPath: "/tmp/vo.mp3",
      localOutputPath: "/tmp/out.mp4",
      voiceoverDurationSec: 10,
    });
    assert.ok(args.includes("-shortest"));
    assert.equal(args[args.indexOf("-t") + 1], "10");
  });
});

it("uses only one b-roll input and shifts segment PTS to VO offsets", () => {
  const args = buildAvatarSegmentTimelineArgs({
    segments: [
      { localPath: "/t/s0.mp4", startSec: 0, durationSec: 5.2 },
      { localPath: "/t/s1.mp4", startSec: 5.2, durationSec: 6.5 },
    ],
    brollPaths: ["/t/b0.mp4", "/t/b1.mp4", "/t/b2.mp4"],
    localVoiceoverPath: "/t/vo.mp3",
    localOutputPath: "/t/out.mp4",
    voiceoverDurationSec: 11.7,
  });
  const inputs = args.filter((_, i) => args[i - 1] === "-i");
  assert.deepEqual(inputs, ["/t/s0.mp4", "/t/s1.mp4", "/t/b0.mp4", "/t/vo.mp3"]);
  const fc = args[args.indexOf("-filter_complex") + 1]!;
  assert.ok(fc.includes("[1:v]setpts=PTS-STARTPTS+5.2/TB"));
  assert.ok(!fc.includes("broll1"));
});
