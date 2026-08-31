import "server-only";

import type { WeeklyCyclePlanStep } from "@/lib/orchestration/plan-weekly-cycle-steps";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type PersistWeeklyCycleRunPlanResult =
  | { outcome: "UPDATED" }
  | { outcome: "NOT_REPLANNABLE" };

export async function persistWeeklyCycleRunPlan(
  runId: string,
  steps: WeeklyCyclePlanStep[],
  createClient: typeof createServerSupabaseClient = createServerSupabaseClient,
): Promise<PersistWeeklyCycleRunPlanResult> {
  const now = new Date().toISOString();
  const { data, error } = await createClient()
    .from("neuramark_weekly_cycle_runs")
    .update({ step_log: steps, finished_at: now })
    .eq("id", runId)
    .eq("status", "dry_run")
    .select("id")
    .maybeSingle();
  if (error) throw new Error("WEEKLY_CYCLE_PLAN_PERSIST_FAILED");
  if (!data) return { outcome: "NOT_REPLANNABLE" };
  return { outcome: "UPDATED" };
}
