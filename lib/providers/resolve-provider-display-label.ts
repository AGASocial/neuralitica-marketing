import "server-only";

const PROVIDER_DISPLAY_LABELS: Record<string, string> = {
  siliconflow_deepseek_flash: "DeepSeek Flash",
  siliconflow_qwen: "Qwen (SiliconFlow)",
  siliconflow_cosyvoice2: "CosyVoice 2",
  sadtalker_low: "SadTalker",
  musetalk_low: "MuseTalk",
  siliconflow_wan21_turbo: "Wan 2.1 Turbo",
  manual: "Manual upload",
  heygen_high: "HeyGen",
  ltx_broll_high: "LTX B-roll",
  elevenlabs_tts_high: "ElevenLabs",
};

export function resolveProviderDisplayLabel(providerKey: string): string {
  const mapped = PROVIDER_DISPLAY_LABELS[providerKey];
  if (mapped) {
    return mapped;
  }
  return providerKey
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
