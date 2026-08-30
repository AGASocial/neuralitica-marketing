import "server-only";

import type { StoredMediaAsset } from "@/lib/contracts/providers";
import { MEDIA_ASSET_TYPE_AVATAR_REFERENCE } from "@/lib/contracts/media-assets";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

/**
 * INSERT generated video row after fetchAsset (US-8.4 terminal complete path).
 * Reuses avatar_reference asset_type until a dedicated generated_video type ships.
 */
export async function insertGeneratedVideoMediaAsset(params: {
  clientId: string;
  storedAsset: StoredMediaAsset;
}): Promise<{ mediaAssetId: string } | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_media_assets")
    .insert({
      client_id: params.clientId,
      asset_type: MEDIA_ASSET_TYPE_AVATAR_REFERENCE,
      storage_key: params.storedAsset.storageKey,
      metadata: {
        originalFilename: "generated-video.mp4",
        detectedMime: params.storedAsset.mimeType,
        sizeBytes: params.storedAsset.sizeBytes,
        ...(params.storedAsset.durationSec
          ? { durationSec: params.storedAsset.durationSec }
          : {}),
        generatedVideo: true,
      },
    })
    .select("id")
    .single();

  if (error || !data || typeof (data as { id: unknown }).id !== "string") {
    console.error("[video-jobs] media asset insert failed", {
      clientId: params.clientId,
      dbCode: error?.code,
    });
    return null;
  }

  return { mediaAssetId: (data as { id: string }).id };
}
