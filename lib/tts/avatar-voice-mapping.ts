import "server-only";

import type { AvatarGender, AvatarLanguage } from "@/lib/contracts/avatar";
import type { TtsVoiceId } from "@/lib/contracts/tts-voiceover";
import { getVoiceById } from "@/lib/tts/voice-catalog";

/**
 * Data-driven catalog voice from avatar gender + language.
 * male + es → es_professional_male (never es_warm_female).
 */
export const AVATAR_GENDER_LANGUAGE_VOICE_MAP = {
  male: {
    es: "es_professional_male",
    en: "en_professional_male",
  },
  female: {
    es: "es_warm_female",
    en: "en_warm_female",
  },
} as const satisfies Record<
  AvatarGender,
  Record<AvatarLanguage, TtsVoiceId>
>;

export function mapAvatarGenderLanguageToCatalogVoiceId(params: {
  gender: AvatarGender;
  language: AvatarLanguage;
}): TtsVoiceId {
  return AVATAR_GENDER_LANGUAGE_VOICE_MAP[params.gender][params.language];
}

export type ResolvedAvatarTtsVoice = {
  catalogVoiceId: TtsVoiceId;
  /** ElevenLabs vendor voice id used for synthesis (custom clone or catalog). */
  elevenLabsVoiceId: string;
  language: AvatarLanguage;
  usedCustomClone: boolean;
};

/**
 * TTS voice = avatar custom elevenlabs_voice_id if set, else gender+language catalog map.
 */
export function resolveAvatarTtsVoice(params: {
  gender: AvatarGender;
  language: AvatarLanguage;
  elevenLabsVoiceId: string | null;
}): ResolvedAvatarTtsVoice {
  const catalogVoiceId = mapAvatarGenderLanguageToCatalogVoiceId({
    gender: params.gender,
    language: params.language,
  });
  const catalog = getVoiceById(catalogVoiceId);
  if (!catalog) {
    throw new Error(`Missing catalog voice ${catalogVoiceId}`);
  }

  const custom = params.elevenLabsVoiceId?.trim() || null;
  if (custom) {
    return {
      catalogVoiceId,
      elevenLabsVoiceId: custom,
      language: params.language,
      usedCustomClone: true,
    };
  }

  return {
    catalogVoiceId,
    elevenLabsVoiceId: catalog.elevenLabsVoiceId,
    language: params.language,
    usedCustomClone: false,
  };
}
