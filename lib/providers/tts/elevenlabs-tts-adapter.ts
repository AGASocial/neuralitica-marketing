import "server-only";

import { randomUUID } from "node:crypto";

import {
  ELEVENLABS_ENV_KEY_NAME,
  ELEVENLABS_MODEL_ID,
  ELEVENLABS_OUTPUT_FORMAT,
  ELEVENLABS_TTS_PROVIDER_KEY,
  ELEVENLABS_TTS_URL_PREFIX,
} from "@/lib/contracts/elevenlabs-tts";
import {
  PROVIDER_CONFIG_MISSING,
  PROVIDER_REQUEST_FAILED,
  PROVIDER_RESPONSE_INVALID,
  TTS_MAX_AUDIO_BYTES,
} from "@/lib/contracts/tts-voiceover";
import { getMediaStorage } from "@/lib/media/storage/get-media-storage";
import {
  ProviderAdapterError,
  sanitizeProviderErrorMessage,
} from "@/lib/providers/normalize-provider-response";
import type {
  SynthesizeSpeechInput,
  TtsProviderAdapter,
} from "@/lib/providers/provider-adapters";
import {
  getVoiceById,
  type TtsCatalogVoice,
} from "@/lib/tts/voice-catalog";
import { isMp3Buffer } from "@/lib/providers/tts/siliconflow-cosyvoice2-adapter";

export type CreateElevenlabsTtsAdapterParams = {
  defaultUnitCostCents: number;
  envKeyName?: string;
  resolveCatalogVoice?: (voiceId: string) => TtsCatalogVoice | undefined;
  uploadAudioBuffer?: (args: {
    clientId: string;
    reelScriptId: string;
    buffer: Buffer;
    mimeType: string;
  }) => Promise<{ storageKey: string; sizeBytes: number }>;
  fetchImpl?: typeof fetch;
};

async function defaultUploadAudioBuffer(args: {
  clientId: string;
  reelScriptId: string;
  buffer: Buffer;
  mimeType: string;
}): Promise<{ storageKey: string; sizeBytes: number }> {
  const storageKey = `neuramark/${args.clientId}/${args.reelScriptId}/${randomUUID()}.mp3`;
  const storage = getMediaStorage();
  await storage.put(storageKey, args.buffer, {
    contentType: args.mimeType,
    sizeBytes: args.buffer.length,
  });
  return { storageKey, sizeBytes: args.buffer.length };
}

function estimateCostFromTextLength(
  textLength: number,
  unitCostCents: number,
): number {
  return Math.max(1, Math.ceil((textLength / 1_000_000) * unitCostCents));
}

export function createElevenlabsTtsAdapter(
  params: CreateElevenlabsTtsAdapterParams,
): TtsProviderAdapter {
  const envKeyName = params.envKeyName ?? ELEVENLABS_ENV_KEY_NAME;
  const resolveVoice = params.resolveCatalogVoice ?? getVoiceById;
  const uploadAudioBuffer = params.uploadAudioBuffer ?? defaultUploadAudioBuffer;
  const fetchImpl = params.fetchImpl ?? fetch;

  function estimateCostFromInput(input: SynthesizeSpeechInput) {
    return {
      estimatedCostCents: estimateCostFromTextLength(
        input.text.length,
        params.defaultUnitCostCents,
      ),
      currency: "USD" as const,
      providerKey: ELEVENLABS_TTS_PROVIDER_KEY,
    };
  }

  return {
    providerKey: ELEVENLABS_TTS_PROVIDER_KEY,

    async estimateCost(input: SynthesizeSpeechInput) {
      return estimateCostFromInput(input);
    },

    async synthesize(input: SynthesizeSpeechInput) {
      const apiKey = process.env[envKeyName];
      if (!apiKey || apiKey.trim().length === 0) {
        throw new ProviderAdapterError(
          PROVIDER_CONFIG_MISSING,
          "Provider is not configured",
        );
      }

      const catalogVoice = resolveVoice(input.voiceId);
      if (!catalogVoice?.elevenLabsVoiceId) {
        throw new ProviderAdapterError(
          PROVIDER_RESPONSE_INVALID,
          "Unknown catalog voice for ElevenLabs",
        );
      }

      const url = `${ELEVENLABS_TTS_URL_PREFIX}/${catalogVoice.elevenLabsVoiceId}?output_format=${ELEVENLABS_OUTPUT_FORMAT}`;
      const response = await fetchImpl(url, {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: input.text.trim(),
          model_id: ELEVENLABS_MODEL_ID,
        }),
      });

      if (!response.ok) {
        const bodyText = await response.text().catch(() => "");
        const sanitized = sanitizeProviderErrorMessage(bodyText);
        console.error("[tts] elevenlabs request failed", {
          providerKey: ELEVENLABS_TTS_PROVIDER_KEY,
          status: response.status,
          voiceId: input.voiceId,
          textLength: input.text.length,
          clientId: input.clientId,
          reelScriptId: input.reelScriptId,
          providerMessage: sanitized.slice(0, 240),
        });
        throw new ProviderAdapterError(PROVIDER_REQUEST_FAILED, sanitized);
      }

      const contentType = response.headers.get("content-type") ?? "";
      const buffer = Buffer.from(await response.arrayBuffer());

      if (buffer.byteLength > TTS_MAX_AUDIO_BYTES) {
        throw new ProviderAdapterError(
          PROVIDER_RESPONSE_INVALID,
          "Audio response too large",
        );
      }

      const isMpeg =
        contentType.includes("audio/mpeg") ||
        contentType.includes("audio/mp3") ||
        isMp3Buffer(buffer);
      if (!isMpeg) {
        throw new ProviderAdapterError(
          PROVIDER_RESPONSE_INVALID,
          "Invalid audio response",
        );
      }

      const uploaded = await uploadAudioBuffer({
        clientId: input.clientId,
        reelScriptId: input.reelScriptId,
        buffer,
        mimeType: "audio/mpeg",
      });

      const estimate = estimateCostFromInput(input);
      return {
        storageKey: uploaded.storageKey,
        mimeType: "audio/mpeg",
        sizeBytes: uploaded.sizeBytes,
        actualCostCents: estimate.estimatedCostCents,
      };
    },
  };
}
