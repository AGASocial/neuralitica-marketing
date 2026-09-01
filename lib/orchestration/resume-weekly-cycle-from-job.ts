import "server-only";

/**
 * US-15.1 Phase B — authenticated callback/poller continuation.
 * Frozen signature in CONTRACT.md § "Aggregate run state machine" and
 * "Per-slot step state and durable dispatch". Callers (existing HMAC/worker
 * -authenticated webhook or polling sweeper) must ignore any caller-supplied
 * tenant/status/URL/cost claim — this function re-derives truth from the
 * persisted step-run linkage and the owning job's own table.
 *
 * Integration note: job completion hooks call
 * `maybeResumeWeeklyCycleFromJob` from video/assembly/branding status writers.
 */
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { loadAssemblyJobScoped } from "@/lib/assembly/load-assembly-job";
import { WEEKLY_CYCLE_STEP_RUN_TABLE, type WeeklyCycleJobKind } from "@/lib/orchestration/weekly-cycle-live-types";
import {
  loadStepRunById,
  markStepRunTerminal,
  type WeeklyCycleStepRunRow,
} from "@/lib/orchestration/weekly-cycle-step-runs";
import { reconcileWeeklyCycleRun } from "@/lib/orchestration/reconcile-weekly-cycle-run";
import { advanceWeeklyCycleSlot } from "@/lib/orchestration/advance-weekly-cycle-slot";
import { loadWeeklyCycleSlotScripts } from "@/lib/orchestration/weekly-cycle-trusted-steps";
import { isWeeklyCycleLiveAllowedForClient } from "@/lib/orchestration/weekly-cycle-live-env";
import { pauseWeeklyCycleRunCas } from "@/lib/orchestration/pause-weekly-cycle-run-cas";
import type {
  ResumeWeeklyCycleFromJobParams,
  ResumeWeeklyCycleFromJobResult,
} from "@/lib/contracts/weekly-cycle-live";

export type { ResumeWeeklyCycleFromJobParams, ResumeWeeklyCycleFromJobResult };

async function findStepRunByJobLinkage(params: {
  jobKind: WeeklyCycleJobKind;
  jobId: string;
}): Promise<WeeklyCycleStepRunRow | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(WEEKLY_CYCLE_STEP_RUN_TABLE)
    .select("id")
    .eq("job_kind", params.jobKind)
    .eq("job_id", params.jobId)
    .in("status", ["pending_provider", "pending_worker"])
    .maybeSingle();
  if (error || !data) return null;
  return loadStepRunById((data as { id: string }).id);
}

async function loadOwnedJobTerminalStatus(params: {
  jobKind: "video" | "assembly" | "branding";
  jobId: string;
  clientId: string;
}): Promise<"completed" | "failed" | "in_progress" | "not_found"> {
  if (params.jobKind === "video") {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("neuramark_video_jobs")
      .select("status, client_id")
      .eq("id", params.jobId)
      .maybeSingle();
    if (error || !data) return "not_found";
    const row = data as { status: string; client_id: string };
    if (row.client_id !== params.clientId) return "not_found";
    if (row.status === "completed") return "completed";
    if (row.status === "failed") return "failed";
    return "in_progress";
  }

  // assembly and branding are both surfaced on neuramark_assembled_reels.
  const job = await loadAssemblyJobScoped({ jobId: params.jobId, clientId: params.clientId });
  if (!job) return "not_found";
  const status = params.jobKind === "assembly" ? job.status : job.brandingStatus;
  if (status === "completed") return "completed";
  if (status === "failed") return "failed";
  return "in_progress";
}

