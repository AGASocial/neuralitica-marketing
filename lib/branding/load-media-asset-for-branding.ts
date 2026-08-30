import "server-only";

import { ASSEMBLED_REEL_STORAGE_KEY_REGEX } from "@/lib/contracts/media-assets";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

import {
  BRANDED_REEL_STORAGE_KEY_REGEX,
  CLIENT_LOGO_STORAGE_KEY_REGEX,
  COVER_FRAME_STORAGE_KEY_REGEX,
} from "./storage-keys";

export type BrandingMediaAssetRow = {
  id: string;
  clientId: string;
  assetType: string;
  storageKey: string;
};

function isAllowedBrandingStorageKey(storageKey: string): boolean {
  return (
    ASSEMBLED_REEL_STORAGE_KEY_REGEX.test(storageKey) ||
    BRANDED_REEL_STORAGE_KEY_REGEX.test(storageKey) ||
    CLIENT_LOGO_STORAGE_KEY_REGEX.test(storageKey) ||
    COVER_FRAME_STORAGE_KEY_REGEX.test(storageKey)
  );
}

export async function loadMediaAssetForBranding(
  assetId: string,
): Promise<BrandingMediaAssetRow | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_media_assets")
    .select("id, client_id, asset_type, storage_key")
    .eq("id", assetId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const row = data as Record<string, unknown>;
  if (
    typeof row.id !== "string" ||
    typeof row.client_id !== "string" ||
    typeof row.asset_type !== "string" ||
    typeof row.storage_key !== "string"
  ) {
    return null;
  }

  if (!isAllowedBrandingStorageKey(row.storage_key)) {
    return null;
  }

  return {
    id: row.id,
    clientId: row.client_id,
    assetType: row.asset_type,
    storageKey: row.storage_key,
  };
}
