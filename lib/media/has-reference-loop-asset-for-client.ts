import "server-only";

/**
 * True when Cliente has a video reference asset suitable for MuseTalk loop routing.
 * Used only when profile visual mode is generic_avatar (caller enforces).
 * Fail-closed: invalid clientId or query error → false.
 */
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

const MEDIA_TABLE = "neuramark_media_assets";
const VIDEO_MIMES = ["video/mp4", "video/quicktime"] as const;

export async function hasReferenceLoopAssetForClient(
  clientId: string,
): Promise<boolean> {
  if (!clientId || typeof clientId !== "string") {
    return false;
  }

  if (!isSupabaseConfigured()) {
    return false;
  }

  try {
    const supabase = createServerSupabaseClient();
    const { count, error } = await supabase
      .from(MEDIA_TABLE)
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .eq("asset_type", "avatar_reference")
      .in("metadata->>detectedMime", [...VIDEO_MIMES]);

    if (error) {
      console.error("[media] hasReferenceLoopAssetForClient failed", {
        code: error.code,
      });
      return false;
    }

    return (count ?? 0) >= 1;
  } catch {
    return false;
  }
}
