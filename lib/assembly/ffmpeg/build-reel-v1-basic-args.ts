/** Phase A FFmpeg args for reel_v1_basic — pure function, no spawn (US-9.1). */

const BASE_VIDEO_FILTER =
  "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920";

export type BuildReelV1BasicArgsInput = {
  localPrimaryPath: string;
  localOutputPath: string;
  localVoiceoverPath?: string;
  remuxVoiceover: boolean;
  primaryDurationSec: number;
  targetDurationSec: number;
  toleranceSec: number;
  /**
   * When remuxing TTS, limit/pad video to the voiceover length so a longer
   * avatar clip cannot leave a silent mouth-moving tail past our audio.
   */
  voiceoverDurationSec?: number;
};

function formatDurationSec(value: number): string {
  return Number(value.toFixed(2)).toString();
}

/**
 * Effective assembly output duration: prefer TTS length when remuxing.
 */
export function resolveReelV1OutputDurationSec(
  input: Pick<
    BuildReelV1BasicArgsInput,
    "remuxVoiceover" | "targetDurationSec" | "voiceoverDurationSec"
  >,
): number {
  if (
    input.remuxVoiceover &&
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
 * Paths must be server-controlled temp files only — never user/script text.
 */
export function buildReelV1BasicArgs(
  input: BuildReelV1BasicArgsInput,
): string[] {
  if (input.remuxVoiceover && !input.localVoiceoverPath) {
    throw new Error("localVoiceoverPath required when remuxVoiceover is true");
  }

  const outputDurationSec = resolveReelV1OutputDurationSec(input);

  const needsTrim =
    input.primaryDurationSec > outputDurationSec + input.toleranceSec ||
    (input.remuxVoiceover &&
      typeof input.voiceoverDurationSec === "number" &&
      input.primaryDurationSec > outputDurationSec);
  const needsPad =
    input.primaryDurationSec < outputDurationSec - input.toleranceSec;
  const padSec = needsPad
    ? outputDurationSec - input.primaryDurationSec
    : 0;

  let videoFilter = BASE_VIDEO_FILTER;
  if (needsPad) {
    videoFilter = `${BASE_VIDEO_FILTER},tpad=stop_mode=add:stop_duration=${formatDurationSec(padSec)}`;
  }

  const args: string[] = ["-y"];

  if (input.remuxVoiceover) {
    args.push(
      "-i",
      input.localPrimaryPath,
      "-i",
      input.localVoiceoverPath!,
    );
  } else {
    args.push("-i", input.localPrimaryPath);
  }

  args.push("-vf", videoFilter);

  if (input.remuxVoiceover) {
    args.push("-map", "0:v:0", "-map", "1:a:0");
  } else {
    args.push("-map", "0:v:0", "-map", "0:a:0?");
  }

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
    args.push("-t", formatDurationSec(outputDurationSec));
  }

  args.push(input.localOutputPath);
  return args;
}
