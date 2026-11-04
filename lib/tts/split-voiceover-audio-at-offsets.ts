/**
 * Split a full voiceover audio file into segment clips at sentence-boundary
 * offsets using ffmpeg (no re-TTS). Paths must be server-controlled temp files.
 */
import "server-only";

import { runFfmpeg } from "@/lib/assembly/run-ffmpeg";

export type VoiceoverAudioSegmentSlice = {
  index: number;
  startSec: number;
  durationSec: number;
  outputPath: string;
};

export async function splitVoiceoverAudioAtOffsets(params: {
  localVoiceoverPath: string;
  slices: Array<{
    index: number;
    startSec: number;
    durationSec: number;
    outputPath: string;
  }>;
  runFfmpegFn?: typeof runFfmpeg;
}): Promise<VoiceoverAudioSegmentSlice[]> {
  const run = params.runFfmpegFn ?? runFfmpeg;
  const results: VoiceoverAudioSegmentSlice[] = [];

  for (const slice of params.slices) {
    const args = [
      "-y",
      "-ss",
      Number(slice.startSec.toFixed(3)).toString(),
      "-i",
      params.localVoiceoverPath,
      "-t",
      Number(slice.durationSec.toFixed(3)).toString(),
      "-acodec",
      "copy",
      slice.outputPath,
    ];
    const result = await run(args);
    if (result.exitCode !== 0) {
      // Retry with re-encode when stream copy fails (odd container boundaries).
      const reencode = await run([
        "-y",
        "-ss",
        Number(slice.startSec.toFixed(3)).toString(),
        "-i",
        params.localVoiceoverPath,
        "-t",
        Number(slice.durationSec.toFixed(3)).toString(),
        "-c:a",
        "libmp3lame",
        "-b:a",
        "192k",
        slice.outputPath,
      ]);
      if (reencode.exitCode !== 0) {
        throw new Error(
          `ffmpeg split voiceover segment ${slice.index} failed: ${reencode.stderr.slice(0, 400)}`,
        );
      }
    }
    results.push({
      index: slice.index,
      startSec: slice.startSec,
      durationSec: slice.durationSec,
      outputPath: slice.outputPath,
    });
  }

  return results;
}
