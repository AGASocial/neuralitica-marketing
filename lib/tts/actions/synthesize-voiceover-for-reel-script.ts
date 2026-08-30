"use server";

import type { SynthesizeVoiceoverForReelScriptResult } from "@/lib/contracts/tts-voiceover";
import { synthesizeVoiceoverForReelScript as synthesizeVoiceoverForReelScriptOrchestrator } from "@/lib/tts/synthesize-voiceover-for-reel-script";

/**
 * Operator TTS synthesize action (US-9.3).
 * Frontend consumer: `/operator/scripts` expand row — Generate / Regenerate voiceover.
 */
export async function synthesizeVoiceoverForReelScript(
  rawInput: unknown,
): Promise<SynthesizeVoiceoverForReelScriptResult> {
  return synthesizeVoiceoverForReelScriptOrchestrator(rawInput);
}
