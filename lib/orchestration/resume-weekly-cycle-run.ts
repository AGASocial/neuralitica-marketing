import "server-only";

/**
 * US-15.1 Phase B — aggregate CAS resume transition.
 * Frozen in CONTRACT.md § "Aggregate run state machine":
 * `paused -> running` and `partial_failed -> running` (Operator resume;
 * failed retryable slots only). State-driven, not caller-directed: no
 * `fromStep`/`skipStep`/attempt input accepted. Successful slots are never
 * rerun. The `actions/resume-weekly-cycle-run.ts` Server Action is the only
 * public entrypoint into this function.
 */
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  WEEKLY_CYCLE_RUNS_TABLE,
  MAX_WEEKLY_CYCLE_ATTEMPTS,
  RETRYABLE_WEEKLY_CYCLE_ERROR_CODES,
} from "@/lib/orchestration/weekly-cycle-live-types";
import { isWeeklyCycleLiveAllowedForClient } from "@/lib/orchestration/weekly-cycle-live-env";
import {
  createOrGetReadyStepRun,
  listStepRunsForRun,
  markStepRunTerminal,
} from "@/lib/orchestration/weekly-cycle-step-runs";
import { dispatchWeeklyCycleOutbox } from "@/lib/orchestration/dispatch-weekly-cycle-outbox";
import { advanceWeeklyCycleSlot } from "@/lib/orchestration/advance-weekly-cycle-slot";
import { loadWeeklyCycleSlotScripts, runWeeklyCycleApprovalStep, runWeeklyCycleQaStep, runWeeklyCycleTtsStep } from "@/lib/orchestration/weekly-cycle-trusted-steps";
import { reconcileWeeklyCycleRun } from "@/lib/orchestration/reconcile-weekly-cycle-run";

export type ResumeWeeklyCycleRunResult =
  | { ok: true; runId: string; outcome: "RESUMED" }
  | {
      ok: false;
      error: {
        code: "NOT_FOUND" | "LIVE_DISABLED" | "CLIENT_INACTIVE" | "RUN_NOT_RESUMABLE" | "INTERNAL_ERROR";
      };
    };

const SYNC_STEPS = new Set(["tts", "qa", "approval"]);

export async function resumeWeeklyCycleRun(params: {
  runId: string;
}): Promise<ResumeWeeklyCycleRunResult> {
  const supabase = createServerSupabaseClient();
  const { data: runRow, error: runError } = await supabase
    .from(WEEKLY_CYCLE_RUNS_TABLE)
    .select("id, client_id, week_start, status")
    .eq("id", params.runId)
    .maybeSingle();

  if (runError || !runRow) {
    return { ok: false, error: { code: "NOT_FOUND" } };
  }

  const run = runRow as { id: string; client_id: string; week_start: string; status: string };

  if (run.status !== "paused" && run.status !== "partial_failed") {
    return { ok: false, error: { code: "RUN_NOT_RESUMABLE" } };
  }

  const stepRuns = await listStepRunsForRun(run.id);
  // A step is only auto-retried on generic resume when it is genuinely a
  // failed step (never a completed one — QA H1: a kill-switch-mid-run
  // callback now persists a truly-succeeded job as `completed`, so it is
  // excluded here by status alone) AND its error code is a known-transient
  // one. Anything outside RETRYABLE_WEEKLY_CYCLE_ERROR_CODES (e.g.
  // BUDGET_EXCEEDED, CONSENT_REQUIRED, or a stale LIVE_DISABLED-tagged row)
  // requires deliberate intervention rather than a blind re-dispatch.
  const retryableFailed = stepRuns.filter(
    (row) =>
      row.status === "failed" &&
      row.attempt < MAX_WEEKLY_CYCLE_ATTEMPTS &&
      row.slotIndex !== null &&
      row.errorCode !== null &&
      RETRYABLE_WEEKLY_CYCLE_ERROR_CODES.has(row.errorCode),
  );

  if (run.status === "partial_failed" && retryableFailed.length === 0) {
    return { ok: false, error: { code: "RUN_NOT_RESUMABLE" } };
  }

  if (!isWeeklyCycleLiveAllowedForClient(run.client_id)) {
    return { ok: false, error: { code: "LIVE_DISABLED" } };
  }

  const { data: clientRow } = await supabase
    .from("neuramark_clients")
    .select("active")
    .eq("id", run.client_id)
    .maybeSingle();
  if (!(clientRow as { active?: boolean } | null)?.active) {
    return { ok: false, error: { code: "CLIENT_INACTIVE" } };
  }

  const { data: casRow, error: casError } = await supabase
    .from(WEEKLY_CYCLE_RUNS_TABLE)
    .update({ status: "running", last_resumed_at: new Date().toISOString() })
    .eq("id", run.id)
    .in("status", ["paused", "partial_failed"])
    .select("id")
    .maybeSingle();

  if (casError) {
    return { ok: false, error: { code: "INTERNAL_ERROR" } };
  }
  if (!casRow) {
    return { ok: false, error: { code: "RUN_NOT_RESUMABLE" } };
  }

  // Load slot scripts once for linkage/continuation context.
  const { data: strategyRow } = await supabase
    .from("neuramark_content_strategies")
    .select("id")
    .eq("client_id", run.client_id)
    .eq("week_start", run.week_start)
    .eq("status", "approved")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const strategyId = (strategyRow as { id?: string } | null)?.id;
  const scripts = strategyId
    ? await loadWeeklyCycleSlotScripts({ clientId: run.client_id, strategyId })
    : [];

  for (const failedStep of retryableFailed) {
    const script = scripts.find((s) => s.slotIndex === failedStep.slotIndex);
    if (!script) continue;

    const nextAttempt = failedStep.attempt + 1;
    const retryRow = await createOrGetReadyStepRun({
      runId: run.id,
      clientId: run.client_id,
      slotIndex: failedStep.slotIndex,
      step: failedStep.step,
      attempt: nextAttempt,
      linkageId: failedStep.jobId ?? undefined,
    });
    if (!retryRow || retryRow.status !== "ready") continue;

    if (SYNC_STEPS.has(failedStep.step)) {
      const outcome =
        failedStep.step === "tts"
          ? await runWeeklyCycleTtsStep({ clientId: run.client_id, reelScriptId: script.reelScriptId })
          : failedStep.step === "qa"
            ? await runWeeklyCycleQaStep({ clientId: run.client_id, assembledReelId: retryRow.jobId ?? "" })
            : await runWeeklyCycleApprovalStep({ clientId: run.client_id, assembledReelId: retryRow.jobId ?? "" });

      if (outcome.ok) {
        await markStepRunTerminal({ stepRunId: retryRow.id, status: "completed" });
        await advanceWeeklyCycleSlot({
          runId: run.id,
          clientId: run.client_id,
          slotIndex: failedStep.slotIndex!,
          script,
          fromStep: failedStep.step,
        });
      } else {
        await markStepRunTerminal({ stepRunId: retryRow.id, status: "failed", errorCode: outcome.errorCode });
      }
    } else {
      await dispatchWeeklyCycleOutbox(3);
    }
  }

  await reconcileWeeklyCycleRun(run.id);
  return { ok: true, runId: run.id, outcome: "RESUMED" };
}
