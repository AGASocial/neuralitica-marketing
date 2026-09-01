import "server-only";

/**
 * US-15.1 Phase B — one-way `dry_run -> running` aggregate CAS transition.
 * Frozen in CONTRACT.md § "Aggregate run state machine".
 */
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { WEEKLY_CYCLE_RUNS_TABLE } from "@/lib/orchestration/weekly-cycle-live-types";

export type StartWeeklyCycleLiveCasResult =
  | { outcome: "STARTED"; runId: string }
  | { outcome: "ALREADY_STARTED"; runId: string }
  | { outcome: "NOT_DRY_RUN"; runId: string };

export async function startWeeklyCycleLiveCas(params: {
  runId: string;
  clientId: string;
  weekStart: string;
}): Promise<StartWeeklyCycleLiveCasResult> {
  const supabase = createServerSupabaseClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from(WEEKLY_CYCLE_RUNS_TABLE)
    .update({ status: "running", live_started_at: now, started_at: now })
    .eq("id", params.runId)
    .eq("client_id", params.clientId)
    .eq("week_start", params.weekStart)
    .eq("status", "dry_run")
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error("WEEKLY_CYCLE_LIVE_START_FAILED");
  }

  if (data) {
    return { outcome: "STARTED", runId: params.runId };
  }

  const { data: existing, error: loadError } = await supabase
    .from(WEEKLY_CYCLE_RUNS_TABLE)
    .select("status")
    .eq("id", params.runId)
    .maybeSingle();

  if (loadError || !existing) {
    throw new Error("WEEKLY_CYCLE_LIVE_START_FAILED");
  }

  const status = (existing as { status: string }).status;
  if (status === "running" || status === "paused") {
    return { outcome: "ALREADY_STARTED", runId: params.runId };
  }
  return { outcome: "NOT_DRY_RUN", runId: params.runId };
}
