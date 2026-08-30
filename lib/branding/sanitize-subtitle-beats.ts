import { createHash } from "node:crypto";

import { REEL_SCRIPT_MAX_CHARS_PER_BEAT_LINE } from "@/lib/contracts/reel-script-readability";

import { resolveSubtitleBeats } from "./resolve-subtitle-beats";

/** Fail-closed: residual ASS override introducers after escape (US-9.2 SECURITY). */
const DANGEROUS_ASS_OVERRIDE_PATTERN = /\{[^}]*\\/;

export type SanitizeSubtitleBeatsResult =
  | {
      ok: true;
      sanitizedBeats: string[];
      subtitleSourceHash: string;
    }
  | {
      ok: false;
      code: "SUBTITLE_SANITIZE_FAILED";
      messageKey: "scripts.branding.failure.subtitleSanitize";
    };

function stripControlChars(text: string): string {
  return text.replace(/[\u0000-\u001F\u007F]/g, "");
}

/** Frozen ellipsis policy — 37 chars + "..." = 40 total. */
function truncateBeatLine(line: string): string {
  if (line.length <= REEL_SCRIPT_MAX_CHARS_PER_BEAT_LINE) {
    return line;
  }
  return (
    line.slice(0, REEL_SCRIPT_MAX_CHARS_PER_BEAT_LINE - 3) + "..."
  );
}

function escapeAssText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/%/g, "\\%");
}

function computeSubtitleSourceHash(beats: string[]): string {
  return createHash("sha256").update(beats.join("\n")).digest("hex");
}

/**
 * Sanitize on_screen_text beats for ASS burn-in (US-9.2 CONTRACT).
 * Fail-closed on injection residue — never silently burn unsanitized text.
 */
export function sanitizeSubtitleBeats(
  beats: string[],
): SanitizeSubtitleBeatsResult {
  const sanitizedBeats: string[] = [];

  for (const raw of beats) {
    let line = stripControlChars(raw.replace(/\r?\n/g, " "));
    line = truncateBeatLine(line.trim());
    if (line.length === 0) {
      continue;
    }

    const escaped = escapeAssText(line);
    if (DANGEROUS_ASS_OVERRIDE_PATTERN.test(escaped)) {
      return {
        ok: false,
        code: "SUBTITLE_SANITIZE_FAILED",
        messageKey: "scripts.branding.failure.subtitleSanitize",
      };
    }

    sanitizedBeats.push(escaped);
  }

  return {
    ok: true,
    sanitizedBeats,
    subtitleSourceHash: computeSubtitleSourceHash(sanitizedBeats),
  };
}

/** Convenience: resolve + sanitize from raw on_screen_text. */
export function sanitizeOnScreenText(
  onScreenText: string,
): SanitizeSubtitleBeatsResult {
  return sanitizeSubtitleBeats(resolveSubtitleBeats(onScreenText));
}
