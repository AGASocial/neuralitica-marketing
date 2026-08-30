import { REEL_SCRIPT_MAX_BEAT_LINES_TOTAL } from "@/lib/contracts/reel-script-readability";

/**
 * Split on_screen_text into beat lines (US-9.2 CONTRACT step 1–3).
 * Truncates to max beat count — per-line sanitization happens in sanitizeSubtitleBeats.
 */
export function resolveSubtitleBeats(onScreenText: string): string[] {
  return onScreenText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, REEL_SCRIPT_MAX_BEAT_LINES_TOTAL);
}
