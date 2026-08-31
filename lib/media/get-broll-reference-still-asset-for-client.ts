import "server-only";

import {
  WAN_IMAGE_MIME_ALLOWLIST,
} from "@/lib/contracts/siliconflow-wan21-turbo";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

const MEDIA_TABLE = "neuramark_media_assets";

/** Image-capable asset types for Wan I2V reference stills (US-3.x / US-9.2). */
export const BROLL_REFERENCE_STILL_ASSET_TYPES = [
  "cover_frame",
  "client_logo",
  "avatar_reference",
] as const;

/**
 * Resolve an owned still for Wan I2V (US-8.5 CONTRACT).
 * Priority: cover_frame → client_logo → earliest avatar_reference with image MIME.
 * Fail closed → null (never client absolute URLs).
 */
export async function getBrollReferenceStillAssetForClient(
  clientId: string,
  _reelScriptId: string,
): Promise<{ assetId: string } | null> {
  if (!clientId || typeof clientId !== "string") {
    return null;
  }

  if (!isSupabaseConfigured()) {
    return null;
  }

  try {
    const supabase = createServerSupabaseClient();

    for (const assetType of BROLL_REFERENCE_STILL_ASSET_TYPES) {
      const { data, error } = await supabase
        .from(MEDIA_TABLE)
        .select("id")
        .eq("client_id", clientId)
        .eq("asset_type", assetType)
        .in("metadata->>detectedMime", [...WAN_IMAGE_MIME_ALLOWLIST])
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error("[media] getBrollReferenceStillAssetForClient failed", {
          code: error.code,
          assetType,
        });
        continue;
      }

      if (data && typeof (data as { id?: unknown }).id === "string") {
        return { assetId: (data as { id: string }).id };
      }
    }

    return null;
  } catch {
    return null;
  }
}
