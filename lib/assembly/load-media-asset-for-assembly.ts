import "server-only";

import {
  ASSEMBLED_REEL_STORAGE_KEY_REGEX,
  STORAGE_KEY_REGEX,
  VOICEOVER_STORAGE_KEY_REGEX,
} from "@/lib/contracts/media-assets";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

export type AssemblyMediaAssetRow = {
  id: string;
  clientId: string;
  assetType: string;
  storageKey: string;
};

function isAllowedAssemblyStorageKey(storageKey: string): boolean {
  return (
    STORAGE_KEY_REGEX.test(storageKey) ||
    VOICEOVER_STORAGE_KEY_REGEX.test(storageKey) ||
    ASSEMBLED_REEL_STORAGE_KEY_REGEX.test(storageKey)
  );
}

export async function loadMediaAssetForAssembly(
  assetId: string,
): Promise<AssemblyMediaAssetRow | null> {
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

  if (!isAllowedAssemblyStorageKey(row.storage_key)) {
    return null;
  }

  return {
    id: row.id,
    clientId: row.client_id,
    assetType: row.asset_type,
    storageKey: row.storage_key,
  };
}

export function voiceoverExtensionFromStorageKey(storageKey: string): string {
  const match = storageKey.match(/\.(mp3|wav|m4a)$/);
  return match?.[1] ?? "mp3";
}
