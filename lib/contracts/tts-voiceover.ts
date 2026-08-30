/**
 * TTS voiceover contract (US-9.3) — FE-safe types; Zod validation at server boundaries.
 */
import { z } from "zod";

export const TTS_MAX_AUDIO_BYTES = 10_485_760 as const;

export const PROVIDER_CONFIG_MISSING = "PROVIDER_CONFIG_MISSING" as const;
export const PROVIDER_REQUEST_FAILED = "PROVIDER_REQUEST_FAILED" as const;
export const PROVIDER_RESPONSE_INVALID = "PROVIDER_RESPONSE_INVALID" as const;

export const SILICONFLOW_TTS_SPEECH_URL =
  "https://api.siliconflow.cn/v1/audio/speech" as const;
export const COSYVOICE2_MODEL = "FunAudioLLM/CosyVoice2-0.5B" as const;
export const SILICONFLOW_COSYVOICE2_PROVIDER_KEY =
  "siliconflow_cosyvoice2" as const;

export const ttsVoiceIdSchema = z.enum([
  "en_warm_female",
  "en_professional_male",
  "es_warm_female",
  "es_professional_male",
]);

export type TtsVoiceId = z.infer<typeof ttsVoiceIdSchema>;

export const ttsVoiceOptionDtoSchema = z
  .object({
    id: ttsVoiceIdSchema,
    labelKey: z.string(),
    locale: z.enum(["en", "es"]),
    sampleUrl: z
      .string()
      .regex(
        /^\/tts-samples\/(en_warm_female|en_professional_male|es_warm_female|es_professional_male)\.mp3$/,
      ),
  })
  .strict();

export type TtsVoiceOptionDto = z.infer<typeof ttsVoiceOptionDtoSchema>;

/** Static catalog DTOs for Preferencias picker (no providerVoice). */
export const TTS_VOICE_OPTIONS_FE: TtsVoiceOptionDto[] = [
  {
    id: "en_warm_female",
    labelKey: "settings.preferences.voice.enWarmFemale",
    locale: "en",
    sampleUrl: "/tts-samples/en_warm_female.mp3",
  },
  {
    id: "en_professional_male",
    labelKey: "settings.preferences.voice.enProfessionalMale",
    locale: "en",
    sampleUrl: "/tts-samples/en_professional_male.mp3",
  },
  {
    id: "es_warm_female",
    labelKey: "settings.preferences.voice.esWarmFemale",
    locale: "es",
    sampleUrl: "/tts-samples/es_warm_female.mp3",
  },
  {
    id: "es_professional_male",
    labelKey: "settings.preferences.voice.esProfessionalMale",
    locale: "es",
    sampleUrl: "/tts-samples/es_professional_male.mp3",
  },
];

export const voiceoverSummaryDtoSchema = z
  .object({
    voiceoverAssetId: z.string().uuid().nullable(),
    voiceId: ttsVoiceIdSchema.nullable(),
    createdAt: z.string().datetime({ offset: true }).nullable(),
    canSynthesize: z.boolean(),
    canRegenerate: z.boolean(),
  })
  .strict();

export type VoiceoverSummaryDto = z.infer<typeof voiceoverSummaryDtoSchema>;

export const voiceoverSummaryByReelMapSchema = z.record(
  z.string().uuid(),
  voiceoverSummaryDtoSchema.nullable(),
);

export type VoiceoverSummaryByReelMap = z.infer<
  typeof voiceoverSummaryByReelMapSchema
>;

export const synthesizeVoiceoverForReelScriptInputSchema = z
  .object({
    reelScriptId: z.string().uuid(),
  })
  .strict();

export type SynthesizeVoiceoverForReelScriptInput = z.infer<
  typeof synthesizeVoiceoverForReelScriptInputSchema
>;

export const synthesizeVoiceoverForReelScriptSuccessSchema = z
  .object({
    ok: z.literal(true),
    voiceoverAssetId: z.string().uuid(),
    reelScriptId: z.string().uuid(),
    voiceId: ttsVoiceIdSchema,
    providerKey: z.literal("siliconflow_cosyvoice2"),
    estimatedCostCents: z.number(),
    actualCostCents: z.number(),
    durationSec: z.number().positive().optional(),
    jobKind: z.enum(["tts_generate", "tts_regenerate"]),
  })
  .strict();

export type SynthesizeVoiceoverForReelScriptSuccess = z.infer<
  typeof synthesizeVoiceoverForReelScriptSuccessSchema
>;

export const ttsVoiceoverErrorCodeSchema = z.enum([
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION_ERROR",
  "FORBIDDEN_FIELDS",
  "EMPTY_VOICEOVER_TEXT",
  "BUDGET_EXCEEDED",
  "COST_POLICY_UNAVAILABLE",
  "PROVIDER_UNAVAILABLE",
  "INTERNAL_ERROR",
]);

export type TtsVoiceoverErrorCode = z.infer<typeof ttsVoiceoverErrorCodeSchema>;

export const synthesizeVoiceoverForReelScriptErrorEnvelopeSchema = z.object({
  ok: z.literal(false),
  error: z
    .object({
      code: ttsVoiceoverErrorCodeSchema,
      messageKey: z.string().optional(),
      fields: z.record(z.string(), z.array(z.string())).optional(),
    })
    .strict(),
});

export type SynthesizeVoiceoverForReelScriptErrorEnvelope = z.infer<
  typeof synthesizeVoiceoverForReelScriptErrorEnvelopeSchema
>;

export type SynthesizeVoiceoverForReelScriptResult =
  | SynthesizeVoiceoverForReelScriptSuccess
  | SynthesizeVoiceoverForReelScriptErrorEnvelope;
