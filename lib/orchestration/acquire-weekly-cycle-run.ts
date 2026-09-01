import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export type WeeklyCycleRunMode = "cron" | "operator";
/**
 * Phase B additive: the migration replaced the ledger's status CHECK with
 * the aggregate live enum (`dry_run|running|paused|completed|partial_failed|failed`).
 * Phase A's `planned` never appears in a fresh row (Phase A always inserts
 * `dry_run`); kept here only for narrowing legacy reads.
 */
export type WeeklyCycleRunStatus =
  | "planned"
  | "dry_run"
  | "running"
  | "paused"
  | "completed"
  | "partial_failed"
  | "failed";
export type AcquireWeeklyCycleRunResult =
  | {
      outcome: "CREATED" | "ALREADY_EXISTS";
      runId: string;
      status: "dry_run";
      replan: "ALLOWED";
      clientId: string;
      weekStart: string;
    }
  | {
      outcome: "ALREADY_EXISTS";
      runId: string;
      status: Exclude<WeeklyCycleRunStatus, "dry_run">;
      replan: "BLOCKED";
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
  if (inserted) return { outcome: "CREATED", runId: inserted.id, status: "dry_run", replan: "ALLOWED", clientId: params.clientId, weekStart: params.weekStart };

  const { data: existing, error } = await supabase
    .from("neuramark_weekly_cycle_runs")
    .select("id,status")
    .eq("client_id", params.clientId)
    .eq("week_start", params.weekStart)
    .single();
  if (error || !existing) throw new Error("WEEKLY_CYCLE_ACQUIRE_FAILED");
  const status = existing.status as WeeklyCycleRunStatus;
  if (status === "dry_run") {
    return { outcome: "ALREADY_EXISTS", runId: existing.id, status, replan: "ALLOWED", clientId: params.clientId, weekStart: params.weekStart };
  }
  return { outcome: "ALREADY_EXISTS", runId: existing.id, status, replan: "BLOCKED", clientId: params.clientId, weekStart: params.weekStart };
}
