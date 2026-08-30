export type ExtractCoverFrameArgsInput = {
  localBrandedPath: string;
  localCoverPath: string;
  coverFrameSec: number;
};

function formatCoverSeekSec(sec: number): string {
  return Number(sec.toFixed(3)).toString();
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
