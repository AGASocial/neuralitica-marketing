import "server-only";

import type { SupportedLocale, VisualMode } from "@/lib/contracts/providers";
import type { TtsVoiceId } from "@/lib/contracts/tts-voiceover";
import type { VisualModality } from "@/lib/contracts/visual-preferences";
import { getBusinessProfileForAgents } from "@/lib/profile/get-business-profile-for-agents";
import { loadApprovedStrategyForScriptJob } from "@/lib/reel-scripts/load-approved-strategy-for-script-job";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";
import { isAllowedVoiceId } from "@/lib/tts/voice-catalog";

export type ReelScriptForVoiceover = {
  reelScriptId: string;
  clientId: string;
  strategyId: string;
  slotIndex: number;
  voiceoverText: string;
  visualMode: VisualMode;
  modalidad: VisualModality;
  preferredVoiceId: TtsVoiceId | null;
  profileTone: string;
  preferredLocale: SupportedLocale;
  targetDurationSec: number;
};

function deriveVisualMode(allowedModes: VisualMode[]): VisualMode {
  if (allowedModes.includes("own_avatar")) {
    return "own_avatar";
  }
  if (allowedModes.includes("generic_avatar")) {
    return "generic_avatar";
  }
  return "faceless";
}

export async function loadReelScriptForVoiceover(params: {
  reelScriptId: string;
  clientId: string;
  preferredLocale: SupportedLocale;
}): Promise<ReelScriptForVoiceover | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_reel_scripts")
    .select(
      "id, client_id, strategy_id, slot_index, voiceover_text, target_duration_sec",
    )
    .eq("id", params.reelScriptId)
    .eq("client_id", params.clientId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const raw = data as Record<string, unknown>;
  const voiceoverText =
    typeof raw.voiceover_text === "string" ? raw.voiceover_text.trim() : "";
  if (
    typeof raw.slot_index !== "number" ||
    typeof raw.strategy_id !== "string" ||
    typeof raw.target_duration_sec !== "number"
  ) {
    return null;
  }

  const strategy = await loadApprovedStrategyForScriptJob({
    strategyId: raw.strategy_id,
    clientId: params.clientId,
  });
  if (!strategy) {
    return null;
  }

  const slot = strategy.brief.slots.find((s) => s.slotIndex === raw.slot_index);
  if (!slot) {
    return null;
  }

  const profile = await getBusinessProfileForAgents(params.clientId);
  if (!profile.exists || profile.visualModeSummary === null) {
    return null;
  }

  const visualMode = deriveVisualMode(profile.visualModeSummary.allowedModes);
  const profileTone =
    typeof profile.fields.tone?.description === "string"
      ? profile.fields.tone.description
      : "";

  const { data: prefsRow, error: prefsError } = await supabase
    .from("neuramark_visual_preferences")
    .select("voice_id")
    .eq("client_id", params.clientId)
    .maybeSingle();

  if (prefsError) {
    return null;
  }

  let preferredVoiceId: TtsVoiceId | null = null;
  const rawVoiceId = (prefsRow as { voice_id?: unknown } | null)?.voice_id;
  if (typeof rawVoiceId === "string" && isAllowedVoiceId(rawVoiceId)) {
    preferredVoiceId = rawVoiceId;
  }

  return {
    reelScriptId: raw.id as string,
    clientId: params.clientId,
    strategyId: raw.strategy_id,
    slotIndex: raw.slot_index,
    voiceoverText,
    visualMode,
    modalidad: slot.modalidad,
    preferredVoiceId,
    profileTone,
    preferredLocale: params.preferredLocale,
    targetDurationSec: raw.target_duration_sec,
  };
}
