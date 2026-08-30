import "server-only";

import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

import {
  BRANDING_JOB_SELECT_COLUMNS,
  BRANDING_JOBS_TABLE,
  mapBrandingJobRow,
  type BrandingJobRow,
} from "./branding-job-row";

export async function loadBrandingJobByIdUnscoped(
  assemblyJobId: string,
): Promise<BrandingJobRow | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(BRANDING_JOBS_TABLE)
    .select(BRANDING_JOB_SELECT_COLUMNS)
    .eq("id", assemblyJobId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return mapBrandingJobRow(data as Record<string, unknown>);
}

export async function loadClientLogoAssetId(
  clientId: string,
): Promise<string | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_business_profiles")
    .select("logo_asset_id")
    .eq("client_id", clientId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const logoAssetId = (data as { logo_asset_id?: unknown }).logo_asset_id;
  return typeof logoAssetId === "string" ? logoAssetId : null;
}

export async function loadScriptBrandingContext(params: {
  clientId: string;
  reelScriptId: string;
}): Promise<{ onScreenText: string; targetDurationSec: number } | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_reel_scripts")
    .select("on_screen_text, target_duration_sec")
    .eq("id", params.reelScriptId)
    .eq("client_id", params.clientId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const row = data as {
    on_screen_text?: unknown;
    target_duration_sec?: unknown;
  };

  if (
    typeof row.on_screen_text !== "string" ||
    typeof row.target_duration_sec !== "number"
  ) {
    return null;
  }

  return {
    onScreenText: row.on_screen_text,
    targetDurationSec: row.target_duration_sec,
  };
}
