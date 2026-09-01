import "server-only";

/**
 * US-15.1 Phase B — bounded claim/dispatch worker.
 * Frozen in CONTRACT.md § "Per-slot step state and durable dispatch":
 * one transaction claims a `ready` step, inserts its outbox row, then a
 * (possibly later) pass claims the outbox row with a token and invokes the
 * existing trusted enqueue seam. Crash-safe: a crash before dispatch leaves
 * a reclaimable outbox row; crash after acceptance is reconciled by the
 * stable idempotency key / job linkage, never a second submission.
 *
 * Only handles the async provider/worker steps (primary_video, broll,
 * assembly, branding). Global and slot-sync steps are dispatched inline by
 * `run-weekly-cycle-live.ts` / `resume-weekly-cycle-from-job.ts`.
 */
import {
  claimStepRunAsDispatchPending,
  loadStepRunById,
  markStepRunPending,
  markStepRunTerminal,
  scheduleStepRunRetry,
  type WeeklyCycleStepRunRow,
} from "@/lib/orchestration/weekly-cycle-step-runs";
import {
  claimOutboxRow,
  enqueueOutboxForStepRun,
  listClaimableOutboxRows,
  markOutboxDispatched,
  markOutboxFailed,
  markOutboxRetry,
} from "@/lib/orchestration/weekly-cycle-outbox";
import { buildWeeklyCycleIdempotencyKey } from "@/lib/orchestration/weekly-cycle-idempotency-key";
import {
  isWeeklyCycleLiveAllowedForClient,
} from "@/lib/orchestration/weekly-cycle-live-env";
import { reconcileWeeklyCycleRun } from "@/lib/orchestration/reconcile-weekly-cycle-run";
import {
  dispatchWeeklyCycleAssemblyStep,
  dispatchWeeklyCycleBrandingStep,
  dispatchWeeklyCycleBrollStep,
  dispatchWeeklyCyclePrimaryVideoStep,
} from "@/lib/orchestration/weekly-cycle-trusted-steps";
import {
  MAX_WEEKLY_CYCLE_ATTEMPTS,
  WEEKLY_CYCLE_DISPATCH_BACKOFF_SEC,
  type WeeklyCycleErrorCode,
} from "@/lib/orchestration/weekly-cycle-live-types";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { WEEKLY_CYCLE_STEP_RUN_TABLE } from "@/lib/orchestration/weekly-cycle-live-types";

const DEFAULT_LIMIT = 10;

/** Promotes ready async step runs into dispatch_pending + outbox rows. */
async function promoteReadyAsyncStepRuns(limit: number): Promise<number> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(WEEKLY_CYCLE_STEP_RUN_TABLE)
    .select("id")
    .eq("status", "ready")
    .in("step", ["primary_video", "broll", "assembly", "branding"])
    .lte("available_at", new Date().toISOString())
    .limit(limit);

  if (error || !data) return 0;

  let promoted = 0;
  for (const row of data as { id: string }[]) {
    const claimed = await claimStepRunAsDispatchPending(row.id);
    if (!claimed) continue;
    const key = buildWeeklyCycleIdempotencyKey({
      runId: claimed.runId,
      slotIndex: claimed.slotIndex,
      step: claimed.step,
      attempt: claimed.attempt,
    });
    const outboxed = await enqueueOutboxForStepRun({
      runId: claimed.runId,
      stepRunId: claimed.id,
      eventKind: claimed.step === "primary_video" || claimed.step === "broll" ? "dispatch_provider" : "dispatch_worker",
      idempotencyKey: key,
    });
    if (outboxed) promoted += 1;
  }
  return promoted;
}

async function invokeTrustedCreator(stepRun: WeeklyCycleStepRunRow) {
  switch (stepRun.step) {
    case "primary_video":
      return dispatchWeeklyCyclePrimaryVideoStep({
        clientId: stepRun.clientId,
        reelScriptId: reelScriptIdFromLinkage(stepRun),
      });
    case "broll":
      return dispatchWeeklyCycleBrollStep({
        clientId: stepRun.clientId,
        reelScriptId: reelScriptIdFromLinkage(stepRun),
      });
    case "assembly":
      return dispatchWeeklyCycleAssemblyStep({
        clientId: stepRun.clientId,
        reelScriptId: reelScriptIdFromLinkage(stepRun),
      });
    case "branding":
      return dispatchWeeklyCycleBrandingStep({
        clientId: stepRun.clientId,
        assemblyJobId: assemblyJobIdFromLinkage(stepRun),
      });
    default:
      return { ok: false as const, errorCode: "INTERNAL_ERROR" as WeeklyCycleErrorCode, retryable: false };
  }
}

/**
 * Slot pointer resolution: `run-weekly-cycle-live.ts` / `resume-weekly-cycle-from-job.ts`
 * always create the async step run for (primary_video|broll|assembly) with
 * `job_id` pre-populated to the owning `reelScriptId`, and `branding` with
 * `job_id` pre-populated to the owning assembly `jobId`, before it reaches
 * `ready`. This keeps the outbox worker free of extra joins per dispatch.
 */
