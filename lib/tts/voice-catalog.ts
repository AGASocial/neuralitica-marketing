import "server-only";

import type { SupportedLocale } from "@/lib/contracts/providers";
import {
  ttsVoiceIdSchema,
  type TtsVoiceId,
  type TtsVoiceOptionDto,
} from "@/lib/contracts/tts-voiceover";

export type TtsCatalogVoice = {
  id: TtsVoiceId;
  locale: SupportedLocale;
  labelKey: string;
  toneTags: readonly string[];
  providerVoice: string;
  sampleAssetPath: string;
};

export const TTS_VOICE_CATALOG: readonly TtsCatalogVoice[] = [
  {
    id: "en_warm_female",
    locale: "en",
    labelKey: "settings.preferences.voice.enWarmFemale",
    toneTags: ["warm", "gentle"],
    providerVoice: "FunAudioLLM/CosyVoice2-0.5B:claire",
    sampleAssetPath: "public/tts-samples/en_warm_female.mp3",
  },
  {
    id: "en_professional_male",
    locale: "en",
    labelKey: "settings.preferences.voice.enProfessionalMale",
    toneTags: ["professional", "steady"],
    providerVoice: "FunAudioLLM/CosyVoice2-0.5B:alex",
    sampleAssetPath: "public/tts-samples/en_professional_male.mp3",
  },
  {
    id: "es_warm_female",
    locale: "es",
    labelKey: "settings.preferences.voice.esWarmFemale",
    toneTags: ["warm", "passionate"],
    providerVoice: "FunAudioLLM/CosyVoice2-0.5B:bella",
    sampleAssetPath: "public/tts-samples/es_warm_female.mp3",
  },
  {
    id: "es_professional_male",
    locale: "es",
    labelKey: "settings.preferences.voice.esProfessionalMale",
    toneTags: ["professional", "deep"],
    providerVoice: "FunAudioLLM/CosyVoice2-0.5B:benjamin",
    sampleAssetPath: "public/tts-samples/es_professional_male.mp3",
  },
] as const;

const CATALOG_BY_ID = new Map(TTS_VOICE_CATALOG.map((voice) => [voice.id, voice]));

export { ttsVoiceIdSchema };

export function getVoiceById(voiceId: string): TtsCatalogVoice | undefined {
  const parsed = ttsVoiceIdSchema.safeParse(voiceId);
  if (!parsed.success) {
    return undefined;
  }
  return CATALOG_BY_ID.get(parsed.data);
}

export function isAllowedVoiceId(voiceId: string): voiceId is TtsVoiceId {
  return ttsVoiceIdSchema.safeParse(voiceId).success;
}

export function listVoicesForLocale(
  locale: SupportedLocale,
): readonly TtsCatalogVoice[] {
  return TTS_VOICE_CATALOG.filter((voice) => voice.locale === locale);
}

export function listAllVoiceOptions(): readonly TtsCatalogVoice[] {
  return TTS_VOICE_CATALOG;
}

export function toTtsVoiceOptionDto(voice: TtsCatalogVoice): TtsVoiceOptionDto {
  const fileName = voice.sampleAssetPath.replace(/^public\//, "");
  return {
    id: voice.id,
    labelKey: voice.labelKey,
    locale: voice.locale,
    sampleUrl: `/${fileName}`,
  };
}

const PROFESSIONAL_KEYWORDS = [
  "professional",
  "formal",
  "corporate",
  "authoritative",
  "serio",
  "profesional",
] as const;

const WARM_KEYWORDS = [
  "warm",
  "friendly",
  "approachable",
  "gentle",
  "cálid",
  "amigable",
  "cercan",
] as const;

function matchesKeyword(haystack: string, keywords: readonly string[]): boolean {
  const lower = haystack.toLowerCase();
  return keywords.some((keyword) => lower.includes(keyword));
}

/**
 * Resolve default catalog voice from locale + profile tone heuristic (CONTRACT).
 */
export function resolveDefaultVoiceId(params: {
  preferredLocale: SupportedLocale;
  profileTone: string;
}): TtsVoiceId {
  const locale = params.preferredLocale;
  const tone = params.profileTone.toLowerCase();

  if (matchesKeyword(tone, PROFESSIONAL_KEYWORDS)) {
    return locale === "es" ? "es_professional_male" : "en_professional_male";
  }

  if (matchesKeyword(tone, WARM_KEYWORDS)) {
    return locale === "es" ? "es_warm_female" : "en_warm_female";
  }

  return locale === "es" ? "es_warm_female" : "en_warm_female";
}


/**
 * Content/script locale — same rule as generate-reel-scripts-for-client:
 * profile.fields.preferredLocale when en|es, otherwise Spanish.
 * Do not use operator UI chrome locale for TTS.
 */
export function resolveContentLocale(
  preferredLocale: unknown,
  fallback: SupportedLocale = "es",
): SupportedLocale {
  if (preferredLocale === "en" || preferredLocale === "es") {
    return preferredLocale;
  }
  return fallback;
}

/**
 * Remap a catalog voice to the same tone family in `locale`.
 * Keeps Preferencias tone choice when the UI locale and content locale diverge.
 */
export function alignVoiceIdToLocale(
  voiceId: TtsVoiceId,
  locale: SupportedLocale,
): TtsVoiceId {
  const voice = getVoiceById(voiceId);
  if (!voice || voice.locale === locale) {
    return voiceId;
  }
  const toneSuffix = voiceId.includes("professional")
    ? "professional_male"
    : "warm_female";
  const aligned = `${locale}_${toneSuffix}`;
  return isAllowedVoiceId(aligned) ? aligned : resolveDefaultVoiceId({
    preferredLocale: locale,
    profileTone: "",
  });
}

/**
 * Final voice for synthesis: Preferencias voice aligned to content locale,
 * else tone heuristic for that locale.
 */
export function resolveSynthesisVoiceId(params: {
  preferredVoiceId: TtsVoiceId | null;
  contentLocale: SupportedLocale;
  profileTone: string;
}): TtsVoiceId {
  if (params.preferredVoiceId) {
    return alignVoiceIdToLocale(params.preferredVoiceId, params.contentLocale);
  }
  return resolveDefaultVoiceId({
    preferredLocale: params.contentLocale,
    profileTone: params.profileTone,
  });
}
