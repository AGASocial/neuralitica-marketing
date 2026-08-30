import "server-only";

import type { StoredMediaAsset } from "@/lib/contracts/providers";
import {
  MEDIA_ASSET_TYPE_VOICEOVER,
  voiceoverDetectedMimeSchema,
} from "@/lib/contracts/media-assets";
import type { TtsVoiceId } from "@/lib/contracts/tts-voiceover";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

/**
 * INSERT voiceover row after TTS synthesize (US-9.3).
 */
export async function insertVoiceoverMediaAsset(params: {
  clientId: string;
  reelScriptId: string;
  storedAsset: StoredMediaAsset;
  voiceId: TtsVoiceId;
  providerKey: string;
  supersedesAssetId?: string | null;
}): Promise<{ mediaAssetId: string } | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const mimeParsed = voiceoverDetectedMimeSchema.safeParse(
    params.storedAsset.mimeType,
  );
  if (!mimeParsed.success) {
    console.error("[tts] voiceover metadata mime invalid", {
      clientId: params.clientId,
      reelScriptId: params.reelScriptId,
    });
    return null;
  }

  const metadata: Record<string, unknown> = {
    originalFilename: "voiceover.mp3",
    detectedMime: mimeParsed.data,
    sizeBytes: params.storedAsset.sizeBytes,
    source: "tts_synthesize",
    reelScriptId: params.reelScriptId,
    voiceId: params.voiceId,
    providerKey: params.providerKey,
  };

  if (typeof params.storedAsset.durationSec === "number") {
    metadata.durationSec = params.storedAsset.durationSec;
  }

  if (params.supersedesAssetId) {
    metadata.supersedesAssetId = params.supersedesAssetId;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_media_assets")
    .insert({
      client_id: params.clientId,
      asset_type: MEDIA_ASSET_TYPE_VOICEOVER,
      storage_key: params.storedAsset.storageKey,
      metadata,
    })
    .select("id")
    .single();

  if (error || !data || typeof (data as { id: unknown }).id !== "string") {
    console.error("[tts] voiceover media asset insert failed", {
      clientId: params.clientId,
      reelScriptId: params.reelScriptId,
      dbCode: error?.code,
    });
    return null;
  }

  return { mediaAssetId: (data as { id: string }).id };
}
