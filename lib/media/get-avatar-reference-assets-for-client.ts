import "server-only";

import type { AvatarReferenceAssetsForClientResult } from "@/lib/contracts/media-assets";
import { DEFAULT_MAX_AVATAR_REFERENCES } from "@/lib/media/media-config";
import {
  mapMediaAssetRowToItem,
  type MediaAssetSelectRow,
} from "@/lib/media/media-helpers";
import { requireActive } from "@/lib/auth/require-user";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";
import { hasActiveAvatarConsent } from "@/lib/visual-preferences/has-active-avatar-consent";

const MEDIA_TABLE = "neuramark_media_assets";
const ASSET_TYPE = "avatar_reference";

/**
 * Load own avatar reference assets (referencias).
 * Arity 0 — identity only via requireActive("page") / getCurrentUser().id.
 * Frontend consumer: `/settings/preferences` RSC — referencias list section.
 * Omits storage_key, absolute paths, other tenants.
 */
export async function getAvatarReferenceAssetsForClient(): Promise<AvatarReferenceAssetsForClientResult> {
  const user = await requireActive("page");
  const ownAvatarConsentActive = await hasActiveAvatarConsent(user.id);
  const maxAssets = DEFAULT_MAX_AVATAR_REFERENCES;

  if (!isSupabaseConfigured()) {
    console.error("[media] list unavailable: Supabase not configured");
    return {
      assets: [],
      maxAssets,
      canUpload: false,
      ownAvatarConsentActive,
    };
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(MEDIA_TABLE)
    .select("id, asset_type, metadata, created_at")
    .eq("client_id", user.id)
    .eq("asset_type", ASSET_TYPE)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[media] list failed", { code: error.code });
    return {
      assets: [],
      maxAssets,
      canUpload: false,
      ownAvatarConsentActive,
    };
  }

  const assets = ((data as MediaAssetSelectRow[] | null) ?? [])
    .map((row) => mapMediaAssetRowToItem(row))
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const canUpload =
    ownAvatarConsentActive && assets.length < maxAssets;

  return {
    assets,
    maxAssets,
    canUpload,
    ownAvatarConsentActive,
  };
}
