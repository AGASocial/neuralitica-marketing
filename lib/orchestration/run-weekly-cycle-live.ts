import "server-only";

/**
 * US-15.1 Phase B — state-driven live dispatcher root.
 * Frozen signature in CONTRACT.md § "Aggregate run state machine".
 * Enqueues/dispatches and returns promptly — never polls providers,
 * downloads media, runs FFmpeg, or waits for assembly (ADR-0003).
 */
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { acquireWeeklyCycleRun } from "@/lib/orchestration/acquire-weekly-cycle-run";
import { startWeeklyCycleLiveCas } from "@/lib/orchestration/start-weekly-cycle-live-cas";
import { isWeeklyCycleLiveAllowedForClient } from "@/lib/orchestration/weekly-cycle-live-env";
import { createOrGetReadyStepRun, markStepRunTerminal } from "@/lib/orchestration/weekly-cycle-step-runs";
import { reconcileWeeklyCycleRun } from "@/lib/orchestration/reconcile-weekly-cycle-run";
import { advanceWeeklyCycleSlot } from "@/lib/orchestration/advance-weekly-cycle-slot";
import {
  loadWeeklyCycleSlotScripts,
  runWeeklyCycleCaptionsStep,
  runWeeklyCycleScriptsStep,
  runWeeklyCycleStrategyStep,
} from "@/lib/orchestration/weekly-cycle-trusted-steps";
import type {
  RunWeeklyCycleLiveParams,
  RunWeeklyCycleLiveResult,
  WeeklyCycleLiveCronClient as WeeklyCycleLiveBatchClientItem,
} from "@/lib/contracts/weekly-cycle-live";

export type { RunWeeklyCycleLiveParams, RunWeeklyCycleLiveResult, WeeklyCycleLiveBatchClientItem };

async function isClientActive(clientId: string): Promise<boolean> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_clients")
    .select("active")
    .eq("id", clientId)
    .maybeSingle();
  if (error || !data) return false;
  return (data as { active: boolean }).active === true;
}

