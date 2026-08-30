import "server-only";

import type { StoredMediaAsset } from "@/lib/contracts/providers";
import { MEDIA_ASSET_TYPE_GENERATED_VIDEO } from "@/lib/contracts/media-assets";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

/**
 * INSERT generated video row after fetchAsset (US-8.4) or manual upload (US-8.3).
 */
export async function insertGeneratedVideoMediaAsset(params: {
  clientId: string;
  storedAsset: StoredMediaAsset;
  source?: "manual_upload" | "provider_fetch";
}): Promise<{ mediaAssetId: string } | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const source = params.source ?? "provider_fetch";
  const metadata: Record<string, unknown> = {
    originalFilename:
      source === "provider_fetch" ? "generated-video.mp4" : "manual-upload.mp4",
    detectedMime: params.storedAsset.mimeType,
    sizeBytes: params.storedAsset.sizeBytes,
    source,
  };

  if (typeof params.storedAsset.durationSec === "number") {
    metadata.durationSec = params.storedAsset.durationSec;
  } else if (source === "manual_upload") {
    console.error("[video-jobs] generated video missing durationSec", {
      clientId: params.clientId,
    });
    return null;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_media_assets")
    .insert({
      client_id: params.clientId,
      asset_type: MEDIA_ASSET_TYPE_GENERATED_VIDEO,
      storage_key: params.storedAsset.storageKey,
      metadata,
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
