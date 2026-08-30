import "server-only";

import { spawn } from "node:child_process";

export type RunFfmpegOptions = {
  ffmpegPath?: string;
  spawnImpl?: typeof spawn;
};

export type RunFfmpegResult = {
  exitCode: number;
  stderr: string;
};

/**
 * Spawn ffmpeg with args array only — ADR-0003 / US-9.1 SECURITY.
 */
export async function runFfmpeg(
  args: string[],
  options: RunFfmpegOptions = {},
): Promise<RunFfmpegResult> {
  const spawnFn = options.spawnImpl ?? spawn;
  const ffmpegPath = options.ffmpegPath ?? "ffmpeg";

  return new Promise((resolve, reject) => {
    const child = spawnFn(ffmpegPath, args, { shell: false });
    const errorChunks: Buffer[] = [];

    child.stderr.on("data", (chunk: Buffer) => {
      errorChunks.push(chunk);
    });

    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        exitCode: code ?? 1,
        stderr: Buffer.concat(errorChunks).toString("utf8"),
      });
    });
  });
}
