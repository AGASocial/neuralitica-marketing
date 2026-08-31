import "server-only";

import type { WeeklyCyclePlanStep } from "@/lib/orchestration/plan-weekly-cycle-steps";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function persistWeeklyCycleRunPlan(runId: string, steps: WeeklyCyclePlanStep[]): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await createServerSupabaseClient().from("neuramark_weekly_cycle_runs").update({ step_log: steps, status: "dry_run", finished_at: now }).eq("id", runId);
  if (error) throw new Error("WEEKLY_CYCLE_PLAN_PERSIST_FAILED");
}
