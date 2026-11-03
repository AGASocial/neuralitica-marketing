import "server-only";

import type { SupportedLocale } from "@/lib/contracts/providers";
import type { TtsVoiceId } from "@/lib/contracts/tts-voiceover";
import { getAvatarForClientId } from "@/lib/avatars/get-avatar-for-client";
import { resolveAvatarTtsVoice } from "@/lib/tts/avatar-voice-mapping";
import { resolveSynthesisVoiceId } from "@/lib/tts/voice-catalog";

export type SynthesisVoiceResolution = {
  catalogVoiceId: TtsVoiceId;
  elevenLabsVoiceId?: string;
  locale: SupportedLocale;
  source: "avatar" | "preferences_tone";
};

/**
 * Prefer avatar custom voice / gender+language map; else Preferencias + tone heuristic.
 */
export async function resolveVoiceForSynthesis(params: {
  clientId: string;
  preferredVoiceId: TtsVoiceId | null;
  contentLocale: SupportedLocale;
  profileTone: string;
}): Promise<SynthesisVoiceResolution> {
  const avatarResult = await getAvatarForClientId(params.clientId);
  if (avatarResult.exists === true) {
    const resolved = resolveAvatarTtsVoice({
      gender: avatarResult.avatar.gender,
      language: avatarResult.avatar.language,
      elevenLabsVoiceId: avatarResult.avatar.elevenLabsVoiceId,
    });
    return {
      catalogVoiceId: resolved.catalogVoiceId,
      elevenLabsVoiceId: resolved.elevenLabsVoiceId,
      locale: resolved.language,
      source: "avatar",
    };
  }

  const catalogVoiceId = resolveSynthesisVoiceId({
    preferredVoiceId: params.preferredVoiceId,
    contentLocale: params.contentLocale,
    profileTone: params.profileTone,
  });
  return {
    catalogVoiceId,
    locale: params.contentLocale,
    source: "preferences_tone",
  };
}
