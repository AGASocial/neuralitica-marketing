import "server-only";

import { HEYGEN_AVATAR_LOOKS_TABLE } from "@/lib/contracts/heygen-high";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

export type HeygenCachedLook = {
  heygenLookId: string;
  heygenGroupId: string | null;
  heygenImageAssetId: string | null;
};

export async function getCachedHeygenLook(params: {
  clientId: string;
  portraitAssetId: string;
}): Promise<HeygenCachedLook | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(HEYGEN_AVATAR_LOOKS_TABLE)
    .select("heygen_look_id, heygen_group_id, heygen_image_asset_id")
    .eq("client_id", params.clientId)
    .eq("portrait_asset_id", params.portraitAssetId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const row = data as {
    heygen_look_id: string;
    heygen_group_id: string | null;
    heygen_image_asset_id: string | null;
  };
  if (!row.heygen_look_id) {
    return null;
  }
  return {
    heygenLookId: row.heygen_look_id,
    heygenGroupId: row.heygen_group_id,
    heygenImageAssetId: row.heygen_image_asset_id,
  };
}

export async function upsertCachedHeygenLook(params: {
  clientId: string;
  portraitAssetId: string;
  heygenLookId: string;
  heygenGroupId?: string | null;
  heygenImageAssetId?: string | null;
}): Promise<void> {
  if (!isSupabaseConfigured()) {
    return;
  }
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from(HEYGEN_AVATAR_LOOKS_TABLE).upsert(
    {
      client_id: params.clientId,
      portrait_asset_id: params.portraitAssetId,
      heygen_look_id: params.heygenLookId,
      heygen_group_id: params.heygenGroupId ?? null,
      heygen_image_asset_id: params.heygenImageAssetId ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "client_id,portrait_asset_id" },
  );
  if (error) {
    console.error("[heygen] look cache upsert failed", { code: error.code });
  }
}
