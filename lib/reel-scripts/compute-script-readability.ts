import type { ReelScriptPackage } from "@/lib/contracts/reel-script";
import type {
  AssertScriptReadabilityIssue,
  AssertScriptReadabilityResult,
  ReelScriptReadability,
} from "@/lib/contracts/reel-script-readability";
import {
  REEL_SCRIPT_MAX_BEAT_LINES_TOTAL,
  REEL_SCRIPT_MAX_CHARS_PER_BEAT_LINE,
  REEL_SCRIPT_MAX_LINES_PER_BEAT,
  REEL_SCRIPT_VO_WARN_OVER_RATIO,
  REEL_SCRIPT_VO_WARN_UNDER_RATIO,
  REEL_SCRIPT_WORDS_PER_SECOND_TARGET,
} from "@/lib/contracts/reel-script-readability";

/** Split on newline, trim segments, drop empty lines — one segment = one beat line. */
export function parseOnScreenBeats(onScreenText: string): string[] {
  return onScreenText
    .split(/\r?\n/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

/** Whitespace token count for VO preview. */
export function countVoiceoverWords(voiceoverText: string): number {
  return voiceoverText.trim().split(/\s+/).filter(Boolean).length;
}

function countLinesInBeatSegment(text: string): number {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0).length;
}

/** Pure readability metrics for a Paquete de guion (US-5.2). */
export function computeScriptReadabilityMetrics(
  pkg: ReelScriptPackage,
): ReelScriptReadability {
  const beatTexts = parseOnScreenBeats(pkg.onScreenText);

  const beatLines = beatTexts.map((text, index) => {
    const charCount = text.length;
    const lineCount = Math.max(1, countLinesInBeatSegment(text));
    const warnings: Array<"chars_exceeded" | "lines_exceeded"> = [];

    if (charCount > REEL_SCRIPT_MAX_CHARS_PER_BEAT_LINE) {
      warnings.push("chars_exceeded");
    }
    if (lineCount > REEL_SCRIPT_MAX_LINES_PER_BEAT) {
      warnings.push("lines_exceeded");
    }

    return { index, text, charCount, lineCount, warnings };
  });

  const onScreenWarnings: Array<
    "too_many_beats" | "beat_chars" | "beat_lines"
  > = [];

  if (beatLines.length > REEL_SCRIPT_MAX_BEAT_LINES_TOTAL) {
    onScreenWarnings.push("too_many_beats");
  }
  if (beatLines.some((beat) => beat.warnings.includes("chars_exceeded"))) {
    onScreenWarnings.push("beat_chars");
  }
  if (beatLines.some((beat) => beat.warnings.includes("lines_exceeded"))) {
    onScreenWarnings.push("beat_lines");
  }

  const wordCount = countVoiceoverWords(pkg.voiceoverText);
  const targetWordCount = Math.round(
    pkg.targetDurationSec * REEL_SCRIPT_WORDS_PER_SECOND_TARGET,
  );

  let status: "ok" | "over" | "under" = "ok";
  if (wordCount > targetWordCount * REEL_SCRIPT_VO_WARN_OVER_RATIO) {
    status = "over";
  } else if (wordCount < targetWordCount * REEL_SCRIPT_VO_WARN_UNDER_RATIO) {
    status = "under";
  }

  const onScreen = {
    beatLines,
    totalBeatLines: beatLines.length,
    warnings: onScreenWarnings,
  };

  const voiceover = {
    wordCount,
    targetWordCount,
    targetDurationSec: pkg.targetDurationSec,
    wordsPerSecondTarget: REEL_SCRIPT_WORDS_PER_SECOND_TARGET,
    status,
  };

  const hasWarnings =
    onScreen.warnings.length > 0 ||
    onScreen.beatLines.some((beat) => beat.warnings.length > 0) ||
    voiceover.status !== "ok";

  return { onScreen, voiceover, hasWarnings };
}

/**
 * Future save validator hook — exported for inline-edit story; uncalled in US-5.2 BUILD.
 */
export function assertScriptReadabilityForSave(
  pkg: ReelScriptPackage,
): AssertScriptReadabilityResult {
  const metrics = computeScriptReadabilityMetrics(pkg);

  if (!metrics.hasWarnings) {
    return { ok: true, metrics };
  }

  const issues: AssertScriptReadabilityIssue[] = [];

  for (const beat of metrics.onScreen.beatLines) {
    if (beat.warnings.includes("chars_exceeded")) {
      issues.push({
        code: "beat_chars_exceeded",
        beatIndex: beat.index,
        messageKey: "scripts.readability.beatCharsExceeded",
      });
    }
    if (beat.warnings.includes("lines_exceeded")) {
      issues.push({
        code: "beat_lines_exceeded",
        beatIndex: beat.index,
        messageKey: "scripts.readability.beatLinesExceeded",
      });
    }
  }

  if (metrics.onScreen.warnings.includes("too_many_beats")) {
    issues.push({
      code: "too_many_beats",
      messageKey: "scripts.readability.tooManyBeats",
    });
  }

  if (metrics.voiceover.status === "over") {
    issues.push({
      code: "voiceover_over",
      messageKey: "scripts.readability.voiceoverOver",
    });
  } else if (metrics.voiceover.status === "under") {
    issues.push({
      code: "voiceover_under",
      messageKey: "scripts.readability.voiceoverUnder",
    });
  }

  return { ok: false, metrics, issues };
}
