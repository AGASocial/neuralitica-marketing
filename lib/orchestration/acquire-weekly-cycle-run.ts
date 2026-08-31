import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export type WeeklyCycleRunMode = "cron" | "operator";
type RunStatus = "planned" | "running" | "completed" | "failed" | "dry_run";
export type AcquireWeeklyCycleRunResult = {
  outcome: "CREATED" | "ALREADY_EXISTS";
  runId: string;
  status: RunStatus;
  clientId: string;
  weekStart: string;
};

export async function acquireWeeklyCycleRun(
  params: { clientId: string; weekStart: string; mode: WeeklyCycleRunMode },
  createClient: typeof createServerSupabaseClient = createServerSupabaseClient,
): Promise<AcquireWeeklyCycleRunResult> {
  const supabase = createClient();
  const { data: inserted, error: insertError } = await supabase
    .from("neuramark_weekly_cycle_runs")
    .upsert({ client_id: params.clientId, week_start: params.weekStart, status: "dry_run", mode: params.mode, step_log: [], started_at: new Date().toISOString() }, { onConflict: "client_id,week_start", ignoreDuplicates: true })
    .select("id,status")
    .maybeSingle();
  if (insertError) throw new Error("WEEKLY_CYCLE_ACQUIRE_FAILED");
  if (inserted) return { outcome: "CREATED", runId: inserted.id, status: inserted.status as RunStatus, clientId: params.clientId, weekStart: params.weekStart };

  const { data: existing, error } = await supabase
    .from("neuramark_weekly_cycle_runs")
    .select("id,status")
    .eq("client_id", params.clientId)
    .eq("week_start", params.weekStart)
    .single();
  if (error || !existing) throw new Error("WEEKLY_CYCLE_ACQUIRE_FAILED");
  return { outcome: "ALREADY_EXISTS", runId: existing.id, status: existing.status as RunStatus, clientId: params.clientId, weekStart: params.weekStart };
}
