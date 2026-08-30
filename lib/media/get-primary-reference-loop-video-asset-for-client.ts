import "server-only";

import {
  MUSETALK_REFERENCE_LOOP_ASSET_TYPE,
  MUSETALK_VIDEO_MIME_ALLOWLIST,
} from "@/lib/contracts/musetalk-low";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

const MEDIA_TABLE = "neuramark_media_assets";

/**
 * Earliest tenant-owned reference-loop video for MuseTalk routing (US-8.6 CONTRACT).
 * Fail-closed: invalid clientId, query error, or no row → null.
 */
export async function getPrimaryReferenceLoopVideoAssetForClient(
  clientId: string,
): Promise<{ assetId: string } | null> {
  if (!clientId || typeof clientId !== "string") {
    return null;
  }

  if (!isSupabaseConfigured()) {
    return null;
  }

  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from(MEDIA_TABLE)
      .select("id")
      .eq("client_id", clientId)
      .eq("asset_type", MUSETALK_REFERENCE_LOOP_ASSET_TYPE)
      .in("metadata->>detectedMime", [...MUSETALK_VIDEO_MIME_ALLOWLIST])
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error || !data || typeof (data as { id?: unknown }).id !== "string") {
      if (error) {
        console.error("[media] getPrimaryReferenceLoopVideoAssetForClient failed", {
          code: error.code,
        });
      }
      return null;
    }

    return { assetId: (data as { id: string }).id };
  } catch {
    return null;
  }
}
