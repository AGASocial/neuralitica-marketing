import "server-only";

import {
  WAN_IMAGE_MIME_ALLOWLIST,
} from "@/lib/contracts/siliconflow-wan21-turbo";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

const MEDIA_TABLE = "neuramark_media_assets";
const ASSEMBLED_REELS_TABLE = "neuramark_assembled_reels";

/** Image-capable asset types for Wan I2V reference stills (US-3.x / US-9.2). */
export const BROLL_REFERENCE_STILL_ASSET_TYPES = [
  "cover_frame",
  "client_logo",
  "avatar_reference",
] as const;

async function findOwnedImageAssetById(params: {
  supabase: ReturnType<typeof createServerSupabaseClient>;
  clientId: string;
  assetId: string;
}): Promise<{ assetId: string } | null> {
  const { data, error } = await params.supabase
    .from(MEDIA_TABLE)
    .select("id")
    .eq("id", params.assetId)
    .eq("client_id", params.clientId)
    .in("metadata->>detectedMime", [...WAN_IMAGE_MIME_ALLOWLIST])
    .maybeSingle();

  if (error) {
    console.error("[media] getBrollReferenceStillAssetForClient owned check failed", {
      code: error.code,
    });
    return null;
  }

  if (data && typeof (data as { id?: unknown }).id === "string") {
    return { assetId: (data as { id: string }).id };
  }
  return null;
}

/**
 * Resolve an owned still for Wan I2V (US-8.5 CONTRACT).
 * Priority:
 * 1. Script-linked cover still for this Reel (`assembled_reels.cover_media_asset_id`)
 * 2. Client-wide cover_frame → client_logo → earliest avatar_reference with image MIME
 * Fail closed → null (never client absolute URLs).
 */
export async function getBrollReferenceStillAssetForClient(
  clientId: string,
  reelScriptId: string,
): Promise<{ assetId: string } | null> {
  if (!clientId || typeof clientId !== "string") {
    return null;
  }

  if (!isSupabaseConfigured()) {
    return null;
  }

  try {
    const supabase = createServerSupabaseClient();

    // Priority 1 — script-scoped cover still (CONTRACT).
    if (reelScriptId && typeof reelScriptId === "string") {
      const { data: assembled, error: assembledError } = await supabase
        .from(ASSEMBLED_REELS_TABLE)
        .select("cover_media_asset_id")
        .eq("client_id", clientId)
        .eq("reel_script_id", reelScriptId)
        .not("cover_media_asset_id", "is", null)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (assembledError) {
        console.error("[media] getBrollReferenceStillAssetForClient script cover failed", {
          code: assembledError.code,
        });
      } else {
        const coverId = (assembled as { cover_media_asset_id?: unknown } | null)
          ?.cover_media_asset_id;
        if (typeof coverId === "string") {
          const owned = await findOwnedImageAssetById({
            supabase,
            clientId,
            assetId: coverId,
          });
          if (owned) {
            return owned;
          }
        }
      }
    }

    // Priority 2–3 — client-wide branding / uploaded stills.
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
