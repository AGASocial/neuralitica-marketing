import "server-only";

import type { BusinessProfileForClientResult } from "@/lib/contracts/profile";
import { requireActive } from "@/lib/auth/require-user";
import {
  mapBusinessProfileRow,
  type ProfileSelectRow,
} from "@/lib/profile/map-business-profile-row";
import { mapBusinessProfileBranding } from "@/lib/profile/map-business-profile-branding";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

type ProfileBrandingSelectRow = ProfileSelectRow & {
  logo_asset_id?: unknown;
  assembly_config?: unknown;
};

/**
 * Own Ficha viva for the authenticated Cliente.
 * Arity 0 — identity only via requireActive("page") / getCurrentUser().id.
 * Prove getBusinessProfileForClient.length === 0 in tests (same class as getProfileStubSummary).
 */
export async function getBusinessProfileForClient(): Promise<BusinessProfileForClientResult> {
  const user = await requireActive("page");

  if (!isSupabaseConfigured()) {
    console.error("[profile] load unavailable: Supabase not configured");
    return { exists: false, loadFailed: true };
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_business_profiles")
    .select("fields, version, updated_at, logo_asset_id, assembly_config")
    .eq("client_id", user.id)
    .maybeSingle();

  const base = mapBusinessProfileRow({
    data: (data as ProfileSelectRow | null) ?? null,
    error,
  });

  if (!base.exists) {
    return base;
  }

  const row = (data ?? {}) as ProfileBrandingSelectRow;
  const logoAssetId =
    typeof row.logo_asset_id === "string" ? row.logo_asset_id : null;

  return {
    ...base,
    branding: mapBusinessProfileBranding({
      logoAssetId,
      assemblyConfig: row.assembly_config,
    }),
  };
}
