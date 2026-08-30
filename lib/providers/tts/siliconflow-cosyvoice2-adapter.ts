import "server-only";

import { randomUUID } from "node:crypto";

import { DEFAULT_LOW_TIER_PROVIDER_KEYS } from "@/lib/contracts/providers";
import {
  COSYVOICE2_MODEL,
  PROVIDER_CONFIG_MISSING,
  PROVIDER_REQUEST_FAILED,
  PROVIDER_RESPONSE_INVALID,
  SILICONFLOW_TTS_SPEECH_URL,
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

const DEFAULT_ENV_KEY_NAME = "SILICONFLOW_API_KEY";

export type UploadVoiceoverAudioArgs = {
  clientId: string;
  reelScriptId: string;
  buffer: Buffer;
  mimeType: string;
};

export type UploadVoiceoverAudioResult = {
  storageKey: string;
  sizeBytes: number;
};

export type CreateSiliconflowCosyvoice2AdapterParams = {
  defaultUnitCostCents: number;
  envKeyName?: string;
  resolveCatalogVoice?: (voiceId: string) => TtsCatalogVoice | undefined;
  uploadAudioBuffer?: (
    args: UploadVoiceoverAudioArgs,
  ) => Promise<UploadVoiceoverAudioResult>;
  fetchImpl?: typeof fetch;
};

async function defaultUploadAudioBuffer(
  args: UploadVoiceoverAudioArgs,
): Promise<UploadVoiceoverAudioResult> {
  const storageKey = `neuramark/${args.clientId}/${args.reelScriptId}/${randomUUID()}.mp3`;
  const storage = getMediaStorage();
  await storage.put(storageKey, args.buffer, {
    contentType: args.mimeType,
    sizeBytes: args.buffer.length,
  });
  return {
    storageKey,
    sizeBytes: args.buffer.length,
  };
}

export function isMp3Buffer(buffer: Buffer): boolean {
  if (buffer.length < 2) {
    return false;
  }
  if (buffer.length >= 3 && buffer.subarray(0, 3).toString("ascii") === "ID3") {
    return true;
  }
  return buffer[0] === 0xff && (buffer[1]! & 0xe0) === 0xe0;
}

function isAudioMpegContentType(contentType: string): boolean {
  const normalized = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  return normalized === "audio/mpeg" || normalized === "audio/mp3";
}

function estimateCostFromTextLength(
  textLength: number,
  unitCostCents: number,
): number {
  return Math.max(1, Math.ceil((textLength / 1_000_000) * unitCostCents));
}

export function createSiliconflowCosyvoice2Adapter(
  params: CreateSiliconflowCosyvoice2AdapterParams,
): TtsProviderAdapter {
  const envKeyName = params.envKeyName ?? DEFAULT_ENV_KEY_NAME;
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
      providerKey: DEFAULT_LOW_TIER_PROVIDER_KEYS.tts,
    };
  }

  return {
    providerKey: DEFAULT_LOW_TIER_PROVIDER_KEYS.tts,

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
      if (!catalogVoice) {
        throw new ProviderAdapterError(
          PROVIDER_RESPONSE_INVALID,
          "Unknown catalog voice",
        );
      }

      const response = await fetchImpl(SILICONFLOW_TTS_SPEECH_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: COSYVOICE2_MODEL,
          input: input.text,
          voice: catalogVoice.providerVoice,
          response_format: "mp3",
          speed: 1.0,
        }),
      });

      if (!response.ok) {
        const bodyText = await response.text().catch(() => "");
        console.error("[tts] siliconflow request failed", {
          providerKey: DEFAULT_LOW_TIER_PROVIDER_KEYS.tts,
          status: response.status,
          clientId: input.clientId,
          reelScriptId: input.reelScriptId,
        });
        throw new ProviderAdapterError(
          PROVIDER_REQUEST_FAILED,
          sanitizeProviderErrorMessage(bodyText),
        );
      }

      const contentType = response.headers.get("content-type") ?? "";
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (buffer.byteLength > TTS_MAX_AUDIO_BYTES) {
        throw new ProviderAdapterError(
          PROVIDER_RESPONSE_INVALID,
          "Audio response too large",
        );
      }

      if (!isMp3Buffer(buffer) && !isAudioMpegContentType(contentType)) {
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
