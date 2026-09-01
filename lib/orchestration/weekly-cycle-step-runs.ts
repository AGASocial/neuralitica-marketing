import "server-only";

/**
 * US-15.1 Phase B — CRUD/CAS helpers over `neuramark_weekly_cycle_step_runs`.
 * Shared by the live dispatcher root, the outbox worker and the callback
 * continuation. Never exposes raw provider payloads / prompts.
 */
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { WeeklyCycleStepKey } from "@/lib/contracts/weekly-cycle";
import {
  WEEKLY_CYCLE_STEP_RUN_TABLE,
  type WeeklyCycleErrorCode,
  type WeeklyCycleJobKind,
  type WeeklyCycleLiveStepStatus,
} from "@/lib/orchestration/weekly-cycle-live-types";
import { buildWeeklyCycleIdempotencyKey } from "@/lib/orchestration/weekly-cycle-idempotency-key";

export type WeeklyCycleStepRunRow = {
  id: string;
  runId: string;
  clientId: string;
  slotIndex: number | null;
  step: WeeklyCycleStepKey;
  status: WeeklyCycleLiveStepStatus;
  attempt: number;
  idempotencyKey: string;
  jobKind: WeeklyCycleJobKind | null;
  jobId: string | null;
  errorCode: WeeklyCycleErrorCode | null;
  availableAt: string;
};

function mapRow(row: Record<string, unknown>): WeeklyCycleStepRunRow {
  return {
    id: row.id as string,
    runId: row.run_id as string,
    clientId: row.client_id as string,
    slotIndex: (row.slot_index as number | null) ?? null,
    step: row.step as WeeklyCycleStepKey,
    status: row.status as WeeklyCycleLiveStepStatus,
    attempt: row.attempt as number,
    idempotencyKey: row.idempotency_key as string,
    jobKind: (row.job_kind as WeeklyCycleJobKind | null) ?? null,
    jobId: (row.job_id as string | null) ?? null,
    errorCode: (row.error_code as WeeklyCycleErrorCode | null) ?? null,
    availableAt: row.available_at as string,
  };
}

/** Creates the next attempt for (run, slot, step) in `ready` status, or returns the existing row (idempotent). */
export async function createOrGetReadyStepRun(params: {
  runId: string;
  clientId: string;
  slotIndex: number | null;
  step: WeeklyCycleStepKey;
  attempt: number;
  /**
   * Pre-dispatch linkage pointer (e.g. owning `reelScriptId` for
   * primary_video/broll/assembly, or owning assembly `jobId` for branding).
   * Overwritten with the real provider/worker job id once dispatched.
   */
  linkageId?: string;
}): Promise<WeeklyCycleStepRunRow | null> {
  const supabase = createServerSupabaseClient();
  const idempotencyKey = buildWeeklyCycleIdempotencyKey(params);

  const { data, error } = await supabase
    .from(WEEKLY_CYCLE_STEP_RUN_TABLE)
    .insert({
      run_id: params.runId,
      client_id: params.clientId,
      slot_index: params.slotIndex,
      step: params.step,
      status: "ready",
      attempt: params.attempt,
      idempotency_key: idempotencyKey,
      job_id: params.linkageId ?? null,
    })
    .select("*")
    .maybeSingle();

  if (data) {
    return mapRow(data as Record<string, unknown>);
  }

  if (error && error.code !== "23505") {
    console.error("[weekly-cycle] step run create failed", {
      code: error.code,
      runId: params.runId,
      step: params.step,
    });
    return null;
  }

  // Conflict (23505): row already exists for this (run, slot, step, attempt) — reload it.
  const existing = await loadStepRunByKey({
    runId: params.runId,
    slotIndex: params.slotIndex,
    step: params.step,
    attempt: params.attempt,
  });
  return existing;
}

