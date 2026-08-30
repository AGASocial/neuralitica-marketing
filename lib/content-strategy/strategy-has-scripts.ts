import "server-only";

import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

/**
 * Returns true when reel scripts exist for a strategy (US-5.1).
 */
export async function strategyHasScripts(strategyId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    return false;
  }

  const supabase = createServerSupabaseClient();
  const { count, error } = await supabase
    .from("neuramark_reel_scripts")
    .select("id", { count: "exact", head: true })
    .eq("strategy_id", strategyId);

  if (error) {
    console.error("[content-strategy] strategyHasScripts failed", {
      code: error.code,
      strategyId,
    });
    return false;
  }

  return (count ?? 0) > 0;
}

export function isStrategyLockAfterScriptsEnabled(): boolean {
  return process.env.NEURAMARK_STRATEGY_LOCK_AFTER_SCRIPTS !== "false";
}
