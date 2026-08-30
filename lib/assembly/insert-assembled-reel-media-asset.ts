import "server-only";

import {
  ASSEMBLED_REEL_STORAGE_KEY_REGEX,
  MEDIA_ASSET_TYPE_ASSEMBLED_REEL,
} from "@/lib/contracts/media-assets";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

/**
 * INSERT assembled_reel row after FFmpeg output upload (US-9.1).
 */
export async function insertAssembledReelMediaAsset(params: {
  clientId: string;
  assemblyJobId: string;
  storageKey: string;
  sizeBytes: number;
  durationSec: number;
}): Promise<{ mediaAssetId: string } | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  if (!ASSEMBLED_REEL_STORAGE_KEY_REGEX.test(params.storageKey)) {
    console.error("[assembly] assembled reel storage key rejected", {
      assemblyJobId: params.assemblyJobId,
    });
    return null;
  }

  const metadata = {
    detectedMime: "video/mp4" as const,
    sizeBytes: params.sizeBytes,
    durationSec: params.durationSec,
    width: 1080 as const,
    height: 1920 as const,
    source: "assembly_ffmpeg" as const,
    templateId: "reel_v1_basic" as const,
    assemblyJobId: params.assemblyJobId,
  };

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_media_assets")
    .insert({
      client_id: params.clientId,
      asset_type: MEDIA_ASSET_TYPE_ASSEMBLED_REEL,
      storage_key: params.storageKey,
      metadata,
    })
    .select("id")
    .single();

  if (error || !data || typeof (data as { id: unknown }).id !== "string") {
    console.error("[assembly] assembled reel media asset insert failed", {
      assemblyJobId: params.assemblyJobId,
      dbCode: error?.code,
    });
    return null;
  }

  return { mediaAssetId: (data as { id: string }).id };
}