export async function loadStepRunByKey(params: {
  runId: string;
  slotIndex: number | null;
  step: WeeklyCycleStepKey;
  attempt: number;
}): Promise<WeeklyCycleStepRunRow | null> {
  const supabase = createServerSupabaseClient();
  let query = supabase
    .from(WEEKLY_CYCLE_STEP_RUN_TABLE)
    .select("*")
    .eq("run_id", params.runId)
    .eq("step", params.step)
    .eq("attempt", params.attempt);

  query = params.slotIndex === null
    ? query.is("slot_index", null)
    : query.eq("slot_index", params.slotIndex);

  const { data, error } = await query.maybeSingle();
  if (error || !data) return null;
  return mapRow(data as Record<string, unknown>);
}

export async function loadStepRunById(
  stepRunId: string,
): Promise<WeeklyCycleStepRunRow | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(WEEKLY_CYCLE_STEP_RUN_TABLE)
    .select("*")
    .eq("id", stepRunId)
    .maybeSingle();
  if (error || !data) return null;
  return mapRow(data as Record<string, unknown>);
}

export async function listStepRunsForRun(
  runId: string,
): Promise<WeeklyCycleStepRunRow[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(WEEKLY_CYCLE_STEP_RUN_TABLE)
    .select("*")
    .eq("run_id", runId)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map(mapRow);
}

export async function loadLatestStepRunForSlot(params: {
  runId: string;
  slotIndex: number | null;
  step: WeeklyCycleStepKey;
}): Promise<WeeklyCycleStepRunRow | null> {
  const supabase = createServerSupabaseClient();
  let query = supabase
    .from(WEEKLY_CYCLE_STEP_RUN_TABLE)
    .select("*")
    .eq("run_id", params.runId)
    .eq("step", params.step);

  query = params.slotIndex === null
    ? query.is("slot_index", null)
    : query.eq("slot_index", params.slotIndex);

  const { data, error } = await query
    .order("attempt", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return mapRow(data as Record<string, unknown>);
}

/** CAS `ready -> dispatch_pending`. */
export async function claimStepRunAsDispatchPending(
  stepRunId: string,
): Promise<WeeklyCycleStepRunRow | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(WEEKLY_CYCLE_STEP_RUN_TABLE)
    .update({ status: "dispatch_pending", claimed_at: new Date().toISOString() })
    .eq("id", stepRunId)
    .eq("status", "ready")
    .select("*")
    .maybeSingle();
  if (error || !data) return null;
  return mapRow(data as Record<string, unknown>);
}

/** Sets an in-flight provider/worker linkage after successful dispatch. */
export async function markStepRunPending(params: {
  stepRunId: string;
  status: "pending_provider" | "pending_worker";
  jobKind: WeeklyCycleJobKind;
  jobId: string;
}): Promise<boolean> {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from(WEEKLY_CYCLE_STEP_RUN_TABLE)
    .update({
      status: params.status,
      job_kind: params.jobKind,
      job_id: params.jobId,
      started_at: new Date().toISOString(),
    })
    .eq("id", params.stepRunId)
    .in("status", ["dispatch_pending", "ready"]);
  return !error;
}

export async function markStepRunTerminal(params: {
  stepRunId: string;
  status: "completed" | "failed" | "skipped";
  errorCode?: WeeklyCycleErrorCode;
}): Promise<boolean> {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from(WEEKLY_CYCLE_STEP_RUN_TABLE)
    .update({
      status: params.status,
      error_code: params.errorCode ?? null,
      finished_at: new Date().toISOString(),
    })
    .eq("id", params.stepRunId)
    .not("status", "in", "(completed,failed,skipped)");
  return !error;
}

/** Backoff a dispatch_pending/pending_* row back to `ready` for the next attempt. */
export async function scheduleStepRunRetry(params: {
  stepRunId: string;
  availableAt: string;
}): Promise<boolean> {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from(WEEKLY_CYCLE_STEP_RUN_TABLE)
    .update({ status: "ready", available_at: params.availableAt })
    .eq("id", params.stepRunId)
    .not("status", "in", "(completed,failed,skipped)");
  return !error;
}
