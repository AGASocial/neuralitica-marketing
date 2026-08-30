import {
  BRANDING_ASS_ALIGNMENT,
  BRANDING_ASS_FONT_NAME,
  BRANDING_ASS_FONT_SIZE,
  BRANDING_ASS_MARGIN_LR,
  BRANDING_ASS_MARGIN_V,
  BRANDING_ASS_PLAY_RES_X,
  BRANDING_ASS_PLAY_RES_Y,
} from "./constants";

export type AssBeatTiming = {
  startSec: number;
  endSec: number;
};

export type BuildAssFromBeatsInput = {
  sanitizedBeats: string[];
  targetDurationSec: number;
  outputAssPath: string;
};

export type BuildAssFromBeatsResult = {
  assContent: string;
  beatTimings: AssBeatTiming[];
};

function formatAssTimestamp(sec: number): string {
  const clamped = Math.max(0, sec);
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const seconds = clamped % 60;
  const wholeSeconds = Math.floor(seconds);
  const centiseconds = Math.round((seconds - wholeSeconds) * 100);
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
}

/**
 * Build ASS subtitle file content — equal beat split (US-9.2 Phase A).
 * Pure function; caller writes assContent to temp path before FFmpeg spawn.
 */
export function buildAssFromBeats(
  input: BuildAssFromBeatsInput,
): BuildAssFromBeatsResult {
  const beatTimings: AssBeatTiming[] = [];
  const dialogueLines: string[] = [];

  if (input.sanitizedBeats.length === 0) {
    const header = buildAssHeader();
    return { assContent: header, beatTimings };
  }

  const beatDurationSec = input.targetDurationSec / input.sanitizedBeats.length;

  input.sanitizedBeats.forEach((beat, index) => {
    const startSec = index * beatDurationSec;
    const endSec = (index + 1) * beatDurationSec;
    beatTimings.push({ startSec, endSec });

    dialogueLines.push(
      `Dialogue: 0,${formatAssTimestamp(startSec)},${formatAssTimestamp(endSec)},Default,,0,0,0,,${beat}`,
    );
  });

  const assContent = [buildAssHeader(), ...dialogueLines, ""].join("\n");
  return { assContent, beatTimings };
}

function buildAssHeader(): string {
  return `[Script Info]
Title: Neuramark Branding
ScriptType: v4.00+
PlayResX: ${BRANDING_ASS_PLAY_RES_X}
PlayResY: ${BRANDING_ASS_PLAY_RES_Y}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${BRANDING_ASS_FONT_NAME},${BRANDING_ASS_FONT_SIZE},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,3,0,0,${BRANDING_ASS_ALIGNMENT},${BRANDING_ASS_MARGIN_LR},${BRANDING_ASS_MARGIN_LR},${BRANDING_ASS_MARGIN_V},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;
}

/** Exported for tests — outputAssPath is informational in CONTRACT signature. */
export type { BuildAssFromBeatsInput as BuildAssFromBeatsContractInput };
