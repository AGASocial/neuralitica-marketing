import "server-only";

import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

import {
  BRANDED_REEL_STORAGE_KEY_REGEX,
  COVER_FRAME_STORAGE_KEY_REGEX,
  MEDIA_ASSET_TYPE_ASSEMBLED_REEL,
  MEDIA_ASSET_TYPE_COVER_FRAME,
} from "./storage-keys";

export async function insertBrandedReelMediaAsset(params: {
  clientId: string;
  assemblyJobId: string;
  reelScriptId: string;
  storageKey: string;
  sizeBytes: number;
  durationSec: number;
}): Promise<{ mediaAssetId: string } | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  if (!BRANDED_REEL_STORAGE_KEY_REGEX.test(params.storageKey)) {
    console.error("[branding] branded reel storage key rejected", {
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
    source: "branding_ffmpeg" as const,
    assemblyJobId: params.assemblyJobId,
    reelScriptId: params.reelScriptId,
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
    console.error("[branding] branded reel media asset insert failed", {
      assemblyJobId: params.assemblyJobId,
      dbCode: error?.code,
    });
    return null;
  }

  return { mediaAssetId: (data as { id: string }).id };
}

export async function insertCoverFrameMediaAsset(params: {
  clientId: string;
  assemblyJobId: string;
  storageKey: string;
  sizeBytes: number;
}): Promise<{ mediaAssetId: string } | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  if (!COVER_FRAME_STORAGE_KEY_REGEX.test(params.storageKey)) {
    console.error("[branding] cover frame storage key rejected", {
      assemblyJobId: params.assemblyJobId,
    });
    return null;
  }

  const metadata = {
    detectedMime: "image/jpeg" as const,
    sizeBytes: params.sizeBytes,
    source: "branding_cover_extract" as const,
    assemblyJobId: params.assemblyJobId,
  };

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_media_assets")
    .insert({
      client_id: params.clientId,
      asset_type: MEDIA_ASSET_TYPE_COVER_FRAME,
      storage_key: params.storageKey,
      metadata,
    })
    .select("id")
    .single();

  if (error || !data || typeof (data as { id: unknown }).id !== "string") {
    console.error("[branding] cover frame media asset insert failed", {
      assemblyJobId: params.assemblyJobId,
      dbCode: error?.code,
    });
    return null;
  }

  return { mediaAssetId: (data as { id: string }).id };
}
