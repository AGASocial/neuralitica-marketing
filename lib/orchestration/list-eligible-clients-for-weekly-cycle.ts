import "server-only";

import { getBusinessProfileForAgents } from "@/lib/profile/get-business-profile-for-agents";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type WeeklyCycleEligibilitySkipReason =
  | "INACTIVE" | "PROFILE_MISSING" | "VISUAL_MODE_MISSING" | "PROFILE_LOAD_FAILED";
export type WeeklyCycleEligibleClient = { clientId: string };
export type WeeklyCycleIneligibleClient = { clientId: string; skipReason: WeeklyCycleEligibilitySkipReason };
export type ListEligibleClientsForWeeklyCycleResult = {
  eligible: WeeklyCycleEligibleClient[];
  skipped: WeeklyCycleIneligibleClient[];
};

export async function listEligibleClientsForWeeklyCycle(): Promise<ListEligibleClientsForWeeklyCycleResult> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_clients")
    .select("id")
    .eq("active", true)
    .order("created_at", { ascending: true });
  if (error) throw new Error("WEEKLY_CYCLE_CLIENT_ENUMERATION_FAILED");

  const result: ListEligibleClientsForWeeklyCycleResult = { eligible: [], skipped: [] };
  for (const row of (data ?? []) as Array<{ id: string }>) {
    const profile = await getBusinessProfileForAgents(row.id);
    if (!profile.exists) {
      result.skipped.push({ clientId: row.id, skipReason: "loadFailed" in profile ? "PROFILE_LOAD_FAILED" : "PROFILE_MISSING" });
    } else if (profile.visualModeSummary === null) {
      result.skipped.push({ clientId: row.id, skipReason: "VISUAL_MODE_MISSING" });
    } else {
      result.eligible.push({ clientId: row.id });
    }
  }
  return result;
}
