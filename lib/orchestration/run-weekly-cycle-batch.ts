import "server-only";

import type { WeeklyCycleRunMode } from "@/lib/orchestration/acquire-weekly-cycle-run";
import type { WeeklyCycleCronResponse } from "@/lib/contracts/weekly-cycle-live";
import { listEligibleClientsForWeeklyCycle, type WeeklyCycleEligibilitySkipReason } from "@/lib/orchestration/list-eligible-clients-for-weekly-cycle";
import { runWeeklyCycleForClient } from "@/lib/orchestration/run-weekly-cycle-for-client";
import { runWeeklyCycleLiveBatch } from "@/lib/orchestration/run-weekly-cycle-live";
import { isWeeklyCycleLiveEnabled, selectWeeklyCycleLiveClientIds } from "@/lib/orchestration/weekly-cycle-live-env";

export type WeeklyCycleClientBatchItem =
  | { clientId: string; status: "dry_run"; runId: string; acquireOutcome: "CREATED" | "ALREADY_EXISTS"; stepCount: number }
  | { clientId: string; status: "skipped"; skipReason: WeeklyCycleEligibilitySkipReason }
  | { clientId: string; status: "failed"; errorCode: "INTERNAL_ERROR" };
export type RunWeeklyCycleBatchResult = { weekStart: string; dryRun: true; eligibleCount: number; skippedCount: number; processedCount: number; failedCount: number; clients: WeeklyCycleClientBatchItem[] };

/** Phase A — always dry-run for every eligible client. Unchanged. */
export async function runWeeklyCycleBatch(params: { weekStart: string; mode: WeeklyCycleRunMode; dryRun: true }): Promise<RunWeeklyCycleBatchResult> {
  const eligibility = await listEligibleClientsForWeeklyCycle();
  const clients: WeeklyCycleClientBatchItem[] = eligibility.skipped.map((item) => ({ ...item, status: "skipped" }));
  let processedCount = 0;
  let failedCount = 0;
  for (const { clientId } of eligibility.eligible) {
    const result = await runWeeklyCycleForClient({ ...params, clientId, invokedBy: "system" });
    if (!result.ok) { failedCount += 1; clients.push({ clientId, status: "failed", errorCode: "INTERNAL_ERROR" }); continue; }
    processedCount += 1;
    clients.push({ clientId, status: "dry_run", runId: result.runId, acquireOutcome: result.acquireOutcome, stepCount: result.plan.steps.length });
  }
  return { weekStart: params.weekStart, dryRun: true, eligibleCount: eligibility.eligible.length, skippedCount: eligibility.skipped.length, processedCount, failedCount, clients };
}

type WeeklyCycleCronBatchDependencies = {
  isLiveEnabled: typeof isWeeklyCycleLiveEnabled;
  listEligible: typeof listEligibleClientsForWeeklyCycle;
  selectLiveClientIds: typeof selectWeeklyCycleLiveClientIds;
  runDryRunBatch: typeof runWeeklyCycleBatch;
  runDryRunForClient: typeof runWeeklyCycleForClient;
  runLiveBatch: typeof runWeeklyCycleLiveBatch;
};

const defaultCronBatchDependencies: WeeklyCycleCronBatchDependencies = {
  isLiveEnabled: isWeeklyCycleLiveEnabled,
  listEligible: listEligibleClientsForWeeklyCycle,
  selectLiveClientIds: selectWeeklyCycleLiveClientIds,
  runDryRunBatch: runWeeklyCycleBatch,
  runDryRunForClient: runWeeklyCycleForClient,
  runLiveBatch: runWeeklyCycleLiveBatch,
};

/**
 * US-15.1 Phase B — cron entrypoint used by the Route Handler.
 * Frozen in CONTRACT.md § "Live activation, rollout and authority" /
 * § "HTTP and Phase A additive compatibility".
 *
 * Per tick: when the kill switch is off, or no eligible client is
 * allowlisted this tick, behavior is byte-identical to Phase A (every
 * eligible client gets/refreshes its dry-run plan). When the switch is on
 * and the allowlist selects at least one eligible client (up to the cap,
 * fail-closed on any invalid allowlist entry), those clients are processed
 * sequentially through the live batch (`runWeeklyCycleLiveBatch`); every
 * other eligible client is unaffected and still gets the Phase A dry-run
 * plan via `runWeeklyCycleForClient`, in the same deterministic order.
 */
export async function runWeeklyCycleCronBatch(
  params: { weekStart: string },
  dependencies: WeeklyCycleCronBatchDependencies = defaultCronBatchDependencies,
): Promise<WeeklyCycleCronResponse> {
  if (!dependencies.isLiveEnabled()) {
    return dependencies.runDryRunBatch({ weekStart: params.weekStart, mode: "cron", dryRun: true });
  }

  const eligibility = await dependencies.listEligible();
  const eligibleIds = eligibility.eligible.map((client) => client.clientId);
  const liveSelected = dependencies.selectLiveClientIds(eligibleIds);

  if (liveSelected.length === 0) {
    return dependencies.runDryRunBatch({ weekStart: params.weekStart, mode: "cron", dryRun: true });
  }

  const liveSet = new Set(liveSelected);
  for (const { clientId } of eligibility.eligible) {
    if (liveSet.has(clientId)) continue;
    await dependencies.runDryRunForClient({ clientId, weekStart: params.weekStart, mode: "cron", invokedBy: "system", dryRun: true });
  }

  const liveBatch = await dependencies.runLiveBatch({ clientIdsInOrder: liveSelected, weekStart: params.weekStart });

  return {
    weekStart: params.weekStart,
    dryRun: false,
    eligibleCount: eligibility.eligible.length,
    processedCount: liveBatch.processedCount,
    failedCount: liveBatch.failedCount,
    clients: liveBatch.clients,
  };
}
