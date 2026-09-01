import "server-only";

/**
 * US-15.1 Phase B — transactional step-log projection + aggregate
 * resolution. Called after every step_run terminal transition. Rebuilds
 * `step_log` from `neuramark_weekly_cycle_step_runs` (source of truth) and
 * advances the run's aggregate status per CONTRACT.md § "Aggregate run
 * state machine". Never accepts caller-supplied step_log.
 */
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  WEEKLY_CYCLE_RUNS_TABLE,
  weeklyCycleStepLogEntrySchema,
  type WeeklyCycleRunStatus,
  type WeeklyCycleStepLogEntry,
} from "@/lib/orchestration/weekly-cycle-live-types";
import {
  listStepRunsForRun,
  type WeeklyCycleStepRunRow,
} from "@/lib/orchestration/weekly-cycle-step-runs";

const PENDING_OR_RUNNABLE = new Set([
  "ready",
  "dispatch_pending",
  "pending_provider",
  "pending_worker",
]);

function toStepLogEntry(row: WeeklyCycleStepRunRow): WeeklyCycleStepLogEntry | null {
  const at = row.availableAt;
  const candidate = {
    slotIndex: row.slotIndex,
    step: row.step,
    status: row.status,
    attempt: row.attempt,
    at,
    ...(row.errorCode ? { errorCode: row.errorCode } : {}),
    ...(row.jobId ? { jobId: row.jobId } : {}),
  };
  const parsed = weeklyCycleStepLogEntrySchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

export type ReconcileWeeklyCycleRunResult = {
  status: WeeklyCycleRunStatus;
  changed: boolean;
};

export async function reconcileWeeklyCycleRun(
  runId: string,
): Promise<ReconcileWeeklyCycleRunResult | null> {
  const supabase = createServerSupabaseClient();
  const { data: runRow, error: runError } = await supabase
    .from(WEEKLY_CYCLE_RUNS_TABLE)
    .select("status")
    .eq("id", runId)
    .maybeSingle();
  if (runError || !runRow) return null;

  const currentStatus = (runRow as { status: WeeklyCycleRunStatus }).status;
  // Terminal / non-live rows are never rewritten by reconcile.
  if (currentStatus === "completed" || currentStatus === "failed" || currentStatus === "dry_run") {
    return { status: currentStatus, changed: false };
  }

  const stepRuns = await listStepRunsForRun(runId);
  const stepLog = stepRuns
    .map(toStepLogEntry)
    .filter((entry): entry is WeeklyCycleStepLogEntry => entry !== null);

  const slots = [0, 1, 2] as const;
  const bySlot = new Map<number, WeeklyCycleStepRunRow[]>();
  for (const slot of slots) bySlot.set(slot, []);
  for (const row of stepRuns) {
    if (row.slotIndex !== null) bySlot.get(row.slotIndex)?.push(row);
  }

  const completedSlots = slots.filter((slot) =>
    (bySlot.get(slot) ?? []).some(
      (row) => row.step === "approval" && row.status === "completed",
    ),
  );

  const anyPendingOrRunnable = stepRuns.some((row) =>
    PENDING_OR_RUNNABLE.has(row.status),
  );

  let nextStatus: WeeklyCycleRunStatus = currentStatus;
  if (currentStatus === "running") {
    if (completedSlots.length === 3) {
      nextStatus = "completed";
    } else if (!anyPendingOrRunnable) {
      nextStatus = completedSlots.length >= 1 ? "partial_failed" : "failed";
    }
  }
  // `paused` and `partial_failed` only change via an explicit resume action,
  // never automatically by reconcile.

  const update: Record<string, unknown> = {
    step_log: stepLog,
    updated_at: new Date().toISOString(),
  };
  if (nextStatus !== currentStatus) {
    update.status = nextStatus;
    if (nextStatus === "completed" || nextStatus === "failed" || nextStatus === "partial_failed") {
      update.finished_at = new Date().toISOString();
    }
  }

  const { error: updateError } = await supabase
    .from(WEEKLY_CYCLE_RUNS_TABLE)
    .update(update)
    .eq("id", runId)
    .eq("status", currentStatus);

  if (updateError) {
    console.error("[weekly-cycle] reconcile update failed", {
      code: updateError.code,
      runId,
    });
    return null;
  }

  return { status: nextStatus, changed: nextStatus !== currentStatus };
}
