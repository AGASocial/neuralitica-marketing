export type ExtractCoverFrameArgsInput = {
  localBrandedPath: string;
  localCoverPath: string;
  coverFrameSec: number;
};

function formatCoverSeekSec(sec: number): string {
  return Number(sec.toFixed(3)).toString();
}

/**
 * Clamp cover seek to [0, max(0, durationSec − 0.05)] (US-9.2 Phase B).
 */
export function clampCoverSeekSec(input: {
  coverFrameSec: number;
  durationSec: number;
}): number {
  const maxSeek = Math.max(0, input.durationSec - 0.05);
  return Math.min(Math.max(0, input.coverFrameSec), maxSeek);
}

/**
 * Build argv for cover JPEG extract — numeric -ss only (US-9.2 SECURITY).
 */
export function extractCoverFrameArgs(
  input: ExtractCoverFrameArgsInput,
): string[] {
  return [
    "-y",
    "-ss",
    formatCoverSeekSec(input.coverFrameSec),
    "-i",
    input.localBrandedPath,
    "-vframes",
    "1",
    "-q:v",
    "2",
    input.localCoverPath,
  ];
}
