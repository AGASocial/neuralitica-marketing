import "server-only";

import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

export class ReelCumulativeCostUnsafeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReelCumulativeCostUnsafeError";
  }
}

export async function sumReelCumulativeCostCents(
  reelScriptId: string,
): Promise<number> {
  if (!isSupabaseConfigured()) {
    throw new ReelCumulativeCostUnsafeError("Supabase not configured");
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_reel_spend_events")
    .select("estimated_cost_cents")
    .eq("reel_script_id", reelScriptId);

  if (error) {
    throw new ReelCumulativeCostUnsafeError("Spend sum query failed");
  }

  let total = 0;
  for (const row of data ?? []) {
    const cents = (row as { estimated_cost_cents: unknown }).estimated_cost_cents;
    if (typeof cents !== "number" || !Number.isSafeInteger(cents) || cents < 0) {
      throw new ReelCumulativeCostUnsafeError("Invalid spend row amount");
    }
    const next = total + cents;
    if (!Number.isSafeInteger(next)) {
      throw new ReelCumulativeCostUnsafeError("Spend sum overflow");
    }
    total = next;
  }

  return total;
}
