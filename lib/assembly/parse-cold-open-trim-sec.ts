/**
 * Parse script cold_open_notes into a safe lead-trim seconds value (US-9.1 Phase B).
 * Never pass raw notes into FFmpeg argv — return number or null (skip).
 */

const COLD_OPEN_DIGITS_ONLY = /^\d{1,2}$/;
const COLD_OPEN_TRIM_MAX_SEC = 30;

export function parseColdOpenTrimSec(input: {
  coldOpenNotes: string | null | undefined;
  targetDurationSec: number;
}): number | null {
  if (
    input.coldOpenNotes == null ||
    typeof input.coldOpenNotes !== "string"
  ) {
    return null;
  }

  const trimmed = input.coldOpenNotes.trim();
  if (!COLD_OPEN_DIGITS_ONLY.test(trimmed)) {
    return null;
  }

  const n = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(n) || n <= 0) {
    return null;
  }

  const maxAllowed = Math.min(
    COLD_OPEN_TRIM_MAX_SEC,
    Math.floor(input.targetDurationSec),
  );
  if (n > maxAllowed) {
    return null;
  }

  return n;
}
