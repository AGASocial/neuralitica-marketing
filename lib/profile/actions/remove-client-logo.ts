"use server";

import { revalidatePath } from "next/cache";

import type { RemoveClientLogoResult } from "@/lib/contracts/branding-job";
import { MEDIA_ASSET_TYPE_CLIENT_LOGO } from "@/lib/contracts/media-assets";
import { isAuthGuardError, requireActive } from "@/lib/auth/require-user";
import { getMediaStorage } from "@/lib/media/storage/get-media-storage";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

const MEDIA_TABLE = "neuramark_media_assets";
const PROFILE_TABLE = "neuramark_business_profiles";

function authGuardEnvelope(error: {
  status: 401 | 403;
}): RemoveClientLogoResult {
  if (error.status === 401) {
    return { ok: false, error: { code: "UNAUTHENTICATED" } };
  }
  return { ok: false, error: { code: "FORBIDDEN" } };
}

/**
 * Remove client logo from Ficha viva (US-9.2).
 */
export async function removeClientLogo(): Promise<RemoveClientLogoResult> {
  try {
    let user;
    try {
      user = await requireActive("handler");
    } catch (error) {
      if (isAuthGuardError(error)) {
        return authGuardEnvelope(error);
      }
      throw error;
    }

    if (!isSupabaseConfigured()) {
      return { ok: false, error: { code: "INTERNAL_ERROR" } };
    }

    const supabase = createServerSupabaseClient();
    const { data: profile } = await supabase
      .from(PROFILE_TABLE)
      .select("logo_asset_id")
      .eq("client_id", user.id)
      .maybeSingle();

    const logoAssetId =
      profile &&
      typeof (profile as { logo_asset_id?: unknown }).logo_asset_id ===
        "string"
        ? (profile as { logo_asset_id: string }).logo_asset_id
        : null;

    if (!logoAssetId) {
      return { ok: false, error: { code: "NOT_FOUND" } };
    }

    const { data: asset } = await supabase
      .from(MEDIA_TABLE)
      .select("storage_key")
      .eq("id", logoAssetId)
      .eq("client_id", user.id)
      .eq("asset_type", MEDIA_ASSET_TYPE_CLIENT_LOGO)
      .maybeSingle();

    if (
      asset &&
      typeof (asset as { storage_key?: unknown }).storage_key === "string"
    ) {
      try {
        await getMediaStorage().delete(
          (asset as { storage_key: string }).storage_key,
        );
      } catch {
        console.error("[profile] logo storage delete failed");
      }
    }

    await supabase
      .from(MEDIA_TABLE)
      .delete()
      .eq("id", logoAssetId)
      .eq("client_id", user.id);

    await supabase
      .from(PROFILE_TABLE)
      .update({ logo_asset_id: null })
      .eq("client_id", user.id);

    revalidatePath("/profile");

    return { ok: true };
  } catch (error) {
    if (isAuthGuardError(error)) {
      return authGuardEnvelope(error);
    }
    console.error("[profile] remove logo unexpected error");
    return { ok: false, error: { code: "INTERNAL_ERROR" } };
  }
}
