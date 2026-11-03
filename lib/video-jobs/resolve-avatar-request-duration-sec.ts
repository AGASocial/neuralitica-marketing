import { clampAiGatewayHeygenDurationSec } from "@/lib/contracts/ai-gateway-video";

/**
 * Requested HeyGen/Gateway avatar duration must follow TTS length so lip-sync
 * output matches our ElevenLabs track (not the script's nominal target alone).
 * Ceil so we never request shorter than the audio; clamp to Gateway 5–15s.
 * When TTS duration is unknown, keep the script package duration untouched
 * (adapter still clamps for the Gateway API call / estimate).
 */
export function resolveAvatarRequestDurationSec(params: {
  voiceoverDurationSec: number | null | undefined;
  scriptTargetDurationSec: number;
}): number {
  const vo = params.voiceoverDurationSec;
  if (typeof vo === "number" && Number.isFinite(vo) && vo > 0) {
    return clampAiGatewayHeygenDurationSec(Math.ceil(vo));
  }
  return params.scriptTargetDurationSec;
}
