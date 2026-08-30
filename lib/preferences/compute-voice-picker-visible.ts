import type {
  FacelessStyle,
  VisualModality,
} from "@/lib/contracts/visual-preferences";

/**
 * Mirror CONTRACT § Preferencias voicePickerVisible from draft allowlist + faceless style.
 * Client-safe — no server-only imports.
 */
export function computeVoicePickerVisible(
  allowedModes: readonly VisualModality[],
  facelessStyle: FacelessStyle | null,
): boolean {
  if (
    allowedModes.includes("own_avatar") ||
    allowedModes.includes("generic_avatar")
  ) {
    return true;
  }

  if (
    allowedModes.includes("faceless") &&
    facelessStyle?.voice === "ai_voiceover"
  ) {
    return true;
  }

  const onlyFaceless =
    allowedModes.length === 1 && allowedModes[0] === "faceless";
  if (
    onlyFaceless &&
    facelessStyle &&
    (facelessStyle.voice === "none" || facelessStyle.voice === "music_only")
  ) {
    return false;
  }

  return true;
}
