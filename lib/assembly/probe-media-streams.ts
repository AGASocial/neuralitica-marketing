import "server-only";

import { spawn } from "node:child_process";

export type MediaProbeResult = {
  durationSec: number;
  hasAudioStream: boolean;
};

type FfprobeStream = { codec_type?: string };
type FfprobePayload = {
  format?: { duration?: string };
  streams?: FfprobeStream[];
};

/**
 * Probe local media for duration and audio stream presence (US-9.1).
 * Uses ffprobe JSON output — available on Fly worker image alongside ffmpeg.
 */
export async function probeLocalMediaFile(
  filePath: string,
): Promise<MediaProbeResult | null> {
  try {
    const stdout = await runFfprobe([
      "-v",
      "error",
      "-show_entries",
      "format=duration:stream=codec_type",
      "-of",
      "json",
      filePath,
    ]);

    const parsed = JSON.parse(stdout) as FfprobePayload;
    const durationRaw = parsed.format?.duration;
    const durationSec =
      typeof durationRaw === "string"
        ? Number.parseFloat(durationRaw)
        : Number.NaN;

    if (!Number.isFinite(durationSec) || durationSec <= 0) {
      return null;
    }

    const hasAudioStream =
      Array.isArray(parsed.streams) &&
      parsed.streams.some((stream) => stream.codec_type === "audio");

    return { durationSec, hasAudioStream };
  } catch {
    return null;
  }
}

function runFfprobe(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffprobe", args, { shell: false });
    const chunks: Buffer[] = [];
    const errorChunks: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      errorChunks.push(chunk);
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(chunks).toString("utf8"));
        return;
      }
      reject(
        new Error(
          `ffprobe exited with code ${code ?? "unknown"}`,
        ),
      );
    });
  });
}
