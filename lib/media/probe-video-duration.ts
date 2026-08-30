import "server-only";

/**
 * Probe video duration from an MP4/MOV buffer using mp4box (US-8.3 CONTRACT).
 * Returns duration in seconds, or null when probe fails.
 */
export async function probeVideoDurationSec(buffer: Buffer): Promise<number | null> {
  try {
    const { default: MP4Box } = await import("mp4box");

    return await new Promise((resolve) => {
      const mp4boxfile = MP4Box.createFile();

      mp4boxfile.onReady = (info: { duration?: number; timescale?: number }) => {
        if (
          typeof info.duration === "number" &&
          typeof info.timescale === "number" &&
          info.timescale > 0
        ) {
          resolve(info.duration / info.timescale);
        } else {
          resolve(null);
        }
      };

      mp4boxfile.onError = () => {
        resolve(null);
      };

      const arrayBuffer = buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength,
      ) as ArrayBuffer & { fileStart?: number };
      arrayBuffer.fileStart = 0;
      mp4boxfile.appendBuffer(arrayBuffer);
      mp4boxfile.flush();
    });
  } catch {
    return null;
  }
}

/** Round duration down to at most 2 decimal places (CONTRACT). */
export function roundDurationSecDown(durationSec: number): number {
  return Math.floor(durationSec * 100) / 100;
}
