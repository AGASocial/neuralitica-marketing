import "server-only";

import type { WeeklyCycleRunMode } from "@/lib/orchestration/acquire-weekly-cycle-run";
import { listEligibleClientsForWeeklyCycle, type WeeklyCycleEligibilitySkipReason } from "@/lib/orchestration/list-eligible-clients-for-weekly-cycle";
import { runWeeklyCycleForClient } from "@/lib/orchestration/run-weekly-cycle-for-client";

export type WeeklyCycleClientBatchItem =
  | { clientId: string; status: "dry_run"; runId: string; acquireOutcome: "CREATED" | "ALREADY_EXISTS"; stepCount: number }
  | { clientId: string; status: "skipped"; skipReason: WeeklyCycleEligibilitySkipReason }
  | { clientId: string; status: "failed"; errorCode: "INTERNAL_ERROR" };
export type RunWeeklyCycleBatchResult = { weekStart: string; dryRun: true; eligibleCount: number; skippedCount: number; processedCount: number; failedCount: number; clients: WeeklyCycleClientBatchItem[] };

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