function reelScriptIdFromLinkage(stepRun: WeeklyCycleStepRunRow): string {
  if (!stepRun.jobId) throw new Error("WEEKLY_CYCLE_STEP_RUN_MISSING_LINKAGE");
  return stepRun.jobId;
}
function assemblyJobIdFromLinkage(stepRun: WeeklyCycleStepRunRow): string {
  if (!stepRun.jobId) throw new Error("WEEKLY_CYCLE_STEP_RUN_MISSING_LINKAGE");
  return stepRun.jobId;
}

function backoffSeconds(nextAttempt: number): number {
  if (nextAttempt === 2) return WEEKLY_CYCLE_DISPATCH_BACKOFF_SEC[2];
  if (nextAttempt === 3) return WEEKLY_CYCLE_DISPATCH_BACKOFF_SEC[3];
  return WEEKLY_CYCLE_DISPATCH_BACKOFF_SEC[3];
}

export type DispatchWeeklyCycleOutboxSummary = {
  promoted: number;
  dispatched: number;
  retried: number;
  failed: number;
  reconciledRunIds: string[];
};

export async function dispatchWeeklyCycleOutbox(
  limit: number = DEFAULT_LIMIT,
): Promise<DispatchWeeklyCycleOutboxSummary> {
  const promoted = await promoteReadyAsyncStepRuns(limit);

  const claimable = await listClaimableOutboxRows(limit);
  let dispatched = 0;
  let retried = 0;
  let failed = 0;
  const reconciledRunIds = new Set<string>();

  for (const row of claimable) {
    const claim = await claimOutboxRow(row.id);
    if (!claim) continue;

    const stepRun = await loadStepRunById(row.stepRunId);
    if (!stepRun) {
      await markOutboxFailed({ outboxId: row.id, errorCode: "INTERNAL_ERROR" });
      failed += 1;
      continue;
    }

    if (!isWeeklyCycleLiveAllowedForClient(stepRun.clientId)) {
      // Kill switch disabled mid-flight — do not dispatch a new provider call.
      await markOutboxFailed({ outboxId: row.id, errorCode: "LIVE_DISABLED" });
      await markStepRunTerminal({ stepRunId: stepRun.id, status: "failed", errorCode: "LIVE_DISABLED" });
      reconciledRunIds.add(stepRun.runId);
      failed += 1;
      continue;
    }

    let outcome;
    try {
      outcome = await invokeTrustedCreator(stepRun);
    } catch {
      outcome = { ok: false as const, errorCode: "INTERNAL_ERROR" as WeeklyCycleErrorCode, retryable: true };
    }

    if (outcome.ok) {
      if (outcome.terminal === "completed") {
        await markStepRunTerminal({ stepRunId: stepRun.id, status: "completed" });
      } else {
        await markStepRunPending({
          stepRunId: stepRun.id,
          status: outcome.jobKind === "video" ? "pending_provider" : "pending_worker",
          jobKind: outcome.jobKind,
          jobId: outcome.jobId,
        });
      }
      await markOutboxDispatched(row.id);
      dispatched += 1;
      reconciledRunIds.add(stepRun.runId);
      continue;
    }

    // Transport-level dispatch retry (outbox.dispatch_attempt, 0..3) is
    // distinct from the step's own spend-capable regeneration attempt
    // (step_run.attempt, 1..3) — CONTRACT § "Retries, timeout and partial
    // failure". This loop only re-claims the same outbox/step_run row; a
    // brand-new attempt row is created later by Operator resume when the
    // step reaches a genuine terminal failure.
    const nextDispatchAttempt = row.dispatchAttempt + 1;
    const canRetry = outcome.retryable && nextDispatchAttempt <= MAX_WEEKLY_CYCLE_ATTEMPTS;

    if (canRetry) {
      const availableAt = new Date(Date.now() + backoffSeconds(nextDispatchAttempt) * 1000).toISOString();
      await scheduleStepRunRetry({ stepRunId: stepRun.id, availableAt });
      await markOutboxRetry({
        outboxId: row.id,
        dispatchAttempt: nextDispatchAttempt,
        availableAt,
        errorCode: outcome.errorCode,
      });
      retried += 1;
    } else {
      await markStepRunTerminal({ stepRunId: stepRun.id, status: "failed", errorCode: outcome.errorCode });
      await markOutboxFailed({ outboxId: row.id, errorCode: outcome.errorCode });
      reconciledRunIds.add(stepRun.runId);
      failed += 1;
    }
  }

  for (const runId of reconciledRunIds) {
    await reconcileWeeklyCycleRun(runId);
  }

  return { promoted, dispatched, retried, failed, reconciledRunIds: [...reconciledRunIds] };
}
