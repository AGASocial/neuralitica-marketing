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
  /** Prefer TTS length so concat output matches our voiceover, not script target alone. */
  voiceoverDurationSec?: number;
};

function formatDurationSec(value: number): string {
  return Number(value.toFixed(2)).toString();
}

export function resolveBrollOutputDurationSec(
  input: Pick<
    BuildBrollConcatArgsInput,
    "targetDurationSec" | "voiceoverDurationSec"
  >,
): number {
  if (
    typeof input.voiceoverDurationSec === "number" &&
    Number.isFinite(input.voiceoverDurationSec) &&
    input.voiceoverDurationSec > 0
  ) {
    return input.voiceoverDurationSec;
  }
  return input.targetDurationSec;
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

  const outputDurationSec = resolveBrollOutputDurationSec(input);

  const needsTrim =
    effectiveSourceSec > outputDurationSec + input.toleranceSec ||
    (typeof input.voiceoverDurationSec === "number" &&
      effectiveSourceSec > outputDurationSec);

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
    BASE_VIDEO_FILTER,
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
  );

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
    args.push("-t", formatDurationSec(outputDurationSec));
  }

  args.push(input.localOutputPath);
  return args;
}

/**
 * Repeat clip1..clipN in order until total duration meets `requiredTotalDurationSec`.
 * Used when paid b-roll covers less than voiceover/target — no new provider calls.
 */
export function expandBrollClipSequenceForDuration(input: {
  clipPaths: string[];
  clipDurationSecs: number[];
  requiredTotalDurationSec: number;
}): { expandedPaths: string[]; totalDurationSec: number } {
  const { clipPaths, clipDurationSecs, requiredTotalDurationSec } = input;
  if (clipPaths.length < 1) {
    throw new Error("clipPaths must not be empty");
  }
  if (clipPaths.length !== clipDurationSecs.length) {
    throw new Error("clipPaths and clipDurationSecs length mismatch");
  }
  if (
    !Number.isFinite(requiredTotalDurationSec) ||
    requiredTotalDurationSec <= 0
  ) {
    throw new Error("requiredTotalDurationSec must be a positive finite number");
  }

  const cycleDurationSec = clipDurationSecs.reduce(
    (sum, sec) => sum + Math.max(0, sec),
    0,
  );
  if (cycleDurationSec <= 0) {
    throw new Error("clip cycle duration must be positive");
  }

  const expandedPaths: string[] = [];
  let totalDurationSec = 0;
  while (totalDurationSec < requiredTotalDurationSec) {
    for (let i = 0; i < clipPaths.length; i += 1) {
      expandedPaths.push(clipPaths[i]!);
      totalDurationSec += clipDurationSecs[i]!;
      if (totalDurationSec >= requiredTotalDurationSec) {
        break;
      }
    }
  }

  return { expandedPaths, totalDurationSec };
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
