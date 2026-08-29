import "server-only";

import type { BusinessProfileForClientResult } from "@/lib/contracts/profile";
import { requireActive } from "@/lib/auth/require-user";
import {
  mapBusinessProfileRow,
  type ProfileSelectRow,
} from "@/lib/profile/map-business-profile-row";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

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
    .select("fields, version, updated_at")
    .eq("client_id", user.id)
    .maybeSingle();

  return mapBusinessProfileRow({
    data: (data as ProfileSelectRow | null) ?? null,
    error,
  });
}
