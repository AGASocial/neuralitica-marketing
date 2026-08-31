/**
 * Faceless B-roll concat FFmpeg args — pure function, no spawn (US-9.1 Phase B).
 * Concat demuxer over server-written concat.txt; voiceover mux; numeric cold-open only.
 */

import { ASSEMBLY_BROLL_CLIP_MAX } from "@/lib/contracts/assembly-job";

const BASE_VIDEO_FILTER =
  "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920";

export type BuildBrollConcatArgsInput = {
  localConcatListPath: string;
  localClipPaths: string[];
  localVoiceoverPath: string;
  localOutputPath: string;
  /** Sum of downloaded clip durations (after ownership download); used for trim/pad. */
  sourceDurationSec: number;
  targetDurationSec: number;
  toleranceSec: number;
  coldOpenTrimSec: number | null;
};

function formatDurationSec(value: number): string {
  return Number(value.toFixed(2)).toString();
}

/**
 * Build argv for `spawn('ffmpeg', args, { shell: false })`.
 * Paths must be server-controlled temp files only — never beats/notes/URLs.
 */
export function buildBrollConcatArgs(
  input: BuildBrollConcatArgsInput,
): string[] {
  const clipCount = input.localClipPaths.length;
  if (clipCount < 1 || clipCount > ASSEMBLY_BROLL_CLIP_MAX) {
    throw new Error(
      `localClipPaths length must be 1..${ASSEMBLY_BROLL_CLIP_MAX}`,
    );
  }
  if (!input.localVoiceoverPath) {
    throw new Error("localVoiceoverPath required for broll stitch");
  }

  const coldOpen =
    input.coldOpenTrimSec != null && input.coldOpenTrimSec > 0
      ? input.coldOpenTrimSec
      : null;

  const effectiveSourceSec = Math.max(
    0,
    input.sourceDurationSec - (coldOpen ?? 0),
  );

  const needsTrim =
    effectiveSourceSec > input.targetDurationSec + input.toleranceSec;
  const needsPad =
    effectiveSourceSec < input.targetDurationSec - input.toleranceSec;
  const padSec = needsPad
    ? input.targetDurationSec - effectiveSourceSec
    : 0;

  let videoFilter = BASE_VIDEO_FILTER;
  if (needsPad) {
    videoFilter = `${BASE_VIDEO_FILTER},tpad=stop_mode=add:stop_duration=${formatDurationSec(padSec)}`;
  }

  const args: string[] = ["-y"];

  if (coldOpen != null) {
    args.push("-ss", formatDurationSec(coldOpen));
  }

  args.push(
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    input.localConcatListPath,
    "-i",
    input.localVoiceoverPath,
    "-vf",
    videoFilter,
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
  );

  if (needsPad) {
    args.push("-af", `apad=pad_dur=${formatDurationSec(padSec)}`);
  }

  args.push(
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
  );

  if (needsTrim) {
    args.push("-t", formatDurationSec(input.targetDurationSec));
  }

  args.push(input.localOutputPath);
  return args;
}

/**
 * Write concat demuxer list contents for absolute clip paths in the job temp dir.
 */
export function formatBrollConcatListContents(
  absoluteClipPaths: string[],
): string {
  return absoluteClipPaths
    .map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
    .join("\n");
}
