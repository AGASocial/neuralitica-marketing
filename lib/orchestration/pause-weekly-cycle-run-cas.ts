import "server-only";

/**
 * US-15.1 Phase B QA-FIX H1 — `running -> paused` aggregate CAS transition.
 * Frozen in CONTRACT.md § "Aggregate run state machine": "kill switch
 * disabled, client inactive, or callback terminal bookkeeping cannot
 * advance." Mirrors `startWeeklyCycleLiveCas`'s guarded-update pattern.
 *
 * Called by `resume-weekly-cycle-from-job.ts` immediately after a callback
 * persists a genuinely-succeeded job's real terminal outcome (`completed`)
 * while the live kill switch is off for the owning client — never on a
 * normal step failure, which stays orthogonal to this transition.
 */
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { WEEKLY_CYCLE_RUNS_TABLE } from "@/lib/orchestration/weekly-cycle-live-types";

export type PauseWeeklyCycleRunCasResult =
  | { outcome: "PAUSED"; runId: string }
  | { outcome: "ALREADY_PAUSED"; runId: string }
  | { outcome: "NOT_RUNNING"; runId: string }
  | { outcome: "ERROR"; runId: string };

export async function pauseWeeklyCycleRunCas(
  runId: string,
): Promise<PauseWeeklyCycleRunCasResult> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from(WEEKLY_CYCLE_RUNS_TABLE)
    .update({ status: "paused", updated_at: new Date().toISOString() })
    .eq("id", runId)
    .eq("status", "running")
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[weekly-cycle] pause CAS failed", { code: error.code, runId });
    return { outcome: "ERROR", runId };
  }

  if (data) {
    return { outcome: "PAUSED", runId };
  }

  const { data: existing, error: loadError } = await supabase
    .from(WEEKLY_CYCLE_RUNS_TABLE)
    .select("status")
    .eq("id", runId)
    .maybeSingle();

  if (loadError || !existing) {
    return { outcome: "ERROR", runId };
  }

  const status = (existing as { status: string }).status;
  if (status === "paused") {
    return { outcome: "ALREADY_PAUSED", runId };
  }
  return { outcome: "NOT_RUNNING", runId };
}
