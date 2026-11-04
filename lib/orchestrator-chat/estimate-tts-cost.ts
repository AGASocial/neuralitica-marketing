import { ELEVENLABS_UNIT_COST_CENTS_PER_1M_CHARS } from "@/lib/contracts/elevenlabs-tts";

/**
 * Plain TTS cost estimate from catalog constants (same formula as ElevenLabs adapter).
 * No provider / network calls — safe for chat proposal tools and unit tests.
 */
export function estimateTtsCostCentsFromTextLength(
  textLength: number,
  unitCostCentsPer1MChars: number = ELEVENLABS_UNIT_COST_CENTS_PER_1M_CHARS,
): number {
  if (textLength <= 0) {
    return 0;
  }
  return Math.max(1, Math.ceil((textLength / 1_000_000) * unitCostCentsPer1MChars));
}
