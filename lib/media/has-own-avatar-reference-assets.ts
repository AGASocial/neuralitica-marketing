import "server-only";

/**
 * True iff Cliente has ≥1 avatar_reference row.
 * US-8 job create MUST call this + hasActiveAvatarConsent + assertActiveAvatarConsentForJobs
 * before own-avatar production — never Preferencias allowlist alone.
 *
 * Fail-closed: invalid clientId or query error → false.
 */

import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

const MEDIA_TABLE = "neuramark_media_assets";
const ASSET_TYPE = "avatar_reference";

export async function hasOwnAvatarReferenceAssets(
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
      .eq("asset_type", ASSET_TYPE);

    if (error) {
      console.error("[media] hasOwnAvatarReferenceAssets failed", {
        code: error.code,
      });
      return false;
    }

    return (count ?? 0) >= 1;
  } catch {
    return false;
  }
}