export async function resumeWeeklyCycleFromJob(
  params: ResumeWeeklyCycleFromJobParams,
): Promise<ResumeWeeklyCycleFromJobResult> {
  if (params.jobKind === "tts" || params.jobKind === "qa") {
    // Modeled as synchronous seams today (see weekly-cycle-trusted-steps.ts) —
    // no pending_* step ever links a tts/qa job_kind, so there is nothing to
    // resume. Reserved for forward compatibility if those seams go async.
    return { ok: false, code: "JOB_LINK_NOT_FOUND" };
  }

  const stepRun = await findStepRunByJobLinkage({ jobKind: params.jobKind, jobId: params.jobId });
  if (!stepRun) {
    return { ok: false, code: "JOB_LINK_NOT_FOUND" };
  }

  const status = await loadOwnedJobTerminalStatus({
    jobKind: params.jobKind,
    jobId: params.jobId,
    clientId: stepRun.clientId,
  });

  if (status === "not_found") {
    return { ok: false, code: "JOB_SCOPE_MISMATCH" };
  }
  if (status === "in_progress") {
    return { ok: true, runId: stepRun.runId, outcome: "DUPLICATE_CALLBACK" };
  }

  if (!isWeeklyCycleLiveAllowedForClient(stepRun.clientId) && status === "completed") {
    // The kill switch is off (or the client went inactive), but the
    // underlying provider/worker job genuinely completed and was already
    // paid for. Discarding that as a synthetic "failed" would strand real
    // spend with no resume path and risk double-spend on a later retry
    // (QA H1). Persist the real outcome, then pause the aggregate run via
    // the frozen `running -> paused` CAS instead of letting it resolve to a
    // terminal `failed`/`partial_failed` state.
    const marked = await markStepRunTerminal({ stepRunId: stepRun.id, status: "completed" });
    if (!marked) {
      // Already terminal — idempotent duplicate callback.
      return { ok: true, runId: stepRun.runId, outcome: "DUPLICATE_CALLBACK" };
    }
    await pauseWeeklyCycleRunCas(stepRun.runId);
    // Rebuild step_log from the now-completed step row; reconcile never
    // rewrites `status` away from `paused` (guarded by its own CAS).
    await reconcileWeeklyCycleRun(stepRun.runId);
    return { ok: true, runId: stepRun.runId, outcome: "PAUSED_LIVE_DISABLED" };
  }

  // Either live is allowed, or the job failed for its own reason — a normal
  // step failure, orthogonal to the kill-switch check above.
  const terminal = status === "completed" ? "completed" : "failed";
  const marked = await markStepRunTerminal({
    stepRunId: stepRun.id,
    status: terminal,
    ...(terminal === "failed" ? { errorCode: "PROVIDER_TRANSIENT" as const } : {}),
  });
  if (!marked) {
    // Already terminal — idempotent duplicate callback.
    return { ok: true, runId: stepRun.runId, outcome: "DUPLICATE_CALLBACK" };
  }

  await reconcileWeeklyCycleRun(stepRun.runId);

  if (terminal === "completed" && stepRun.slotIndex !== null) {
    // Only direct successor ownership: reload the slot's script context and
    // advance exactly one step (advanceWeeklyCycleSlot enforces the order).
    const supabase = createServerSupabaseClient();
    const { data: scriptRow } = await supabase
      .from("neuramark_reel_scripts")
      .select("strategy_id")
      .eq("client_id", stepRun.clientId)
      .eq("slot_index", stepRun.slotIndex)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const strategyId = (scriptRow as { strategy_id?: string } | null)?.strategy_id;
    if (strategyId) {
      const scripts = await loadWeeklyCycleSlotScripts({ clientId: stepRun.clientId, strategyId });
      const script = scripts.find((s) => s.slotIndex === stepRun.slotIndex);
      if (script) {
        await advanceWeeklyCycleSlot({
          runId: stepRun.runId,
          clientId: stepRun.clientId,
          slotIndex: stepRun.slotIndex,
          script,
          fromStep: stepRun.step,
        });
        await reconcileWeeklyCycleRun(stepRun.runId);
      }
    }
  }

  return { ok: true, runId: stepRun.runId, outcome: "ADVANCED" };
}