export async function runWeeklyCycleLive(
  params: RunWeeklyCycleLiveParams,
): Promise<RunWeeklyCycleLiveResult> {
  // Gate 1: kill switch + rollout membership — checked before any acquire/spend.
  if (!isWeeklyCycleLiveAllowedForClient(params.clientId)) {
    return { ok: false, error: { code: "LIVE_DISABLED" } };
  }

  // Gate 3 (re-check active — gate 2 tenant ownership is the params themselves).
  const active = await isClientActive(params.clientId);
  if (!active) {
    return { ok: false, error: { code: "CLIENT_INACTIVE" } };
  }

  let acquired;
  try {
    acquired = await acquireWeeklyCycleRun({
      clientId: params.clientId,
      weekStart: params.weekStart,
      mode: params.mode,
    });
  } catch {
    return { ok: false, error: { code: "INTERNAL_ERROR" } };
  }

  if (acquired.replan === "BLOCKED") {
    if (acquired.status === "running" || acquired.status === "paused") {
      return { ok: true, runId: acquired.runId, outcome: "ALREADY_RUNNING", dispatchedStepCount: 0 };
    }
    if (acquired.status === "completed") {
      return { ok: true, runId: acquired.runId, outcome: "ALREADY_COMPLETED", dispatchedStepCount: 0 };
    }
    // partial_failed / failed — only the dedicated resume action may proceed.
    return { ok: false, error: { code: "RUN_NOT_RESUMABLE" } };
  }

  const started = await startWeeklyCycleLiveCas({
    runId: acquired.runId,
    clientId: params.clientId,
    weekStart: params.weekStart,
  });

  if (started.outcome === "ALREADY_STARTED") {
    return { ok: true, runId: acquired.runId, outcome: "ALREADY_RUNNING", dispatchedStepCount: 0 };
  }
  if (started.outcome === "NOT_DRY_RUN") {
    return { ok: false, error: { code: "RUN_NOT_REPLANNABLE" } };
  }

  const runId = acquired.runId;
  let dispatchedStepCount = 0;

  // --- Global chain: strategy -> scripts -> captions (synchronous today). ---
  const strategyRun = await createOrGetReadyStepRun({
    runId,
    clientId: params.clientId,
    slotIndex: null,
    step: "strategy",
    attempt: 1,
  });
  if (strategyRun && strategyRun.status === "ready") {
    dispatchedStepCount += 1;
    const strategyOutcome = await runWeeklyCycleStrategyStep({
      runId,
      clientId: params.clientId,
      weekStart: params.weekStart,
    });
    if (!strategyOutcome.ok) {
      await markStepRunTerminal({ stepRunId: strategyRun.id, status: "failed", errorCode: strategyOutcome.errorCode });
      await reconcileWeeklyCycleRun(runId);
      return { ok: true, runId, outcome: "STARTED", dispatchedStepCount };
    }
    await markStepRunTerminal({ stepRunId: strategyRun.id, status: "completed" });

    const scriptsRun = await createOrGetReadyStepRun({
      runId,
      clientId: params.clientId,
      slotIndex: null,
      step: "scripts",
      attempt: 1,
    });
    if (scriptsRun && scriptsRun.status === "ready") {
      dispatchedStepCount += 1;
      const scriptsOutcome = await runWeeklyCycleScriptsStep({
        clientId: params.clientId,
        weekStart: params.weekStart,
        strategyId: strategyOutcome.strategyId,
      });
      if (!scriptsOutcome.ok) {
        await markStepRunTerminal({ stepRunId: scriptsRun.id, status: "failed", errorCode: scriptsOutcome.errorCode });
        await reconcileWeeklyCycleRun(runId);
        return { ok: true, runId, outcome: "STARTED", dispatchedStepCount };
      }
      await markStepRunTerminal({ stepRunId: scriptsRun.id, status: "completed" });

      const captionsRun = await createOrGetReadyStepRun({
        runId,
        clientId: params.clientId,
        slotIndex: null,
        step: "captions",
        attempt: 1,
      });
      if (captionsRun && captionsRun.status === "ready") {
        dispatchedStepCount += 1;
        const captionsOutcome = await runWeeklyCycleCaptionsStep({
          clientId: params.clientId,
          weekStart: params.weekStart,
          strategyId: strategyOutcome.strategyId,
        });
        if (!captionsOutcome.ok) {
          await markStepRunTerminal({ stepRunId: captionsRun.id, status: "failed", errorCode: captionsOutcome.errorCode });
          await reconcileWeeklyCycleRun(runId);
          return { ok: true, runId, outcome: "STARTED", dispatchedStepCount };
        }
        await markStepRunTerminal({ stepRunId: captionsRun.id, status: "completed" });

        // --- Seed per-slot chains. ---
        const slotScripts = await loadWeeklyCycleSlotScripts({
          clientId: params.clientId,
          strategyId: strategyOutcome.strategyId,
        });
        for (const script of slotScripts) {
          await advanceWeeklyCycleSlot({
            runId,
            clientId: params.clientId,
            slotIndex: script.slotIndex,
            script,
            fromStep: null,
          });
          dispatchedStepCount += 1;
        }
      }
    }
  }

  await reconcileWeeklyCycleRun(runId);
  return { ok: true, runId, outcome: "STARTED", dispatchedStepCount };
}

/**
 * Convenience batch wrapper for the cron Route Handler's live branch.
 * `clientIdsInOrder` must already be the allowlisted+capped selection
 * (`selectWeeklyCycleLiveClientIds` in `weekly-cycle-live-env.ts`) — this
 * function processes them sequentially, matching Phase A's PO-lean.
 */
export async function runWeeklyCycleLiveBatch(params: {
  clientIdsInOrder: readonly string[];
  weekStart: string;
}): Promise<{ processedCount: number; failedCount: number; clients: WeeklyCycleLiveBatchClientItem[] }> {
  const clients: WeeklyCycleLiveBatchClientItem[] = [];
  let processedCount = 0;
  let failedCount = 0;

  for (const clientId of params.clientIdsInOrder) {
    const result = await runWeeklyCycleLive({
      clientId,
      weekStart: params.weekStart,
      invokedBy: "system",
      mode: "cron",
    });

    if (!result.ok) {
      failedCount += 1;
      clients.push({ clientId, status: "failed", errorCode: result.error.code === "CLIENT_INACTIVE" ? "INTERNAL_ERROR" : result.error.code });
      continue;
    }

    processedCount += 1;
    const status =
      result.outcome === "STARTED"
        ? "dispatched"
        : result.outcome === "ALREADY_RUNNING"
          ? "already_running"
          : "already_completed";
    clients.push({ clientId, status, runId: result.runId });
  }

  return { processedCount, failedCount, clients };
}
