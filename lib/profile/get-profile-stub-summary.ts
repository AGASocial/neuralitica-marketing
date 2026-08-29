import "server-only";

import type { ProfileStubSummary } from "@/lib/contracts/interview";
import { requireActive } from "@/lib/auth/require-user";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

/**
 * Minimal own-profile existence for stub `/profile` RSC (US-1.3).
 * Identity from requireActive("page") only — no client/profile id params.
 * Returns null when Supabase is unavailable (page should show safe empty CTA).
 */
export async function getProfileStubSummary(): Promise<ProfileStubSummary | null> {
  const user = await requireActive("page");

  if (!isSupabaseConfigured()) {
    console.error("[profile] stub unavailable: Supabase not configured");
    return null;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_business_profiles")
    .select("version")
    .eq("client_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[profile] stub select failed", { code: error.code });
    throw new Error("Profile stub unavailable");
  }

  if (!data) {
    return { exists: false, version: null };
  }

  const version = Number(data.version);
  if (!Number.isInteger(version) || version < 1) {
    return { exists: false, version: null };
  }

  return { exists: true, version };
}
