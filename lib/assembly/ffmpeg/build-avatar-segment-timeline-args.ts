/**
 * FFmpeg argv builder for segmented avatar reels:
 * place each avatar clip at its VO offset, optional b-roll cutaway at the
 * segment boundary, full ElevenLabs voiceover as the soundtrack, trim to VO.
 *
 * Pure function — no spawn.
 */

export type AvatarTimelineSegmentInput = {
  localPath: string;
  /** Start offset within the full voiceover (seconds). */
  startSec: number;
  /** Clip / segment duration (seconds). */
  durationSec: number;
};

export type BuildAvatarSegmentTimelineArgsInput = {
  segments: AvatarTimelineSegmentInput[];
  brollPaths: string[];
  localVoiceoverPath: string;
  localOutputPath: string;
  voiceoverDurationSec: number;
  /** Cutaway length at the boundary between seg0 and seg1 when b-roll exists. */
  cutawaySec?: number;
};

function formatDurationSec(value: number): string {
  return Number(value.toFixed(3)).toString();
}

const BASE_SCALE =
  "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1";

/**
 * Build argv for `spawn('ffmpeg', args, { shell: false })`.
 */
export function buildAvatarSegmentTimelineArgs(
  input: BuildAvatarSegmentTimelineArgsInput,
): string[] {
  if (input.segments.length === 0) {
    throw new Error("at least one avatar segment is required");
  }
  if (
    !Number.isFinite(input.voiceoverDurationSec) ||
    input.voiceoverDurationSec <= 0
  ) {
    throw new Error("voiceoverDurationSec must be positive");
  }

  const total = input.voiceoverDurationSec;
  // Only one cutaway slot exists; extra b-roll inputs would leave unconnected
  // filter outputs and make ffmpeg fail.
  const brollPaths = input.brollPaths.slice(0, 1);
  const cutawaySec = Math.max(
    0,
    Math.min(
      input.cutawaySec ?? 1.5,
      input.segments.length >= 2 ? 2.5 : 0,
    ),
  );
  const hasCutaway =
    cutawaySec > 0 &&
    brollPaths.length > 0 &&
    input.segments.length >= 2;

  const args: string[] = ["-y"];

  for (const segment of input.segments) {
    args.push("-i", segment.localPath);
  }
  for (const broll of brollPaths) {
    args.push("-i", broll);
  }
  args.push("-i", input.localVoiceoverPath);

  const segmentCount = input.segments.length;
  const brollCount = brollPaths.length;
  const voiceoverIndex = segmentCount + brollCount;

  // Build filter_complex: normalize each visual input, then overlay on a black base.
  const filterParts: string[] = [];
  filterParts.push(
    `color=c=black:s=1080x1920:d=${formatDurationSec(total)}[base]`,
  );

  for (let i = 0; i < segmentCount; i += 1) {
    filterParts.push(
      `[${i}:v]setpts=PTS-STARTPTS+${formatDurationSec(input.segments[i]!.startSec)}/TB,${BASE_SCALE},fps=30,format=yuv420p[seg${i}]`,
    );
  }
  const brollStartSec =
    segmentCount >= 2
      ? Math.max(0, input.segments[1]!.startSec - cutawaySec / 2)
      : Math.max(0, total / 2 - cutawaySec / 2);
  for (let i = 0; i < brollCount; i += 1) {
    const idx = segmentCount + i;
    filterParts.push(
      `[${idx}:v]setpts=PTS-STARTPTS+${formatDurationSec(brollStartSec)}/TB,${BASE_SCALE},fps=30,format=yuv420p[broll${i}]`,
    );
  }

  // Timeline windows (visual):
  // - 1 segment: full [0, total)
  // - 2 segments + cutaway: seg0 [0, boundary-cutaway/2), broll mid, seg1 [boundary+cutaway/2, total)
  // - 2 segments no cutaway: place each at startSec for durationSec
  let lastLabel = "base";
  let overlayIdx = 0;

  if (segmentCount === 1) {
    const seg = input.segments[0]!;
    const enableEnd = Math.min(total, seg.startSec + seg.durationSec);
    const out = `v${overlayIdx}`;
    filterParts.push(
      `[${lastLabel}][seg0]overlay=0:0:enable='between(t,${formatDurationSec(seg.startSec)},${formatDurationSec(enableEnd)})'[${out}]`,
    );
    lastLabel = out;
    overlayIdx += 1;
  } else {
    const seg0 = input.segments[0]!;
    const seg1 = input.segments[1]!;
    const boundary = seg1.startSec;

    if (hasCutaway) {
      const cutStart = Math.max(0, boundary - cutawaySec / 2);
      const cutEnd = Math.min(total, boundary + cutawaySec / 2);
      const seg0End = cutStart;
      const seg1Start = cutEnd;

      let out = `v${overlayIdx}`;
      filterParts.push(
        `[${lastLabel}][seg0]overlay=0:0:enable='between(t,0,${formatDurationSec(seg0End)})'[${out}]`,
      );
      lastLabel = out;
      overlayIdx += 1;

      out = `v${overlayIdx}`;
      filterParts.push(
        `[${lastLabel}][broll0]overlay=0:0:enable='between(t,${formatDurationSec(cutStart)},${formatDurationSec(cutEnd)})'[${out}]`,
      );
      lastLabel = out;
      overlayIdx += 1;

      out = `v${overlayIdx}`;
      filterParts.push(
        `[${lastLabel}][seg1]overlay=0:0:enable='between(t,${formatDurationSec(seg1Start)},${formatDurationSec(total)})'[${out}]`,
      );
      lastLabel = out;
      overlayIdx += 1;
    } else {
      for (let i = 0; i < segmentCount; i += 1) {
        const seg = input.segments[i]!;
        const enableEnd = Math.min(total, seg.startSec + seg.durationSec);
        const out = `v${overlayIdx}`;
        filterParts.push(
          `[${lastLabel}][seg${i}]overlay=0:0:enable='between(t,${formatDurationSec(seg.startSec)},${formatDurationSec(enableEnd)})'[${out}]`,
        );
        lastLabel = out;
        overlayIdx += 1;
      }
    }
  }

  // If only one segment and b-roll available, optional mid-clip cutaway overlay
  // covering the middle ~1.5s (lips off-screen briefly).
  if (
    segmentCount === 1 &&
    brollCount > 0 &&
    cutawaySec > 0 &&
    total > cutawaySec * 2
  ) {
    const mid = total / 2;
    const cutStart = mid - cutawaySec / 2;
    const cutEnd = mid + cutawaySec / 2;
    const out = `v${overlayIdx}`;
    filterParts.push(
      `[${lastLabel}][broll0]overlay=0:0:enable='between(t,${formatDurationSec(cutStart)},${formatDurationSec(cutEnd)})'[${out}]`,
    );
    lastLabel = out;
  }

  args.push("-filter_complex", filterParts.join(";"));
  args.push(
    "-map",
    `[${lastLabel}]`,
    "-map",
    `${voiceoverIndex}:a:0`,
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
    "-t",
    formatDurationSec(total),
    "-shortest",
    input.localOutputPath,
  );

  return args;
}
